/**
 * Manejador de eventos: ManejadorAlarmas (CU-07, SAD 5.2.4).
 *
 * Reacciona a DescuentoDiarioCompletado: por cada producto afectado verifica si
 * las existencias bajaron del porcentaje parametrizado (25 %) respecto a la
 * cantidad de referencia y, si corresponde, crea la alarma y publica
 * StockBajoDetectado en la misma transacción (Outbox). No repite una alarma
 * activa y cierra la alarma de los productos que ya fueron reabastecidos.
 *
 * Es idempotente: reprocesar el mismo evento no duplica alarmas.
 */
import { TIPOS_EVENTO } from '../BusDeEventos.js';

export const NOMBRE_MANEJADOR_ALARMAS = 'ManejadorAlarmas';

export class ManejadorAlarmas {
  #db;
  #unidadDeTrabajo;
  #alarmas;
  #evaluador;
  #parametros;
  #registrador;

  /**
   * @param {{db, unidadDeTrabajo, alarmas: AlarmaRepository, evaluador: EvaluadorAlarmas,
   *          parametros: ParametroRepository, registrador: {error: Function}}} dependencias
   */
  constructor({ db, unidadDeTrabajo, alarmas, evaluador, parametros, registrador }) {
    this.#db = db;
    this.#unidadDeTrabajo = unidadDeTrabajo;
    this.#alarmas = alarmas;
    this.#evaluador = evaluador;
    this.#parametros = parametros;
    this.#registrador = registrador;
  }

  registrar(bus) {
    bus.suscribir(TIPOS_EVENTO.DESCUENTO_DIARIO_COMPLETADO, NOMBRE_MANEJADOR_ALARMAS, (evento) => this.manejar(evento));
  }

  async manejar(evento) {
    const ids = Array.isArray(evento.payload?.inventarioIds) ? [...new Set(evento.payload.inventarioIds)] : [];
    if (ids.length === 0) return;

    const umbral = await this.#parametros.obtenerNumero('alarma_porcentaje', this.#db, 25);
    const fallos = [];

    for (const inventarioId of ids) {
      try {
        await this.#unidadDeTrabajo(async (tx) => {
          // Se vuelve a leer dentro de la transacción para evaluar el saldo vigente
          const [nivel] = await this.#alarmas.obtenerNiveles([inventarioId], tx);
          if (!nivel) return;
          await this.#evaluador.evaluar(tx, nivel, umbral);
        });
      } catch (error) {
        fallos.push(inventarioId);
        await this.#registrador.error({
          modulo: 'alarmas',
          mensaje: 'No se pudo evaluar la alarma de stock de un producto',
          detalle: { eventoId: evento.id, inventarioId },
          error,
        });
      }
    }

    if (fallos.length > 0) {
      throw new Error(`Falló la evaluación de alarmas de ${fallos.length} producto(s); se reintentará el evento`);
    }
  }
}
