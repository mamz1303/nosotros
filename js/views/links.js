import { store, live, me } from "../store.js";
import { $, $$, esc, icon, modal, toast, confirmDialog, actionSheet, emptyState, tagInput, safeUrl, debounce } from "../ui.js";
import { fetchPreview, linkCard } from "../services.js";

const CATS = ["lugares", "comida", "planes", "viajes", "recetas", "regalos", "pelis", "otros"];

export function render(view, mode, value) {
  let filter = "pending", q = "", tag = mode === "tag" ? value : "";
  view.innerHTML = `
    <header class="page-head"><h1>Cosas por hacer</h1><button class="btn primary" id="add">${icon("plus")} Link</button></header>
    <p class="muted small">Guarda TikToks, reels, videos o páginas de lugares y planes. En Android también puedes usar “Compartir → ${esc(document.title)}”.</p>
    <div class="search-box">${icon("search")}<input type="search" id="q" placeholder="Buscar"></div>
    <div class="seg" id="seg"><button data-f="pending">Pendientes</button><button data-f="done">Hechos</button><button data-f="all">Todos</button></div>
    <div class="tag-bar" id="tb"></div>
    <div id="list" class="link-list"></div>`;
  const linksLive = live("links");
  const draw = () => {
    $$("#seg button", view).forEach((b) => b.classList.toggle("on", b.dataset.f === filter));
    const all = linksLive.data;
    const counts = {};
    all.forEach((l) => (l.tags || []).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    $("#tb", view).innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `<button class="chip ${t === tag ? "on" : ""}" data-t="${esc(t)}">#${esc(t)} <small>${n}</small></button>`).join("");
    $$("#tb .chip", view).forEach((c) => (c.onclick = () => { tag = tag === c.dataset.t ? "" : c.dataset.t; draw(); }));
    const list = all.filter((l) => (filter === "all" || (filter === "done" ? l.done : !l.done))
      && (!tag || (l.tags || []).includes(tag))
      && (!q || `${l.title} ${l.description} ${l.note} ${l.site} ${(l.tags || []).join(" ")}`.toLowerCase().includes(q)));
    const box = $("#list", view);
    if (!linksLive.ready) return;
    box.innerHTML = list.length ? list.map((l) => linkCard(l, {
      actions: `<div class="link-actions">
        <button class="icon-btn ${l.done ? "on" : ""}" data-done aria-label="Marcar hecho">${icon("check")}</button>
        <button class="icon-btn" data-menu aria-label="Opciones">${icon("more")}</button></div>`,
    })).join("") : emptyState("link", filter === "done" ? "Nada marcado como hecho aún" : "Sin links", "Pega un link de TikTok, Instagram, YouTube o cualquier página.");
    $$(".link-card", box).forEach((c) => {
      const l = all.find((x) => x.id === c.dataset.id);
      $("[data-done]", c).onclick = () => store.update("links", l.id, { done: !l.done });
      $("[data-menu]", c).onclick = () => actionSheet(l.title || "Link", [
        { label: "Editar", icon: "edit", run: () => linkDialog(l) },
        { label: "Planear una cita con esto", icon: "sparkles", run: () => { sessionStorage.setItem("nosotros:planLink", l.id); location.hash = "#/citas/nueva"; } },
        { label: "Actualizar vista previa", icon: "search", run: async () => { const p = await fetchPreview(l.url); await store.update("links", l.id, { ...p, url: l.url }); toast("Actualizado"); } },
        { label: "Eliminar", icon: "trash", danger: true, run: async () => { if (await confirmDialog("Se eliminará este link.")) store.remove("links", l.id); } },
      ]);
    });
  };
  const u = linksLive.on(draw);
  $$("#seg button", view).forEach((b) => (b.onclick = () => { filter = b.dataset.f; draw(); }));
  $("#q", view).oninput = debounce((e) => { q = e.target.value.toLowerCase().trim(); draw(); }, 200);
  $("#add", view).onclick = () => linkDialog();
  const shared = sessionStorage.getItem("nosotros:shared");
  if (shared) { sessionStorage.removeItem("nosotros:shared"); linkDialog(null, shared); }
  return u;
}

