// 1. Importar los módulos de Firebase desde el CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 2. Tus credenciales de Firebase (Asegúrate de tener tus claves correctas aquí)
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "intersat-control-biomtrico.firebaseapp.com",
  projectId: "intersat-control-biomtrico",
  storageBucket: "intersat-control-biomtrico.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};

// 3. Inicializar la app y la base de datos
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// -------------------------------------------------------------
// FUNCIONES PARA METER Y LEER DATOS EN FIRESTORE
// -------------------------------------------------------------

// Función A: Guardar un nuevo registro de asistencia
export async function registrarAsistencia(nombre, cedula) {
  try {
    const docRef = await addDoc(collection(db, "asistencias"), {
      empleado: nombre,
      cedula: cedula,
      fechaHora: new Date().toLocaleString()
    });
    console.log("Asistencia registrada en Firebase con ID:", docRef.id);
    alert("¡Asistencia registrada exitosamente en la nube!");
  } catch (error) {
    console.error("Error al guardar asistencia:", error);
  }
}

// Función B: Obtener y listar todas las asistencias
export async function obtenerAsistencias() {
  try {
    const querySnapshot = await getDocs(collection(db, "asistencias"));
    const lista = [];
    querySnapshot.forEach((doc) => {
      lista.push({ id: doc.id, ...doc.data() });
    });
    return lista;
  } catch (error) {
    console.error("Error al obtener asistencias:", error);
    return [];
  }
}

// -------------------------------------------------------------
// Puente global (Para usar las funciones desde la consola)
// -------------------------------------------------------------
window.registrarAsistencia = registrarAsistencia;
window.obtenerAsistencias = obtenerAsistencias;