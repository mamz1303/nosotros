import { initStore, store, onAuth, me, DEMO, live, resetLive, personFor } from "./store.js";
import { people, APP_NAME } from "./config.js";
import { $, $$, esc, icon, toast, ymd, parseYmd, daysBetween } from "./ui.js";
import { spotifyEmbed } from "./services.js";

import * as feed from "./views/feed.js";
import * as mapView from "./views/map.js";
import * as albums from "./views/albums.js";
import * as links from "./views/links.js";
import * as music from "./views/music.js";
import * as calendar from "./views/calendar.js";
import * as chat from "./views/chat.js";
import * as plans from "./views/plans.js";
import * as more from "./views/more.js";

const routes = {
  fotos: feed.render, post: feed.renderPost, mapa: mapView.render,
  albumes: albums.render, album: albums.renderAlbum,
  links: links.render, musica: music.render, calendario: calendar.render,
  chat: chat.render, citas: plans.render, cita: plans.renderPlan, mas: more.render,
};
const NAV = [
  { r: "fotos", label: "Fotos", ic: "image", mobile: true },
  { r: "citas", label: "Citas", ic: "sparkles", mobile: true },
  { r: "calendario", label: "Calendario", ic: "calendar", mobile: true },
  { r: "chat", label: "Chat", ic: "chat", mobile: true },
  { r: "mapa", label: "Mapa", ic: "map" },
  { r: "albumes", label: "Álbumes", ic: "album" },
  { r: "links", label: "Links", ic: "link" },
  { r: "musica", label: "Música", ic: "music" },
  { r: "mas", label: "Más", ic: "more", mobileOnly: true },
];
const MORE_ROUTES = ["mapa", "albumes", "album", "links", "musica", "mas"];

let cleanup = null;
const app = document.getElementById("app");

// ---------------------------------------------------------------- Login
function renderLogin() {
  cleanup?.(); cleanup = null;
  document.body.classList.remove("in-app");
  const emails = Object.keys(people);
  app.innerHTML = `
  <main class="login">
    <div class="login-card">
      <div class="logo">${icon("heart")}</div>
      <h1>${esc(APP_NAME)}</h1>
      <p class="muted">Nuestro rincón: fotos, planes, música y todo lo que queremos hacer juntos.</p>
      ${DEMO ? `
        <div class="demo-note">Modo demo: los datos se guardan solo en este navegador. Abre otra pestaña con la otra persona para probar el chat.</div>
        <p class="small muted">¿Quién eres?</p>
        <div class="who">${emails.map((e) => {
          const p = personFor(e);
          return `<button class="btn who-btn" data-email="${esc(e)}" style="--c:${p.color}"><span class="avatar" style="background:${p.color}">${esc(p.name[0])}</span>${esc(p.name)}</button>`;
        }).join("")}</div>`
      : `
        <button class="btn primary block" id="g">${googleLogo()} Entrar con Google</button>
        <div class="or"><span>o con correo</span></div>
        <form id="f" class="stack">
          <input type="email" name="email" placeholder="Correo" required autocomplete="email">
          <input type="password" name="pw" placeholder="Contraseña" required minlength="6" autocomplete="current-password">
          <button class="btn block">Entrar</button>
          <div class="row between small">
            <button type="button" class="linkish" id="signup">Crear cuenta</button>
            <button type="button" class="linkish" id="reset">Olvidé mi contraseña</button>
          </div>
        </form>
        <p class="small muted">Solo los dos correos autorizados pueden ver el contenido.</p>`}
    </div>
  </main>`;
  if (DEMO) {
    $$(".who-btn").forEach((b) => (b.onclick = () => store.signInDemo(b.dataset.email)));
    return;
  }
  const err = (e) => toast(({
    "auth/invalid-credential": "Correo o contraseña incorrectos",
    "auth/email-already-in-use": "Ese correo ya tiene cuenta",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres",
  })[e.code] || e.message);
  $("#g").onclick = () => store.signInGoogle().catch(err);
  const f = $("#f");
  f.onsubmit = (e) => { e.preventDefault(); store.signInEmail(f.email.value, f.pw.value).catch(err); };
  $("#signup").onclick = () => { if (f.reportValidity()) store.signUpEmail(f.email.value, f.pw.value).catch(err); };
  $("#reset").onclick = () => {
    if (!f.email.value) return toast("Escribe tu correo primero");
    store.resetPassword(f.email.value).then(() => toast("Te enviamos un correo")).catch(err);
  };
}
function googleLogo() {
  return `<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
}

function renderDenied(u) {
  app.innerHTML = `<main class="login"><div class="login-card">
    <div class="logo">${icon("heart")}</div><h1>Acceso restringido</h1>
    <p class="muted">${esc(u.email)} no está autorizado en esta app.</p>
    <button class="btn" id="out">Cerrar sesión</button></div></main>`;
  $("#out").onclick = () => store.signOut();
}

// ---------------------------------------------------------------- Shell
function renderShell() {
  document.body.classList.add("in-app");
  const u = me();
  app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <a class="brand" href="#/fotos">${icon("heart")}<span>${esc(APP_NAME)}</span></a>
      <nav>${NAV.filter((n) => !n.mobileOnly).map((n) => navLink(n)).join("")}</nav>
      <a class="nav-link" href="#/mas" data-r="mas">${icon("settings")}<span>Ajustes</span></a>
      <div class="me-chip"><span class="avatar" style="background:${u.color}">${esc(u.name[0])}</span>${esc(u.name)}</div>
    </aside>
    <div class="main-col">
      <div id="days-banner"></div>
      <main id="view" class="view"></main>
    </div>
    <div id="player-dock" class="player-dock hidden">
      <iframe title="Spotify" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
      <button class="icon-btn" id="dock-close" aria-label="Cerrar reproductor">${icon("x")}</button>
    </div>
    <nav class="tabbar">${NAV.filter((n) => n.mobile || n.mobileOnly).map((n) => navLink(n)).join("")}</nav>
  </div>`;
  $("#dock-close").onclick = () => { const d = $("#player-dock"); d.classList.add("hidden"); $("iframe", d).src = "about:blank"; document.body.classList.remove("has-player"); };
  startGlobalWatchers();
  route();
}
function navLink(n) {
  return `<a class="nav-link" href="#/${n.r}" data-r="${n.r}">${icon(n.ic)}<span>${n.label}</span>${n.r === "chat" ? `<i class="badge hidden" id="chat-badge-${n.mobile ? "m" : "d"}"></i>` : ""}</a>`;
}

