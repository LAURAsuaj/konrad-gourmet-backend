/**
 * Manejador de eventos: ManejadorEstadoSolicitud (CU-09, SAD 5.2.4).
 *
 * Ante SolicitudCotizacionEnviada pasa la solicitud de PENDIENTE a EN TRÁMITE
 * cuando TODOS sus alimentos ya tienen cotización. Es idempotente: la
 * actualización solo afecta solicitudes PENDIENTE completamente cotizadas.
 */
import { TIPOS_EVENTO } from '../BusDeEventos.js';
import { ESTADOS_SOLICITUD } from '../../modules/compras/estados.js';

export const NOMBRE_MANEJADOR_ESTADO_SOLICITUD = 'ManejadorEstadoSolicitud';

export class ManejadorEstadoSolicitud {
  #unidadDeTrabajo;
  #solicitudes;
  #auditoria;

  /** @param {{unidadDeTrabajo, solicitudes: SolicitudRepository, auditoria: AuditoriaService}} dependencias */
  constructor({ unidadDeTrabajo, solicitudes, auditoria }) {
    this.#unidadDeTrabajo = unidadDeTrabajo;
    this.#solicitudes = solicitudes;
    this.#auditoria = auditoria;
  }

  registrar(bus) {
    bus.suscribir(TIPOS_EVENTO.SOLICITUD_COTIZACION_ENVIADA, NOMBRE_MANEJADOR_ESTADO_SOLICITUD, (evento) => this.manejar(evento));
  }

  async manejar(evento) {
    const solicitudId = evento.payload?.solicitudId;
    await this.#unidadDeTrabajo(async (tx) => {
      const cambiada = await this.#solicitudes.pasarAEnTramiteSiCotizada(solicitudId, tx);
      if (cambiada > 0) {
        await this.#auditoria.registrar(
          {
            accion: 'UPDATE',
            entidad: 'solicitud_alimentos',
            entidadId: solicitudId,
            detalle: { origen: 'SolicitudCotizacionEnviada', estado: ESTADOS_SOLICITUD.EN_TRAMITE },
          },
          tx
        );
      }
    });
  }
}
