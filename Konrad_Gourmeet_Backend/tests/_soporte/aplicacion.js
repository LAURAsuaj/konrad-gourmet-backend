/**
 * Arma la aplicación completa para una prueba: base de datos limpia, contenedor de
 * dependencias con servicios externos FALSOS (correo, Ministerio y redes sociales),
 * servidor HTTP en un puerto libre y utilidades para consultar y esperar eventos.
 * Cada archivo de prueba corre en su propio proceso, por eso se construye una vez por archivo.
 */
import './entorno.js';
import { reiniciarEsquema } from './baseDeDatos.js';
import { dormir, esperar } from './utiles.js';
import { ServicioExternoError } from '../../src/domain/services/ServicioExternoError.js';

export { dormir, esperar };

const PRECIOS = { Arroz: 4500, Pollo: 12000 };

/** Servicios externos falsos y controlables. */
export function crearServiciosFalsos() {
  const estado = { correos: [], correoFalla: 0, precios: 'ok', tendencias: 'ok', terminos: null };
  const servicios = {
    correo: {
      async enviarCorreo(correo) {
        if (estado.correoFalla > 0) {
          estado.correoFalla -= 1;
          throw new ServicioExternoError('correo', 'ENVIO', 'servidor de correo caído');
        }
        estado.correos.push(correo);
        return { messageId: `m-${estado.correos.length}`, aceptados: [correo.para], rechazados: [] };
      },
    },
    precios: {
      async consultarPrecios(productos) {
        if (estado.precios === 'caido') throw new ServicioExternoError('ministerio_comercio', 'HTTP', 'HTTP 503', { estado: 503 });
        return productos.map((p) =>
          estado.precios === 'sinPollo' && p.nombre === 'Pollo'
            ? { productoId: p.id, precioSugerido: null, motivo: 'SIN_PRECIO' }
            : { productoId: p.id, precioSugerido: PRECIOS[p.nombre] ?? 1000, motivo: null }
        );
      },
    },
    tendencias: {
      async obtenerTendencias() {
        if (estado.tendencias === 'caido') throw new ServicioExternoError('redes_sociales', 'TIMEOUT', 'sin respuesta');
        return estado.terminos ?? [
          { termino: 'Pollo asado', fuente: 'tiktok', puntaje: 90 },
          { termino: 'ceviche', fuente: 'instagram', puntaje: 80 },
          { termino: 'Brownie', fuente: 'instagram', puntaje: 70 },
        ];
      },
    },
  };
  return { estado, servicios };
}

/**
 * @param {{env?: Record<string,string>, outbox?: object, servicios?: object,
 *          iniciarEventos?: boolean, servidor?: boolean}} [opciones]
 *        `env` se aplica ANTES de cargar la aplicación (la configuración se lee una sola vez).
 */
export async function iniciarAplicacion({ env = {}, outbox = {}, servicios = {}, iniciarEventos = true, servidor: conServidor = true } = {}) {
  Object.assign(process.env, env);
  const bd = await reiniciarEsquema();
  const { construirContenedor } = await import('../../src/container.js');
  const { crearApp, crearServidor } = await import('../../src/app.js');

  const falsos = crearServiciosFalsos();
  const contenedor = construirContenedor({
    servicios: { ...falsos.servicios, ...servicios },
    outbox: { pollMs: 150, batchSize: 10, retryBaseSeconds: 1, maxAttempts: 5, leaseSeconds: 30, ...outbox },
  });
  if (iniciarEventos) contenedor.iniciarEventos();

  let servidor = null;
  let base = null;
  const app = conServidor ? crearApp(contenedor) : null;
  if (conServidor) {
    servidor = crearServidor(app);
    await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    base = `http://127.0.0.1:${servidor.address().port}/api/v1`;
  }

  const { facade } = contenedor;
  const q = (texto, parametros) => bd.query(texto, parametros).then((r) => r.rows);

  const http = async (metodo, ruta, { token, cuerpo, cabeceras } = {}) => {
    const respuesta = await fetch(base + ruta, {
      method: metodo,
      headers: { ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...cabeceras },
      body: cuerpo === undefined ? undefined : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
    });
    const texto = await respuesta.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* respuesta sin JSON */ }
    return { estado: respuesta.status, json, texto, cabeceras: respuesta.headers };
  };

  return {
    contenedor,
    facade,
    falsos: falsos.estado,
    app,
    servidor,
    base,
    bd,
    q,
    http,
    drenado: () => esperar(async () => (await q("SELECT 1 FROM outbox WHERE estado = 'PENDIENTE'")).length === 0),
    login: async (correo, password = 'Clave1234') => (await http('POST', '/auth/login', { cuerpo: { correo, password } })).json?.datos?.token,
    actorDe: async (correo, password = 'Clave1234') => facade.autenticarToken((await facade.iniciarSesion({ correo, password })).token),
    /** Apagado ordenado: detiene el publicador, el servidor y cierra las conexiones. */
    async detener() {
      if (servidor) await new Promise((resolver) => servidor.close(resolver));
      await contenedor.detener();
      await bd.end();
    },
  };
}
