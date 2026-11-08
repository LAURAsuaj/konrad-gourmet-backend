/**
 * Notificaciones del propio usuario (CU-05, CU-07, CU-15: "informar al usuario").
 * Cada usuario ve únicamente las que se le enviaron a él: confirmaciones de solicitud, alarmas de
 * stock y promociones. No contienen montos de cotizaciones ni de órdenes de compra.
 */
import { ROLES, exigirRol } from '../auth/roles.js';
import { ErrorValidacion } from '../../errors/ErroresDeNegocio.js';
import { exigirRangoFechas, normalizarPaginacion } from '../../consulta.js';

const TIPOS = Object.freeze(['CONFIRMACION_SOLICITUD', 'ALARMA_STOCK', 'PROMOCION']);

export class NotificacionService {
  #db;
  #notificaciones;

  constructor({ db, notificaciones }) {
    this.#db = db;
    this.#notificaciones = notificaciones;
  }

  /** @param {{tipo?: string, desde?: string, hasta?: string, limite?: number, offset?: number}} [filtros] */
  async listarPropias(actor, filtros = {}) {
    exigirRol(actor, Object.values(ROLES));
    if (filtros.tipo !== undefined && !TIPOS.includes(filtros.tipo)) {
      throw new ErrorValidacion(`El tipo debe ser uno de: ${TIPOS.join(', ')}`);
    }
    const { desde, hasta } = exigirRangoFechas(filtros.desde, filtros.hasta);
    const filas = await this.#notificaciones.listarPorUsuario(
      { usuarioId: actor.id, tipo: filtros.tipo, desde, hasta, ...normalizarPaginacion(filtros) },
      this.#db
    );
    const total = filas.length > 0 ? Number(filas[0].total) : 0;
    return {
      total,
      notificaciones: filas.map((f) => ({
        id: f.id,
        tipo: f.tipo,
        asunto: f.asunto,
        mensaje: f.cuerpo,
        estado: f.estado,
        creadaEn: f.creada_en,
        enviadaEn: f.enviada_en,
      })),
      ...(total === 0 ? { mensaje: 'No tiene notificaciones que cumplan los filtros indicados' } : {}),
    };
  }
}
