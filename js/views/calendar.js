import { store, live, me } from "../store.js";
import { $, $$, esc, icon, modal, toast, confirmDialog, MES, DIAS, ymd, parseYmd, pad, daysBetween, fmtDate, relDay } from "../ui.js";
import { googleCalendarUrl, downloadIcs } from "../services.js";

export const TYPES = {
  aniversario: { label: "Aniversario", emoji: "💞", color: "#e11d48" },
  cumple: { label: "Cumpleaños", emoji: "🎂", color: "#d97706" },
  cita: { label: "Cita", emoji: "✨", color: "#7c3aed" },
  viaje: { label: "Viaje", emoji: "✈️", color: "#0284c7" },
  recordatorio: { label: "Recordatorio", emoji: "📌", color: "#475569" },
};

// Fecha de un evento en un año dado (los anuales se repiten)
function onYear(ev, y) { return ev.yearly ? `${y}${ev.date.slice(4)}` : ev.date; }

export function upcoming(evs, days = 60, plans = []) {
  const today = new Date(); const y = today.getFullYear();
  const out = [];
  for (const ev of evs) {
    const cands = ev.yearly ? [onYear(ev, y), onYear(ev, y + 1)] : [ev.date];
    for (const d of cands) {
      const n = daysBetween(today, parseYmd(d));
      if (n >= 0 && n <= days) { out.push({ ...ev, on: d, when: n, years: ev.yearly ? +d.slice(0, 4) - +ev.date.slice(0, 4) : 0 }); break; }
    }
  }
  for (const p of plans) {
    if (!p.date) continue;
    const n = daysBetween(today, parseYmd(p.date));
    if (n >= 0 && n <= days) out.push({ id: p.id, title: p.title, on: p.date, time: p.time, type: "cita", when: n, planId: p.id, fromPlan: true });
  }
  return out.sort((a, b) => a.when - b.when || (a.time || "").localeCompare(b.time || ""));
}

export function render(view) {
  const now = new Date();
  let y = now.getFullYear(), mo = now.getMonth(), sel = ymd(now);
  view.innerHTML = `
    <header class="page-head"><h1>Calendario</h1><button class="btn primary" id="add">${icon("plus")} Fecha</button></header>
    <section class="cal card">
      <div class="cal-head">
        <button class="icon-btn" id="prev" aria-label="Mes anterior">${icon("back")}</button>
        <b id="mt"></b>
        <button class="icon-btn" id="next" aria-label="Mes siguiente">${icon("next")}</button>
      </div>
      <div class="cal-grid dow">${["lun","mar","mié","jue","vie","sáb","dom"].map((d) => `<span>${d}</span>`).join("")}</div>
      <div class="cal-grid" id="grid"></div>
    </section>
    <section><h3 id="dayt" class="sec-title"></h3><div id="day" class="ev-list"></div></section>
    <section><h3 class="sec-title">Próximos 60 días</h3><div id="up" class="ev-list"></div></section>
    <button class="btn ghost block" id="notif">${icon("bell")} Activar avisos en este dispositivo</button>`;
  const evLive = live("events", { orderBy: "date", dir: "asc" }), plLive = live("plans", { orderBy: "date" });

  const itemsOn = (d) => {
    const evs = evLive.data.filter((e) => onYear(e, +d.slice(0, 4)) === d);
    const pls = plLive.data.filter((p) => p.date === d).map((p) => ({ id: p.id, title: p.title, time: p.time, type: "cita", planId: p.id, fromPlan: true }));
    return [...evs, ...pls];
  };
  const evRow = (e, showDate = false) => {
    const t = TYPES[e.type] || TYPES.recordatorio;
    const yrs = e.years > 0 ? ` · ${e.years} año${e.years > 1 ? "s" : ""}` : "";
    return `<button class="ev" data-id="${esc(e.id)}" data-plan="${e.fromPlan ? 1 : ""}" style="--c:${t.color}">
      <span class="ev-emoji">${t.emoji}</span>
      <span class="grow"><b>${esc(e.title)}</b><small>${showDate ? `${fmtDate(e.on, { noYear: true })} · ${relDay(e.on)}` : t.label}${e.time ? " · " + esc(e.time) : ""}${yrs}</small></span>
      ${icon("next")}</button>`;
  };
  const wireRows = (box) => $$(".ev", box).forEach((b) => (b.onclick = () => {
    if (b.dataset.plan) return (location.hash = "#/cita/" + b.dataset.id);
    const e = evLive.data.find((x) => x.id === b.dataset.id); if (e) eventDialog(e);
  }));

  const draw = () => {
    $("#mt", view).textContent = `${MES[mo][0].toUpperCase() + MES[mo].slice(1)} ${y}`;
    const first = new Date(y, mo, 1);
    const offset = (first.getDay() + 6) % 7;
    const dim = new Date(y, mo + 1, 0).getDate();
    let cells = "";
    for (let i = 0; i < offset; i++) cells += `<span></span>`;
    for (let d = 1; d <= dim; d++) {
      const key = `${y}-${pad(mo + 1)}-${pad(d)}`;
      const items = itemsOn(key);
      cells += `<button class="day ${key === ymd() ? "today" : ""} ${key === sel ? "sel" : ""}" data-d="${key}">
        <span>${d}</span><i>${items.slice(0, 3).map((e) => `<b style="background:${(TYPES[e.type] || TYPES.recordatorio).color}"></b>`).join("")}</i></button>`;
    }
    $("#grid", view).innerHTML = cells;
    $$("#grid .day", view).forEach((b) => (b.onclick = () => { sel = b.dataset.d; draw(); }));
    const di = itemsOn(sel);
    $("#dayt", view).textContent = fmtDate(sel);
    $("#day", view).innerHTML = di.length ? di.map((e) => evRow(e)).join("")
      : `<button class="ev empty-ev" id="addday">${icon("plus")} Agregar algo este día</button>`;
    wireRows($("#day", view));
    $("#addday", view)?.addEventListener("click", () => eventDialog(null, sel));
    const up = upcoming(evLive.data, 60, plLive.data);
    $("#up", view).innerHTML = up.length ? up.map((e) => evRow(e, true)).join("") : `<p class="muted small">Nada en los próximos días.</p>`;
    wireRows($("#up", view));
  };
  const us = [evLive.on(draw), plLive.on(draw)];
  $("#prev", view).onclick = () => { mo--; if (mo < 0) { mo = 11; y--; } draw(); };
  $("#next", view).onclick = () => { mo++; if (mo > 11) { mo = 0; y++; } draw(); };
  $("#add", view).onclick = () => eventDialog(null, sel);
  const nb = $("#notif", view);
  if (!("Notification" in window) || Notification.permission === "granted") nb.remove();
  else nb.onclick = async () => { const r = await Notification.requestPermission(); if (r === "granted") { toast("Avisos activados"); nb.remove(); } };
  return () => us.forEach((u) => u());
}

