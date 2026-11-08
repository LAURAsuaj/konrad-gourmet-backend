/**
 * Manejador de eventos: ManejadorValidacionCotizaciones (CU-12, SAD 5.2.4).
 *
 * Reacciona a CotizacionRegistrada y a PrecioSugeridoActualizado: compara el
 * valor cotizado con el sugerido por el Ministerio, aplica los rangos
 * parametrizados y clasifica la cotización como RECHAZADA, SOSPECHOSA u
 * OPCIONADA, dejando el resultado en la auditoría (misma transacción).
 *
 * La comparación usa el valor sugerido de los alimentos que cubre la
 * cotización, que coincide con el total de la solicitud cuando los cubre todos.
 * Es idempotente: una cotización ya clasificada se omite.
 */
import { TIPOS_EVENTO } from '../BusDeEventos.js';
import { ESTADOS_COTIZACION } from '../../modules/compras/estados.js';
import { clasificarCotizacion, rangosValidos } from '../../modules/compras/ValidadorCotizacion.js';
import { ErrorValidacion } from '../../errors/ErroresDeNegocio.js';

export const NOMBRE_MANEJADOR_VALIDACION = 'ManejadorValidacionCotizaciones';

export class ManejadorValidacionCotizaciones {
  #db;
  #unidadDeTrabajo;
  #cotizaciones;
  #parametros;
  #auditoria;
  #registrador;

  /**
   * @param {{db, unidadDeTrabajo, cotizaciones: CotizacionRepository, parametros: ParametroRepository,
   *          auditoria: AuditoriaService, registrador: {error: Function, advertencia: Function}}} dependencias
   */
  constructor({ db, unidadDeTrabajo, cotizaciones, parametros, auditoria, registrador }) {
    this.#db = db;
    this.#unidadDeTrabajo = unidadDeTrabajo;
    this.#cotizaciones = cotizaciones;
    this.#parametros = parametros;
    this.#auditoria = auditoria;
    this.#registrador = registrador;
  }

  registrar(bus) {
    bus.suscribir(TIPOS_EVENTO.COTIZACION_REGISTRADA, NOMBRE_MANEJADOR_VALIDACION, (e) => this.manejarCotizacionRegistrada(e));
    bus.suscribir(TIPOS_EVENTO.PRECIO_SUGERIDO_ACTUALIZADO, NOMBRE_MANEJADOR_VALIDACION, (e) => this.manejarPrecioActualizado(e));
  }

  async manejarCotizacionRegistrada(evento) {
    await this.validar(evento.payload?.cotizacionId);
  }

  /** Al llegar el valor sugerido, valida las cotizaciones de la solicitud que esperaban por él. */
  async manejarPrecioActualizado(evento) {
    const ids = await this.#cotizaciones.pendientesDeValidacionPorSolicitud(evento.payload?.solicitudId, this.#db);
    const fallos = [];
    for (const id of ids) {
      try {
        await this.validar(id);
      } catch (error) {
        fallos.push(id);
        await this.#registrador.error({ modulo: 'validacion_cotizaciones', mensaje: 'Falló la validación de una cotización', detalle: { cotizacionId: id }, error });
      }
    }
    if (fallos.length > 0) throw new Error(`Falló la validación de ${fallos.length} cotización(es); se reintentará el evento`);
  }

  /** @returns {Promise<{estado: string, clasificacion?: string, razon?: number}>} */
  async validar(cotizacionId) {
    let resultado;
    try {
      resultado = await this.#unidadDeTrabajo(async (tx) => {
        const cotizacion = await this.#cotizaciones.bloquear(cotizacionId, tx);
        if (!cotizacion) return { estado: 'NO_EXISTE' };
        if (cotizacion.estado !== ESTADOS_COTIZACION.ENVIADA || !cotizacion.valores_registrados_en) {
          return { estado: 'OMITIDA' };
        }

        const totales = await this.#cotizaciones.obtenerTotalesParaValidacion(cotizacionId, tx);
        if (!totales || totales.sugerido_total === null || Number(totales.sin_precio) > 0) {
          return { estado: 'SIN_VALOR_SUGERIDO' }; // CU-12 EXCEP-1: queda pendiente
        }

        const rangos = await this.#parametros.obtener('rangos_validacion_cotizacion', tx, null);
        if (!rangosValidos(rangos)) return { estado: 'SIN_RANGOS' }; // CU-12 EXCEP-2

        const { estado, razon } = clasificarCotizacion({
          valorCotizado: totales.cotizado_total,
          valorSugerido: totales.sugerido_total,
          rangos,
        });
        await this.#cotizaciones.actualizarEstado(cotizacionId, estado, tx);
        await this.#auditoria.registrar(
          {
            accion: 'UPDATE',
            entidad: 'cotizacion',
            entidadId: cotizacionId,
            // SRS 6.5: sin montos ni razón de precio; el Administrador que lee la auditoría
            // no pertenece al área de compras. El resultado basta para el seguimiento.
            detalle: { origen: 'validacion_automatica', resultado: estado },
          },
          tx
        );
        return { estado: 'CLASIFICADA', clasificacion: estado, razon };
      });
    } catch (error) {
      if (error instanceof ErrorValidacion) {
        // CU-12 EXCEP-3: valores no numéricos; no se procesa y no tiene sentido reintentar
        await this.#registrador.error({ modulo: 'validacion_cotizaciones', mensaje: error.message, detalle: { cotizacionId }, error });
        return { estado: 'DATOS_INVALIDOS' };
      }
      throw error;
    }

    if (resultado.estado === 'SIN_VALOR_SUGERIDO') {
      await this.#registrador.advertencia({
        modulo: 'validacion_cotizaciones',
        mensaje: 'La cotización queda pendiente de validación: la solicitud no tiene valor sugerido completo',
        detalle: { cotizacionId },
      });
    } else if (resultado.estado === 'SIN_RANGOS') {
      await this.#registrador.error({
        modulo: 'validacion_cotizaciones',
        mensaje: 'Los rangos de validación no están parametrizados o son inválidos; no se clasificó la cotización',
        detalle: { cotizacionId },
      });
    }
    return resultado;
  }
}
