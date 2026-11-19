import { store, live, me, personFor } from "../store.js";
import { $, $$, esc, icon, modal, toast, confirmDialog, emptyState, fmtDate, relDay, ymd, safeUrl, debounce } from "../ui.js";
import { pickLocation, miniMap, mapsUrl, linkCard, googleCalendarUrl, downloadIcs } from "../services.js";
import { linkDialog, pickLinks } from "./links.js";
import { openComposer } from "./feed.js";

const uid = () => Math.random().toString(36).slice(2, 9);

export function render(view, action) {
  view.innerHTML = `
    <header class="page-head"><h1>Nuestras citas</h1><button class="btn primary" id="new">${icon("plus")} Planear</button></header>
    <div id="lists"></div>`;
  const pl = live("plans", { orderBy: "date" });
  const draw = () => {
    if (!pl.ready) return;
    const today = ymd();
    const up = pl.data.filter((p) => p.date && p.date >= today).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
    const ideas = pl.data.filter((p) => !p.date);
    const past = pl.data.filter((p) => p.date && p.date < today);
    const card = (p) => {
      const done = (p.items || []).filter((i) => i.done).length, tot = (p.items || []).length;
      return `<a class="plan-card" href="#/cita/${esc(p.id)}">
        <div class="plan-date">${p.date ? `<b>${+p.date.slice(8)}</b><span>${fmtDate(p.date).split(" de ")[1]?.slice(0, 3)}</span>` : icon("sparkles")}</div>
        <div class="grow"><b>${esc(p.title)}</b>
          <small class="muted">${p.date ? relDay(p.date) : "sin fecha"}${p.time ? " · " + esc(p.time) : ""}
          ${(p.places || []).length ? ` · ${icon("pin")}${p.places.length}` : ""}${(p.linkIds || []).length ? ` · ${icon("link")}${p.linkIds.length}` : ""}
          ${tot ? ` · ${icon("check")}${done}/${tot}` : ""}</small></div>${icon("next")}</a>`;
    };
    $("#lists", view).innerHTML = !pl.data.length
      ? emptyState("sparkles", "Planeen su próxima cita", "Agreguen lugares, cosas por hacer y links de TikTok o reels que quieran visitar.")
      : `${up.length ? `<h3 class="sec-title">Próximas</h3>${up.map(card).join("")}` : ""}
         ${ideas.length ? `<h3 class="sec-title">Ideas sin fecha</h3>${ideas.map(card).join("")}` : ""}
         ${past.length ? `<h3 class="sec-title">Ya vividas</h3>${past.reverse().map(card).join("")}` : ""}`;
  };
  const u = pl.on(draw);
  $("#new", view).onclick = () => newPlan();
  if (action === "nueva") { history.replaceState(null, "", "#/citas"); newPlan(sessionStorage.getItem("nosotros:planLink")); sessionStorage.removeItem("nosotros:planLink"); }
  return u;
}

function newPlan(linkId = null) {
  const m = modal({
    title: "Nueva cita",
    body: `<label class="field"><span>¿Qué van a hacer?</span><input id="t" placeholder="Picnic en el parque, cena en…"></label>
      <div class="grid2"><label class="field"><span>Fecha (opcional)</span><input type="date" id="d"></label>
      <label class="field"><span>Hora</span><input type="time" id="h"></label></div>
      <button class="btn primary block" id="ok">Crear y planificar</button>`,
  });
  setTimeout(() => $("#t", m.el).focus(), 250);
  $("#ok", m.el).onclick = async () => {
    const title = $("#t", m.el).value.trim(); if (!title) return toast("Ponle un nombre");
    const id = await store.add("plans", { title, date: $("#d", m.el).value || "", time: $("#h", m.el).value || "", notes: "",
      items: [], places: [], linkIds: linkId ? [linkId] : [], author: me().email, createdAt: Date.now() });
    m.close(); location.hash = "#/cita/" + id;
  };
}

