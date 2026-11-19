import { store, live, me } from "../store.js";
import { $, $$, esc, icon, modal, toast, confirmDialog, actionSheet, emptyState, fmtDate, safeImg } from "../ui.js";
import { openComposer, postCard, wirePosts } from "./feed.js";

export function render(view) {
  view.innerHTML = `
    <header class="page-head"><h1>Álbumes</h1><button class="btn primary" id="new">${icon("plus")} Crear</button></header>
    <div id="list" class="album-grid"></div>`;
  const postsLive = live("posts", { orderBy: "date" }), albumsLive = live("albums");
  const draw = () => {
    const box = $("#list", view);
    if (!albumsLive.ready) return;
    if (!albumsLive.data.length) { box.innerHTML = emptyState("album", "Sin álbumes", "Agrupa fotos de un viaje o una fecha especial."); return; }
    box.innerHTML = albumsLive.data.map((a) => {
      const ps = postsLive.data.filter((p) => (p.albumIds || []).includes(a.id));
      const covers = ps.slice(0, 4).map((p) => p.images?.[0]?.thumb).filter(Boolean);
      const n = ps.reduce((s, p) => s + (p.images?.length || 0), 0);
      return `<a class="album" href="#/album/${esc(a.id)}">
        <div class="album-cover c${Math.min(covers.length, 4)}">${covers.map((c) => `<img src="${safeImg(c)}" alt="">`).join("") || icon("album")}</div>
        <b>${esc(a.name)}</b><span class="small muted">${n} foto${n === 1 ? "" : "s"}</span></a>`;
    }).join("");
  };
  const us = [postsLive.on(draw), albumsLive.on(draw)];
  $("#new", view).onclick = () => editAlbum();
  return () => us.forEach((u) => u());
}

function editAlbum(a = null) {
  const m = modal({
    title: a ? "Editar álbum" : "Nuevo álbum",
    body: `<label class="field"><span>Nombre</span><input id="n" value="${esc(a?.name || "")}" placeholder="Viaje a Cusco 2026"></label>
      <label class="field"><span>Descripción</span><textarea id="d" rows="2">${esc(a?.description || "")}</textarea></label>
      <button class="btn primary block" id="ok">Guardar</button>`,
  });
  $("#ok", m.el).onclick = async () => {
    const name = $("#n", m.el).value.trim(); if (!name) return toast("Ponle un nombre");
    const description = $("#d", m.el).value.trim();
    if (a) await store.update("albums", a.id, { name, description });
    else { const id = await store.add("albums", { name, description, createdAt: Date.now(), author: me().email }); location.hash = "#/album/" + id; }
    m.close();
  };
}

export function renderAlbum(view, id) {
  let layout = "grid";
  view.innerHTML = `
    <header class="page-head"><a class="icon-btn" href="#/albumes" aria-label="Volver">${icon("back")}</a>
      <h1 id="t">Álbum</h1><button class="icon-btn" id="menu" aria-label="Opciones">${icon("more")}</button></header>
    <p class="muted" id="desc"></p>
    <div class="row gap wrap">
      <button class="btn primary" id="upload">${icon("plus")} Subir fotos aquí</button>
      <button class="btn ghost" id="pick">${icon("image")} Elegir de publicadas</button>
      <button class="btn ghost" id="lay">${icon("list")}</button>
    </div>
    <div id="ps"></div>`;
  const postsLive = live("posts", { orderBy: "date" }), albumsLive = live("albums");
  let album = null, posts = [];
  const draw = () => {
    album = albumsLive.data.find((a) => a.id === id);
    if (albumsLive.ready && !album) { view.innerHTML = emptyState("album", "Álbum no encontrado"); return; }
    if (!album) return;
    $("#t", view).textContent = album.name;
    $("#desc", view).textContent = album.description || "";
    posts = postsLive.data.filter((p) => (p.albumIds || []).includes(id));
    const dates = posts.map((p) => p.date).sort();
    if (dates.length) $("#desc", view).textContent = (album.description ? album.description + " · " : "") +
      (dates[0] === dates.at(-1) ? fmtDate(dates[0]) : `${fmtDate(dates[0])} – ${fmtDate(dates.at(-1))}`);
    const box = $("#ps", view);
    if (!posts.length) { box.className = ""; box.innerHTML = emptyState("image", "Álbum vacío", "Sube fotos o elige algunas ya publicadas."); return; }
    box.className = layout === "grid" ? "photo-grid" : "feed";
    box.innerHTML = layout === "grid"
      ? posts.flatMap((p) => (p.images || []).map((im) => `<a href="#/post/${esc(p.id)}" class="cell"><img src="${safeImg(im.thumb)}" alt=""></a>`)).join("")
      : posts.map((p) => postCard(p, { [id]: album })).join("");
    if (layout === "list") wirePosts(box, (pid) => posts.find((p) => p.id === pid));
  };
  const us = [postsLive.on(draw), albumsLive.on(draw)];
  $("#upload", view).onclick = () => openComposer(null, [], id);
  $("#lay", view).onclick = () => { layout = layout === "grid" ? "list" : "grid"; $("#lay", view).innerHTML = icon(layout === "grid" ? "list" : "grid"); draw(); };
  $("#pick", view).onclick = () => pickPosts(id);
  $("#menu", view).onclick = () => actionSheet(album?.name || "Álbum", [
    { label: "Editar nombre", icon: "edit", run: () => editAlbum(album) },
    { label: "Ver en el mapa", icon: "map", run: () => { localStorage.setItem("nosotros:mapmode", "both"); location.hash = "#/mapa"; } },
    { label: "Eliminar álbum (las fotos se conservan)", icon: "trash", danger: true, run: async () => {
      if (!(await confirmDialog("Las fotos seguirán en el inicio."))) return;
      for (const p of posts) await store.update("posts", p.id, { albumIds: (p.albumIds || []).filter((x) => x !== id) });
      await store.remove("albums", id); location.hash = "#/albumes";
    } },
  ]);
  return () => us.forEach((u) => u());
}

function pickPosts(albumId) {
  const all = live("posts", { orderBy: "date" }).data;
  const sel = new Set(all.filter((p) => (p.albumIds || []).includes(albumId)).map((p) => p.id));
  const m = modal({
    title: "Elegir publicaciones", wide: true,
    body: `<div class="photo-grid selectable">${all.map((p) => `<button class="cell ${sel.has(p.id) ? "sel" : ""}" data-id="${esc(p.id)}"><img src="${safeImg(p.images?.[0]?.thumb)}" alt=""><i>${icon("check")}</i></button>`).join("")}</div>
      <button class="btn primary block" id="ok">Guardar selección</button>`,
  });
  $$(".cell", m.el).forEach((c) => (c.onclick = () => { c.classList.toggle("sel"); sel.has(c.dataset.id) ? sel.delete(c.dataset.id) : sel.add(c.dataset.id); }));
  $("#ok", m.el).onclick = async () => {
    for (const p of all) {
      const has = (p.albumIds || []).includes(albumId);
      if (sel.has(p.id) && !has) await store.update("posts", p.id, { albumIds: [...(p.albumIds || []), albumId] });
      if (!sel.has(p.id) && has) await store.update("posts", p.id, { albumIds: p.albumIds.filter((x) => x !== albumId) });
    }
    toast("Álbum actualizado"); m.close();
  };
}
