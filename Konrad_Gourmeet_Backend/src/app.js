/**
 * Inicialización de la API (Express). Arma la aplicación con la seguridad HTTP,
 * el controlador y el manejo de errores; levanta el servidor (HTTPS con TLS 1.3
 * si se configuraron certificado y llave) e inicia el publicador del Outbox.
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { env } from './config/env.js';
import { construirContenedor } from './container.js';
import { crearAuthMiddleware } from './facade/middlewares/authMiddleware.js';
import { crearRbacMiddleware } from './facade/middlewares/rbacMiddleware.js';
import { crearApiController } from './presentation/controllers/apiController.js';
import { configurarSeguridadHttp, manejadorErrores, rutaNoEncontrada } from './presentation/middlewares/httpSecurity.js';

export function crearApp(contenedor, opcionesSeguridad = {}) {
  const { facade, registrador } = contenedor;
  const app = express();

  configurarSeguridadHttp(app, opcionesSeguridad);
  app.use(express.json({ limit: '100kb' }));

  app.get('/salud', async (req, res, next) => {
    try {
      res.json({ datos: await facade.verificarSalud() });
    } catch (error) {
      next(error);
    }
  });

  const authMiddleware = crearAuthMiddleware(facade);
  const rbac = crearRbacMiddleware(facade);
  app.use('/api/v1', crearApiController({ facade, authMiddleware, rbac }));

  app.use(rutaNoEncontrada);
  app.use(manejadorErrores(registrador));
  return app;
}

/**
 * En producción la API debe servir TLS 1.3 por sí misma (certificado y llave) o
 * estar detrás de un proxy que lo termine (TRUST_PROXY=true) (CO-6). Se valida
 * aquí y no en env.js porque solo el proceso de la API sirve HTTP; el contenedor
 * cron comparte env.js y no debe exigirlo.
 */
export function validarConfiguracionTls({
  esProduccion = env.esProduccion,
  certPath = env.server.tlsCertPath,
  trustProxy = env.server.trustProxy,
} = {}) {
  if (esProduccion && !certPath && !trustProxy) {
    throw new Error(
      'En producción configure HTTPS_CERT_PATH/HTTPS_KEY_PATH, o TRUST_PROXY=true detrás de un proxy que termine TLS 1.3 (CO-6)'
    );
  }
}

/** HTTPS con TLS 1.3 como mínimo si hay certificado y llave; HTTP simple si no (detrás de un proxy TLS). */
export function crearServidor(
  app,
  { certPath = env.server.tlsCertPath, keyPath = env.server.tlsKeyPath, minVersion = env.tls.minVersion } = {}
) {
  const servidor =
    certPath && keyPath
      ? https.createServer({ cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath), minVersion }, app)
      : http.createServer(app);
  servidor.headersTimeout = 20_000;
  servidor.requestTimeout = 30_000;
  return servidor;
}

async function iniciar() {
  validarConfiguracionTls();
  const contenedor = construirContenedor();
  const servidor = crearServidor(crearApp(contenedor));

  contenedor.iniciarEventos();
  servidor.listen(env.port, () => {
    console.log(`[api] Konrad Gourmet escuchando en el puerto ${env.port} (${env.nodeEnv})`);
  });

  let cerrando = false;
  const apagar = async (senal) => {
    if (cerrando) return;
    cerrando = true;
    console.log(`[api] ${senal} recibida: apagado ordenado`);
    const forzar = setTimeout(() => process.exit(1), 10_000);
    forzar.unref();
    servidor.close();
    await contenedor.detener();
    process.exit(0);
  };
  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));
  process.on('unhandledRejection', (motivo) => {
    contenedor.registrador.error({ modulo: 'api', mensaje: 'Promesa rechazada sin manejar', error: motivo instanceof Error ? motivo : new Error(String(motivo)) });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  iniciar().catch((error) => {
    console.error('[api] No se pudo iniciar:', error);
    process.exit(1);
  });
}
