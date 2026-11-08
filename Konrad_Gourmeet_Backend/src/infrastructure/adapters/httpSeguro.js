/**
 * Cliente HTTP compartido por los adaptadores de servicios externos (REST/JSON y SOAP).
 *
 * Usa node:https con TLS mínimo configurable (1.3 por defecto, CO-6), tiempo máximo de
 * espera y tope de tamaño de respuesta. Solo se permite http hacia localhost y fuera de
 * producción (servidores simulados en desarrollo), o hacia cualquier host cuando el
 * llamador lo autoriza de forma explícita con `permitirHttp` (excepción documentada).
 */
import https from 'node:https';
import http from 'node:http';
import { StringDecoder } from 'node:string_decoder';
import { env } from '../../config/env.js';
import {
  ServicioExternoError,
  CODIGOS_ERROR_SERVICIO as CODIGOS,
} from '../../domain/services/ServicioExternoError.js';

const LIMITE_RESPUESTA_BYTES = 1_000_000;
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const agenteTls = new https.Agent({
  minVersion: env.tls.minVersion,
  keepAlive: true,
  maxSockets: 10,
});

/** Construye una URL a partir de una base, una ruta relativa y parámetros de consulta. */
export function construirUrl(base, ruta, parametros = {}) {
  const raiz = base.endsWith('/') ? base : `${base}/`;
  const url = new URL(ruta.replace(/^\//, ''), raiz);
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null && valor !== '') {
      url.searchParams.set(clave, String(valor));
    }
  }
  return url;
}

function normalizar(servicio, error) {
  if (error instanceof ServicioExternoError) return error;
  return new ServicioExternoError(servicio, CODIGOS.RED, `No se pudo contactar el servicio: ${error.message}`, {
    causa: error,
  });
}

/**
 * Envía una petición y devuelve la respuesta COMPLETA como texto, con cualquier código HTTP
 * (quien llama decide qué hacer con los errores; por ejemplo, un SOAP Fault llega con HTTP 500).
 *
 * @param {{servicio: string, url: URL|string, metodo?: string, cabeceras?: object, cuerpo?: string|null,
 *          timeoutMs: number, permitirHttp?: boolean, limiteBytes?: number}} opciones
 * @returns {Promise<{estado: number, texto: string}>}
 * @throws {ServicioExternoError} configuración inválida, red, tiempo de espera o respuesta demasiado grande
 */
export function solicitarTexto({
  servicio,
  url,
  metodo = 'GET',
  cabeceras = {},
  cuerpo = null,
  timeoutMs,
  permitirHttp = false,
  limiteBytes = LIMITE_RESPUESTA_BYTES,
}) {
  return new Promise((resolve, reject) => {
    let destino;
    try {
      destino = url instanceof URL ? url : new URL(url);
    } catch {
      reject(new ServicioExternoError(servicio, CODIGOS.CONFIGURACION, 'La URL del servicio no es válida'));
      return;
    }

    const esHttps = destino.protocol === 'https:';
    const httpPermitido =
      destino.protocol === 'http:' && (permitirHttp || (!env.esProduccion && HOSTS_LOCALES.has(destino.hostname)));
    if (!esHttps && !httpPermitido) {
      reject(
        new ServicioExternoError(servicio, CODIGOS.CONFIGURACION, 'El servicio debe consumirse por HTTPS con TLS (CO-6)')
      );
      return;
    }

    const peticion = (esHttps ? https : http).request(
      destino,
      {
        method: metodo,
        agent: esHttps ? agenteTls : undefined,
        timeout: timeoutMs,
        headers: {
          ...(cuerpo ? { 'Content-Length': Buffer.byteLength(cuerpo) } : {}),
          ...cabeceras,
        },
      },
      (respuesta) => {
        const partes = [];
        let total = 0;

        respuesta.on('data', (parte) => {
          total += parte.length;
          if (total > limiteBytes) {
            peticion.destroy(
              new ServicioExternoError(servicio, CODIGOS.RESPUESTA_INVALIDA, 'La respuesta excede el tamaño permitido')
            );
            return;
          }
          partes.push(parte);
        });

        respuesta.on('error', (error) => reject(normalizar(servicio, error)));
        respuesta.on('end', () => resolve({ estado: respuesta.statusCode, texto: Buffer.concat(partes).toString('utf8') }));
      }
    );

    peticion.on('timeout', () => {
      peticion.destroy(
        new ServicioExternoError(servicio, CODIGOS.TIMEOUT, `El servicio no respondió en ${timeoutMs} ms`)
      );
    });
    peticion.on('error', (error) => reject(normalizar(servicio, error)));

    if (cuerpo) peticion.write(cuerpo);
    peticion.end();
  });
}

/**
 * @param {{servicio: string, url: URL|string, metodo?: string, cabeceras?: object,
 *          cuerpo?: object, timeoutMs: number}} opciones
 * @returns {Promise<any>} cuerpo JSON de una respuesta 2xx (null si viene vacío)
 * @throws {ServicioExternoError}
 */
