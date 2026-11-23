# Nosotros 💞 — app de pareja

Web app responsiva (pensada para celular, también funciona en escritorio), instalable como app (PWA).
Sin servidor propio y sin paso de compilación: son archivos estáticos que se suben a **GitHub Pages**
y guardan los datos en **Firebase** (plan gratuito Spark).

## Qué incluye

| Sección | Qué hace |
|---|---|
| **Fotos** | Publicaciones tipo Instagram (sin likes): carrusel de varias fotos, descripción, #hashtags (filtrables), fecha y ubicación. Vista lista o cuadrícula. |
| **Mapa** | Mapa de calor + pines con miniaturas de todas las fotos con ubicación (estilo Google Fotos). Filtro por álbum y vista de los lugares de las citas. |
| **Álbumes** | Agrupa publicaciones (ej. "Viaje a Cusco"). Subir directo al álbum o elegir fotos ya publicadas. |
| **Links** | Guarda TikToks, reels, YouTube o cualquier página con vista previa (como WhatsApp). Pendientes / hechos, categorías y búsqueda. En Android se puede **compartir directo desde TikTok/Instagram → Nosotros** (con la app instalada). |
| **Música** | Playlists, álbumes o canciones de Spotify con reproductor integrado que **sigue sonando mientras navegas**. |
| **Calendario** | Aniversarios, cumpleaños, citas, viajes; repetición anual, contador "en X días", aviso al abrir la app y botones para pasar el evento a Google Calendar o .ics (para avisos reales en el celular). |
| **Chat** | Mensajería en tiempo real entre los dos, con fotos, separadores por día y contador de no leídos. |
| **Citas** | Planificador del día: lista con horas, lugares con mini mapa y botón "Abrir en Maps", links (nuevos o elegidos de los guardados), notas, y "Subir fotos de esta cita". Las citas con fecha aparecen solas en el calendario. |
| **Más** | Fecha de inicio (contador de días juntos), instalar app, notificaciones, copia de seguridad .json, cerrar sesión. |

## Probarla ya (modo demo)

Con `firebaseConfig.apiKey` vacío la app arranca en **modo demo**: eliges quién eres y todo se guarda en el
navegador. Abre dos pestañas (una como cada persona) para probar el chat.

Para abrirla en tu PC necesitas un servidor local (los módulos JS no funcionan con doble clic):
```bash
cd nosotros
python -m http.server 8000      # luego abre http://localhost:8000
```

## Puesta en marcha real (≈15 min)

### 1. Firebase
1. Entra a <https://console.firebase.google.com> → **Agregar proyecto** (puedes desactivar Analytics).
2. **Compilación → Authentication → Comenzar** → habilita **Google** (y si quieres **Correo/contraseña**).
3. **Compilación → Firestore Database → Crear base de datos** → modo producción → región `southamerica-east1` (São Paulo) o la que prefieras.
4. Pestaña **Reglas** de Firestore: pega el contenido de `firestore.rules` **cambiando los dos correos** → Publicar.
5. **Configuración del proyecto (⚙️) → Tus apps → Web (</>)** → registra la app → copia el objeto `firebaseConfig`.

### 2. Configurar la app
Edita `js/config.js`:
- Pega `firebaseConfig`.
- En `people` pon los **dos correos** (los mismos de las reglas), nombres y colores.

### 3. Publicar en GitHub Pages
1. Crea un repositorio (puede ser privado si tienes GitHub Pro; si es público, no hay problema: los datos están protegidos por las reglas de Firebase, no por el código).
2. Sube todo el contenido de la carpeta `nosotros/` a la raíz del repo.
3. **Settings → Pages → Deploy from a branch → `main` / root** → Save. En 1–2 min tendrás `https://TU-USUARIO.github.io/REPO/`.
4. En Firebase: **Authentication → Configuración → Dominios autorizados → Agregar** `TU-USUARIO.github.io`.

### 4. Instalar en los celulares
- **Android (Chrome):** abre la URL → menú ⋮ → *Instalar app*. Así aparece también en el menú *Compartir*.
- **iPhone (Safari):** Compartir → *Agregar a pantalla de inicio*.

## Fotos: dónde se guardan

- **Por defecto (cero configuración):** cada foto se comprime a ~1600 px y se guarda en Firestore (colección `media`),
  más una miniatura liviana dentro de la publicación. El plan gratis da **1 GB** ≈ 2.000–3.000 fotos.
