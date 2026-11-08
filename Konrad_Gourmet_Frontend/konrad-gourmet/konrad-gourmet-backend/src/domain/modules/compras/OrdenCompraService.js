/**
 * Módulo Órdenes de compra (CU-13).
 * El Director de Compras elige la mejor cotización OPCIONADA de una solicitud y
 * el sistema genera la orden con los mismos datos de la cotización
 * (proveedor, alimentos, cantidades y valores) y un consecutivo.
 */
import { ROLES, exigirRol } from '../auth/roles.js';
import { ESTADOS_COTIZACION } from './estados.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion, traducirErrorPersistencia } from '../../errors/ErroresDeNegocio.js';
import { normalizarPaginacion } from '../../consulta.js';
import { exigirObjeto, exigirUuid } from '../../validacion.js';

export class OrdenCompraService {
  #db;
  #unidadDeTrabajo;
  #ordenes;
  #cotizaciones;

  constructor({ db, unidadDeTrabajo, ordenes, cotizaciones }) {
    this.#db = db;
    this.#unidadDeTrabajo = unidadDeTrabajo;
    this.#ordenes = ordenes;
    this.#cotizaciones = cotizaciones;
  }

  /** Cotizaciones OPCIONADAS de la solicitud para que el Director las compare. */
  async consultarOpcionadas(actor, solicitudId) {
    exigirRol(actor, [ROLES.DIRECTOR_COMPRAS]);
    const id = exigirUuid(solicitudId, 'La solicitud');
    const filas = await this.#cotizaciones.listar(
      { estado: ESTADOS_COTIZACION.OPCIONADA, solicitudId: id, limite: 100, offset: 0 },
      this.#db
    );
    if (filas.length === 0) {
      return { cotizaciones: [], mensaje: 'La solicitud no tiene cotizaciones OPCIONADAS; no es posible generar la orden de compra' };
    }
    const cotizaciones = await Promise.all(
      filas.map(async (f) => ({
        id: f.id,
        consecutivo: Number(f.consecutivo),
        proveedor: f.proveedor,
        valorTotal: Number(f.valor_total),
        plazoMaximo: f.plazo_maximo,
        alimentos: (await this.#cotizaciones.obtenerDetalle(f.id, this.#db)).length,
      }))
    );
    return { cotizaciones };
  }

  async generarOrden(actor, datos) {
    exigirRol(actor, [ROLES.DIRECTOR_COMPRAS]);
    exigirObjeto(datos, 'Los datos de la orden');
    if (!datos.cotizacionId) throw new ErrorValidacion('Debe seleccionar una cotización');
    const cotizacionId = exigirUuid(datos.cotizacionId, 'La cotización');

    let ordenId;
    try {
      ordenId = await this.#unidadDeTrabajo(async (tx) => {
        const cotizacion = await this.#cotizaciones.bloquear(cotizacionId, tx);
        if (!cotizacion) throw new ErrorNoEncontrado('La cotización no existe');

        const existente = await this.#ordenes.ordenDeCotizacion(cotizacionId, tx);
        if (existente) {
          throw new ErrorConflicto(`La cotización ya tiene la orden de compra N.º ${Number(existente.consecutivo)}`);
        }
        if (cotizacion.estado !== ESTADOS_COTIZACION.OPCIONADA) {
          throw new ErrorValidacion('Solo se puede generar la orden de una cotización OPCIONADA');
        }
        if (cotizacion.valor_total === null) {
          throw new ErrorValidacion('La cotización no tiene valor total registrado');
        }
        const proveedorId = await this.#ordenes.proveedorDeCotizacion(cotizacionId, tx);
        const orden = await this.#ordenes.insertar(
          {
            cotizacionId,
            solicitudId: cotizacion.solicitud_id,
            proveedorId,
            valorTotal: cotizacion.valor_total,
            generadaPor: actor.id,
          },
          tx
        );
        return orden.id;
      });
    } catch (error) {
      throw traducirErrorPersistencia(error, { unico: 'La cotización ya tiene una orden de compra' });
    }
    return this.#detalle(ordenId);
  }

  async obtenerOrden(actor, ordenId) {
    exigirRol(actor, [ROLES.DIRECTOR_COMPRAS, ROLES.AUXILIAR_COMPRAS]);
    return this.#detalle(exigirUuid(ordenId, 'La orden de compra'));
  }

  async listarOrdenes(actor, filtros = {}) {
    exigirRol(actor, [ROLES.DIRECTOR_COMPRAS, ROLES.AUXILIAR_COMPRAS]);
    const solicitudId = filtros.solicitudId === undefined ? undefined : exigirUuid(filtros.solicitudId, 'La solicitud');
    const filas = await this.#ordenes.listar({ solicitudId, ...normalizarPaginacion(filtros) }, this.#db);
    const total = filas.length > 0 ? Number(filas[0].total) : 0;
    return {
      total,
      ordenes: filas.map((f) => this.#cabecera(f)),
      ...(total === 0 ? { mensaje: 'No hay órdenes de compra que cumplan los filtros' } : {}),
    };
  }

  async #detalle(ordenId) {
    const orden = await this.#ordenes.obtener(ordenId, this.#db);
    if (!orden) throw new ErrorNoEncontrado('La orden de compra no existe');
    const items = await this.#ordenes.obtenerItems(orden.cotizacion_id, this.#db);
    return {
      ...this.#cabecera(orden),
      alimentos: items.map((i) => ({
        producto: i.producto,
        marca: i.marca,
        cantidad: Number(i.cantidad),
        unidad: i.unidad,
        valorUnitario: Number(i.valor_unitario),
        subtotal: Number(i.subtotal),
      })),
    };
  }

  #cabecera(f) {
    return {
      id: f.id,
      consecutivo: Number(f.consecutivo),
      proveedor: f.proveedor,
      valorTotal: Number(f.valor_total),
      solicitudId: f.solicitud_id,
      solicitudConsecutivo: Number(f.solicitud_consecutivo),
      cotizacionId: f.cotizacion_id,
      cotizacionConsecutivo: Number(f.cotizacion_consecutivo),
      generadaPor: f.generada_por,
      generadaEn: f.generada_en,
    };
  }
}