export async function solicitarJson({ servicio, url, metodo = 'GET', cabeceras = {}, cuerpo, timeoutMs }) {
  const datos = cuerpo === undefined ? null : JSON.stringify(cuerpo);
  const { estado, texto } = await solicitarTexto({
    servicio,
    url,
    metodo,
    cabeceras: { Accept: 'application/json', ...(datos ? { 'Content-Type': 'application/json' } : {}), ...cabeceras },
    cuerpo: datos,
    timeoutMs,
  });
  if (estado < 200 || estado >= 300) {
    throw new ServicioExternoError(servicio, CODIGOS.HTTP, `El servicio respondió HTTP ${estado}`, { estado });
  }
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    throw new ServicioExternoError(servicio, CODIGOS.RESPUESTA_INVALIDA, 'La respuesta no es JSON válido');
  }
}

/**
 * Como solicitarTexto, pero entrega la respuesta POR PARTES a `alRecibir(texto, bytesAcumulados)`
 * en lugar de acumularla: sirve para respuestas de cientos de MB de las que solo interesa el
 * principio. Si `alRecibir` devuelve `false` se corta la conexión (sin leer el resto). Una respuesta
 * con código distinto de 2xx no se entrega por partes: se acumula (hasta 1 MB) y se devuelve en `texto`.
 * Además del tiempo de inactividad (`timeoutMs`) hay un plazo total (`plazoTotalMs`).
 *
 * @param {{servicio: string, url: URL|string, metodo?: string, cabeceras?: object, cuerpo?: string|null,
 *          timeoutMs: number, plazoTotalMs?: number, permitirHttp?: boolean,
 *          alRecibir: (texto: string, bytes: number) => boolean|void}} opciones
 * @returns {Promise<{estado: number, completa: boolean, bytes: number, texto: string|null}>}
 *          `completa` es false si se cortó porque `alRecibir` devolvió false
 * @throws {ServicioExternoError}
 */
export function solicitarEnFlujo({
  servicio,
  url,
  metodo = 'GET',
  cabeceras = {},
  cuerpo = null,
  timeoutMs,
  plazoTotalMs = timeoutMs * 3,
  permitirHttp = false,
  alRecibir,
}) {
  return new Promise((resolve, reject) => {
    let destino;
    try {
      destino = url instanceof URL ? url : new URL(url);
    } catch {
      reject(new ServicioExternoError(servicio, CODIGOS.CONFIGURACION, 'La URL del servicio no es válida'));
      return;
    }
    const esHttps = destino.protocol === 'https:';
    const httpPermitido =
      destino.protocol === 'http:' && (permitirHttp || (!env.esProduccion && HOSTS_LOCALES.has(destino.hostname)));
    if (!esHttps && !httpPermitido) {
      reject(
        new ServicioExternoError(servicio, CODIGOS.CONFIGURACION, 'El servicio debe consumirse por HTTPS con TLS (CO-6)')
      );
      return;
    }

    let terminado = false;
    let plazo = null;
    const terminar = (accion, valor) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(plazo);
      accion(valor);
    };

    const peticion = (esHttps ? https : http).request(
      destino,
      {
        method: metodo,
        agent: esHttps ? agenteTls : undefined,
        timeout: timeoutMs,
        headers: { ...(cuerpo ? { 'Content-Length': Buffer.byteLength(cuerpo) } : {}), ...cabeceras },
      },
      (respuesta) => {
        const estado = respuesta.statusCode;
        const exitosa = estado >= 200 && estado < 300;
        const decodificador = new StringDecoder('utf8'); // no parte un carácter con tilde entre dos partes
        const acumulado = [];
        let bytes = 0;

        respuesta.on('data', (parte) => {
          if (terminado) return;
          bytes += parte.length;
          if (!exitosa) {
            if (bytes > LIMITE_RESPUESTA_BYTES) {
              peticion.destroy(
                new ServicioExternoError(servicio, CODIGOS.RESPUESTA_INVALIDA, 'La respuesta excede el tamaño permitido')
              );
              return;
            }
            acumulado.push(parte);
            return;
          }
          try {
            if (alRecibir(decodificador.write(parte), bytes) === false) {
              terminar(resolve, { estado, completa: false, bytes, texto: null });
              peticion.destroy();
            }
          } catch (error) {
            terminar(reject, normalizar(servicio, error));
            peticion.destroy();
          }
        });
        respuesta.on('error', (error) => terminar(reject, normalizar(servicio, error)));
        respuesta.on('end', () => {
          if (terminado) return;
          if (!exitosa) {
            terminar(resolve, { estado, completa: true, bytes, texto: Buffer.concat(acumulado).toString('utf8') });
            return;
          }
          try {
            const resto = decodificador.end();
            if (resto) alRecibir(resto, bytes);
            terminar(resolve, { estado, completa: true, bytes, texto: null });
          } catch (error) {
            terminar(reject, normalizar(servicio, error));
          }
        });
      }
    );

    plazo = setTimeout(() => {
      peticion.destroy(
        new ServicioExternoError(servicio, CODIGOS.TIMEOUT, `El servicio no terminó de responder en ${plazoTotalMs} ms`)
      );
    }, plazoTotalMs);
    peticion.on('timeout', () => {
      peticion.destroy(
        new ServicioExternoError(servicio, CODIGOS.TIMEOUT, `El servicio no respondió en ${timeoutMs} ms`)
      );
    });
    peticion.on('error', (error) => terminar(reject, normalizar(servicio, error)));

    if (cuerpo) peticion.write(cuerpo);
    peticion.end();
  });
}
