// Servicios: imágenes, ubicación, vistas previas de links, Spotify, calendario externo
import { cloudinary } from "./config.js";
import { store, DEMO } from "./store.js";
import { $, esc, modal, icon, toast, debounce, safeUrl, pad } from "./ui.js";

// ============================================================ IMÁGENES
async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch {
    return await new Promise((res, rej) => {
      const img = new Image(); img.onload = () => res(img); img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }
}
function toJpeg(bmp, max, q) {
  const w0 = bmp.width, h0 = bmp.height;
  const s = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return { data: c.toDataURL("image/jpeg", q), w: c.width, h: c.height };
}

// Lee GPS y fecha de la foto (si el teléfono no los quitó)
export async function readExif(file) {
  try {
    if (!window.exifr) return {};
    const d = await window.exifr.parse(file, { gps: true, pick: ["DateTimeOriginal", "latitude", "longitude"] });
    if (!d) return {};
    const out = {};
    if (Number.isFinite(d.latitude) && Number.isFinite(d.longitude)) out.gps = { lat: d.latitude, lng: d.longitude };
    if (d.DateTimeOriginal instanceof Date) out.date = d.DateTimeOriginal;
    return out;
  } catch { return {}; }
}

// Procesa una foto y devuelve { thumb, src, w, h }
// - thumb: miniatura liviana (va dentro del documento, sirve para mapa/grillas)
// - src: URL de Cloudinary, o "media:ID" (foto comprimida guardada en Firestore)
export async function processPhoto(file) {
  const bmp = await loadBitmap(file);
  const thumb = toJpeg(bmp, 360, 0.7).data;
  if (cloudinary.cloudName && cloudinary.uploadPreset && !DEMO) {
    const fd = new FormData();
    fd.append("file", file); fd.append("upload_preset", cloudinary.uploadPreset);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`, { method: "POST", body: fd });
    if (!r.ok) throw new Error("No se pudo subir a Cloudinary");
    const j = await r.json();
    const url = j.secure_url.replace("/upload/", "/upload/f_auto,q_auto,w_1600/");
    return { thumb, src: url, w: j.width, h: j.height };
  }
  // Firestore permite ~1 MB por documento: bajamos calidad hasta que entre
  let big, q = 0.82, max = DEMO ? 1080 : 1600;
  do { big = toJpeg(bmp, max, q); q -= 0.1; if (q < 0.45) { max -= 300; q = 0.7; } }
  while (big.data.length > 900_000 && max > 600);
  const id = await store.add("media", { data: big.data, createdAt: Date.now() });
  return { thumb, src: "media:" + id, w: big.w, h: big.h };
}

const mediaCache = new Map();
export async function resolveSrc(src) {
  if (!src?.startsWith("media:")) return src;
  const id = src.slice(6);
  if (!mediaCache.has(id)) mediaCache.set(id, store.get("media", id).then((d) => d?.data || ""));
  return mediaCache.get(id);
}
// Carga diferida: <img data-src="media:..."> se resuelve cuando entra en pantalla
const io = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
  entries.forEach(async (e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    const real = await resolveSrc(e.target.dataset.src);
    if (real) { e.target.src = real; e.target.classList.add("loaded"); }
  });
}, { rootMargin: "400px" }) : null;
export function hydrateImages(root) {
  root.querySelectorAll("img[data-src]").forEach((img) => {
    if (io) io.observe(img); else resolveSrc(img.dataset.src).then((s) => (img.src = s));
  });
}

// ============================================================ UBICACIÓN
export async function searchPlaces(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=es&q=${encodeURIComponent(q)}`);
  const j = await r.json();
  return j.map((p) => ({ name: p.name || p.display_name.split(",")[0], address: p.display_name, lat: +p.lat, lng: +p.lon }));
}
export async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=es&lat=${lat}&lon=${lng}`);
    const j = await r.json();
    const a = j.address || {};
    const name = j.name || a.attraction || a.amenity || a.road || a.suburb || a.city || a.town || "Lugar";
    const city = a.city || a.town || a.village || a.state || "";
    return { name: city && name !== city ? `${name}, ${city}` : name, address: j.display_name || "" };
  } catch { return { name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, address: "" }; }
}
export function getCurrentPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("Tu navegador no permite ubicación"));
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => rej(new Error("No se pudo obtener tu ubicación")), { enableHighAccuracy: true, timeout: 10000 });
  });
}
export function mapsUrl(p) {
  return p.lat != null
    ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address || p.name)}`;
}
export function tileLayer() {
  return L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO',
  });
}
export function heartMarker(color = "#c2410c") {
  return L.divIcon({
    className: "heart-pin",
    html: `<span style="--c:${color}">${icon("heart")}</span>`,
    iconSize: [34, 34], iconAnchor: [17, 32], popupAnchor: [0, -28],
  });
}
// Mini mapa estático (no interactivo) para tarjetas
export function miniMap(el, p, zoom = 15) {
  const m = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
    doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false }).setView([p.lat, p.lng], zoom);
  tileLayer().addTo(m);
  L.marker([p.lat, p.lng], { icon: heartMarker() }).addTo(m);
  return m;
}

