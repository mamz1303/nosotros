// ============================================================
//  CONFIGURACIÓN — edita este archivo antes de publicar
// ============================================================

// 1) Pega aquí la config de tu proyecto Firebase
//    (Consola Firebase → Configuración del proyecto → Tus apps → Web)
//    Si lo dejas vacío (apiKey: ""), la app arranca en MODO DEMO
//    y guarda todo solo en este navegador (localStorage).
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

// 2) Las dos personas de la app (correo con el que inician sesión).
//    Deben coincidir con los correos de firestore.rules.
export const people = {
  "tu-correo@gmail.com":   { name: "Manu",     color: "#c2410c" },
  "correo-de-ella@gmail.com": { name: "Graciela", color: "#be185d" },
};

// 3) Nombre del "espacio" (carpeta raíz en Firestore). Puedes dejarlo así.
export const SPACE_ID = "nosotros";

// 4) (Opcional) Cloudinary para guardar las fotos en alta calidad gratis.
//    Si lo dejas vacío, las fotos se comprimen (~1600px) y se guardan
//    dentro de Firestore, sin configurar nada más.
//    Para activarlo: cloudinary.com → Settings → Upload → Add upload preset
//    → Signing mode: "Unsigned". Copia el cloud name y el nombre del preset.
export const cloudinary = {
  cloudName: "",
  uploadPreset: "",
};

// Título que aparece en la app
export const APP_NAME = "Nosotros";
