# Prompt de contexto — "Nosotros", app web de pareja

> Pega este documento al inicio de una nueva conversación (junto con los archivos del proyecto si vas a pedir cambios)
> para que el asistente entienda qué se pidió, qué se construyó y cómo está hecho.

---

## 1. Rol y objetivo

Actúa como desarrollador front-end senior. Vas a mantener y ampliar **"Nosotros"**, una aplicación web responsiva
de pareja (prioridad móvil, también usable en escritorio) para dos personas: **Manu** (Android) y **Graciela** (iPhone).
Debe seguir siendo **gratuita de alojar** (GitHub Pages) y usar **Firebase plan Spark (gratis)** como base de datos.
Responde y escribe la interfaz en **español (Perú)**.

## 2. Requerimiento original (lo que se pidió)

1. **Fotos tipo Instagram** (sin reacciones ni compartir): foto(s), descripción, **hashtags** para compartimentar,
   fecha y **ubicación**. Con la ubicación, **vista de mapa tipo mapa de calor de Google Fotos**.
   Las fotos se pueden agrupar en **álbumes** (ej. fotos de un viaje).
2. **Links con vista previa** (como WhatsApp) para guardar TikToks, reels, etc. de lugares o cosas que queremos hacer.
3. **Playlists de Spotify** (vinculadas o con reproductor integrado).
4. **Calendario con recordatorios** de fechas importantes o citas.
5. **Mensajería interna**.
6. **Apartado de citas — planificación del día**: listas de cosas por hacer, ubicaciones (con mapa y vista previa)
   e hipervínculos (nuevos o cargados desde la lista de links ya guardados).
7. Alojamiento gratis (GitHub u otro), base de datos en Firebase (Google Drive se evaluó como alternativa).

## 3. Decisiones técnicas tomadas

- **Stack:** HTML + CSS + JavaScript vanilla con **módulos ES**, **sin build** (se sube tal cual a GitHub Pages).
- **Backend:** Firebase **Auth** (Google y correo/contraseña) + **Firestore** con caché offline persistente.
  Todo vive bajo `spaces/{SPACE_ID}/…`. Las **reglas** solo permiten leer/escribir a los dos correos autorizados.
- **Modo demo:** si `firebaseConfig.apiKey` está vacío, `store.js` usa `localStorage` con la misma API
  (incluye sincronización entre pestañas para probar el chat). Se elige "quién eres" al entrar.
- **Fotos:** se comprimen en el navegador. Miniatura (~360 px) dentro de la publicación; foto grande (~1600 px, < 900 KB)
  en la colección `media` y referenciada como `"media:ID"` (carga diferida con IntersectionObserver).
  **Opcional:** Cloudinary unsigned upload (si se configura, `src` es la URL de Cloudinary).
  Firebase Storage se descartó porque ahora exige plan de pago. **Google Drive se descartó** por OAuth con token
  de 1 h, carpeta compartida entre dos cuentas y carga lenta; Drive queda para guardar el backup .json.
- **EXIF:** `exifr` (CDN) lee GPS y fecha de la foto; si no hay GPS (Android suele quitarlo), selector manual.
- **Mapas:** Leaflet 1.9.4 + teselas CARTO Voyager (OSM) + `leaflet.heat` para el mapa de calor.
  Búsqueda/geocodificación inversa con **Nominatim** (OSM). "Abrir en Maps" usa URLs de Google Maps.
- **Vista previa de links:** `api.microlink.io` (gratis) con respaldo `noembed.com`; el resultado se guarda en el
  documento para no volver a pedirlo. **Web Share Target** en el manifest: en Android, Compartir → Nosotros abre
  "Guardar link" con la URL.
- **Spotify:** iframe embed oficial en un **reproductor persistente** (dock fijo fuera de la vista; la música sigue al navegar).
  Título/portada con `open.spotify.com/oembed`. Completo si hay sesión de Spotify en el navegador; si no, previews de 30 s.
- **Recordatorios:** aviso (toast + Notification API) al abrir la app para fechas de hoy/mañana; notificación de
  mensaje nuevo si la pestaña está en segundo plano. Para avisos con la app cerrada: botones **Google Calendar**
  (URL de plantilla, con `RRULE:FREQ=YEARLY` si es anual) y **.ics** con alarmas (1 día y 2 h antes).
  Push real (FCM + Cloud Functions) quedó fuera por requerir plan de pago.
- **PWA:** `manifest.webmanifest` (instalable, maskable icons, share_target) + `sw.js` (red primero, caché de respaldo).
- **Diseño:** tonos cálidos crema/rosa (`--accent: #d1495b`), tipografías **Fraunces** (títulos) y **DM Sans** (texto),
  modo oscuro automático, barra inferior en móvil (Fotos, Citas, Calendario, Chat, Más) y barra lateral en escritorio (≥ 900 px).
  Modales como hoja inferior en móvil y diálogo centrado en escritorio.

## 4. Estructura de archivos