// Selector de ubicación: buscar, tocar el mapa o usar GPS
export function pickLocation(initial) {
  return new Promise((resolve) => {
    let chosen = initial ? { ...initial } : null, done = false;
    const m = modal({
      title: "Elegir ubicación", wide: true,
      onClose: () => { if (!done) resolve(undefined); },
      body: `
        <div class="search-box">${icon("search")}<input type="search" placeholder="Busca un lugar, dirección o ciudad" id="lp-q"></div>
        <div id="lp-results" class="results"></div>
        <div id="lp-map" class="picker-map"></div>
        <p class="muted small">Toca el mapa para mover el pin.</p>
        <label class="field"><span>Nombre del lugar</span><input id="lp-name" placeholder="Ej. Mirador de Yanahuara"></label>
        <div class="row gap wrap">
          <button class="btn ghost" id="lp-gps">${icon("locate")} Mi ubicación</button>
          ${initial ? `<button class="btn ghost danger-text" id="lp-clear">Quitar</button>` : ""}
          <span class="spacer"></span>
          <button class="btn primary" id="lp-ok">Usar esta ubicación</button>
        </div>`,
    });
    const el = m.el;
    const map = L.map($("#lp-map", el)).setView(chosen ? [chosen.lat, chosen.lng] : [-16.409, -71.537], chosen ? 15 : 12);
    tileLayer().addTo(map);
    let marker = null;
    const place = async (lat, lng, name, address) => {
      chosen = { lat, lng, name: name || "", address: address || "" };
      if (marker) marker.setLatLng([lat, lng]); else marker = L.marker([lat, lng], { icon: heartMarker() }).addTo(map);
      if (!name) { $("#lp-name", el).value = "…"; const g = await reverseGeocode(lat, lng); chosen.name = g.name; chosen.address = g.address; }
      $("#lp-name", el).value = chosen.name;
    };
    if (chosen) { place(chosen.lat, chosen.lng, chosen.name, chosen.address); }
    setTimeout(() => map.invalidateSize(), 250);
    map.on("click", (e) => place(e.latlng.lat, e.latlng.lng));
    const results = $("#lp-results", el);
    $("#lp-q", el).oninput = debounce(async (e) => {
      const q = e.target.value.trim();
      if (q.length < 3) { results.innerHTML = ""; return; }
      try {
        const list = await searchPlaces(q);
        results.innerHTML = list.map((p, i) => `<button class="result" data-i="${i}"><b>${esc(p.name)}</b><span>${esc(p.address)}</span></button>`).join("")
          || `<p class="muted small">Sin resultados</p>`;
        results.querySelectorAll(".result").forEach((b) => (b.onclick = () => {
          const p = list[+b.dataset.i]; results.innerHTML = "";
          map.setView([p.lat, p.lng], 16); place(p.lat, p.lng, p.name, p.address);
        }));
      } catch { results.innerHTML = `<p class="muted small">No se pudo buscar ahora</p>`; }
    }, 500);
    $("#lp-gps", el).onclick = async () => {
      try { const p = await getCurrentPosition(); map.setView([p.lat, p.lng], 16); place(p.lat, p.lng); }
      catch (e) { toast(e.message); }
    };
    $("#lp-clear", el)?.addEventListener("click", () => { done = true; resolve(null); m.close(); });
    $("#lp-ok", el).onclick = () => {
      if (!chosen) return toast("Elige un punto en el mapa");
      chosen.name = $("#lp-name", el).value.trim() || chosen.name;
      done = true; resolve(chosen); m.close();
    };
  });
}

