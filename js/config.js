// ============================================================
//  CONFIGURACIÓN — edita este archivo antes de publicar
// ============================================================

// 1) Config de tu proyecto Firebase
//    (Consola Firebase → Configuración del proyecto → Tus apps → Web)
//    Si lo dejas vacío (apiKey: ""), la app arranca en MODO DEMO.
export const firebaseConfig = {
  apiKey: "AIzaSyC073QXbGvXM-svQRGGGBxYQey_AsDRHBU",
  authDomain: "nosotros-469d0.firebaseapp.com",
  projectId: "nosotros-469d0",
  storageBucket: "nosotros-469d0.firebasestorage.app",
  messagingSenderId: "430646214800",
  appId: "1:430646214800:web:2b6c1c460fc7cf61669815",
};

// 2) Las dos personas de la app (correo con el que inician sesión).
//    Deben coincidir con los correos de firestore.rules. Siempre en minúsculas.
export const people = {
  "mamz1303@gmail.com":  { name: "Manu",  color: "#c2410c" },
  "balbint17@gmail.com": { name: "Cheli", color: "#be185d" },
};

// 3) Nombre del "espacio" (carpeta raíz en Firestore). Puedes dejarlo así.
export const SPACE_ID = "nosotros";

// 4) (Opcional) Cloudinary para guardar las fotos en alta calidad gratis.
//    Si lo dejas vacío, las fotos se comprimen (~1600px) y se guardan en Firestore.
export const cloudinary = {
  cloudName: "",
  uploadPreset: "",
};

// 5) (Opcional) Clave de Google Maps para buscar direcciones con la base de Google.
//    Vacío = búsqueda gratuita con OpenStreetMap (sin tarjeta).
//    Ver README → "Búsqueda de direcciones con Google".
export const googleMapsKey = "";

// Título que aparece en la app
export const APP_NAME = "Nosotros";
