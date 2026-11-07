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
