# Vigilante de la audioguía

Un script que comprueba desde fuera, cada 10 minutos, que la audioguía **funciona**, no solo que responde, y avisa por WhatsApp cuando algo falla y cuando se resuelve.

- Script: [`scripts/watchdog.mjs`](../scripts/watchdog.mjs) (Node 20+, sin dependencias).
- Programación: [`.github/workflows/watchdog.yml`](../.github/workflows/watchdog.yml) (GitHub Actions).
- Avisos: un webhook de Make que reenvía a WhatsApp.

Se ejecuta en GitHub y no en Vercel a propósito: un vigilante tiene que vivir fuera de lo que vigila.

## Temporada

Solo trabaja mientras los jardines están abiertos: **del 14 de febrero al 31 de octubre**, ambos incluidos, en hora de Madrid. Fuera de esas fechas no comprueba ni avisa de nada.

Las fechas están al principio del script, en la constante `SEASON`. Si cambia el calendario, se cambia ahí.

De noviembre a enero queda una ejecución diaria que no comprueba nada. Existe porque GitHub desactiva las tareas programadas de un repositorio público tras 60 días sin commits, y esa ejecución reinicia el contador para que el vigilante no llegue apagado al 14 de febrero.

## Qué comprueba

| Comprobación | Nivel | Falla cuando |
|---|---|---|
| `web` | crítico | La página principal, el programa de la app, el service worker o el manifiesto no cargan |
| `datos` | crítico | No hay 18 puntos, o a algún idioma le falta una traducción o un audio en OGG o en MP3 |
| `audios` | crítico | Algún archivo de audio no se puede descargar |
| `actividad` | crítico | Ninguna visita en 45 minutos, cuando en esa misma franja hubo al menos 5 en cada una de las dos semanas anteriores |
| `lentitud` | aviso | La base de datos tarda más de 4 segundos dos veces seguidas |
| `mapas` | aviso | La política de seguridad deja de permitir OpenStreetMap, o OpenStreetMap no responde |

Detalles que conviene saber:

- **Audios:** hay 180 archivos (18 puntos × 5 idiomas × 2 formatos). Cada pasada revisa 6 y va rotando, así que los recorre todos en 5 horas. Revisarlos de golpe hace que Supabase responda con error 429.
- **Actividad:** se compara con las dos semanas anteriores para no dar falsas alarmas de noche, en días flojos ni al empezar la temporada. Puede dar una falsa alarma si los jardines cierran un día en que las dos semanas anteriores abrieron.
- **Confirmación:** si algo falla, se repite la comprobación a los 20 segundos antes de avisar.

## Cuándo avisa

- Cuando algo **empieza a fallar**.
- Cada **2 horas** mientras siga fallando.
- Cuando **se resuelve**, indicando cuánto ha durado.

No avisa cada 10 minutos: recuerda qué fallaba en la pasada anterior.

Además, si falla algo crítico la ejecución queda en rojo y GitHub envía su propio correo al dueño del repositorio. Es un segundo canal por si falla el webhook.

## Qué envía al webhook

Un `POST` con este JSON:

```json
{
  "source": "alfabia-audioguia-watchdog",
  "status": "alerta",
  "level": "critico",
  "subject": "🔴 Audioguía Alfabia: Hay audios que no se descargan",
  "body": "🔴 Audioguía Alfabia: Hay audios que no se descargan — 5/10, 11:00\n• Fallan poi_07_en.mp3 (HTTP 400).\nhttps://github.com/…/actions/runs/…",
  "whatsapp_line": "🔴 Audioguía Alfabia: Hay audios que no se descargan — 5/10, 11:00. Fallan poi_07_en.mp3 (HTTP 400).",
  "checks": [{ "id": "audios", "level": "critico", "title": "…", "detail": "…" }],
  "at": "2026-10-05T09:00:00.000Z",
  "run_url": "https://github.com/…/actions/runs/…"
}
```

- `status`: `alerta` o `recuperado`. `level`: `critico`, `aviso` u `ok`.
- `subject` y `body` siguen el formato del aviso de Doctor_Post, por si se quiere reenviar también por correo.
- `whatsapp_line` es el mismo texto en una sola línea, porque las variables de una plantilla de WhatsApp no admiten saltos de línea.

## Puesta en marcha

### 1. Escenario en Make

Webhook personalizado → módulo de WhatsApp, enviando `whatsapp_line`.

WhatsApp solo permite a una empresa iniciar una conversación con una **plantilla aprobada** por Meta. Hay que crear una plantilla de tipo utilidad con una variable, por ejemplo `Aviso del vigilante: {{1}}`, y pasarle `whatsapp_line`.

### 2. Secretos en GitHub

En el repositorio, *Settings → Secrets and variables → Actions*:

| Secreto | Valor |
|---|---|
| `ALERT_WEBHOOK_URL` | La dirección del webhook de Make |
| `SUPABASE_URL` | El mismo que `VITE_SUPABASE_URL` en `.env.local` |
| `SUPABASE_ANON_KEY` | El mismo que `VITE_SUPABASE_ANON_KEY` en `.env.local` |

Sin `ALERT_WEBHOOK_URL` el vigilante funciona en modo prueba: comprueba todo y escribe el aviso en el registro, pero no lo envía.

### 3. Activar

Las tareas programadas de GitHub solo se ejecutan desde la rama `main`.

## Probar que llega el aviso

En GitHub, *Actions → Vigilante de la audioguía → Run workflow*, escribiendo en **simular_fallo** el nombre de una comprobación, por ejemplo `audios`. Llega una alerta marcada como PRUEBA y, en la pasada siguiente, el mensaje de resuelto.

En local, sin enviar nada:

```bash
node --env-file=.env.local scripts/watchdog.mjs
```

## Silenciar una comprobación

Crear en GitHub la variable `WATCHDOG_SKIP` (*Settings → Secrets and variables → Actions → Variables*) con los nombres separados por comas, por ejemplo `actividad`. Borrarla para reactivar.

## Limitaciones

- **Puntualidad:** GitHub puede retrasar las tareas programadas varios minutos en horas de mucha carga.
- **Registro público:** el repositorio es público, así que el resultado de cada pasada lo puede ver cualquiera. No se escriben secretos.
- **No ve lo que ve un móvil:** comprueba que los archivos existen y se descargan, no que un teléfono concreto pueda reproducirlos. Un fallo como el de los iPhone con iOS anterior a 18.4 lo detecta por la parte que le toca (falta el MP3), pero no un fallo que dependa solo del navegador.
- **Lectura del analytics:** la comprobación de actividad lee la tabla de eventos con la clave pública. Si se cierra ese acceso, avisa de que ha dejado de ver el analytics en lugar de callar.
