// Service worker: permite instalar la app y abrirla rápido (caché del "cascarón")
const CACHE = "nosotros-v2";
const SHELL = [
  "./", "./index.html", "./css/styles.css", "./manifest.webmanifest", "./icons/icon.svg",
  "./js/app.js", "./js/config.js", "./js/store.js", "./js/ui.js", "./js/services.js",
  "./js/views/feed.js", "./js/views/map.js", "./js/views/albums.js", "./js/views/links.js",
  "./js/views/music.js", "./js/views/calendar.js", "./js/views/chat.js", "./js/views/plans.js", "./js/views/more.js",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Red primero para nuestros archivos (así ves los cambios al publicar); caché si no hay internet
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
  );
});