export function eventDialog(ev = null, date = ymd()) {
  const m = modal({
    title: ev ? "Editar fecha" : "Nueva fecha",
    body: `
      <label class="field"><span>Título</span><input id="t" value="${esc(ev?.title || "")}" placeholder="Nuestro aniversario"></label>
      <div class="chips" id="ty">${Object.entries(TYPES).map(([k, t]) => `<button type="button" class="chip ${(ev?.type || "cita") === k ? "on" : ""}" data-k="${k}">${t.emoji} ${t.label}</button>`).join("")}</div>
      <div class="grid2">
        <label class="field"><span>Fecha</span><input type="date" id="d" value="${ev?.date || date}"></label>
        <label class="field"><span>Hora (opcional)</span><input type="time" id="h" value="${ev?.time || ""}"></label>
      </div>
      <label class="check"><input type="checkbox" id="yr" ${ev?.yearly ? "checked" : ""}> Se repite cada año</label>
      <label class="field"><span>Notas</span><textarea id="n" rows="2">${esc(ev?.notes || "")}</textarea></label>
      <button class="btn primary block" id="ok">Guardar</button>
      <p class="small muted">Para que el celular te avise aunque la app esté cerrada, agrégalo también a tu calendario:</p>
      <div class="row gap wrap">
        <button class="btn ghost" id="gc">${icon("calendar")} Google Calendar</button>
        <button class="btn ghost" id="ics">${icon("download")} Archivo .ics (iPhone)</button>
        ${ev ? `<span class="spacer"></span><button class="btn ghost danger-text" id="del">${icon("trash")}</button>` : ""}
      </div>`,
  });
  const el = m.el;
  let type = ev?.type || "cita";
  $$("#ty .chip", el).forEach((c) => (c.onclick = () => { type = c.dataset.k; $$("#ty .chip", el).forEach((x) => x.classList.toggle("on", x === c));
    if (["aniversario", "cumple"].includes(type)) $("#yr", el).checked = true; }));
  const read = () => ({ title: $("#t", el).value.trim(), type, date: $("#d", el).value, time: $("#h", el).value, yearly: $("#yr", el).checked, notes: $("#n", el).value.trim() });
  $("#ok", el).onclick = async () => {
    const d = read(); if (!d.title || !d.date) return toast("Falta título o fecha");
    if (ev) await store.update("events", ev.id, d);
    else await store.add("events", { ...d, author: me().email, createdAt: Date.now() });
    toast("Guardado"); m.close();
  };
  $("#gc", el).onclick = () => { const d = read(); if (!d.title) return toast("Ponle un título"); window.open(googleCalendarUrl(d), "_blank"); };
  $("#ics", el).onclick = () => { const d = read(); if (!d.title) return toast("Ponle un título"); downloadIcs({ ...d, id: ev?.id }); };
  $("#del", el)?.addEventListener("click", async () => { if (await confirmDialog("Se eliminará esta fecha.")) { await store.remove("events", ev.id); m.close(); } });
}
