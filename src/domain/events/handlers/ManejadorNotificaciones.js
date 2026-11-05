/**
 * Manejador de eventos: ManejadorNotificaciones (CU-05, CU-07, CU-15).
 *
 * Usa el patrón Factory Method para crear cada notificación y el servicio de
 * correo (Adapter) para enviarla. Atiende:
 *   - SolicitudRegistrada  -> confirmación al Jefe de Cocina solicitante.
 *   - StockBajoDetectado   -> alarma a los Jefes de Cocina del punto afectado.
 *   - PromocionGenerada    -> promoción a los Jefes de Cocina.
 *
 * Resiliencia: la notificación queda guardada con su estado (CREADA, ENVIADA,
 * FALLIDA). Si el correo falla por una causa temporal el error se registra en
 * el log y el manejador lanza una excepción para que el Outbox reintente el
 * evento; en el reintento solo se reenvían las notificaciones no enviadas.
 */
import { TIPOS_EVENTO } from '../BusDeEventos.js';
import { ESTADOS_NOTIFICACION } from '../../factories/Notificacion.js';
import { ConfirmacionSolicitudCreator } from '../../factories/creators/ConfirmacionSolicitudCreator.js';
import { AlarmaStockCreator } from '../../factories/creators/AlarmaStockCreator.js';
import { PromocionCreator } from '../../factories/creators/PromocionCreator.js';

export const NOMBRE_MANEJADOR_NOTIFICACIONES = 'ManejadorNotificaciones';

export class ManejadorNotificaciones {
  #db;
  #notificaciones;
  #correo;
  #registrador;
  #creadores;

