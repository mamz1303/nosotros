import { store, live, me, otherPerson, personFor } from "../store.js";
import { $, $$, esc, icon, toast, fmtDate, fmtTime, ymd, actionSheet, safeImg } from "../ui.js";
import { processPhoto, hydrateImages } from "../services.js";
import { markChatSeen } from "../app.js";

const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);

export function render(view) {
  const other = otherPerson();
  view.innerHTML = `
    <div class="chat">
      <header class="chat-head">
        <span class="avatar" style="background:${other.color}">${esc(other.name[0])}</span>
        <div><b>${esc(other.name)}</b><small class="muted">Solo ustedes dos</small></div>
      </header>
      <div class="msgs" id="msgs"></div>
      <form class="composer" id="f">
        <label class="icon-btn" aria-label="Enviar foto">${icon("image")}<input type="file" accept="image/*" hidden id="img"></label>
        <textarea id="t" rows="1" placeholder="Escribe un mensaje…" enterkeyhint="send"></textarea>
        <button class="send" aria-label="Enviar">${icon("send")}</button>
      </form>
    </div>`;
  const box = $("#msgs", view), ta = $("#t", view);
  const msgs = live("messages", { limit: 300 });
  let firstDraw = true;
  const draw = (list) => {
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    const items = [...list].reverse();
    let lastDay = "", out = "";
    items.forEach((m, i) => {
      const d = ymd(new Date(m.createdAt));
      if (d !== lastDay) { out += `<div class="day-sep"><span>${d === ymd() ? "Hoy" : fmtDate(d)}</span></div>`; lastDay = d; }
      const mine = m.author === me().email;
      const next = items[i + 1];
      const tail = !next || next.author !== m.author || ymd(new Date(next.createdAt)) !== d;
      out += `<div class="msg ${mine ? "mine" : "theirs"} ${tail ? "tail" : ""}" data-id="${esc(m.id)}" style="--c:${personFor(m.author).color}">
        ${m.image ? `<img ${m.image.startsWith("media:") ? `data-src="${esc(m.image)}" src="${safeImg(m.thumb)}"` : `src="${safeImg(m.image)}"`} alt="" class="msg-img">` : ""}
        ${m.text ? `<p>${linkify(m.text)}</p>` : ""}<time>${fmtTime(m.createdAt)}</time></div>`;
    });
    box.innerHTML = out || `<div class="empty small">${icon("chat")}<p>Escríbele algo bonito 💌</p></div>`;
    hydrateImages(box);
    if (firstDraw || atBottom || list[0]?.author === me().email) box.scrollTop = box.scrollHeight;
    firstDraw = false;
    markChatSeen();
    $$(".msg.mine", box).forEach((el) => (el.oncontextmenu = el.ondblclick = (e) => {
      e.preventDefault();
      actionSheet("Mensaje", [{ label: "Eliminar para ambos", icon: "trash", danger: true, run: () => store.remove("messages", el.dataset.id) }]);
    }));
  };
  const u = msgs.on(draw);
  const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; };
  ta.oninput = grow;
  const send = async () => {
    const text = ta.value.trim(); if (!text) return;
    ta.value = ""; grow();
    await store.add("messages", { text, author: me().email, createdAt: Date.now() });
  };
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && matchMedia("(pointer:fine)").matches) { e.preventDefault(); send(); } };
  $("#f", view).onsubmit = (e) => { e.preventDefault(); send(); ta.focus(); };
  $("#img", view).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    toast("Enviando foto…");
    try {
      const p = await processPhoto(f);
      await store.add("messages", { text: ta.value.trim(), image: p.src, thumb: p.thumb, author: me().email, createdAt: Date.now() });
      ta.value = ""; grow();
    } catch (err) { toast("No se pudo enviar: " + err.message); }
    e.target.value = "";
  };
  return u;
}
