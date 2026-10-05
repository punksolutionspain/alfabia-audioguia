#!/usr/bin/env node
// Watchdog for the Alfabia audioguide. See docs/vigilante.md (Spanish).
//
// Runs from outside the app (GitHub Actions, every 10 minutes) and checks that
// the guide actually works, not just that the site answers: the POIs and both
// audio formats exist, audio files download, and real visitors are showing up.
// Alerts go to a webhook (Make → WhatsApp). No dependencies: Node 20+ only.
//
// Alert texts are in Spanish on purpose — they are read by the team.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

// ─── Configuration ────────────────────────────────────────────────────────────

const list = (value) =>
  (value ?? '').split(',').map((s) => s.trim()).filter(Boolean)

export function loadConfig(env = process.env) {
  return {
    site: (env.SITE_URL ?? 'https://guia.jardinesdealfabia.com').replace(/\/$/, ''),
    // VITE_* fallbacks let `node --env-file=.env.local` work on a dev machine
    supabaseUrl: (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').replace(/\/$/, ''),
    supabaseKey: env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '',
    webhook: env.ALERT_WEBHOOK_URL ?? '',
    stateFile: env.WATCHDOG_STATE_FILE ?? '.watchdog/state.json',
    skip: list(env.WATCHDOG_SKIP),
    forceFail: list(env.WATCHDOG_FORCE_FAIL),
    runUrl:
      env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
        ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
        : null,
  }
}

// The gardens open from 14 February to 31 October, both included (Madrid time).
// Outside the season nothing is checked and nobody is alerted.
const SEASON = { opens: { month: 2, day: 14 }, closes: { month: 10, day: 31 } }

const LANGUAGES = ['es', 'en', 'de', 'fr', 'ca']
const EXPECTED_POIS = 18
const TIMEOUT_MS = 15_000
const SLOW_MS = 4_000                 // Supabase normally answers in ~0.3 s
const AUDIO_SAMPLE = 6                // files checked per run; all 180 rotate in 5 h
const AUDIO_PAUSE_MS = 300            // Storage answers 429 to bursts
const ACTIVITY_WINDOW_MIN = 45
const ACTIVITY_MIN_BASELINE = 5       // sessions the same slot needed in past weeks
const REMIND_EVERY_MIN = 120
const RECHECK_AFTER_MS = 20_000
const SLOT_MS = 10 * 60 * 1000        // matches the cron cadence

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ─── HTTP ─────────────────────────────────────────────────────────────────────

/**
 * fetch that never throws: returns { status: 0, error } on network failure.
 * Retries once on network errors, 5xx and 429.
 */
export async function http(url, { method = 'GET', headers = {}, body, wantText = false } = {}) {
  let last = { status: 0, ms: 0, error: 'sin respuesta', headers: new Headers(), text: '' }

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(2_500)
    const started = Date.now()
    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const text = wantText ? await res.text() : ''
      if (!wantText) await res.body?.cancel()
      last = { status: res.status, ms: Date.now() - started, headers: res.headers, text, error: null }
      if (res.status < 500 && res.status !== 429) return last
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      last = {
        status: 0,
        ms: Date.now() - started,
        headers: new Headers(),
        text: '',
        error: timedOut ? `sin respuesta en ${TIMEOUT_MS / 1000} s` : 'error de red',
      }
    }
  }
  return last
}

const describe = (res) => (res.status === 0 ? res.error : `HTTP ${res.status}`)

function supabase(config, path, options = {}) {
  return http(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
      ...options.headers,
    },
  })
}

/** Exact row count through PostgREST without downloading rows. null on failure. */
async function countRows(config, query) {
  const res = await supabase(config, `analytics_events?select=id&${query}`, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact' },
  })
  if (res.status !== 200 && res.status !== 206) return null
  const total = Number((res.headers.get('content-range') ?? '').split('/')[1])
  return Number.isFinite(total) ? total : null
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

const clock = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit',
})
const dayAndClock = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

const madridDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
})

/** Whether the gardens are open on this date, and which day of the season it is. */
export function seasonInfo(now) {
  const [year, month, day] = madridDate.format(now).split('-').map(Number)
  const key = month * 100 + day
  const open =
    key >= SEASON.opens.month * 100 + SEASON.opens.day &&
    key <= SEASON.closes.month * 100 + SEASON.closes.day
  const firstDay = Date.UTC(year, SEASON.opens.month - 1, SEASON.opens.day)
  const dayOfSeason = Math.round((Date.UTC(year, month - 1, day) - firstDay) / 86_400_000) + 1
  return { open, dayOfSeason }
}

