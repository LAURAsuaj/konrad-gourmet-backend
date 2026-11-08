/**
 * Guarda la sesión en sessionStorage: sobrevive a recargar la página pero se borra al
 * cerrar la pestaña, y no se comparte entre pestañas. Si el navegador bloquea el
 * almacenamiento, la sesión vive solo en memoria.
 */
const CLAVE = 'kg.sesion';

export function leerSesion() {
  try {
    const texto = sessionStorage.getItem(CLAVE);
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

export function guardarSesion(sesion) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(sesion));
  } catch {
    /* sin almacenamiento disponible: la sesión sigue en memoria */
  }
}

export function borrarSesion() {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    /* nada que borrar */
  }
}

/** Lee el vencimiento (`exp`, en segundos Unix) del token sin verificarlo: solo para la interfaz. */
export function vencimientoDelToken(token) {
  try {
    const carga = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(decodeURIComponent(escape(atob(carga))));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}
