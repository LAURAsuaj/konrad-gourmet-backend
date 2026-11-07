/**
 * Configuración global del sistema.
 *
 * Única fuente de lectura de variables de entorno (CO-6): ningún otro archivo
 * debe leer process.env. Las credenciales de los servicios externos (correo,
 * Ministerio de Comercio y redes sociales) se consumen desde aquí.
 */
import 'dotenv/config';

const OBLIGATORIAS = ['DATABASE_URL', 'JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

const faltantes = OBLIGATORIAS.filter((nombre) => !process.env[nombre]?.trim());
if (faltantes.length > 0) {
  throw new Error(
    `Faltan variables de entorno obligatorias: ${faltantes.join(', ')}. ` +
      'Cree el archivo .env a partir de .env.example.'
  );
}

function texto(nombre, defecto = '') {
  const valor = process.env[nombre];
  return valor === undefined || valor.trim() === '' ? defecto : valor.trim();
}

function entero(nombre, defecto, minimo = 0) {
  const crudo = process.env[nombre];
  if (crudo === undefined || crudo.trim() === '') return defecto;
  const numero = Number.parseInt(crudo, 10);
  if (Number.isNaN(numero) || numero < minimo) {
    throw new Error(`La variable ${nombre} debe ser un entero mayor o igual a ${minimo}`);
  }
  return numero;
}

function booleano(nombre, defecto) {
  const crudo = process.env[nombre];
  if (crudo === undefined || crudo.trim() === '') return defecto;
  return ['1', 'true', 'yes', 'si', 'sí'].includes(crudo.trim().toLowerCase());
}

function lista(nombre, defecto = []) {
  const crudo = process.env[nombre];
  if (crudo === undefined || crudo.trim() === '') return defecto;
  return crudo
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function congelar(objeto) {
  Object.values(objeto).forEach((valor) => {
    if (valor && typeof valor === 'object' && !Object.isFrozen(valor)) congelar(valor);
  });
  return Object.freeze(objeto);
}

const nodeEnv = texto('NODE_ENV', 'development');
const esProduccion = nodeEnv === 'production';

const versionesTls = ['TLSv1.2', 'TLSv1.3'];
const minVersionTls = texto('TLS_MIN_VERSION', 'TLSv1.3');
if (!versionesTls.includes(minVersionTls)) {
  throw new Error(`TLS_MIN_VERSION debe ser uno de: ${versionesTls.join(', ')}`);
}
if (esProduccion && minVersionTls !== 'TLSv1.3') {
  throw new Error('En producción TLS_MIN_VERSION debe ser TLSv1.3 (CO-6)');
}

const dbSsl = booleano('DB_SSL', true);
if (esProduccion && !dbSsl) {
  throw new Error('En producción DB_SSL debe estar activo (CO-6)');
}

const tlsCertPath = texto('HTTPS_CERT_PATH');
const tlsKeyPath = texto('HTTPS_KEY_PATH');
const trustProxy = booleano('TRUST_PROXY', false);
if (Boolean(tlsCertPath) !== Boolean(tlsKeyPath)) {
  throw new Error('HTTPS_CERT_PATH y HTTPS_KEY_PATH deben configurarse juntos');
}

const jwtSecret = process.env.JWT_SECRET.trim();
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
}

export const env = congelar({
  nodeEnv,
  esProduccion,
  port: entero('PORT', 3000, 1),

  tls: {
    minVersion: minVersionTls,
    // false solo para una base local de desarrollo (sin TLS); en producción es obligatorio
    dbSsl: dbSsl,
    rejectUnauthorized: booleano('DB_SSL_REJECT_UNAUTHORIZED', true),
    caCertificate: texto('DB_SSL_CA').replace(/\\n/g, '\n'),
  },

  db: {
    url: process.env.DATABASE_URL.trim(),
    poolMax: entero('DB_POOL_MAX', 10, 1),
  },

  supabase: {
    url: process.env.SUPABASE_URL.trim(),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  },

  jwt: {
    secret: jwtSecret,
    expiresIn: texto('JWT_EXPIRES_IN', '30m'),
    issuer: texto('JWT_ISSUER', 'konrad-gourmet'),
  },

  security: {
    corsOrigins: lista('CORS_ORIGINS', []),
    bcryptRounds: entero('BCRYPT_ROUNDS', 12, 10),
  },

  server: {
    trustProxy,
    tlsCertPath,
    tlsKeyPath,
    loginMaxFallos: entero('LOGIN_RATE_LIMIT_MAX', 10, 1),
    loginVentanaMinutos: entero('LOGIN_RATE_LIMIT_WINDOW_MIN', 15, 1),
  },

  outbox: {
    pollMs: entero('OUTBOX_POLL_MS', 2000, 100),
    batchSize: entero('OUTBOX_BATCH_SIZE', 25, 1),
    maxAttempts: entero('OUTBOX_MAX_ATTEMPTS', 6, 1),
    retryBaseSeconds: entero('OUTBOX_RETRY_BASE_SECONDS', 15, 1),
    leaseSeconds: entero('OUTBOX_LEASE_SECONDS', 60, 5),
  },

  cron: {
    timezone: texto('CRON_TIMEZONE', 'America/Bogota'),
    descuentoDiarioFallback: texto('CRON_DESCUENTO_FALLBACK', '0 2 * * *'),
    tendencias: texto('CRON_TENDENCIAS', '0 8 * * 1'),
    reintentoPrecios: texto('CRON_REINTENTO_PRECIOS', '*/30 * * * *'),
  },

  ministerio: {
    baseUrl: texto('MINCOMERCIO_API_URL'),
    timeoutMs: entero('MINCOMERCIO_TIMEOUT_MS', 20000, 500),
    ciudad: texto('MINCOMERCIO_CIUDAD'),
    permitirHttp: booleano('MINCOMERCIO_PERMITIR_HTTP', false),
    cacheMinutos: entero('MINCOMERCIO_CACHE_MINUTOS', 360, 1),
  },

  correo: {
    host: texto('SMTP_HOST'),
    port: entero('SMTP_PORT', 587, 1),
    secure: booleano('SMTP_SECURE', false),
    user: texto('SMTP_USER'),
    pass: texto('SMTP_PASS'),
    remitente: texto('CORREO_REMITENTE', 'Konrad Gourmet <no-reply@konradgourmet.com>'),
  },

  redes: {
    baseUrl: texto('REDES_API_URL'),
    token: texto('REDES_API_TOKEN'),
    timeoutMs: entero('REDES_TIMEOUT_MS', 8000, 500),
  },
});
