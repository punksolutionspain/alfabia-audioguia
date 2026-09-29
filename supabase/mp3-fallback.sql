-- ═══════════════════════════════════════════════════════════════════════════
-- Alfabia Audioguía — Respaldo MP3 para iPhone con iOS anterior a 18.4
--
-- Contexto: Safari solo reproduce OGG/Opus desde iOS 18.4. En iPhones más
-- antiguos el reproductor busca translations.audio_url_mp3, y como las 90
-- filas lo tienen a NULL muestra "Audio no disponible".
--
-- REQUISITO: subir ANTES los 90 MP3 al bucket `audios`, en la misma carpeta
-- que su OGG y con el mismo nombre (audios/en/poi_01_en.mp3, etc.).
-- Si se ejecuta sin haberlos subido, esos iPhone pasarán de
-- "Audio no disponible" a "Error al cargar".
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- PASO 1 — Comprobación previa (no modifica nada)
-- ───────────────────────────────────────────────────────────────────────────
-- Esperado antes del cambio: total 18 · con_ogg 18 · con_mp3 0 por idioma.

select language,
       count(*)             as total,
       count(audio_url_ogg) as con_ogg,
       count(audio_url_mp3) as con_mp3
from translations
group by language
order by language;


-- ───────────────────────────────────────────────────────────────────────────
-- PASO 2 — Rellenar audio_url_mp3 a partir de la URL del OGG
-- ───────────────────────────────────────────────────────────────────────────
-- Idempotente: solo toca filas sin MP3. Debe afectar a 90 filas.

update translations
set audio_url_mp3 = regexp_replace(audio_url_ogg, '\.ogg$', '.mp3')
where audio_url_mp3 is null
  and audio_url_ogg like '%.ogg';


-- ───────────────────────────────────────────────────────────────────────────
-- PASO 3 — Comprobación posterior
-- ───────────────────────────────────────────────────────────────────────────
-- Esperado: total 18 · con_ogg 18 · con_mp3 18 por idioma.
-- Repetir la consulta del PASO 1.


-- ───────────────────────────────────────────────────────────────────────────
-- MARCHA ATRÁS — vuelve al estado anterior
-- ───────────────────────────────────────────────────────────────────────────
-- update translations set audio_url_mp3 = null where audio_url_mp3 like '%.mp3';
