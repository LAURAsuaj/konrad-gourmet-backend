/**
 * Interceptores globales de la API: cabeceras de seguridad, CORS, exigencia de
 * TLS (CO-6), límite de intentos de inicio de sesión y manejo uniforme de errores.
 */
import helmet from 'helmet';
import cors from 'cors';
import { env } from '../../config/env.js';
import { ErrorDeNegocio, ErrorProhibido } from '../../domain/errors/ErroresDeNegocio.js';

const ESTADOS_HTTP = Object.freeze({
  VALIDACION: 400,
  CREDENCIALES_INVALIDAS: 401,
  NO_AUTENTICADO: 401,
  PROHIBIDO: 403,
  NO_ENCONTRADO: 404,
  CONFLICTO: 409,
  CUENTA_BLOQUEADA: 423,
  SERVICIO_NO_DISPONIBLE: 503,
});

/** En producción rechaza las peticiones que no llegaron por TLS (/salud queda exenta para sondas internas). */
export function exigirTls({ activo }) {
  return (req, res, next) => {
    if (!activo || req.secure || req.path === '/salud') {
      next();
      return;
    }
    res.status(426).json({ error: { codigo: 'TLS_REQUERIDO', mensaje: 'Esta API solo acepta conexiones seguras (TLS 1.3)' } });
  };
}

export function configurarSeguridadHttp(
  app,
  { corsOrigins = env.security.corsOrigins, esProduccion = env.esProduccion, trustProxy = env.server.trustProxy } = {}
) {
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);

  app.use(helmet({ hsts: { maxAge: 31_536_000, includeSubDomains: true } }));
  app.use(exigirTls({ activo: esProduccion }));
  app.use(
    cors({
      origin(origen, devolver) {
        // Sin cabecera Origin (herramientas del servidor, curl) no aplica CORS
        if (!origen || corsOrigins.includes(origen)) devolver(null, true);
        else devolver(new ErrorProhibido('Origen no permitido'));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    })
  );
}

/**
 * Limita los intentos de inicio de sesión fallidos por IP dentro de una ventana.
 * Un acceso correcto reinicia el conteo.
 */
export function limitarIntentosLogin({
  max = env.server.loginMaxFallos,
  ventanaMs = env.server.loginVentanaMinutos * 60_000,
} = {}) {
  const fallos = new Map();
  return (req, res, next) => {
    const ahora = Date.now();
    if (fallos.size > 10_000) {
      for (const [ip, registro] of fallos) if (ahora - registro.inicio > ventanaMs) fallos.delete(ip);
    }
    let registro = fallos.get(req.ip);
    if (registro && ahora - registro.inicio > ventanaMs) {
      fallos.delete(req.ip);
      registro = undefined;
    }
    if (registro && registro.conteo >= max) {
      res.set('Retry-After', String(Math.ceil((registro.inicio + ventanaMs - ahora) / 1000)));
      res.status(429).json({ error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos fallidos; intente más tarde' } });
      return;
    }
    res.on('finish', () => {
      if (res.statusCode === 200) {
        fallos.delete(req.ip);
      } else if (res.statusCode === 401 || res.statusCode === 423) {
        const actual = fallos.get(req.ip) ?? { conteo: 0, inicio: Date.now() };
        actual.conteo += 1;
        fallos.set(req.ip, actual);
      }
    });
    next();
  };
}

export function rutaNoEncontrada(req, res) {
  res.status(404).json({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'La ruta solicitada no existe' } });
}

const CODIGOS_DE_CONEXION = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE',
  '57P01', '57P02', '57P03', '53300', '08000', '08001', '08003', '08004', '08006',
]);

/**
 * Indica si un error se debe a que no hay conexión con la base de datos (caída, tiempo de espera,
 * reinicio, demasiadas conexiones). Son fallos temporales: el cliente debe reintentar, no es un error del sistema.
 */
export function esErrorDeConexion(error) {
  if (!error) return false;
  if (CODIGOS_DE_CONEXION.has(error.code)) return true;
  return /connection terminated|connection timeout|timeout exceeded when trying to connect|connection error|database system is (starting up|shutting down)/i.test(error.message ?? '');
}

/** Traduce errores de negocio a HTTP; los inesperados se registran y no exponen detalles internos. */
export function manejadorErrores(registrador) {
  // eslint-disable-next-line no-unused-vars
  return (error, req, res, _siguiente) => {
    if (error instanceof ErrorDeNegocio) {
      const cuerpo = { codigo: error.codigo, mensaje: error.message };
      if (error.codigo === 'VALIDACION' && error.detalle) cuerpo.detalle = error.detalle;
      res.status(ESTADOS_HTTP[error.codigo] ?? 400).json({ error: cuerpo });
      return;
    }
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({ error: { codigo: 'VALIDACION', mensaje: 'El cuerpo de la petición no es un JSON válido' } });
      return;
    }
    if (error.type === 'entity.too.large') {
      res.status(413).json({ error: { codigo: 'CUERPO_DEMASIADO_GRANDE', mensaje: 'El cuerpo de la petición supera el tamaño permitido' } });
      return;
    }
    if (esErrorDeConexion(error)) {
      registrador
        .error({ modulo: 'api', mensaje: 'Sin conexión con la base de datos', detalle: { ruta: `${req.method} ${req.path}` }, error })
        .finally(() => {
          if (!res.headersSent) {
            res.set('Retry-After', '5');
            res.status(503).json({ error: { codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'El servicio no está disponible temporalmente; intente de nuevo en unos segundos' } });
          }
        });
      return;
    }
    registrador
      .error({ modulo: 'api', mensaje: 'Error no controlado en la API', detalle: { ruta: `${req.method} ${req.path}` }, error })
      .finally(() => {
        if (!res.headersSent) {
          res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' } });
        }
      });
  };
}