function duration(fromIso, now) {
  const minutes = Math.max(1, Math.round((now - new Date(fromIso)) / 60_000))
  if (minutes < 90) return `${minutes} min`
  return `${Math.round(minutes / 60)} h`
}

// ─── Checks ───────────────────────────────────────────────────────────────────
// Each returns { ok: true, detail } | { ok: false, detail } | { skipped: true, detail }.
// A failing result may carry its own `level` / `title` to override the check's.

export async function checkWeb(config, ctx) {
  const home = await http(`${config.site}/`, { wantText: true })
  if (home.status !== 200) return { ok: false, detail: `la página principal da ${describe(home)}` }
  if (!home.text.includes('id="root"')) {
    return { ok: false, detail: 'la página principal responde, pero no es la app' }
  }
  ctx.csp = home.headers.get('content-security-policy')

  const bundle = home.text.match(/\/assets\/index-[\w-]+\.js/)?.[0]
  if (!bundle) return { ok: false, detail: 'la página no enlaza el programa de la app' }

  for (const path of [bundle, '/sw.js', '/manifest.webmanifest']) {
    const res = await http(`${config.site}${path}`)
    if (res.status !== 200) return { ok: false, detail: `${path} da ${describe(res)}` }
  }
  return { ok: true, detail: `responde en ${home.ms} ms` }
}

export async function checkData(config, ctx) {
  ctx.supabaseDown = false
  const pois = await supabase(config, 'pois?select=number', { wantText: true })
  ctx.supabaseMs = pois.ms
  if (pois.status !== 200) {
    ctx.supabaseDown = true
    return { ok: false, detail: `la base de datos da ${describe(pois)}` }
  }
  const poiCount = JSON.parse(pois.text).length
  if (poiCount !== EXPECTED_POIS) {
    return { ok: false, detail: `hay ${poiCount} puntos en lugar de ${EXPECTED_POIS}` }
  }

  const res = await supabase(
    config,
    'translations?select=language,audio_url_ogg,audio_url_mp3,pois(number)',
    { wantText: true },
  )
  if (res.status !== 200) return { ok: false, detail: `las traducciones dan ${describe(res)}` }
  const rows = JSON.parse(res.text)

  const problems = []
  for (const language of LANGUAGES) {
    const own = rows.filter((row) => row.language === language)
    if (own.length !== EXPECTED_POIS) {
      problems.push(`${language}: ${own.length} traducciones en lugar de ${EXPECTED_POIS}`)
    }
    for (const [field, format] of [['audio_url_ogg', 'OGG'], ['audio_url_mp3', 'MP3']]) {
      const missing = own.filter((row) => !row[field]).length
      if (missing > 0) problems.push(`${language}: ${missing} puntos sin audio ${format}`)
    }
  }

  ctx.audioUrls = rows
    .flatMap((row) => [row.audio_url_ogg, row.audio_url_mp3])
    .filter(Boolean)
    .sort()

  if (problems.length > 0) return { ok: false, detail: problems.join('; ') }
  return { ok: true, detail: `${poiCount} puntos, ${rows.length} traducciones, ${ctx.audioUrls.length} audios` }
}

/** The files to test this run: a window that slides over the whole list. */
export function pickAudioSample(urls, now, size = AUDIO_SAMPLE) {
  if (urls.length <= size) return urls
  const start = (Math.floor(now / SLOT_MS) * size) % urls.length
  return Array.from({ length: size }, (_, i) => urls[(start + i) % urls.length])
}

export async function checkAudio(config, ctx) {
  if (!ctx.audioUrls?.length) return { skipped: true, detail: 'sin lista de audios que comprobar' }

  // startedAt, not now: a re-check must test the same files that just failed
  const sample = pickAudioSample(ctx.audioUrls, ctx.startedAt)
  const broken = []
  let unknown = 0

  for (const url of sample) {
    // A one-byte range is what a media element sends first, and is cheap
    const res = await http(url, { headers: { Range: 'bytes=0-0' } })
    const name = url.split('/').pop()
    if (res.status === 429) unknown++
    else if (res.status !== 200 && res.status !== 206) broken.push(`${name} (${describe(res)})`)
    else if (!(res.headers.get('content-type') ?? '').startsWith('audio/')) {
      broken.push(`${name} (no es un audio)`)
    }
    await sleep(AUDIO_PAUSE_MS)
  }

  if (broken.length > 0) return { ok: false, detail: `fallan ${broken.join(', ')}` }
  const note = unknown > 0 ? `, ${unknown} sin comprobar por límite de peticiones` : ''
  return { ok: true, detail: `${sample.length - unknown} de ${sample.length} audios revisados${note}` }
}