- **Opcional, alta calidad:** Cloudinary gratis (25 GB). Crea cuenta → *Settings → Upload → Add upload preset* →
  *Signing mode: Unsigned* → pon `cloudName` y `uploadPreset` en `js/config.js`.

> **¿Por qué no Google Drive?** Se puede, pero exige que cada uno inicie sesión con permisos de Drive, el token caduca
> cada hora, hay que compartir una carpeta entre ambos y las imágenes cargan bastante más lento. Firestore/Cloudinary
> son más rápidos y fluidos. Tu espacio de Drive sí te sirve para guardar la **copia de seguridad .json** (Más → Descargar copia).

> **Ubicación automática:** si la foto trae GPS, se toma sola. Algunos Android quitan el GPS al elegir desde la galería
> por privacidad; en ese caso se elige a mano (buscador, tocar el mapa o "Mi ubicación").

> **iPhone:** si al entrar con Google en la app instalada se queda en blanco o vuelve al login (Safari limita las
> ventanas emergentes en apps instaladas), usen **correo y contraseña**: botón *Crear cuenta* una sola vez con el correo autorizado.

## Búsqueda de direcciones con Google (opcional)

Por defecto el buscador de ubicación usa OpenStreetMap (gratis, sin tarjeta). Encuentra bien lugares, calles y distritos,
pero no siempre direcciones con número exacto. Si quieren la base de Google:

1. Entra a <https://console.cloud.google.com> con el mismo proyecto de Firebase (`nosotros-469d0`).
2. **Facturación**: vincula una cuenta de facturación (pide tarjeta). Google da **10.000 búsquedas gratis al mes**;
   para dos personas no se llega ni cerca, pero pon un tope en **APIs y servicios → Cuotas** por tranquilidad.
3. **APIs y servicios → Biblioteca**: habilita **Maps JavaScript API** y **Places API (New)**.
4. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**. En *Restricciones de aplicación* elige
   **Sitios web** y agrega `https://mamz1303.github.io/*`; en *Restricciones de API* marca solo esas dos APIs.
5. Pega la clave en `googleMapsKey` dentro de `js/config.js`.

Si la clave falla o se acaba la cuota, la app vuelve sola a OpenStreetMap.

## Limitaciones honestas
- **Spotify:** el reproductor integrado reproduce completo si la persona tiene sesión de Spotify abierta en ese navegador; si no, son vistas previas de 30 s. Un reproductor 100 % propio requiere Spotify Premium + app registrada en Spotify Developers.
- **Avisos con la app cerrada:** las notificaciones push reales necesitan un servidor (Cloud Functions = plan de pago). Por eso cada fecha tiene botones para pasarla a Google Calendar / .ics, que sí avisan en el celular. Con la app abierta (o en segundo plano) sí avisa de mensajes nuevos y fechas de hoy/mañana.
- **Vista previa de links:** usa el servicio gratuito microlink.io (≈50 previsualizaciones/día) y se guarda una sola vez por link. Instagram a veces no entrega imagen.

## Estructura
```
index.html              Entrada; carga Leaflet (mapas), leaflet.heat y exifr desde CDN
manifest.webmanifest    PWA + "compartir a Nosotros" en Android
sw.js                   Service worker (instalable, carga rápida)
firestore.rules         Reglas: solo los 2 correos autorizados
css/styles.css          Estilos (claro/oscuro automático)
js/config.js            ← lo único que debes editar
js/store.js             Capa de datos: Firebase o modo demo (misma API)
js/services.js          Fotos (compresión, EXIF, Cloudinary), mapas, vistas previas, Spotify, Google Calendar/.ics
js/ui.js                Utilidades (modales, toasts, fechas, íconos, hashtags)
js/app.js               Login, navegación, reproductor persistente, avisos
js/views/*.js           Una vista por sección
```

## Modelo de datos (Firestore: `spaces/nosotros/...`)
- `posts` { images[{thumb, src, w, h}], caption, tags[], date, location{lat,lng,name,address}, albumIds[], author, createdAt }
- `media` { data } — foto comprimida (solo si no usas Cloudinary)
- `albums` { name, description, author, createdAt }
- `links` { url, title, description, image, site, note, tags[], done, author, createdAt }
- `playlists` { url, type, spotifyId, title, image, note, author, createdAt }
- `events` { title, type, date, time, yearly, notes, author, createdAt }
- `messages` { text, image?, thumb?, author, createdAt }
- `plans` { title, date, time, notes, items[{id,text,time,done}], places[{id,name,address,lat,lng,url?}], linkIds[], author, createdAt }
- `settings/main` { anniversary }
