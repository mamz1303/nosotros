// Servicios: imágenes, ubicación, vistas previas de links, Spotify, calendario externo
import { cloudinary, googleMapsKey } from "./config.js";
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
// Búsqueda con autocompletado (estilo app de taxi).
// - Gratis y sin clave: Photon (datos de OpenStreetMap), priorizando lo cercano al mapa.
// - Opcional: Google Places, si pones googleMapsKey en config.js (mejor con direcciones con número).
async function photonSearch(q, near) {
  const bias = near ? `&lat=${near.lat}&lon=${near.lng}&location_bias_scale=0.3` : "";
  const r = await fetch(`https://photon.komoot.io/api/?limit=7${bias}&q=${encodeURIComponent(q)}`);
  const j = await r.json();
  return (j.features || []).map((f) => {
    const p = f.properties || {}, [lng, lat] = f.geometry.coordinates;
    const street = [p.street, p.housenumber].filter(Boolean).join(" ");
    const main = p.name || street || p.city || p.state || "Lugar";
    const secondary = [p.name && street, p.district || p.locality, p.city || p.county, p.state, p.country]
      .filter((x, i, a) => x && x !== main && a.indexOf(x) === i).join(", ");
    return { name: main, address: secondary, lat, lng };
  });
}

let gPlaces = null;
function loadGooglePlaces() {
  if (gPlaces) return gPlaces;
  gPlaces = new Promise((res, rej) => {
    window.__gmapsReady = () => google.maps.importLibrary("places").then(res, rej);
    const sc = document.createElement("script");
    sc.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsKey)}&v=weekly&loading=async&callback=__gmapsReady`;
    sc.async = true; sc.onerror = () => { gPlaces = null; rej(new Error("No cargó Google")); };
    document.head.appendChild(sc);
  });
  return gPlaces;
}
let gToken = null;
async function googleSearch(q, near) {
  const lib = await loadGooglePlaces();
  gToken ||= new lib.AutocompleteSessionToken();
  const req = { input: q, sessionToken: gToken, language: "es", region: "pe" };
  if (near) req.locationBias = { center: near, radius: 30000 };
  const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
  return suggestions.filter((s) => s.placePrediction).map((s) => {
    const pp = s.placePrediction;
    return {
      name: pp.mainText?.toString() || pp.text.toString(),
      address: pp.secondaryText?.toString() || "",
      // las coordenadas se piden solo al elegir (así el autocompletado no se cobra)
      resolve: async () => {
        const place = pp.toPlace();
        await place.fetchFields({ fields: ["location", "formattedAddress"] });
        gToken = null;
        return { lat: place.location.lat(), lng: place.location.lng(), address: place.formattedAddress || "" };
      },
    };
  });
}
export async function searchPlaces(q, near) {
  if (googleMapsKey) {
    try { return await googleSearch(q, near); } catch (e) { console.warn("Google Places falló, uso OSM", e); }
  }
  return photonSearch(q, near);
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
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; OpenStreetMap',
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

// Selector de ubicación estilo app de taxi: escribe la dirección y elige de la lista,
// o toca / arrastra el pin en el mapa, o usa tu ubicación actual.
export function pickLocation(initial) {
  return new Promise((resolve) => {
    let chosen = initial ? { ...initial } : null, done = false, seq = 0;
    const m = modal({
      title: "Elegir ubicación", wide: true,
      onClose: () => { if (!done) resolve(undefined); },
      body: `
        <div class="search-box taxi">${icon("pin")}<input type="search" placeholder="¿A dónde? Escribe dirección o lugar" id="lp-q" autocomplete="off" enterkeyhint="search"></div>
        <div id="lp-results" class="results taxi-results"></div>
        <div id="lp-map" class="picker-map"></div>
        <p class="muted small">También puedes tocar el mapa o arrastrar el pin.</p>
        <label class="field"><span>Nombre del lugar</span><input id="lp-name" placeholder="Ej. Mirador de Yanahuara"></label>
        <div class="row gap wrap">
          ${initial ? `<button class="btn ghost danger-text" id="lp-clear">Quitar</button>` : ""}
          <span class="spacer"></span>
          <button class="btn primary" id="lp-ok">Usar esta ubicación</button>
        </div>`,
    });
    const el = m.el, q = $("#lp-q", el), results = $("#lp-results", el);
    const map = L.map($("#lp-map", el)).setView(chosen ? [chosen.lat, chosen.lng] : [-16.409, -71.537], chosen ? 16 : 12);
    tileLayer().addTo(map);
    let marker = null;
    const place = async (lat, lng, name, address) => {
      chosen = { lat, lng, name: name || "", address: address || "" };
      if (marker) marker.setLatLng([lat, lng]);
      else {
        marker = L.marker([lat, lng], { icon: heartMarker(), draggable: true }).addTo(map);
        marker.on("dragend", () => { const p = marker.getLatLng(); place(p.lat, p.lng); });
      }
      if (!name) { $("#lp-name", el).value = "…"; const g = await reverseGeocode(lat, lng); chosen.name = g.name; chosen.address = g.address; }
      $("#lp-name", el).value = chosen.name;
    };
    if (chosen) place(chosen.lat, chosen.lng, chosen.name, chosen.address);
    setTimeout(() => map.invalidateSize(), 250);
    map.on("click", (e) => { results.innerHTML = ""; place(e.latlng.lat, e.latlng.lng); });

    const useGps = async () => {
      results.innerHTML = `<p class="muted small pad-s">Buscando tu ubicación…</p>`;
      try { const p = await getCurrentPosition(); results.innerHTML = ""; map.setView([p.lat, p.lng], 17); place(p.lat, p.lng); }
      catch (e) { results.innerHTML = ""; toast(e.message); }
    };
    const gpsRow = `<button class="result" data-gps>${icon("locate")}<div><b>Usar mi ubicación actual</b><span>GPS del celular</span></div></button>`;
    const showGps = () => { results.innerHTML = gpsRow; $("[data-gps]", results).onclick = useGps; };
    q.onfocus = () => { if (!q.value.trim()) showGps(); };
    q.oninput = debounce(async () => {
      const text = q.value.trim();
      if (text.length < 3) { text ? (results.innerHTML = "") : showGps(); return; }
      const my = ++seq;
      results.innerHTML = `<p class="muted small pad-s">Buscando…</p>`;
      try {
        const c = map.getCenter();
        const list = await searchPlaces(text, { lat: c.lat, lng: c.lng });
        if (my !== seq) return; // llegó una respuesta vieja
        results.innerHTML = list.map((p, i) => `<button class="result" data-i="${i}">${icon("pin")}<div><b>${esc(p.name)}</b><span>${esc(p.address)}</span></div></button>`).join("")
          || `<p class="muted small pad-s">Sin resultados. Prueba con el nombre del lugar o la calle y el distrito.</p>`;
        results.querySelectorAll("[data-i]").forEach((b) => (b.onclick = async () => {
          let p = list[+b.dataset.i];
          results.innerHTML = ""; q.blur();
          if (p.resolve) { try { p = { ...p, ...(await p.resolve()) }; } catch { return toast("No se pudo abrir ese lugar"); } }
          map.setView([p.lat, p.lng], 17); place(p.lat, p.lng, p.name, p.address);
        }));
      } catch { if (my === seq) results.innerHTML = `<p class="muted small pad-s">No se pudo buscar ahora</p>`; }
    }, 350);
    $("#lp-clear", el)?.addEventListener("click", () => { done = true; resolve(null); m.close(); });
    $("#lp-ok", el).onclick = () => {
      if (!chosen) return toast("Busca una dirección o toca el mapa");
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
