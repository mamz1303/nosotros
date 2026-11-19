import { store, live, me, personFor } from "../store.js";
import { $, $$, esc, icon, modal, toast, confirmDialog, emptyState, safeUrl } from "../ui.js";
import { parseSpotify, spotifyMeta } from "../services.js";
import { playSpotify } from "../app.js";

const TYPE = { playlist: "Playlist", album: "Álbum", track: "Canción", episode: "Episodio", show: "Podcast", artist: "Artista" };

export function render(view) {
  view.innerHTML = `
    <header class="page-head"><h1>Nuestra música</h1><button class="btn primary" id="add">${icon("plus")} Agregar</button></header>
    <p class="muted small">Pega el link de una playlist, álbum o canción de Spotify. Se reproduce aquí mismo y sigue sonando mientras navegas por la app.
    Si tienen sesión de Spotify abierta en el navegador se escucha completa; si no, son vistas previas de 30 s (o toca “Abrir en Spotify”).</p>
    <div id="list" class="music-grid"></div>`;
  const pl = live("playlists");
  const draw = () => {
    const box = $("#list", view);
    if (!pl.ready) return;
    box.innerHTML = pl.data.length ? pl.data.map((p) => {
      const a = personFor(p.author);
      const img = (p.image || "").startsWith("https://") ? p.image : "";
      return `<article class="music-card" data-id="${esc(p.id)}">
        <button class="cover" data-play aria-label="Reproducir">${img ? `<img src="${esc(img)}" alt="">` : icon("music")}<span class="play">${icon("play")}</span></button>
        <div class="grow">
          <span class="small muted">${TYPE[p.type] || "Spotify"} · ${esc(a.name)}</span>
          <b>${esc(p.title || "Sin título")}</b>
          ${p.note ? `<p class="small">${esc(p.note)}</p>` : ""}
          <div class="row gap small"><a href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener" class="linkish">${icon("external")} Abrir en Spotify</a>
          <button class="linkish danger-text" data-del>Quitar</button></div>
        </div></article>`;
    }).join("") : emptyState("music", "Sin música aún", "Agrega su playlist favorita.");
    $$(".music-card", box).forEach((c) => {
      const p = pl.data.find((x) => x.id === c.dataset.id);
      $("[data-play]", c).onclick = () => playSpotify({ type: p.type, id: p.spotifyId }, p.title);
      $("[data-del]", c).onclick = async () => { if (await confirmDialog("Se quitará de la lista.", "Quitar")) store.remove("playlists", p.id); };
    });
  };
  const u = pl.on(draw);
  $("#add", view).onclick = addDialog;
  return u;
}

function addDialog() {
  const m = modal({
    title: "Agregar de Spotify",
    body: `<label class="field"><span>Link de Spotify</span><input id="u" placeholder="https://open.spotify.com/playlist/…"></label>
      <label class="field"><span>Nota (opcional)</span><input id="n" placeholder="Para el viaje en carro 🚗"></label>
      <p class="small muted">En Spotify: ⋯ → Compartir → Copiar enlace.</p>
      <button class="btn primary block" id="ok">Agregar</button>`,
  });
  $("#ok", m.el).onclick = async () => {
    const url = $("#u", m.el).value.trim();
    const sp = parseSpotify(url);
    if (!sp) return toast("Ese link no parece de Spotify");
    $("#ok", m.el).disabled = true;
    const meta = await spotifyMeta(url);
    await store.add("playlists", { url, type: sp.type, spotifyId: sp.id, title: meta.title, image: meta.image,
      note: $("#n", m.el).value.trim(), author: me().email, createdAt: Date.now() });
    toast("Agregado"); m.close();
  };
}
