// Capa de datos: Firebase (Firestore + Auth) o modo demo (localStorage).
// Todas las vistas usan solo esta API, así cambiar de backend no toca la UI.
import { firebaseConfig, people, SPACE_ID } from "./config.js";

export const DEMO = !firebaseConfig.apiKey;
const FB = "https://www.gstatic.com/firebasejs/10.12.2/";

let impl = null;
let currentUser = null;
const authListeners = new Set();

export function personFor(email) {
  const p = people[(email || "").toLowerCase()];
  if (p) return { email, ...p };
  return { email, name: (email || "?").split("@")[0], color: "#64748b" };
}
export function me() { return currentUser; }
export function otherPerson() {
  const emails = Object.keys(people);
  const other = emails.find((e) => e !== currentUser?.email) || emails[1];
  return personFor(other);
}

function setUser(u) {
  currentUser = u ? personFor(u.email.toLowerCase()) : null;
  authListeners.forEach((cb) => cb(currentUser));
}

// ---------------------------------------------------------------- Firebase
async function initFirebase() {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(FB + "firebase-app.js"),
    import(FB + "firebase-firestore.js"),
    import(FB + "firebase-auth.js"),
  ]);
  const app = initializeApp(firebaseConfig);
  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch { db = fs.getFirestore(app); }
  const auth = au.getAuth(app);
  au.getRedirectResult(auth).catch(() => {});
  au.onAuthStateChanged(auth, (u) => setUser(u));
  const col = (name) => fs.collection(db, "spaces", SPACE_ID, name);
  const ref = (name, id) => fs.doc(db, "spaces", SPACE_ID, name, id);

  return {
    subscribe(name, cb, { orderBy = "createdAt", dir = "desc", limit } = {}) {
      const parts = [col(name), fs.orderBy(orderBy, dir)];
      if (limit) parts.push(fs.limit(limit));
      return fs.onSnapshot(fs.query(...parts),
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => { console.error(err); cb([], err); });
    },
    async get(name, id) {
      const s = await fs.getDoc(ref(name, id));
      return s.exists() ? { id: s.id, ...s.data() } : null;
    },
    async add(name, data) { return (await fs.addDoc(col(name), data)).id; },
    async set(name, id, data) { await fs.setDoc(ref(name, id), data, { merge: true }); },
    async update(name, id, data) { await fs.updateDoc(ref(name, id), data); },
    async remove(name, id) { await fs.deleteDoc(ref(name, id)); },
    async signInGoogle() {
      const p = new au.GoogleAuthProvider();
      try { await au.signInWithPopup(auth, p); }
      catch (e) {
        if (String(e.code).includes("popup")) await au.signInWithRedirect(auth, p);
        else throw e;
      }
    },
    signInEmail: (e, p) => au.signInWithEmailAndPassword(auth, e, p),
    signUpEmail: (e, p) => au.createUserWithEmailAndPassword(auth, e, p),
    resetPassword: (e) => au.sendPasswordResetEmail(auth, e),
    signOut: () => au.signOut(auth),
  };
}

// ---------------------------------------------------------------- Demo local
function initLocal() {
  const KEY = (n) => `nosotros:${n}`;
  const subs = new Map(); // name -> Set(fn)
  const read = (n) => { try { return JSON.parse(localStorage.getItem(KEY(n)) || "[]"); } catch { return []; } };
  const write = (n, arr) => {
    try { localStorage.setItem(KEY(n), JSON.stringify(arr)); }
    catch (e) { alert("El almacenamiento del modo demo está lleno. Conecta Firebase para guardar sin límites."); throw e; }
    emit(n);
  };
  const emit = (n) => (subs.get(n) || new Set()).forEach((fn) => fn());
  window.addEventListener("storage", (e) => {
    if (e.key?.startsWith("nosotros:")) emit(e.key.slice(9));
  });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const saved = sessionStorage.getItem("nosotros:demoUser");
  setTimeout(() => setUser(saved ? { email: saved } : null), 0);

  return {
    subscribe(name, cb, { orderBy = "createdAt", dir = "desc", limit } = {}) {
      const run = () => {
        let arr = read(name).sort((a, b) => {
          const x = a[orderBy] ?? "", y = b[orderBy] ?? "";
          return (x > y ? 1 : x < y ? -1 : 0) * (dir === "desc" ? -1 : 1);
        });
        if (limit) arr = arr.slice(0, limit);
        cb(arr);
      };
      if (!subs.has(name)) subs.set(name, new Set());
      subs.get(name).add(run);
      setTimeout(run, 0);
      return () => subs.get(name).delete(run);
    },
    async get(name, id) { return read(name).find((d) => d.id === id) || null; },
    async add(name, data) { const id = uid(); write(name, [...read(name), { ...data, id }]); return id; },
    async set(name, id, data) {
      const arr = read(name); const i = arr.findIndex((d) => d.id === id);
      if (i >= 0) arr[i] = { ...arr[i], ...data }; else arr.push({ ...data, id });
      write(name, arr);
    },
    async update(name, id, data) {
      write(name, read(name).map((d) => (d.id === id ? { ...d, ...data } : d)));
    },
    async remove(name, id) { write(name, read(name).filter((d) => d.id !== id)); },
    async signInDemo(email) { sessionStorage.setItem("nosotros:demoUser", email); setUser({ email }); },
    async signOut() { sessionStorage.removeItem("nosotros:demoUser"); setUser(null); },
  };
}

export async function initStore() {
  impl = DEMO ? initLocal() : await initFirebase();
  return impl;
}
export const store = new Proxy({}, { get: (_, k) => impl?.[k] });
export function onAuth(cb) { authListeners.add(cb); return () => authListeners.delete(cb); }

// Utilidad: suscribirse y mantener un caché compartido entre vistas
const caches = new Map();
export function live(name, opts = {}) {
  const key = name + JSON.stringify(opts);
  if (!caches.has(key)) {
    const c = { data: [], ready: false, fns: new Set() };
    c.unsub = store.subscribe(name, (d) => { c.data = d; c.ready = true; c.fns.forEach((f) => f(d)); }, opts);
    caches.set(key, c);
  }
  const c = caches.get(key);
  return {
    get data() { return c.data; },
    get ready() { return c.ready; },
    on(fn) { c.fns.add(fn); if (c.ready) fn(c.data); return () => c.fns.delete(fn); },
  };
}
export function resetLive() { caches.forEach((c) => c.unsub?.()); caches.clear(); }
