/**
 * Manejador de eventos: ManejadorPrecioSugerido (CU-10, SAD 5.2.4).
 *
 * Ante SolicitudRegistrada consulta el precio sugerido de cada producto con
 * IPrecioSugeridoService (Adapter del Ministerio de Comercio), guarda el precio
 * unitario en cada alimento y, cuando TODOS tienen precio, actualiza el valor
 * total sugerido de la solicitud y publica PrecioSugeridoActualizado (misma
 * transacción). También expone actualizarPrecios() y reintentarPendientes()
 * para SistemaFacade.consultarPrecioSugerido() y el proceso de reintento.
 *
 * Resiliencia: los precios obtenidos se guardan aunque otros productos fallen,
 * de modo que cada reintento consulta solo lo que falta. Cada consulta queda
 * registrada en el log.
 */
import { TIPOS_EVENTO } from '../BusDeEventos.js';
import { MOTIVOS_SIN_PRECIO } from '../../services/IPrecioSugeridoService.js';

export const NOMBRE_MANEJADOR_PRECIO_SUGERIDO = 'ManejadorPrecioSugerido';
const TOPE_ERRORES_EN_LOG = 50;

export class ManejadorPrecioSugerido {
  #db;
  #unidadDeTrabajo;
  #solicitudes;
  #precios;
  #registrarEvento;
  #registrador;

  /**
   * @param {{db, unidadDeTrabajo, solicitudes: SolicitudRepository, precios: IPrecioSugeridoService,
   *          registrarEvento: Function, registrador: {error: Function, ejecucion: Function}}} dependencias
   */
  constructor({ db, unidadDeTrabajo, solicitudes, precios, registrarEvento, registrador }) {
    this.#db = db;
    this.#unidadDeTrabajo = unidadDeTrabajo;
    this.#solicitudes = solicitudes;
    this.#precios = precios;
    this.#registrarEvento = registrarEvento;
    this.#registrador = registrador;
  }

  registrar(bus) {
    bus.suscribir(TIPOS_EVENTO.SOLICITUD_REGISTRADA, NOMBRE_MANEJADOR_PRECIO_SUGERIDO, (evento) => this.manejar(evento));
  }

  /** Si quedó algo por consultar por una falla temporal, falla para que el Outbox reintente. */
  async manejar(evento) {
    const resultado = await this.actualizarPrecios(evento.payload?.solicitudId);
    if (resultado.reintentar) {
      throw new Error(`El precio sugerido de la solicitud ${evento.payload?.solicitudId} quedó incompleto; se reintentará`);
    }
  }

  /**
   * @returns {Promise<{estado: 'NO_EXISTE'|'ACTUALIZADA'|'INCOMPLETA'|'ERROR', valorTotal?: number,
   *                    faltantes?: number, reintentar: boolean, servicioCaido: boolean}>}
   */
  async actualizarPrecios(solicitudId) {
    const items = await this.#solicitudes.obtenerItemsParaPrecio(solicitudId, this.#db);
    if (items.length === 0) return { estado: 'NO_EXISTE', reintentar: false, servicioCaido: false };

    const sinPrecio = items.filter((i) => i.precio === null);
    let resultados = [];
    let reintentar = false;

    if (sinPrecio.length > 0) {
      const productos = [...new Map(sinPrecio.map((i) => [i.producto_id, { id: i.producto_id, nombre: i.producto, unidad: i.unidad }])).values()];
      try {
        resultados = await this.#precios.consultarPrecios(productos);
      } catch (error) {
        await this.#registrador.error({
          modulo: 'precio_sugerido',
          mensaje: 'No se pudo consultar el precio sugerido al Ministerio de Comercio',
          detalle: { solicitudId, productos: productos.length, codigo: error.codigo },
          error,
        });
        return { estado: 'ERROR', reintentar: error.reintentable === true, servicioCaido: true };
      }

      const porProducto = new Map(resultados.map((r) => [r.productoId, r]));
      const faltantes = [];
      const preciosItems = [];
      for (const item of sinPrecio) {
        const resultado = porProducto.get(item.producto_id);
        if (resultado?.precioSugerido) preciosItems.push({ detalleId: item.id, precio: resultado.precioSugerido });
        else faltantes.push({ producto: item.producto, motivo: resultado?.motivo ?? MOTIVOS_SIN_PRECIO.SIN_PRECIO });
      }

      await this.#registrador.ejecucion({
        modulo: 'precio_sugerido',
        mensaje: 'Consulta al servicio del Ministerio de Comercio',
        detalle: { solicitudId, productosConsultados: productos.length, alimentosConPrecio: preciosItems.length, alimentosSinPrecio: faltantes.length },
      });
      for (const faltante of faltantes.slice(0, TOPE_ERRORES_EN_LOG)) {
        await this.#registrador.error({
          modulo: 'precio_sugerido',
          mensaje: `El Ministerio no entregó un precio utilizable para ${faltante.producto} (${faltante.motivo})`,
          detalle: { solicitudId, ...faltante },
        });
      }
      reintentar = faltantes.some((f) => f.motivo === MOTIVOS_SIN_PRECIO.SERVICIO_NO_DISPONIBLE);

      const total = await this.#guardar(solicitudId, preciosItems);
      return { ...total, reintentar, servicioCaido: false };
    }

    const total = await this.#guardar(solicitudId, []);
    return { ...total, reintentar: false, servicioCaido: false };
  }

  /**
   * Reintenta las solicitudes que aún no tienen valor total sugerido (proceso programado).
   * Se detiene si el servicio no responde, para no insistir inútilmente.
   */
  async reintentarPendientes({ limite = 20 } = {}) {
    const ids = await this.#solicitudes.listarPendientesDePrecio(limite, this.#db);
    let actualizadas = 0;
    let intentadas = 0;
    for (const id of ids) {
      intentadas += 1;
      try {
        const resultado = await this.actualizarPrecios(id);
        if (resultado.estado === 'ACTUALIZADA') actualizadas += 1;
        if (resultado.servicioCaido) break;
      } catch (error) {
        await this.#registrador.error({
          modulo: 'precio_sugerido',
          mensaje: 'Falló el reintento de la consulta de precio sugerido de una solicitud',
          detalle: { solicitudId: id },
          error,
        });
      }
    }
    return { pendientes: ids.length, intentadas, actualizadas };
  }

  /** Guarda los precios obtenidos y, si ya están todos, el total y el evento (una sola transacción). */
  async #guardar(solicitudId, preciosItems) {
    return this.#unidadDeTrabajo(async (tx) => {
      await this.#solicitudes.actualizarPreciosItems(preciosItems, tx);
      const { total, faltantes } = await this.#solicitudes.calcularTotalSugerido(solicitudId, tx);
      if (faltantes > 0 || total === null) return { estado: 'INCOMPLETA', faltantes };

      await this.#solicitudes.actualizarTotalSugerido(solicitudId, total, tx);
      await this.#registrarEvento(
        tx,
        TIPOS_EVENTO.PRECIO_SUGERIDO_ACTUALIZADO,
        { solicitudId, valorTotalSugerido: Number(total) },
        { claveDeduplicacion: `precio:${solicitudId}:${total}` }
      );
      return { estado: 'ACTUALIZADA', valorTotal: Number(total), faltantes: 0 };
    });
  }
}
