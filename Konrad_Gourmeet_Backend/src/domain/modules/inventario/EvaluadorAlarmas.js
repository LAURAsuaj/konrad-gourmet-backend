/**
 * Regla de negocio de la alarma de stock bajo (CU-07), compartida por
 * ManejadorAlarmas (tras el descuento diario) e InventarioService (tras un
 * ajuste manual). Debe invocarse con el cliente de una transacción: la alarma
 * y el evento StockBajoDetectado se guardan juntos (patrón Outbox).
 */
import { TIPOS_EVENTO } from '../../events/BusDeEventos.js';

const TOLERANCIA = 1e-9;

export class EvaluadorAlarmas {
  #alarmas;
  #registrarEvento;

  /**
   * @param {{alarmas: AlarmaRepository, registrarEvento: Function}} dependencias
   *        registrarEvento(client, tipo, payload, opciones) - ver EventOutboxPublisher
   */
  constructor({ alarmas, registrarEvento }) {
    this.#alarmas = alarmas;
    this.#registrarEvento = registrarEvento;
  }

  /**
   * @param {object} tx cliente de la transacción
   * @param {object} nivel fila de AlarmaRepository.obtenerNiveles()
   * @param {number} umbralPorcentaje p. ej. 25
   * @returns {Promise<{accion: 'GENERADA'|'EXISTENTE'|'RESUELTA'|'NINGUNA'|'SIN_REFERENCIA', alarmaId?: string, porcentaje?: number}>}
   */
  async evaluar(tx, nivel, umbralPorcentaje) {
    const actual = Number(nivel.cantidad_actual);
    const referencia = Number(nivel.cantidad_referencia);
    if (!Number.isFinite(actual) || !Number.isFinite(referencia) || referencia <= 0) {
      return { accion: 'SIN_REFERENCIA' };
    }

    const porcentaje = (actual / referencia) * 100;
    if (porcentaje - umbralPorcentaje > TOLERANCIA) {
      // Reabastecido por encima del umbral: la alarma activa se cierra y podrá volver a generarse
      const cerradas = await this.#alarmas.resolverActiva(nivel.inventario_id, tx);
      return { accion: cerradas > 0 ? 'RESUELTA' : 'NINGUNA', porcentaje };
    }

    const alarmaId = await this.#alarmas.crearSiNoExiste(nivel.inventario_id, nivel.cantidad_actual, tx);
    if (!alarmaId) return { accion: 'EXISTENTE', porcentaje };

    await this.#registrarEvento(
      tx,
      TIPOS_EVENTO.STOCK_BAJO_DETECTADO,
      {
        alarmaId,
        inventarioId: nivel.inventario_id,
        puntoId: nivel.punto_id,
        punto: nivel.punto,
        productoId: nivel.producto_id,
        producto: nivel.producto,
        unidad: nivel.unidad,
        cantidadActual: actual,
        cantidadReferencia: referencia,
        porcentaje: Math.round(porcentaje * 10) / 10,
      },
      { claveDeduplicacion: `alarma:${alarmaId}` }
    );
    return { accion: 'GENERADA', alarmaId, porcentaje };
  }
}
