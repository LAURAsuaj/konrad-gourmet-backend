/**
 * Entorno de las pruebas. Cada archivo de prueba debe importarlo PRIMERO.
 *
 * Protección: las pruebas borran y recrean el esquema de la base de datos, así que solo
 * corren contra una base LOCAL cuyo nombre contenga "test". Nunca contra Supabase.
 * Además se ignora el archivo .env del proyecto para que sus credenciales reales
 * (SMTP, Ministerio, redes sociales) no se usen por accidente.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error('Falta TEST_DATABASE_URL. Ejecute las pruebas con "npm test": levanta una base de datos temporal.');
}
const destino = new URL(url);
const hostsLocales = ['localhost', '127.0.0.1', '::1', '[::1]', 'postgres'];
if (!hostsLocales.includes(destino.hostname) || !destino.pathname.toLowerCase().includes('test')) {
  throw new Error(
    `Por seguridad las pruebas solo corren contra una base de datos LOCAL cuyo nombre contenga "test" ` +
      `(recibida: ${destino.hostname}${destino.pathname}). Nunca contra Supabase.`
  );
}

const aqui = path.dirname(fileURLToPath(import.meta.url));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DOTENV_CONFIG_PATH: path.join(aqui, 'no-existe.env'),
  DATABASE_URL: url,
  DB_SSL: 'false',
  DB_SSL_CA: '',
  TLS_MIN_VERSION: 'TLSv1.2',
  DB_POOL_MAX: '10',
  JWT_SECRET: 'secreto-de-prueba-solo-para-tests-0123456789',
  JWT_EXPIRES_IN: '30m',
  BCRYPT_ROUNDS: '10',
  SUPABASE_URL: 'https://prueba.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-prueba',
  CORS_ORIGINS: 'http://front.test',
  LOGIN_RATE_LIMIT_MAX: '100000',
  HTTPS_CERT_PATH: '',
  HTTPS_KEY_PATH: '',
  TRUST_PROXY: 'false',
  SMTP_HOST: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  MINCOMERCIO_API_URL: '',
  MINCOMERCIO_API_KEY: '',
  REDES_API_URL: '',
  REDES_API_TOKEN: '',
  CRON_TENDENCIAS: '0 8 * * 1',
  CRON_REINTENTO_PRECIOS: '*/30 * * * *',
  CRON_DESCUENTO_FALLBACK: '0 2 * * *',
});