```
index.html              Entrada; carga Leaflet, leaflet.heat, exifr y fuentes desde CDN
manifest.webmanifest    PWA + share_target (GET ./index.html ?title&text&url)
sw.js                   Service worker
firestore.rules         Reglas (2 correos autorizados)
css/styles.css          Todos los estilos (variables CSS, claro/oscuro)
icons/                  icon.svg, icon-192.png, icon-512.png
js/config.js            firebaseConfig, people {correo: {name, color}}, SPACE_ID, cloudinary, APP_NAME
js/store.js             initStore(), store.{subscribe,get,add,set,update,remove,signIn*,signOut}, live(col, opts) (caché compartido), me(), otherPerson(), personFor()
js/ui.js                $, $$, esc, safeUrl, safeImg, modal(), confirmDialog(), actionSheet(), toast(), tagInput(), fechas (ymd, fmtDate, relDay), extractTags(), icon()
js/services.js          processPhoto(), readExif(), resolveSrc()/hydrateImages(), pickLocation(), searchPlaces(), reverseGeocode(), miniMap(), mapsUrl(), fetchPreview(), linkCard(), parseSpotify(), spotifyEmbed(), googleCalendarUrl(), downloadIcs()
js/app.js               Login (Google/correo o demo), shell, router por hash, playSpotify(), badge de chat, contador de días, recordatorios, share target
js/views/feed.js        #/fotos, #/fotos/tag/:tag, #/post/:id — postCard, compositor (openComposer), addToAlbum
js/views/map.js         #/mapa, #/mapa/:postId — calor / pines / ambos / lugares de citas, filtro por álbum
js/views/albums.js      #/albumes, #/album/:id — crear/editar, subir al álbum, elegir publicadas
js/views/links.js       #/links — linkDialog() y pickLinks() reutilizables
js/views/music.js       #/musica
js/views/calendar.js    #/calendario — TYPES, upcoming(), eventDialog(); incluye las citas con fecha
js/views/chat.js        #/chat — texto, fotos, eliminar propio (doble clic / mantener)
js/views/plans.js       #/citas, #/citas/nueva, #/cita/:id — plan del día con horas, lugares, links, notas
js/views/more.js        #/mas — accesos, aniversario, instalar, notificaciones, backup .json, cerrar sesión
```

Cada vista exporta `render(view, ...params)` y devuelve una función de limpieza (desuscripciones / `map.remove()`).

## 5. Modelo de datos (Firestore `spaces/{SPACE_ID}/…`)

| Colección | Campos |
|---|---|
| `posts` | images[{thumb, src, w, h}], caption, tags[], date "YYYY-MM-DD", location{lat,lng,name,address}\|null, albumIds[], author (correo), createdAt (ms) |
| `media` | data (dataURL JPEG), createdAt |
| `albums` | name, description, author, createdAt |
| `links` | url, title, description, image, site, note, tags[], done, author, createdAt |
| `playlists` | url, type, spotifyId, title, image, note, author, createdAt |
| `events` | title, type (aniversario\|cumple\|cita\|viaje\|recordatorio), date, time, yearly, notes, author, createdAt |
| `messages` | text, image?, thumb?, author, createdAt |
| `plans` | title, date ("" = idea sin fecha), time, notes, items[{id,text,time,done}], places[{id,name,address,lat?,lng?,url?}], linkIds[], author, createdAt |
| `settings` | doc `main`: anniversary, createdAt: 0 |

Importante: `subscribe` ordena por un campo (`createdAt` por defecto; `date` en posts/plans/events) y Firestore **excluye
documentos sin ese campo**, por eso siempre se guardan (`date: ""` en ideas).

## 6. Convenciones

- Todo texto de usuario se inserta con `esc()`; URLs con `safeUrl()` / `safeImg()` (solo http/https o data:image).
- Fechas como string `YYYY-MM-DD` (zona local); marcas de tiempo en milisegundos (`Date.now()`).
- No agregar frameworks ni paso de build sin que se pida. Mantener la API de `store.js` para que el modo demo siga funcionando.
- Los cambios de UI deben verse bien a 360–430 px de ancho y en escritorio.
- Al agregar archivos JS, añadirlos a la lista `SHELL` de `sw.js` y subir `CACHE` (ej. `nosotros-v2`).

## 7. Estado actual

- ✅ Todas las secciones pedidas funcionan; probado en modo demo (Chrome móvil y escritorio) sin errores de consola.
- ⏳ Pendiente de Manu: crear proyecto Firebase, pegar config y correos en `js/config.js` y `firestore.rules`,
  subir a GitHub Pages y agregar el dominio `usuario.github.io` en Authentication → Dominios autorizados.

## 8. Ideas para siguientes versiones

- "Un día como hoy": recuerdos de hace 1 año en el inicio.
- Reacciones mínimas/stickers en el chat y estado "visto".
- Wishlist de regalos y lista de pelis/series por ver.
- Notificaciones push reales con Firebase Cloud Messaging (requiere plan Blaze o un servicio externo).
- Exportar un álbum como PDF o collage.
- Ruleta "¿qué hacemos hoy?" eligiendo un link pendiente al azar.

## 9. Cómo pedir cambios

Indica la sección (vista) y el comportamiento esperado, por ejemplo:
"En `plans.js`, permite reordenar los ítems del plan arrastrándolos" o
"Agrega en `feed.js` un buscador por texto de descripción". Pide siempre el archivo completo modificado.
