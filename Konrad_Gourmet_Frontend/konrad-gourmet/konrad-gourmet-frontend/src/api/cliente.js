/**
 * Cliente HTTP único hacia la API de Konrad Gourmet (/api/v1).
 * - Agrega el token de la sesión (Authorization: Bearer).
 * - Devuelve directamente `datos` de las respuestas { datos }.
 * - Convierte las respuestas { error: { codigo, mensaje } } en ErrorApi.
 * - Si la API responde 401 NO_AUTENTICADO, avisa a la sesión para que la cierre.
 */
const URL_BASE = (import.meta.env?.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const PREFIJO = '/api/v1';

export class ErrorApi extends Error {
  constructor({ estado, codigo, mensaje, reintentarEnSegundos = null }) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.codigo = codigo;
    this.reintentarEnSegundos = reintentarEnSegundos;
  }
}

const MENSAJES_POR_DEFECTO = {
  SIN_CONEXION: 'No hay conexión con el servidor. Verifique que la API esté encendida e intente de nuevo.',
  ERROR_INTERNO: 'El servidor tuvo un error inesperado. Intente de nuevo en unos segundos.',
  SERVICIO_NO_DISPONIBLE: 'Un servicio no está disponible en este momento. Intente de nuevo en unos segundos.',
  RESPUESTA_INVALIDA: 'El servidor respondió en un formato inesperado.',
};

let obtenerToken = () => null;
let alNoAutenticado = () => {};

/** Lo llama el proveedor de sesión para conectar el cliente con el token vigente. */
export function configurarCliente(opciones) {
  if (opciones.obtenerToken) obtenerToken = opciones.obtenerToken;
  if (opciones.alNoAutenticado) alNoAutenticado = opciones.alNoAutenticado;
}

export function construirUrl(ruta, consulta) {
  const url = new URL(`${URL_BASE}${PREFIJO}${ruta}`);
  for (const [clave, valor] of Object.entries(consulta ?? {})) {
    if (valor !== undefined && valor !== null && valor !== '') url.searchParams.set(clave, String(valor));
  }
  return url.toString();
}

/**
 * @param {string} ruta Ruta relativa a /api/v1, por ejemplo '/menu'
 * @param {{metodo?: string, cuerpo?: unknown, consulta?: object, publica?: boolean, senal?: AbortSignal, token?: string}} opciones
 */
export async function pedir(ruta, { metodo = 'GET', cuerpo, consulta, publica = false, senal, token } = {}) {
  const cabeceras = { Accept: 'application/json' };
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  const tokenUsado = token ?? (publica ? null : obtenerToken());
  if (tokenUsado) cabeceras.Authorization = `Bearer ${tokenUsado}`;

  let respuesta;
  try {
    respuesta = await fetch(construirUrl(ruta, consulta), {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: senal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ErrorApi({ estado: 0, codigo: 'SIN_CONEXION', mensaje: MENSAJES_POR_DEFECTO.SIN_CONEXION });
  }

  return interpretarRespuesta(respuesta, { publica });
}

export async function interpretarRespuesta(respuesta, { publica = false } = {}) {
  let cuerpo = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    cuerpo = null;
  }

  if (respuesta.ok) {
    if (!cuerpo || !('datos' in cuerpo)) {
      throw new ErrorApi({ estado: respuesta.status, codigo: 'RESPUESTA_INVALIDA', mensaje: MENSAJES_POR_DEFECTO.RESPUESTA_INVALIDA });
    }
    return cuerpo.datos;
  }

  const codigo = cuerpo?.error?.codigo ?? (respuesta.status >= 500 ? 'ERROR_INTERNO' : 'RESPUESTA_INVALIDA');
  const reintentar = Number(respuesta.headers?.get?.('Retry-After'));
  const error = new ErrorApi({
    estado: respuesta.status,
    codigo,
    mensaje: cuerpo?.error?.mensaje ?? MENSAJES_POR_DEFECTO[codigo] ?? MENSAJES_POR_DEFECTO.ERROR_INTERNO,
    reintentarEnSegundos: Number.isFinite(reintentar) && reintentar > 0 ? reintentar : null,
  });
  if (codigo === 'NO_AUTENTICADO' && !publica) alNoAutenticado(error);
  throw error;
}

export const api = {
  get: (ruta, opciones) => pedir(ruta, { ...opciones, metodo: 'GET' }),
  post: (ruta, cuerpo, opciones) => pedir(ruta, { ...opciones, metodo: 'POST', cuerpo }),
  put: (ruta, cuerpo, opciones) => pedir(ruta, { ...opciones, metodo: 'PUT', cuerpo }),
  patch: (ruta, cuerpo, opciones) => pedir(ruta, { ...opciones, metodo: 'PATCH', cuerpo }),
  delete: (ruta, opciones) => pedir(ruta, { ...opciones, metodo: 'DELETE' }),
};

/** Mensaje listo para mostrar a partir de cualquier error. */
export function mensajeDeError(error) {
  if (error instanceof ErrorApi) return error.message;
  return MENSAJES_POR_DEFECTO.ERROR_INTERNO;
}