// Diálogo para crear/editar link. Devuelve el id guardado (o null)
export function linkDialog(existing = null, prefillUrl = "", presetTags = []) {
  return new Promise((resolve) => {
    let preview = existing ? { ...existing } : null, saved = false;
    const m = modal({
      title: existing ? "Editar link" : "Guardar link",
      onClose: () => { if (!saved) resolve(null); },
      body: `
        <label class="field"><span>Link</span><input id="u" type="url" inputmode="url" placeholder="https://vm.tiktok.com/…" value="${esc(existing?.url || prefillUrl)}"></label>
        <div id="pv" class="pv-box"></div>
        <label class="field"><span>Título</span><input id="ti" value="${esc(existing?.title || "")}" placeholder="Se completa solo"></label>
        <label class="field"><span>Nota</span><input id="no" value="${esc(existing?.note || "")}" placeholder="Ej. vamos cuando cobremos 😅"></label>
        <div class="field"><span>Categorías / hashtags</span><div id="tg"></div>
          <div class="chips small-chips">${CATS.map((c) => `<button type="button" class="chip" data-c="${c}">#${c}</button>`).join("")}</div></div>
        <button class="btn primary block" id="ok">Guardar</button>`,
    });
    const el = m.el;
    const tags = tagInput($("#tg", el), existing?.tags || presetTags);
    $$("[data-c]", el).forEach((b) => (b.onclick = () => tags.add(b.dataset.c)));
    const showPv = () => { $("#pv", el).innerHTML = preview?.url ? linkCard(preview, { compact: false }) : ""; };
    const load = async () => {
      const raw = $("#u", el).value.trim();
      const found = raw.match(/https?:\/\/\S+/)?.[0] || raw;
      const url = safeUrl(found);
      if (!url || url === preview?.url) return;
      if (found !== raw) $("#u", el).value = url;
      $("#pv", el).innerHTML = `<div class="skeleton thin"></div>`;
      preview = await fetchPreview(url);
      if (!$("#ti", el).value) $("#ti", el).value = preview.title || "";
      showPv();
    };
    showPv();
    $("#u", el).addEventListener("input", debounce(load, 600));
    if (prefillUrl && !existing) load();
    $("#ok", el).onclick = async () => {
      await load();
      const url = safeUrl($("#u", el).value.trim());
      if (!url) return toast("Pega un link válido");
      const data = {
        url, site: preview?.site || "", image: preview?.image || "", description: preview?.description || "",
        title: $("#ti", el).value.trim() || preview?.title || url, note: $("#no", el).value.trim(), tags: tags.get(),
      };
      let id = existing?.id;
      if (existing) await store.update("links", id, data);
      else id = await store.add("links", { ...data, done: false, author: me().email, createdAt: Date.now() });
      saved = true; toast("Link guardado"); m.close(); resolve(id);
    };
  });
}

// Selector múltiple de links ya guardados
export function pickLinks(selected = []) {
  return new Promise((resolve) => {
    const sel = new Set(selected); let done = false;
    const all = live("links").data;
    const m = modal({
      title: "Elegir de mis links", wide: true,
      onClose: () => { if (!done) resolve(null); },
      body: `<div class="search-box">${icon("search")}<input type="search" id="q" placeholder="Buscar"></div>
        <div class="link-list pick" id="pl"></div><button class="btn primary block" id="ok">Listo</button>`,
    });
    const draw = (q = "") => {
      $("#pl", m.el).innerHTML = all.filter((l) => !q || `${l.title} ${(l.tags || []).join(" ")}`.toLowerCase().includes(q))
        .map((l) => `<div class="pick-row ${sel.has(l.id) ? "sel" : ""}" data-id="${esc(l.id)}"><span class="tick">${icon("check")}</span>${linkCard(l, { compact: true })}</div>`).join("")
        || emptyState("link", "No hay links guardados");
      $$("#pl .pick-row", m.el).forEach((r) => (r.onclick = (e) => {
        e.preventDefault();
        const id = r.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); r.classList.toggle("sel", sel.has(id));
      }));
    };
    draw();
    $("#q", m.el).oninput = (e) => draw(e.target.value.toLowerCase());
    $("#ok", m.el).onclick = () => { done = true; resolve([...sel]); m.close(); };
  });
}