// Reproductor persistente: la música sigue mientras navegas
export function playSpotify(sp, title = "") {
  const d = $("#player-dock"); if (!d) return;
  const f = $("iframe", d);
  const src = spotifyEmbed(sp);
  if (f.src !== src) f.src = src;
  d.classList.remove("hidden"); document.body.classList.add("has-player");
  d.title = title;
}

function route() {
  const hash = location.hash.replace(/^#\/?/, "") || "fotos";
  const [name, ...params] = hash.split("/").map(decodeURIComponent);
  const fn = routes[name] || routes.fotos;
  cleanup?.(); cleanup = null;
  const view = $("#view");
  if (!view) return;
  view.innerHTML = ""; view.className = `view view-${name}`;
  window.scrollTo(0, 0);
  $$(".nav-link").forEach((a) => {
    const r = a.dataset.r;
    const active = r === name || (r === "albumes" && name === "album") || (r === "fotos" && name === "post")
      || (r === "citas" && name === "cita") || (r === "mas" && a.closest(".tabbar") && MORE_ROUTES.includes(name));
    a.classList.toggle("active", active);
  });
  if (name === "chat") markChatSeen();
  try { cleanup = fn(view, ...params) || null; }
  catch (e) { console.error(e); view.innerHTML = `<p class="pad">Algo salió mal: ${esc(e.message)}</p>`; }
}
window.addEventListener("hashchange", () => { if (me()) route(); });

// ---------------------------------------------------------------- Vigilantes globales
let watchersStarted = false;
function startGlobalWatchers() {
  if (watchersStarted) return; watchersStarted = true;
  // Mensajes no leídos
  live("messages", { limit: 60 }).on((msgs) => {
    const seen = +localStorage.getItem("nosotros:chatSeen:" + me().email) || 0;
    const unread = msgs.filter((m) => m.author !== me().email && m.createdAt > seen).length;
    if (location.hash.startsWith("#/chat")) { markChatSeen(); return setBadge(0); }
    setBadge(unread);
    const last = msgs[0];
    if (last && last.author !== me().email && last.createdAt > seen && document.hidden
        && "Notification" in window && Notification.permission === "granted"
        && Date.now() - last.createdAt < 15000) {
      new Notification(personFor(last.author).name, { body: last.text || "📷", icon: "icons/icon.svg", tag: "chat" });
    }
  });
  // Contador de días juntos
  live("settings").on((arr) => {
    const s = arr.find((x) => x.id === "main") || {};
    const b = $("#days-banner"); if (!b) return;
    if (s.anniversary) {
      const n = daysBetween(parseYmd(s.anniversary), new Date());
      b.innerHTML = `<div class="days">${icon("heart")} <b>${n.toLocaleString("es")}</b> días juntos</div>`;
    } else b.innerHTML = "";
  });
  // Recordatorios del día (una vez al día al abrir la app)
  live("events", { orderBy: "date", dir: "asc" }).on((evs) => {
    const key = "nosotros:remind:" + ymd();
    if (localStorage.getItem(key)) return;
    const soon = calendar.upcoming(evs, 1);
    if (!soon.length) return;
    localStorage.setItem(key, "1");
    soon.forEach((e) => {
      const msg = `${e.when === 0 ? "Hoy" : "Mañana"}: ${e.title}${e.time ? " · " + e.time : ""}`;
      toast("🔔 " + msg, 5000);
      if ("Notification" in window && Notification.permission === "granted") new Notification(APP_NAME, { body: msg, icon: "icons/icon.svg" });
    });
  });
}
function setBadge(n) {
  $$("[id^=chat-badge]").forEach((b) => { b.textContent = n > 9 ? "9+" : n; b.classList.toggle("hidden", !n); });
}
export function markChatSeen() {
  localStorage.setItem("nosotros:chatSeen:" + me().email, String(Date.now()));
  setBadge(0);
}

// ---------------------------------------------------------------- Arranque
(async () => {
  // Compartir desde otra app (Android): TikTok/Instagram → Compartir → Nosotros
  const qs = new URLSearchParams(location.search);
  const sharedText = [qs.get("url"), qs.get("text"), qs.get("title")].filter(Boolean).join(" ");
  const sharedUrl = sharedText.match(/https?:\/\/\S+/)?.[0];
  if (sharedUrl) {
    sessionStorage.setItem("nosotros:shared", sharedUrl);
    history.replaceState(null, "", location.pathname + "#/links");
  }
  try { await initStore(); }
  catch (e) { app.innerHTML = `<p class="pad">No se pudo conectar: ${esc(e.message)}</p>`; return; }
  onAuth((u) => {
    if (!u) { resetLive(); watchersStarted = false; return renderLogin(); }
    if (!people[u.email]) return renderDenied(u);
    renderShell();
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
