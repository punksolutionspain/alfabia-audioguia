-- ═══════════════════════════════════════════════════════════════════════════
-- Alfabia Audioguía — Mantenimiento de analytics_events
--
-- Contexto: 145.107 filas insertadas de una en una han generado 1.154 MB de
-- WAL (el 99,9% de toda la escritura del proyecto) y agotado el Disk IO Budget.
--
-- El arreglo de raíz ya está aplicado en src/services/analyticsService.ts
-- (los eventos se envían agrupados). Este script limpia el histórico acumulado.
--
-- IMPORTANTE: ejecutar de madrugada, sin visitantes en los jardines.
-- Los pasos 2 y 3 BORRAN DATOS. Ejecuta el paso 1 completo antes.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- PASO 1 — Agregar el histórico (no destructivo)
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists analytics_daily (
  dia                 date    not null,
  event_type          text    not null,
  poi_number          integer,
  language            text,
  device_type         text,
  n                   integer not null,
  segundos_escuchados bigint
);

alter table analytics_daily enable row level security;

create index if not exists analytics_daily_dia_idx on analytics_daily (dia);


-- Volcado mes a mes. Ejecutar cada bloque por separado: agregar los 145.000
-- registros de golpe agota el tiempo de conexión con la instancia saturada.

insert into analytics_daily (dia, event_type, poi_number, language, device_type, n, segundos_escuchados)
select created_at::date, event_type, poi_number, language, device_type,
       count(*), sum(duration_listened_seconds)
from analytics_events
where created_at >= '2026-04-01' and created_at < '2026-05-01'
group by 1, 2, 3, 4, 5;

insert into analytics_daily (dia, event_type, poi_number, language, device_type, n, segundos_escuchados)
select created_at::date, event_type, poi_number, language, device_type,
       count(*), sum(duration_listened_seconds)
from analytics_events
where created_at >= '2026-05-01' and created_at < '2026-06-01'
group by 1, 2, 3, 4, 5;

insert into analytics_daily (dia, event_type, poi_number, language, device_type, n, segundos_escuchados)
select created_at::date, event_type, poi_number, language, device_type,
       count(*), sum(duration_listened_seconds)
from analytics_events
where created_at >= '2026-06-01' and created_at < '2026-07-01'
group by 1, 2, 3, 4, 5;

insert into analytics_daily (dia, event_type, poi_number, language, device_type, n, segundos_escuchados)
select created_at::date, event_type, poi_number, language, device_type,
       count(*), sum(duration_listened_seconds)
from analytics_events
where created_at >= '2026-07-01' and created_at < '2026-08-01'
group by 1, 2, 3, 4, 5;


-- ── Verificación antes de borrar nada ──
-- Los totales deben coincidir. Si no coinciden, PARA aquí.

select
  (select sum(n) from analytics_daily where dia < '2026-08-01')                as agregados,
  (select count(*) from analytics_events where created_at < '2026-08-01')      as originales;


-- ───────────────────────────────────────────────────────────────────────────
-- PASO 2 — Purga por lotes  ⚠️  BORRA DATOS
-- ───────────────────────────────────────────────────────────────────────────
--
-- Por lotes de 5.000 a propósito: un DELETE de 100.000 filas de golpe genera
-- un pico de WAL enorme y empeoraría justo el problema que intentas resolver.
-- Repetir hasta que devuelva 0 filas afectadas.

delete from analytics_events
where ctid in (
  select ctid from analytics_events
  where created_at < now() - interval '60 days'
  limit 5000
);


-- ───────────────────────────────────────────────────────────────────────────
-- PASO 3 — Recuperar espacio  ⚠️  BLOQUEA LA TABLA
-- ───────────────────────────────────────────────────────────────────────────
--
-- Solo cuando el PASO 2 ya no devuelva filas. Durante VACUUM FULL la tabla
-- queda bloqueada: la app no podrá registrar eventos (se encolarán en el
-- navegador y se enviarán después, así que no se pierde nada).

vacuum full analytics_events;
analyze analytics_events;


-- ───────────────────────────────────────────────────────────────────────────
-- PASO 4 — Comprobación posterior
-- ───────────────────────────────────────────────────────────────────────────

select relname,
       n_live_tup,
       pg_size_pretty(pg_total_relation_size(relid)) as tamano
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc
limit 10;

-- Reinicia las estadísticas para medir la mejora desde cero:
-- select pg_stat_statements_reset();


-- ───────────────────────────────────────────────────────────────────────────
-- OPCIONAL — Respaldo de abril que probablemente ya no hace falta
-- ───────────────────────────────────────────────────────────────────────────
-- drop table if exists translations_backup_20260420;
