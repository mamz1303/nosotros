import { store, live, me, personFor } from "../store.js";
import { $, $$, esc, icon, modal, toast, confirmDialog, actionSheet, emptyState, tagInput,
  extractTags, fmtDate, ymd, safeImg } from "../ui.js";
import { processPhoto, readExif, pickLocation, hydrateImages, reverseGeocode } from "../services.js";

const imgTag = (im, cls = "") => {
  const src = im.src?.startsWith("media:") ? "" : safeImg(im.src);
  return `<img class="${cls}" src="${src || safeImg(im.thumb)}" ${im.src?.startsWith("media:") ? `data-src="${esc(im.src)}"` : ""} alt="" loading="lazy" ${im.w ? `width="${im.w}" height="${im.h}"` : ""}>`;
};

export function postCard(p, albumsById = {}) {
  const a = personFor(p.author);
  const caption = esc(p.caption || "").replace(/#([\p{L}\p{N}_]+)/gu, (_, t) => `<a href="#/fotos/tag/${encodeURIComponent(t.toLowerCase())}" class="tag">#${t}</a>`);
  const extraTags = (p.tags || []).filter((t) => !(p.caption || "").toLowerCase().includes("#" + t));
  const imgs = p.images || [];
  return `<article class="post" data-id="${esc(p.id)}">
    <header class="post-head">
      <span class="avatar" style="background:${a.color}">${esc(a.name[0])}</span>
      <div class="grow"><b>${esc(a.name)}</b>
        ${p.location ? `<a class="small muted place" href="#/mapa/${esc(p.id)}">${icon("pin")}${esc(p.location.name || "Ubicación")}</a>` : ""}
      </div>
      <button class="icon-btn" data-menu aria-label="Opciones">${icon("more")}</button>
    </header>
    <div class="carousel" ${imgs.length > 1 ? 'data-multi' : ""}>
      <div class="track">${imgs.map((im) => `<div class="slide">${imgTag(im)}</div>`).join("")}</div>
      ${imgs.length > 1 ? `<div class="dots">${imgs.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div><span class="count">1/${imgs.length}</span>` : ""}
    </div>
    <div class="post-body">
      ${caption ? `<p class="caption">${caption}</p>` : ""}
      ${extraTags.length ? `<p class="tags">${extraTags.map((t) => `<a href="#/fotos/tag/${encodeURIComponent(t)}" class="tag">#${esc(t)}</a>`).join(" ")}</p>` : ""}
      <div class="row gap wrap small muted">
        <span>${icon("calendar")} ${fmtDate(p.date)}</span>
        ${(p.albumIds || []).filter((id) => albumsById[id]).map((id) => `<a class="pill" href="#/album/${esc(id)}">${icon("album")}${esc(albumsById[id].name)}</a>`).join("")}
      </div>
    </div>
  </article>`;
}

export function wirePosts(root, getPost) {
  hydrateImages(root);
  $$(".carousel[data-multi]", root).forEach((c) => {
    const track = $(".track", c), dots = $$(".dots i", c), count = $(".count", c);
    track.addEventListener("scroll", () => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      dots.forEach((d, j) => d.classList.toggle("on", i === j));
      if (count) count.textContent = `${i + 1}/${dots.length}`;
    }, { passive: true });
  });
  $$(".post [data-menu]", root).forEach((b) => (b.onclick = () => {
    const p = getPost(b.closest(".post").dataset.id); if (!p) return;
    postMenu(p);
  }));
}

export function postMenu(p) {
  actionSheet("Publicación", [
    { label: "Editar", icon: "edit", run: () => openComposer(p) },
    { label: "Agregar a álbum", icon: "album", run: () => addToAlbum([p]) },
    { label: p.location ? "Ver en el mapa" : "Agregar ubicación", icon: "pin", run: async () => {
      if (p.location) return (location.hash = "#/mapa/" + p.id);
      const loc = await pickLocation(); if (loc) { await store.update("posts", p.id, { location: loc }); toast("Ubicación guardada"); }
    } },
    { label: "Eliminar", icon: "trash", danger: true, run: async () => {
      if (!(await confirmDialog("Se eliminará la publicación y sus fotos."))) return;
      await store.remove("posts", p.id);
      for (const im of p.images || []) if (im.src?.startsWith("media:")) store.remove("media", im.src.slice(6)).catch(() => {});
      toast("Publicación eliminada");
      if (location.hash.startsWith("#/post")) history.back();
    } },
  ]);
}

// ------------------------------------------------------------------ Feed
export function render(view, mode, value) {
  const tag = mode === "tag" ? value : "";
  let layout = localStorage.getItem("nosotros:layout") || "list";
  view.innerHTML = `
    <header class="page-head">
      <h1>${tag ? `#${esc(tag)}` : "Nuestras fotos"}</h1>
      <div class="row gap">
        <button class="icon-btn" id="layout" aria-label="Cambiar vista">${icon(layout === "list" ? "grid" : "list")}</button>
      </div>
    </header>
    ${tag ? `<a class="btn ghost small-btn" href="#/fotos">${icon("back")} Todas las fotos</a>` : ""}
    <div class="tag-bar" id="tagbar"></div>
    <div id="posts"></div>
    <button class="fab" id="new" aria-label="Nueva publicación">${icon("plus")}</button>`;
  const postsLive = live("posts", { orderBy: "date" });
  const albumsLive = live("albums");
  let posts = [];
  const draw = () => {
    posts = postsLive.data;
    const albumsById = Object.fromEntries(albumsLive.data.map((a) => [a.id, a]));
    // barra de hashtags
    const counts = {};
    posts.forEach((p) => (p.tags || []).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25);
    $("#tagbar", view).innerHTML = top.map(([t, n]) => `<a class="chip ${t === tag ? "on" : ""}" href="#/fotos${t === tag ? "" : "/tag/" + encodeURIComponent(t)}">#${esc(t)} <small>${n}</small></a>`).join("");
    const list = tag ? posts.filter((p) => (p.tags || []).includes(tag)) : posts;
    const box = $("#posts", view);
    if (!postsLive.ready) { box.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`; return; }
    if (!list.length) { box.innerHTML = emptyState("image", tag ? "Nada con ese hashtag" : "Aún no hay fotos", "Toca + para subir la primera."); return; }
    box.className = layout === "grid" ? "photo-grid" : "feed";
    box.innerHTML = layout === "grid"
      ? list.map((p) => `<a href="#/post/${esc(p.id)}" class="cell">${imgTag({ src: p.images?.[0]?.thumb }, "")}${p.images?.length > 1 ? `<span class="multi">${icon("album")}</span>` : ""}</a>`).join("")
      : list.map((p) => postCard(p, albumsById)).join("");
    wirePosts(box, (id) => posts.find((p) => p.id === id));
  };
  const u1 = postsLive.on(draw), u2 = albumsLive.on(draw);
  $("#layout", view).onclick = () => {
    layout = layout === "list" ? "grid" : "list"; localStorage.setItem("nosotros:layout", layout);
    $("#layout", view).innerHTML = icon(layout === "list" ? "grid" : "list"); draw();
  };
  $("#new", view).onclick = () => openComposer(null, tag ? [tag] : []);
  return () => { u1(); u2(); };
}

export function renderPost(view, id) {
  view.innerHTML = `<header class="page-head"><button class="icon-btn" onclick="history.back()" aria-label="Volver">${icon("back")}</button><h1>Publicación</h1><span></span></header><div class="feed" id="one"></div>`;
  const postsLive = live("posts", { orderBy: "date" }), albumsLive = live("albums");
  const draw = () => {
    const p = postsLive.data.find((x) => x.id === id);
    const box = $("#one", view);
    if (!postsLive.ready) return;
    if (!p) { box.innerHTML = emptyState("image", "No encontrada"); return; }
    box.innerHTML = postCard(p, Object.fromEntries(albumsLive.data.map((a) => [a.id, a])));
    wirePosts(box, () => p);
  };
  const u1 = postsLive.on(draw), u2 = albumsLive.on(draw);
  return () => { u1(); u2(); };
}

// ------------------------------------------------------------------ Álbum: agregar
export function addToAlbum(posts) {
  const albums = live("albums").data;
  const m = modal({
    title: "Agregar a álbum",
    body: `<div class="sheet-list">${albums.map((a) => `<button class="sheet-item" data-id="${esc(a.id)}">${icon("album")}<span>${esc(a.name)}</span></button>`).join("")}</div>
      <div class="row gap"><input id="na" placeholder="Nuevo álbum (ej. Viaje a Cusco)"><button class="btn" id="mk">Crear</button></div>`,
  });
  const put = async (albumId) => {
    for (const p of posts) {
      const ids = new Set(p.albumIds || []); ids.add(albumId);
      await store.update("posts", p.id, { albumIds: [...ids] });
    }
    toast("Agregado al álbum"); m.close();
  };
  $$(".sheet-item", m.el).forEach((b) => (b.onclick = () => put(b.dataset.id)));
  $("#mk", m.el).onclick = async () => {
    const name = $("#na", m.el).value.trim(); if (!name) return;
    const id = await store.add("albums", { name, description: "", createdAt: Date.now(), author: me().email });
    put(id);
  };
}

// ------------------------------------------------------------------ Compositor
export function openComposer(existing = null, presetTags = [], presetAlbum = null) {
  const editing = !!existing;
  let files = [], location_ = existing?.location || null;
  let albumIds = new Set(existing?.albumIds || (presetAlbum ? [presetAlbum] : []));
  const albums = live("albums").data;
  const m = modal({
    title: editing ? "Editar publicación" : "Nueva publicación", wide: true,
    body: `
      ${editing ? `<div class="pick-preview">${(existing.images || []).map((im) => `<img src="${safeImg(im.thumb)}" alt="">`).join("")}</div>`
      : `<label class="drop" id="drop">
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden id="file">
          ${icon("image")}<b>Elegir fotos</b><span class="small muted">Puedes elegir varias (carrusel)</span>
        </label>
        <div class="pick-preview" id="prev"></div>`}
      <label class="field"><span>Descripción</span>
        <textarea id="cap" rows="3" placeholder="Escribe algo… puedes usar #hashtags">${esc(existing?.caption || "")}</textarea></label>
      <div class="field"><span>Hashtags</span><div id="tags"></div></div>
      <div class="grid2">
        <label class="field"><span>Fecha</span><input type="date" id="date" value="${existing?.date || ymd()}"></label>
        <div class="field"><span>Ubicación</span><button type="button" class="btn ghost loc-btn" id="loc"></button></div>
      </div>
      <div class="field"><span>Álbumes</span><div class="chips" id="albs"></div></div>
      <div class="progress hidden" id="prog"><div></div></div>
      <button class="btn primary block" id="save">${editing ? "Guardar cambios" : "Publicar"}</button>`,
  });
  const el = m.el;
  const tags = tagInput($("#tags", el), existing?.tags?.filter((t) => !(existing.caption || "").toLowerCase().includes("#" + t)) || presetTags);
  const drawLoc = () => { $("#loc", el).innerHTML = `${icon("pin")} <span>${location_ ? esc(location_.name || "Ubicación elegida") : "Agregar ubicación"}</span>`; };
  drawLoc();
  $("#loc", el).onclick = async () => { const r = await pickLocation(location_); if (r !== undefined) { location_ = r; drawLoc(); } };
  const drawAlbums = () => {
    $("#albs", el).innerHTML = albums.map((a) => `<button type="button" class="chip ${albumIds.has(a.id) ? "on" : ""}" data-id="${esc(a.id)}">${esc(a.name)}</button>`).join("")
      + `<button type="button" class="chip add" id="newalb">${icon("plus")} Nuevo</button>`;
    $$("#albs .chip[data-id]", el).forEach((b) => (b.onclick = () => { albumIds.has(b.dataset.id) ? albumIds.delete(b.dataset.id) : albumIds.add(b.dataset.id); drawAlbums(); }));
    $("#newalb", el).onclick = async () => {
      const name = prompt("Nombre del álbum"); if (!name?.trim()) return;
      const id = await store.add("albums", { name: name.trim(), description: "", createdAt: Date.now(), author: me().email });
      albums.push({ id, name: name.trim() }); albumIds.add(id); drawAlbums();
    };
  };
  drawAlbums();

  if (!editing) {
    $("#file", el).onchange = async (e) => {
      files = [...files, ...e.target.files].slice(0, 10);
      $("#prev", el).innerHTML = files.map((f, i) => `<div class="pv"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-i="${i}" aria-label="Quitar">×</button></div>`).join("");
      $$("#prev button", el).forEach((b) => (b.onclick = () => { files.splice(+b.dataset.i, 1); $("#file", el).dispatchEvent(new Event("change")); }));
      $("#drop", el).classList.toggle("small-drop", files.length > 0);
      // Ubicación y fecha automáticas desde la foto
      for (const f of files) {
        const ex = await readExif(f);
        if (ex.date && !e._dateSet) { $("#date", el).value = ymd(ex.date); e._dateSet = true; }
        if (ex.gps && !location_) {
          const g = await reverseGeocode(ex.gps.lat, ex.gps.lng);
          location_ = { ...ex.gps, ...g }; drawLoc(); toast("📍 Ubicación tomada de la foto"); break;
        }
      }
      e.target.value = "";
    };
  }

  $("#save", el).onclick = async () => {
    const caption = $("#cap", el).value.trim();
    const allTags = [...new Set([...extractTags(caption), ...tags.get()])];
    const data = { caption, tags: allTags, date: $("#date", el).value || ymd(), location: location_ || null, albumIds: [...albumIds] };
    const btn = $("#save", el); btn.disabled = true;
    try {
      if (editing) { await store.update("posts", existing.id, data); toast("Cambios guardados"); m.close(); return; }
      if (!files.length) { btn.disabled = false; return toast("Elige al menos una foto"); }
      const prog = $("#prog", el); prog.classList.remove("hidden");
      const images = [];
      for (let i = 0; i < files.length; i++) {
        btn.textContent = `Subiendo ${i + 1} de ${files.length}…`;
        images.push(await processPhoto(files[i]));
        $("div", prog).style.width = `${((i + 1) / files.length) * 100}%`;
      }
      await store.add("posts", { ...data, images, author: me().email, createdAt: Date.now() });
      toast("¡Publicado!"); m.close();
    } catch (err) {
      console.error(err); toast("Error: " + err.message); btn.disabled = false; btn.textContent = "Publicar";
    }
  };
}
