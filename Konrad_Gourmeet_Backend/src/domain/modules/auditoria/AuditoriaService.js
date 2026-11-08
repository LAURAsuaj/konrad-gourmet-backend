/**
 * Módulo Auditoría y Logs (CU-16).
 *
 * - registrar(): lo invoca SistemaFacade de forma síncrona tras cada acción CRUD
 *   (usuario, acción, entidad y fecha) y los manejadores de eventos para dejar
 *   constancia de resultados automáticos. Los registros no se pueden modificar
 *   ni eliminar (triggers en la base de datos).
 * - Las consultas son exclusivas del Administrador.
 */
import { ROLES, exigirRol } from '../auth/roles.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../../errors/ErroresDeNegocio.js';
import { exigirRangoFechas, normalizarPaginacion } from '../../consulta.js';
import { exigirObjeto, exigirTexto, exigirUuid } from '../../validacion.js';

export const ACCIONES_AUDITORIA = Object.freeze([
  'CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN_OK', 'LOGIN_FALLIDO', 'ACCESO_DENEGADO', 'EJECUCION',
]);
const NIVELES_LOG = ['ERROR', 'WARN', 'INFO'];

export class AuditoriaService {
  #db;
  #auditoria;

  constructor({ db, auditoria }) {
    this.#db = db;
    this.#auditoria = auditoria;
  }

  /**
   * @param {{usuarioId?: string|null, correo?: string|null, accion: string, entidad: string,
   *          entidadId?: string|null, detalle?: object}} entrada
   * @param {object} [db] pool o cliente de una transacción (para auditar atómicamente)
   */
  async registrar(entrada, db = this.#db) {
    exigirObjeto(entrada, 'El registro de auditoría');
    if (!ACCIONES_AUDITORIA.includes(entrada.accion)) {
      throw new ErrorValidacion(`La acción de auditoría "${entrada.accion}" no es válida`);
    }
    const entidad = exigirTexto(entrada.entidad, 'La entidad auditada', { max: 80 });
    return this.#auditoria.insertar(
      {
        usuarioId: entrada.usuarioId ?? null,
        correo: entrada.correo ?? null,
        accion: entrada.accion,
        entidad,
        entidadId: entrada.entidadId === undefined || entrada.entidadId === null ? null : String(entrada.entidadId),
        detalle: entrada.detalle ?? {},
      },
      db
    );
  }

  async consultarAuditoria(actor, filtros = {}) {
    exigirRol(actor, [ROLES.ADMINISTRADOR]);
    const { desde, hasta } = exigirRangoFechas(filtros.desde, filtros.hasta);
    if (filtros.accion !== undefined && !ACCIONES_AUDITORIA.includes(filtros.accion)) {
      throw new ErrorValidacion('La acción indicada no es válida');
    }
    const paginacion = normalizarPaginacion(filtros);
    const filas = await this.#auditoria.listar(
      {
        usuarioId: filtros.usuarioId === undefined ? undefined : exigirUuid(filtros.usuarioId, 'El usuario'),
        accion: filtros.accion,
        entidad: filtros.entidad === undefined ? undefined : exigirTexto(filtros.entidad, 'La entidad', { max: 80 }),
        desde,
        hasta,
        ...paginacion,
      },
      this.#db
    );
    return this.#resultado(filas, (f) => ({
      id: f.id,
      usuarioId: f.usuario_id,
      correo: f.correo,
      accion: f.accion,
      entidad: f.entidad,
      entidadId: f.entidad_id,
      fecha: f.fecha,
    }));
  }

  async detalleAuditoria(actor, id) {
    exigirRol(actor, [ROLES.ADMINISTRADOR]);
    const fila = await this.#auditoria.obtener(this.#exigirIdNumerico(id), this.#db);
    if (!fila) throw new ErrorNoEncontrado('El registro de auditoría no existe');
    return {
      id: fila.id,
      usuarioId: fila.usuario_id,
      correo: fila.correo,
      accion: fila.accion,
      entidad: fila.entidad,
      entidadId: fila.entidad_id,
      detalle: fila.detalle,
      fecha: fila.fecha,
    };
  }

  async consultarLogs(actor, filtros = {}) {
    exigirRol(actor, [ROLES.ADMINISTRADOR]);
    const { desde, hasta } = exigirRangoFechas(filtros.desde, filtros.hasta);
    if (filtros.nivel !== undefined && !NIVELES_LOG.includes(filtros.nivel)) {
      throw new ErrorValidacion('El nivel indicado no es válido');
    }
    const filas = await this.#auditoria.listarLogs(
      {
        nivel: filtros.nivel,
        modulo: filtros.modulo === undefined ? undefined : exigirTexto(filtros.modulo, 'El módulo', { max: 80 }),
        desde,
        hasta,
        ...normalizarPaginacion(filtros),
      },
      this.#db
    );
    return this.#resultado(filas, (f) => ({
      id: f.id,
      nivel: f.nivel,
      modulo: f.modulo,
      mensaje: f.mensaje,
      fecha: f.fecha,
    }));
  }

  async detalleLog(actor, id) {
    exigirRol(actor, [ROLES.ADMINISTRADOR]);
    const fila = await this.#auditoria.obtenerLog(this.#exigirIdNumerico(id), this.#db);
    if (!fila) throw new ErrorNoEncontrado('El registro del log no existe');
    return { id: fila.id, nivel: fila.nivel, modulo: fila.modulo, mensaje: fila.mensaje, detalle: fila.detalle, fecha: fila.fecha };
  }

  #resultado(filas, presentar) {
    const total = filas.length > 0 ? Number(filas[0].total) : 0;
    return {
      total,
      registros: filas.map(presentar),
      ...(total === 0 ? { mensaje: 'Ningún registro cumple los filtros indicados' } : {}),
    };
  }

  #exigirIdNumerico(id) {
    if (!/^\d{1,18}$/.test(String(id))) throw new ErrorValidacion('El identificador del registro no es válido');
    return String(id);
  }
}
