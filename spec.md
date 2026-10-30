# Cierre de turno

Proyecto para el Hacktoberfest Hack Day CDMX (MLH), build day miércoles 28 de octubre de 2026, 13:00 a 19:00, Sandbox Hub, Polanco.

## Pitch (60 segundos)

Los desarrolladores no abren apps de bienestar: les piden constancia justo cuando no la tienen. Cierre de turno no pide nada. Conectas tu GitHub y te devuelve una nota de voz de cuarenta segundos que te dice qué cerraste hoy, qué quedó abierto y por dónde empiezas mañana. No es un terapeuta, es el amigo que te dice que ya cierres la laptop.

## Qué hace

1. El usuario pega su usuario de GitHub y pulsa "cerrar el día".
2. El sistema lee su actividad de las últimas 24 horas: commits, PRs abiertos y mergeados, issues asignados, reviews.
3. Distingue lo que parece productivo (cantidad de commits) de lo que fue productivo (un PR mergeado, un bug cerrado, un review hecho).
4. Escribe un guion de máximo 90 palabras y lo convierte en audio de unos 40 segundos.
5. Devuelve el reproductor, el texto de la nota y una segunda nota corta para mañana: "empieza por X".

## Qué no hace

- No pregunta cómo te sientes.
- No tiene chat, rachas, medallas ni notificaciones.
- No da consejo médico ni psicológico.
- No necesita cuenta ni base de datos.

## Reglas de tono (aquí está el proyecto)

- Segunda persona, sin tecnicismos. "Hoy cerraste el login que fallaba en Safari", no "3 commits en auth".
- Nunca felicita por volumen.
- No usa la palabra productividad.
- Máximo 90 palabras. Si no cabe, se recorta.
- La última frase siempre da permiso de parar.
- Si no hubo commits, no regaña: "hoy no era día de cerrar cosas, y también cuenta".
- Nada de signos de admiración ni emojis.

## Arquitectura mínima

- Una página estática en Cloudflare Pages, blanco y negro, Space Grotesk, según PAGE/DESIGN.md.
- Un Worker con `POST /api/nota`:
  - GitHub API pública: `/repos/{owner}/{repo}/commits`, `/search/issues?q=is:pr+author:...`, `/issues?assignee=...`. Sin token alcanza para el demo (60 req/h).
  - Gemma 4 para el guion (Ollama local o Gemini API, con respaldo en la otra).
  - ElevenLabs TTS con el guion. El audio se genera al crear la nota y se guarda, nunca en vivo durante el demo.
- Respuesta: `{ guion, audio_url, dur_s, manana, fuentes[] }`.

## Plan de 6 horas

| Hora | Qué |
|---|---|
| 13:00 a 13:20 | Repo público nuevo, deploy vacío, llaves, una voz en español |
| 13:20 a 14:30 | Worker `/api/nota` con GitHub y el guion. Sin UI todavía |
| 14:30 a 15:30 | Audio con ElevenLabs, medir duración real, guardar el mp3 |
| 15:30 a 17:00 | Página: usuario, botón, reproductor, texto debajo |
| 17:00 a 17:45 | Nota de mañana y botón de copiar o correo |
| 17:45 a 18:20 | Probar 3 cuentas: la tuya, una con muchos commits, una sin commits hoy |
| 18:20 a 19:00 | README, repo público, video de 90 s, pitch de 60 s |

## Tracks

- Best Use of ElevenLabs: la voz es el producto, no el adorno.
- Best Use of Gemma 4 y Best Open-Source AI Project: el guion sale de un modelo de pesos abiertos.
- Firecrawl es opcional (leer páginas de PR e issues). No es la fuerza, se usa solo si sobra tiempo.

## Riesgos y respaldos

- Wifi del venue: el audio ya está generado antes del demo, y hay video de 90 segundos grabado a las 18:20.
- Cuenta sin actividad: el demo usa la cuenta de Petra (18 repos públicos, pushes recientes en entropia-escrow y videodanza-nft).
- Micrófono: no se usa micrófono. Todo el audio sale del sistema.
- Regla 6 y 9 de MLH: repo nuevo, sin código de Entropy, Virtuals ni Fyre. Se reutiliza criterio e infraestructura, no archivos.

## Qué llevar mañana

- Llave de ElevenLabs (el free tier de 10k créditos alcanza).
- Llave de Firecrawl solo si se va a usar.
- Laptop con Ollama y Gemma 4 ya descargado, por si no hay API.
- El repo vacío creado, sin commits de código previo.