  /**
   * @param {{db, notificaciones: NotificacionRepository, correo: ICorreoService,
   *          registrador: {error: Function, advertencia: Function},
   *          creadores?: {confirmacion?: NotificacionFactory, alarma?: NotificacionFactory, promocion?: NotificacionFactory}}} dependencias
   */
  constructor({ db, notificaciones, correo, registrador, creadores = {} }) {
    this.#db = db;
    this.#notificaciones = notificaciones;
    this.#correo = correo;
    this.#registrador = registrador;
    this.#creadores = {
      confirmacion: creadores.confirmacion ?? new ConfirmacionSolicitudCreator(),
      alarma: creadores.alarma ?? new AlarmaStockCreator(),
      promocion: creadores.promocion ?? new PromocionCreator(),
    };
  }

  registrar(bus) {
    bus.suscribir(TIPOS_EVENTO.SOLICITUD_REGISTRADA, NOMBRE_MANEJADOR_NOTIFICACIONES, (e) => this.manejarSolicitudRegistrada(e));
    bus.suscribir(TIPOS_EVENTO.STOCK_BAJO_DETECTADO, NOMBRE_MANEJADOR_NOTIFICACIONES, (e) => this.manejarStockBajo(e));
    bus.suscribir(TIPOS_EVENTO.PROMOCION_GENERADA, NOMBRE_MANEJADOR_NOTIFICACIONES, (e) => this.manejarPromocion(e));
  }

  async manejarSolicitudRegistrada(evento) {
    const datos = await this.#notificaciones.obtenerDatosConfirmacion(evento.payload?.solicitudId, this.#db);
    if (!datos) {
      throw new Error(`La solicitud ${evento.payload?.solicitudId} del evento ${evento.id} no existe`);
    }
    const notificacion = this.#creadores.confirmacion.crear(datos);
    const resultado = await this.#entregar(notificacion, evento);
    this.#reintentarSiHuboFallosTemporales([resultado], 'de confirmación');
  }

  async manejarStockBajo(evento) {
    const contexto = await this.#notificaciones.obtenerContextoAlarma(evento.payload?.alarmaId, this.#db);
    if (!contexto) {
      throw new Error(`La alarma ${evento.payload?.alarmaId} del evento ${evento.id} no existe`);
    }
    const jefes = await this.#notificaciones.obtenerJefesCocina({ puntoId: contexto.punto_id }, this.#db);
    if (jefes.length === 0) {
      await this.#registrador.advertencia({
        modulo: 'notificaciones',
        mensaje: `La alarma de ${contexto.producto} en ${contexto.punto} no tiene un Jefe de Cocina a quien notificar`,
        detalle: { eventoId: evento.id, alarmaId: contexto.id },
      });
      return;
    }

    const resultados = [];
    for (const jefe of jefes) {
      const notificacion = this.#creadores.alarma.crear({
        producto: { id: contexto.producto_id, nombre: contexto.producto, unidad: contexto.unidad },
        cantidadActual: Number(contexto.cantidad_al_generar),
        cantidadReferencia: Number(contexto.cantidad_referencia),
        punto: { id: contexto.punto_id, nombre: contexto.punto },
        destinatario: jefe,
        alarmaId: contexto.id,
        fecha: contexto.generada_en,
      });
      resultados.push(await this.#entregar(notificacion, evento));
    }
    this.#reintentarSiHuboFallosTemporales(resultados, 'de alarma de stock');
  }

  async manejarPromocion(evento) {
    const promocion = await this.#notificaciones.obtenerPromocion(evento.payload?.promocionId, this.#db);
    if (!promocion) {
      throw new Error(`La promoción ${evento.payload?.promocionId} del evento ${evento.id} no existe`);
    }
    const jefes = await this.#notificaciones.obtenerJefesCocina({}, this.#db);
    const resultados = [];
    for (const jefe of jefes) {
      const notificacion = this.#creadores.promocion.crear({
        promocion: {
          id: promocion.id,
          titulo: promocion.titulo,
          descripcion: promocion.descripcion,
          origen: promocion.origen,
          producto: promocion.producto,
        },
        destinatario: jefe,
      });
      resultados.push(await this.#entregar(notificacion, evento));
    }
    this.#reintentarSiHuboFallosTemporales(resultados, 'de promoción');
  }

  /** Guarda la notificación (una sola vez por evento y destinatario) y la envía por correo. */
  async #entregar(notificacion, evento) {
    const existente = await this.#notificaciones.buscarPorEvento(
      { tipo: notificacion.tipo, eventoId: evento.id, usuarioId: notificacion.destinatario.usuarioId },
      this.#db
    );
    if (existente?.estado === ESTADOS_NOTIFICACION.ENVIADA) return { estado: 'YA_ENVIADA' };
    const id = existente?.id ?? (await this.#notificaciones.guardar(notificacion, evento.id, this.#db));

    if (!notificacion.tieneCorreo()) {
      await this.#notificaciones.actualizarEstado(id, ESTADOS_NOTIFICACION.FALLIDA, this.#db);
      await this.#registrador.advertencia({
        modulo: 'notificaciones',
        mensaje: `El destinatario de la notificación ${notificacion.tipo} no tiene correo registrado`,
        detalle: { eventoId: evento.id, usuarioId: notificacion.destinatario.usuarioId ?? null },
      });
      return { estado: 'SIN_CORREO' };
    }

    try {
      await this.#correo.enviarCorreo(notificacion.aCorreo());
      await this.#notificaciones.actualizarEstado(id, ESTADOS_NOTIFICACION.ENVIADA, this.#db);
      return { estado: ESTADOS_NOTIFICACION.ENVIADA };
    } catch (error) {
      if (error?.name !== 'ServicioExternoError') throw error;
      await this.#notificaciones.actualizarEstado(id, ESTADOS_NOTIFICACION.FALLIDA, this.#db);
      await this.#registrador.error({
        modulo: 'notificaciones',
        mensaje: `No se pudo enviar la notificación ${notificacion.tipo}`,
        detalle: { eventoId: evento.id, usuarioId: notificacion.destinatario.usuarioId ?? null, codigo: error.codigo },
        error,
      });
      return { estado: ESTADOS_NOTIFICACION.FALLIDA, error };
    }
  }

  #reintentarSiHuboFallosTemporales(resultados, descripcion) {
    const temporales = resultados.filter((r) => r.estado === ESTADOS_NOTIFICACION.FALLIDA && r.error?.reintentable);
    if (temporales.length > 0) {
      throw new Error(`No se enviaron ${temporales.length} notificación(es) ${descripcion}; se reintentará el evento`);
    }
  }
}