/** Pure decision, kept apart from the queries so it can be reasoned about. */
export function judgeActivity(current, weekAgo, twoWeeksAgo) {
  return current === 0 && weekAgo >= ACTIVITY_MIN_BASELINE && twoWeeksAgo >= ACTIVITY_MIN_BASELINE
}

export async function checkActivity(config, ctx) {
  if (ctx.supabaseDown) return { skipped: true, detail: 'la base de datos no responde' }

  const week = 7 * 24 * 60 * 60 * 1000
  const windowMs = ACTIVITY_WINDOW_MIN * 60 * 1000
  const sessionsBefore = (end) =>
    countRows(
      config,
      'event_type=eq.session_start' +
        `&created_at=gte.${new Date(end - windowMs).toISOString()}` +
        `&created_at=lt.${new Date(end).toISOString()}`,
    )

  const current = await sessionsBefore(ctx.now)
  const weekAgo = await sessionsBefore(ctx.now - week)
  const twoWeeksAgo = await sessionsBefore(ctx.now - 2 * week)
  if (current === null || weekAgo === null || twoWeeksAgo === null) {
    return { skipped: true, detail: 'no se pudo consultar el analytics' }
  }

  const span = `${clock.format(ctx.now - windowMs)}–${clock.format(ctx.now)}`

  if (judgeActivity(current, weekAgo, twoWeeksAgo)) {
    return {
      ok: false,
      detail: `0 visitas entre ${span}; en esa franja hubo ${weekAgo} y ${twoWeeksAgo} las dos semanas anteriores`,
    }
  }

  // If the anon role loses read access, RLS answers "zero rows", not an error,
  // and this check would stay silent for ever. Tell the two cases apart.
  // Not during the first week of the season: seven empty days are normal then.
  const seasonUnderWay = seasonInfo(ctx.now).dayOfSeason > 8
  if (seasonUnderWay && current === 0 && weekAgo === 0 && twoWeeksAgo === 0) {
    const since = new Date(ctx.now - week).toISOString()
    const any = await supabase(config, `analytics_events?select=id&created_at=gte.${since}&limit=1`, {
      wantText: true,
    })
    if (any.status === 200 && JSON.parse(any.text).length === 0) {
      return {
        ok: false,
        level: 'aviso',
        title: 'El vigilante no ve el analytics',
        detail: 'ningún evento en 7 días: o no se registran visitas o se ha perdido el permiso de lectura',
      }
    }
  }

  return { ok: true, detail: `${current} visitas entre ${span} (semanas anteriores: ${weekAgo} y ${twoWeeksAgo})` }
}

export async function checkSpeed(config, ctx) {
  if (ctx.supabaseDown) return { skipped: true, detail: 'la base de datos no responde' }
  if ((ctx.supabaseMs ?? 0) <= SLOW_MS) return { ok: true, detail: `${ctx.supabaseMs ?? '?'} ms` }

  // One slow answer is noise; two in a row is the saturation seen in August 2026
  const again = await supabase(config, 'pois?select=number')
  if (again.status === 200 && again.ms <= SLOW_MS) return { ok: true, detail: `${again.ms} ms al repetir` }
  const seconds = (Math.max(ctx.supabaseMs, again.ms) / 1000).toFixed(1)
  return { ok: false, detail: `tarda ${seconds} s en responder (lo normal son 0,3 s)` }
}