export function renderPlan(view, id) {
  view.innerHTML = `<div class="skeleton"></div>`;
  const pl = live("plans", { orderBy: "date" }), lk = live("links");
  let plan = null, maps = [], lastSig = "";
  const save = (data) => store.update("plans", id, data);

  const draw = () => {
    plan = pl.data.find((p) => p.id === id);
    if (!pl.ready) return;
    if (!plan) { view.innerHTML = emptyState("sparkles", "Cita no encontrada"); return; }
    // Si solo cambiaron las notas, no redibujamos (para no cortar la escritura)
    const sig = JSON.stringify({ ...plan, notes: null }) + "|" + lk.data.map((l) => l.id + l.title).join();
    if (sig === lastSig) {
      const no = $("#no", view);
      if (no && document.activeElement !== no) no.value = plan.notes || "";
      return;
    }
    lastSig = sig;
    maps.forEach((m) => m.remove()); maps = [];
    const focused = document.activeElement?.id;
    const items = [...(plan.items || [])].sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    const links = (plan.linkIds || []).map((lid) => lk.data.find((l) => l.id === lid)).filter(Boolean);
    const a = personFor(plan.author);
    view.innerHTML = `
      <header class="page-head"><a class="icon-btn" href="#/citas" aria-label="Volver">${icon("back")}</a>
        <input class="title-input" id="ti" value="${esc(plan.title)}" aria-label="Título">
        <button class="icon-btn" id="del" aria-label="Eliminar">${icon("trash")}</button></header>
      <div class="plan-meta card">
        <div class="grid2">
          <label class="field"><span>Fecha</span><input type="date" id="d" value="${esc(plan.date || "")}"></label>
          <label class="field"><span>Hora</span><input type="time" id="h" value="${esc(plan.time || "")}"></label>
        </div>
        <p class="small muted">${plan.date ? `${fmtDate(plan.date)} · ${relDay(plan.date)}` : "Aún sin fecha — es una idea"} · creada por ${esc(a.name)}</p>
        ${plan.date ? `<div class="row gap wrap"><button class="btn ghost small-btn" id="gc">${icon("calendar")} Google Calendar</button>
          <button class="btn ghost small-btn" id="ics">${icon("download")} .ics</button></div>` : ""}
      </div>

      <section class="card">
        <h3 class="sec-title">${icon("list")} Plan del día</h3>
        <ul class="todo">${items.map((it) => `<li class="${it.done ? "done" : ""}" data-id="${esc(it.id)}">
          <button class="tick" aria-label="Marcar">${icon("check")}</button>
          ${it.time ? `<time>${esc(it.time)}</time>` : ""}<span class="grow">${esc(it.text)}</span>
          <button class="icon-btn sm" data-x aria-label="Quitar">${icon("x")}</button></li>`).join("")}</ul>
        <form class="row gap add-todo" id="tf"><input type="time" id="tt" aria-label="Hora"><input id="tx" placeholder="Agregar (ej. comprar flores)"><button class="btn">${icon("plus")}</button></form>
      </section>

      <section class="card">
        <h3 class="sec-title">${icon("pin")} Lugares</h3>
        <div class="places">${(plan.places || []).map((p) => `<div class="place" data-id="${esc(p.id)}">
          ${p.lat != null ? `<div class="mini-map" data-lat="${p.lat}" data-lng="${p.lng}"></div>` : ""}
          <div class="place-info"><b>${esc(p.name)}</b>${p.address ? `<small class="muted">${esc(p.address)}</small>` : ""}
            <div class="row gap small"><a class="linkish" href="${esc(p.url ? safeUrl(p.url) : mapsUrl(p))}" target="_blank" rel="noopener">${icon("external")} Abrir en Maps</a>
            <button class="linkish danger-text" data-x>Quitar</button></div></div></div>`).join("")}</div>
        <div class="row gap wrap"><button class="btn ghost" id="addp">${icon("search")} Buscar lugar</button>
          <button class="btn ghost" id="addml">${icon("link")} Pegar link de Google Maps</button></div>
      </section>

      <section class="card">
        <h3 class="sec-title">${icon("link")} Links e ideas</h3>
        <div class="link-list">${links.map((l) => linkCard(l, { compact: true, actions: `<button class="icon-btn sm" data-x="${esc(l.id)}" aria-label="Quitar">${icon("x")}</button>` })).join("")}</div>
        <div class="row gap wrap"><button class="btn ghost" id="newl">${icon("plus")} Nuevo link</button>
          <button class="btn ghost" id="pickl">${icon("list")} Elegir de guardados</button></div>
      </section>

      <section class="card">
        <h3 class="sec-title">${icon("edit")} Notas</h3>
        <textarea id="no" rows="3" placeholder="Presupuesto, qué llevar, sorpresas…">${esc(plan.notes || "")}</textarea>
      </section>

      ${plan.date && plan.date <= ymd() ? `<button class="btn primary block" id="photos">${icon("image")} Subir fotos de esta cita</button>` : ""}`;

    // Mini mapas
    $$(".mini-map", view).forEach((el) => maps.push(miniMap(el, { lat: +el.dataset.lat, lng: +el.dataset.lng })));
    if (focused) $("#" + focused, view)?.focus();

    $("#ti", view).onchange = (e) => e.target.value.trim() && save({ title: e.target.value.trim() });
    $("#d", view).onchange = (e) => save({ date: e.target.value || "" });
    $("#h", view).onchange = (e) => save({ time: e.target.value || "" });
    $("#no", view).oninput = debounce((e) => save({ notes: e.target.value }), 700);
    const evData = () => ({ title: plan.title, date: plan.date, time: plan.time, place: plan.places?.[0]?.name || "",
      notes: [...items.map((i) => `${i.time ? i.time + " " : ""}• ${i.text}`), plan.notes].filter(Boolean).join("\n") });
    $("#gc", view)?.addEventListener("click", () => window.open(googleCalendarUrl(evData()), "_blank"));
    $("#ics", view)?.addEventListener("click", () => downloadIcs({ ...evData(), id }));
    $("#del", view).onclick = async () => { if (await confirmDialog("Se eliminará esta cita.")) { await store.remove("plans", id); location.hash = "#/citas"; } };

    // Lista
    $("#tf", view).onsubmit = (e) => {
      e.preventDefault(); const text = $("#tx", view).value.trim(); if (!text) return;
      save({ items: [...(plan.items || []), { id: uid(), text, time: $("#tt", view).value || "", done: false }] });
      setTimeout(() => $("#tx", view)?.focus(), 50);
    };
    $$(".todo li", view).forEach((li) => {
      $(".tick", li).onclick = () => save({ items: plan.items.map((i) => (i.id === li.dataset.id ? { ...i, done: !i.done } : i)) });
      $("[data-x]", li).onclick = () => save({ items: plan.items.filter((i) => i.id !== li.dataset.id) });
    });
    // Lugares
    $("#addp", view).onclick = async () => { const p = await pickLocation(); if (p) save({ places: [...(plan.places || []), { id: uid(), ...p }] }); };
    $("#addml", view).onclick = () => mapsLinkDialog((p) => save({ places: [...(plan.places || []), { id: uid(), ...p }] }));
    $$(".place [data-x]", view).forEach((b) => (b.onclick = () => save({ places: plan.places.filter((p) => p.id !== b.closest(".place").dataset.id) })));
    // Links
    $("#newl", view).onclick = async () => { const lid = await linkDialog(null, "", ["cita"]); if (lid) save({ linkIds: [...new Set([...(plan.linkIds || []), lid])] }); };
    $("#pickl", view).onclick = async () => { const ids = await pickLinks(plan.linkIds || []); if (ids) save({ linkIds: ids }); };
    $$(".link-list [data-x]", view).forEach((b) => (b.onclick = () => save({ linkIds: plan.linkIds.filter((x) => x !== b.dataset.x) })));
    $("#photos", view)?.addEventListener("click", () => openComposer(null, ["cita"]));
  };
  const us = [pl.on(draw), lk.on(draw)];
  return () => { us.forEach((u) => u()); maps.forEach((m) => m.remove()); };
}

function mapsLinkDialog(onOk) {
  const m = modal({
    title: "Link de Google Maps",
    body: `<label class="field"><span>Link</span><input id="u" placeholder="https://maps.app.goo.gl/…"></label>
      <label class="field"><span>Nombre del lugar</span><input id="n" placeholder="Ej. Café Tuyo"></label>
      <p class="small muted">En Google Maps: Compartir → Copiar enlace. Si el link trae coordenadas, se mostrará el mapa.</p>
      <button class="btn primary block" id="ok">Agregar</button>`,
  });
  $("#ok", m.el).onclick = () => {
    const url = safeUrl($("#u", m.el).value.trim()); const name = $("#n", m.el).value.trim();
    if (!url || !name) return toast("Falta el link o el nombre");
    const c = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || url.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    onOk({ name, url, address: "", ...(c ? { lat: +c[1], lng: +c[2] } : {}) }); m.close();
  };
}
