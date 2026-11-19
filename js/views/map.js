import { live } from "../store.js";
import { $, esc, icon, fmtDate, safeImg } from "../ui.js";
import { tileLayer, heartMarker } from "../services.js";

export function render(view, focusId) {
  let mode = localStorage.getItem("nosotros:mapmode") || "both";
  view.innerHTML = `
    <header class="page-head"><h1>Nuestro mapa</h1>
      <select id="alb" class="select-sm"><option value="">Todas las fotos</option></select></header>
    <div class="seg" id="seg">
      <button data-m="heat">${icon("flame")} Calor</button>
      <button data-m="pins">${icon("pin")} Pines</button>
      <button data-m="both">Ambos</button>
      <button data-m="plans">${icon("sparkles")} Citas</button>
    </div>
    <div id="bigmap" class="big-map"></div>
    <p class="small muted" id="stat"></p>`;
  const map = L.map($("#bigmap", view), { zoomControl: true }).setView([-12.05, -77.04], 5);
  tileLayer().addTo(map);
  setTimeout(() => map.invalidateSize(), 200);
  const layer = L.layerGroup().addTo(map);
  let fitted = false;

  const postsLive = live("posts", { orderBy: "date" }), albumsLive = live("albums"), plansLive = live("plans", { orderBy: "date" });
  const draw = () => {
    const sel = $("#alb", view);
    const cur = sel.value;
    sel.innerHTML = `<option value="">Todas las fotos</option>` + albumsLive.data.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("");
    sel.value = cur;
    $$seg();
    layer.clearLayers();
    const bounds = [];
    if (mode === "plans") {
      plansLive.data.forEach((pl) => (pl.places || []).forEach((p) => {
        if (p.lat == null) return;
        bounds.push([p.lat, p.lng]);
        L.marker([p.lat, p.lng], { icon: heartMarker("#7c3aed") }).addTo(layer)
          .bindPopup(`<b>${esc(p.name)}</b><br><a href="#/cita/${esc(pl.id)}">${esc(pl.title)}</a><br><small>${fmtDate(pl.date)}</small>`);
      }));
      $("#stat", view).textContent = `${bounds.length} lugares de citas`;
    } else {
      const posts = postsLive.data.filter((p) => p.location && (!cur || (p.albumIds || []).includes(cur)));
      if ((mode === "heat" || mode === "both") && L.heatLayer) {
        L.heatLayer(posts.map((p) => [p.location.lat, p.location.lng, Math.max(1, p.images?.length || 1)]),
          { radius: 28, blur: 22, maxZoom: 14, minOpacity: 0.35,
            gradient: { 0.2: "#fde68a", 0.45: "#fb923c", 0.7: "#e11d48", 1: "#7e22ce" } }).addTo(layer);
      }
      posts.forEach((p) => {
        bounds.push([p.location.lat, p.location.lng]);
        if (mode === "heat") return;
        const thumb = safeImg(p.images?.[0]?.thumb);
        const mk = L.marker([p.location.lat, p.location.lng], {
          icon: L.divIcon({ className: "photo-pin", html: `<img src="${thumb}" alt="">`, iconSize: [44, 44], iconAnchor: [22, 22] }),
        }).addTo(layer).bindPopup(`<a href="#/post/${esc(p.id)}" class="map-pop"><img src="${thumb}" alt=""><b>${esc(p.location.name || "")}</b><small>${fmtDate(p.date)}</small></a>`);
        if (p.id === focusId) setTimeout(() => { map.setView([p.location.lat, p.location.lng], 15); mk.openPopup(); }, 300);
      });
      $("#stat", view).textContent = `${posts.length} fotos con ubicación`;
    }
    if (!focusId && bounds.length && !fitted) { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 }); fitted = true; }
  };
  const $$seg = () => view.querySelectorAll("#seg button").forEach((b) => b.classList.toggle("on", b.dataset.m === mode));
  view.querySelectorAll("#seg button").forEach((b) => (b.onclick = () => { mode = b.dataset.m; localStorage.setItem("nosotros:mapmode", mode); fitted = false; draw(); }));
  $("#alb", view).onchange = () => { fitted = false; draw(); };
  const us = [postsLive.on(draw), albumsLive.on(draw), plansLive.on(draw)];
  return () => { us.forEach((u) => u()); map.remove(); };
}