export async function checkMaps(config, ctx) {
  // The service worker fetches tiles with fetch(), which connect-src governs
  const connect = (ctx.csp ?? '').split(';').find((part) => part.trim().startsWith('connect-src'))
  if (connect && !connect.includes('tile.openstreetmap.org')) {
    return { ok: false, detail: 'la política de seguridad ya no permite los mapas de OpenStreetMap' }
  }

  // OpenStreetMap asks for light automated use: one tile, once an hour
  if (Math.floor(ctx.startedAt / SLOT_MS) % 6 !== 0) return { ok: true, detail: 'política correcta' }

  const tile = await http('https://a.tile.openstreetmap.org/17/66516/49755.png', {
    headers: { 'User-Agent': 'alfabia-audioguia-watchdog', Referer: `${config.site}/` },
  })
  if (tile.status === 429) return { ok: true, detail: 'política correcta; OpenStreetMap limita las consultas' }
  if (tile.status !== 200) return { ok: false, detail: `OpenStreetMap da ${describe(tile)}` }
  return { ok: true, detail: 'política correcta y OpenStreetMap responde' }
}

// Order matters: later checks reuse what earlier ones put in ctx.
export const CHECKS = [
  { id: 'web',       level: 'critico', title: 'La web no carga',                       run: checkWeb },
  { id: 'datos',     level: 'critico', title: 'Faltan puntos o audios',                run: checkData },
  { id: 'audios',    level: 'critico', title: 'Hay audios que no se descargan',        run: checkAudio },
  { id: 'actividad', level: 'critico', title: 'Ningún visitante en 45 minutos',        run: checkActivity },
  { id: 'lentitud',  level: 'aviso',   title: 'La base de datos responde lenta',       run: checkSpeed },
  { id: 'mapas',     level: 'aviso',   title: 'Los mapas pueden no verse',             run: checkMaps },
]

// ─── Running the checks ───────────────────────────────────────────────────────

async function runCheck(check, config, ctx) {
  if (config.skip.includes(check.id)) return { skipped: true, detail: 'desactivada' }
  if (config.forceFail.includes(check.id)) {
    return { ok: false, detail: 'PRUEBA: fallo simulado para comprobar que llega el aviso' }
  }
  try {
    return await check.run(config, ctx)
  } catch (err) {
    return { ok: false, detail: `la comprobación falló: ${err?.message ?? err}` }
  }
}

export async function runChecks(config, { checks = CHECKS, recheckAfterMs = RECHECK_AFTER_MS } = {}) {
  const startedAt = Date.now()
  const ctx = { now: startedAt, startedAt }
  const results = new Map()
  for (const check of checks) results.set(check.id, await runCheck(check, config, ctx))

  // A single bad answer should not wake anyone up: confirm before alerting
  const failed = checks.filter((check) => results.get(check.id).ok === false)
  if (failed.length > 0 && recheckAfterMs > 0 && config.forceFail.length === 0) {
    await sleep(recheckAfterMs)
    ctx.now = Date.now()
    for (const check of failed) results.set(check.id, await runCheck(check, config, ctx))
  }
  return { results, now: ctx.now }
}

// ─── State and notification decisions ─────────────────────────────────────────

export async function readState(file) {
  try {
    const state = JSON.parse(await readFile(file, 'utf8'))
    return { failing: state.failing ?? {} }
  } catch {
    return { failing: {} }  // first run, or the cache was evicted
  }
}

async function writeState(file, state) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(state, null, 2) + '\n')
}

/**
 * Compare this run with the previous state.
 * Notify when something starts failing, every REMIND_EVERY_MIN while it lasts,
 * and when it recovers. A skipped check is neither a failure nor a recovery.
 */
export function decide(previous, results, now, checks = CHECKS) {
  const failing = {}
  const fresh = []
  const recovered = []
  let reminderDue = false

  for (const check of checks) {
    const result = results.get(check.id)
    const before = previous.failing[check.id]

    if (result.skipped) {
      if (before) failing[check.id] = before
      continue
    }
    if (result.ok) {
      if (before) recovered.push({ ...before, id: check.id })
      continue
    }

    const entry = {
      level: result.level ?? check.level,
      title: result.title ?? check.title,
      detail: result.detail,
      since: before?.since ?? new Date(now).toISOString(),
      lastNotified: before?.lastNotified ?? null,
    }
    failing[check.id] = entry
    if (!before) fresh.push(check.id)
    else if (now - new Date(before.lastNotified ?? 0) >= REMIND_EVERY_MIN * 60_000) reminderDue = true
  }

  const stillFailing = Object.keys(failing).length > 0
  let notify = null
  if (fresh.length > 0 || reminderDue) notify = 'alerta'
  else if (recovered.length > 0) notify = stillFailing ? 'alerta' : 'recuperado'

  return { failing, fresh, recovered, notify }
}