// ============================================================ VISTA PREVIA DE LINKS
export function linkKind(url) {
  const h = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  if (h.includes("tiktok")) return "TikTok";
  if (h.includes("instagram")) return "Instagram";
  if (h.includes("youtu")) return "YouTube";
  if (h.includes("facebook") || h === "fb.watch") return "Facebook";
  if (h.includes("google") && url.includes("/maps") || h === "maps.app.goo.gl") return "Google Maps";
  if (h.includes("spotify")) return "Spotify";
  if (h === "x.com" || h.includes("twitter")) return "X";
  return h;
}
export async function fetchPreview(url) {
  const base = { url, site: linkKind(url), title: "", description: "", image: "" };
  try {
    const r = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
    const j = await r.json();
    if (j.status === "success" && j.data) {
      const d = j.data;
      return { ...base, title: d.title || "", description: d.description || "", image: d.image?.url || d.logo?.url || "",
        site: base.site || d.publisher || "" };
    }
  } catch {}
  try {
    const r = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    const j = await r.json();
    if (!j.error) return { ...base, title: j.title || "", description: j.author_name || "", image: j.thumbnail_url || "" };
  } catch {}
  return base;
}

// ============================================================ SPOTIFY
export function parseSpotify(url) {
  const m = String(url).match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album|track|episode|show|artist)\/([A-Za-z0-9]+)/);
  if (m) return { type: m[1], id: m[2] };
  const u = String(url).match(/^spotify:(playlist|album|track|episode|show|artist):([A-Za-z0-9]+)/);
  return u ? { type: u[1], id: u[2] } : null;
}
export function spotifyEmbed({ type, id }) {
  return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
}
export async function spotifyMeta(url) {
  try {
    const r = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
    const j = await r.json();
    return { title: j.title || "", image: j.thumbnail_url || "" };
  } catch { return { title: "", image: "" }; }
}

// ============================================================ CALENDARIO EXTERNO
function stamp(date, time) {
  const t = (time || "00:00").replace(":", "");
  return date.replace(/-/g, "") + "T" + t + "00";
}
function addMinutes(date, time, mins) {
  const [y, mo, d] = date.split("-").map(Number); const [h, mi] = (time || "00:00").split(":").map(Number);
  const dt = new Date(y, mo - 1, d, h, mi + mins);
  return { date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}` };
}
export function googleCalendarUrl(ev) {
  let dates;
  if (ev.time) { const end = addMinutes(ev.date, ev.time, 120); dates = `${stamp(ev.date, ev.time)}/${stamp(end.date, end.time)}`; }
  else { const end = addMinutes(ev.date, "00:00", 1440); dates = `${ev.date.replace(/-/g, "")}/${end.date.replace(/-/g, "")}`; }
  const p = new URLSearchParams({ action: "TEMPLATE", text: ev.title, dates, details: ev.notes || "", location: ev.place || "" });
  if (ev.yearly) p.set("recur", "RRULE:FREQ=YEARLY");
  return "https://calendar.google.com/calendar/render?" + p.toString();
}
export function downloadIcs(ev) {
  const end = ev.time ? addMinutes(ev.date, ev.time, 120) : addMinutes(ev.date, "00:00", 1440);
  const dt = (d, t) => ev.time ? `:${stamp(d, t)}` : `;VALUE=DATE:${d.replace(/-/g, "")}`;
  const escI = (s = "") => s.replace(/[,;\\]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nosotros//ES", "BEGIN:VEVENT",
    `UID:${ev.id || Date.now()}@nosotros`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART${dt(ev.date, ev.time)}`, `DTEND${dt(end.date, end.time)}`,
    `SUMMARY:${escI(ev.title)}`, ev.notes ? `DESCRIPTION:${escI(ev.notes)}` : "",
    ev.yearly ? "RRULE:FREQ=YEARLY" : "",
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${escI(ev.title)}`, "END:VALARM",
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${escI(ev.title)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = (ev.title || "evento").replace(/[^\p{L}\p{N}]+/gu, "-") + ".ics";
  a.click();
}

// Tarjeta de link reutilizable (estilo WhatsApp)
export function linkCard(l, { compact = false, actions = "" } = {}) {
  const url = safeUrl(l.url);
  const img = l.image && (l.image.startsWith("https://") ? l.image : "");
  return `<article class="link-card ${compact ? "compact" : ""} ${l.done ? "done" : ""}" data-id="${esc(l.id || "")}">
    <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="link-main">
      ${img ? `<div class="link-thumb"><img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>` : ""}
      <div class="link-text">
        <span class="link-site">${esc(l.site || "")}</span>
        <b>${esc(l.title || url)}</b>
        ${!compact && l.description ? `<p>${esc(l.description)}</p>` : ""}
        ${l.note ? `<p class="note">“${esc(l.note)}”</p>` : ""}
      </div>
    </a>
    ${actions}
  </article>`;
}
