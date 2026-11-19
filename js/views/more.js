import { store, live, me, DEMO, otherPerson } from "../store.js";
import { $, esc, icon, toast } from "../ui.js";

const COLS = ["posts", "albums", "links", "playlists", "events", "messages", "plans", "settings"];
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });

export function render(view) {
  const u = me(), o = otherPerson();
  view.innerHTML = `
    <header class="page-head"><h1>Más</h1></header>
    <nav class="more-grid">
      <a href="#/mapa" class="more-item">${icon("map")}<b>Mapa</b><small>Dónde hemos estado</small></a>
      <a href="#/albumes" class="more-item">${icon("album")}<b>Álbumes</b><small>Viajes y momentos</small></a>
      <a href="#/links" class="more-item">${icon("link")}<b>Links</b><small>Cosas por hacer</small></a>
      <a href="#/musica" class="more-item">${icon("music")}<b>Música</b><small>Nuestras playlists</small></a>
    </nav>
    <section class="card stack">
      <h3 class="sec-title">${icon("heart")} Nosotros</h3>
      <p><span class="avatar sm" style="background:${u.color}">${esc(u.name[0])}</span> ${esc(u.name)}
        &nbsp;+&nbsp; <span class="avatar sm" style="background:${o.color}">${esc(o.name[0])}</span> ${esc(o.name)}</p>
      <label class="field"><span>¿Desde cuándo están juntos?</span><input type="date" id="ann"></label>
    </section>
    <section class="card stack">
      <h3 class="sec-title">${icon("settings")} App</h3>
      <button class="btn ghost" id="inst">${icon("download")} Instalar en el celular</button>
      <button class="btn ghost" id="notif">${icon("bell")} Activar notificaciones</button>
      <button class="btn ghost" id="exp">${icon("download")} Descargar copia de seguridad (.json)</button>
      ${DEMO ? `<p class="demo-note">Estás en <b>modo demo</b>: todo se guarda solo en este navegador. Configura Firebase en <code>js/config.js</code> para sincronizar entre los dos celulares.</p>` : ""}
      <button class="btn ghost danger-text" id="out">${icon("logout")} Cerrar sesión (${esc(u.email)})</button>
    </section>`;
  const s = live("settings");
  const off = s.on((arr) => { const m = arr.find((x) => x.id === "main"); $("#ann", view).value = m?.anniversary || ""; });
  $("#ann", view).onchange = (e) => store.set("settings", "main", { anniversary: e.target.value, createdAt: 0 }).then(() => toast("Guardado"));
  $("#inst", view).onclick = async () => {
    if (installPrompt) { installPrompt.prompt(); installPrompt = null; return; }
    toast(/iphone|ipad/i.test(navigator.userAgent) ? "En Safari: Compartir → Agregar a inicio" : "En Chrome: menú ⋮ → Instalar app / Agregar a pantalla principal", 5000);
  };
  $("#notif", view).onclick = async () => {
    if (!("Notification" in window)) return toast("Este navegador no soporta notificaciones");
    toast((await Notification.requestPermission()) === "granted" ? "Notificaciones activadas" : "Permiso denegado");
  };
  $("#exp", view).onclick = () => {
    const out = {};
    let pending = COLS.length;
    COLS.forEach((c) => {
      const unsub = store.subscribe(c, (d) => {
        out[c] = d; setTimeout(() => unsub?.());
        if (--pending === 0) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
          a.download = `nosotros-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
        }
      }, { orderBy: c === "posts" || c === "plans" || c === "events" ? "date" : "createdAt" });
    });
    toast("Preparando copia… (las fotos en alta calidad no se incluyen)");
  };
  $("#out", view).onclick = () => store.signOut();
  return off;
}