export function buildMessage(decision, now, config) {
  const entries = Object.entries(decision.failing)
  const critical = entries.some(([, entry]) => entry.level === 'critico')
  const when = dayAndClock.format(now)
  const lines = []
  let subject

  if (decision.notify === 'recuperado') {
    const names = decision.recovered.map((entry) => entry.title.toLowerCase()).join(', ')
    const longest = decision.recovered.map((entry) => entry.since).sort()[0]
    subject = `🟢 Audioguía Alfabia: resuelto`
    lines.push(`Resuelto tras ${duration(longest, now)}: ${names}.`)
  } else {
    const icon = critical ? '🔴' : '🟠'
    subject =
      entries.length === 1
        ? `${icon} Audioguía Alfabia: ${entries[0][1].title}`
        : `${icon} Audioguía Alfabia: ${entries.length} problemas`
    for (const [id, entry] of entries) {
      const isNew = decision.fresh.includes(id)
      if (entries.length === 1) {
        // The subject already carries the title: do not say it twice
        lines.push(`${entry.detail[0].toUpperCase()}${entry.detail.slice(1)}.`)
        if (!isNew) lines.push(`Dura ya ${duration(entry.since, now)}.`)
      } else {
        const age = isNew ? 'nuevo' : `desde hace ${duration(entry.since, now)}`
        lines.push(`${entry.title} (${age}): ${entry.detail}.`)
      }
    }
    for (const entry of decision.recovered) lines.push(`Resuelto: ${entry.title.toLowerCase()}.`)
  }

  return {
    source: 'alfabia-audioguia-watchdog',
    status: decision.notify,
    level: decision.notify === 'recuperado' ? 'ok' : critical ? 'critico' : 'aviso',
    subject,
    body: [`${subject} — ${when}`, ...lines.map((line) => `• ${line}`), config.runUrl ?? '']
      .filter(Boolean)
      .join('\n'),
    // WhatsApp template variables cannot contain line breaks
    whatsapp_line: `${subject} — ${when}. ${lines.join(' ')}`.slice(0, 900),
    checks: entries.map(([id, entry]) => ({ id, level: entry.level, title: entry.title, detail: entry.detail })),
    at: new Date(now).toISOString(),
    run_url: config.runUrl,
  }
}

async function send(config, message) {
  if (!config.webhook) {
    console.log('\n[modo prueba: sin ALERT_WEBHOOK_URL, este aviso NO se envía]')
    console.log(JSON.stringify(message, null, 2))
    return true
  }
  const res = await http(config.webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  })
  if (res.status >= 200 && res.status < 300) return true
  console.error(`No se pudo entregar el aviso: ${describe(res)}`)
  return false
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function main(config = loadConfig()) {
  if (!config.supabaseUrl || !config.supabaseKey) {
    console.error('Faltan SUPABASE_URL y SUPABASE_ANON_KEY.')
    return 2
  }

  // A simulated failure still runs off season, so the alert path can be tested
  if (!seasonInfo(Date.now()).open && config.forceFail.length === 0) {
    console.log('Fuera de temporada (14 de febrero – 31 de octubre): no se comprueba ni se avisa de nada.')
    // Start the next season clean, without incidents left over from October
    await writeState(config.stateFile, { failing: {}, checkedAt: new Date().toISOString() })
    return 0
  }

  const previous = await readState(config.stateFile)
  const { results, now } = await runChecks(config)

  for (const check of CHECKS) {
    const result = results.get(check.id)
    const mark = result.skipped ? '–' : result.ok ? '✓' : '✗'
    console.log(`${mark} ${check.id.padEnd(10)} ${result.detail}`)
  }

  const decision = decide(previous, results, now)
  let delivered = true

  if (decision.notify) {
    delivered = await send(config, buildMessage(decision, now, config))
    if (delivered) {
      const stamp = new Date(now).toISOString()
      for (const entry of Object.values(decision.failing)) entry.lastNotified = stamp
    } else {
      // Keep recovered checks on record so the "resuelto" notice is retried
      for (const entry of decision.recovered) {
        const { id, ...rest } = entry
        decision.failing[id] = rest
      }
    }
  }

  await writeState(config.stateFile, { failing: decision.failing, checkedAt: new Date(now).toISOString() })

  if (!delivered) return 2
  // A red run makes GitHub email the repository owner: a second alert channel
  const critical = Object.values(decision.failing).some((entry) => entry.level === 'critico')
  return critical ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
