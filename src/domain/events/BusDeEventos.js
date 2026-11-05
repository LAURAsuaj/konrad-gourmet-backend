/**
 * Bus de eventos interno (EDA, SAD 5.2.4).
 *
 * Entrega cada evento a los manejadores suscritos de forma asíncrona e
 * independiente. Es agnóstico de la base de datos: la idempotencia (cada
 * manejador procesa un evento una sola vez) se delega en un "registro de
 * procesados" inyectable; la infraestructura aporta la versión en PostgreSQL.
 *
 * Garantía: entrega "al menos una vez". Si un manejador falla, el publicador
 * reintenta el evento y solo se reejecutan los manejadores que no terminaron.
 */

export const TIPOS_EVENTO = Object.freeze({
  SOLICITUD_REGISTRADA: 'SolicitudRegistrada',
  DESCUENTO_DIARIO_COMPLETADO: 'DescuentoDiarioCompletado',
  STOCK_BAJO_DETECTADO: 'StockBajoDetectado',
  SOLICITUD_COTIZACION_ENVIADA: 'SolicitudCotizacionEnviada',
  PRECIO_SUGERIDO_ACTUALIZADO: 'PrecioSugeridoActualizado',
  COTIZACION_REGISTRADA: 'CotizacionRegistrada',
  PROMOCION_GENERADA: 'PromocionGenerada',
});

function crearRegistroEnMemoria() {
  const vistos = new Set();
  return {
    async yaProcesado(eventoId, manejador) {
      return vistos.has(`${eventoId}:${manejador}`);
    },
    async marcarProcesado(eventoId, manejador) {
      vistos.add(`${eventoId}:${manejador}`);
    },
  };
}

export class BusDeEventos {
  #manejadores = new Map();
  #registro = crearRegistroEnMemoria();

  /**
   * Reemplaza el registro de eventos procesados (p. ej. por el de PostgreSQL).
   * @param {{yaProcesado: Function, marcarProcesado: Function}} registro
   */
  usarRegistro(registro) {
    if (
      !registro ||
      typeof registro.yaProcesado !== 'function' ||
      typeof registro.marcarProcesado !== 'function'
    ) {
      throw new Error('El registro debe implementar yaProcesado() y marcarProcesado()');
    }
    this.#registro = registro;
  }

  /**
   * @param {string} tipoEvento uno de TIPOS_EVENTO
   * @param {string} nombreManejador identificador único del manejador para ese evento
   * @param {(evento: {id: string, tipo: string, payload: object, creadoEn: Date}) => Promise<void>} manejador
   */
  suscribir(tipoEvento, nombreManejador, manejador) {
    if (!Object.values(TIPOS_EVENTO).includes(tipoEvento)) {
      throw new Error(`Tipo de evento desconocido: ${tipoEvento}`);
    }
    if (!nombreManejador || typeof manejador !== 'function') {
      throw new Error('Un manejador requiere nombre y función');
    }
    const suscritos = this.#manejadores.get(tipoEvento) ?? [];
    if (suscritos.some((s) => s.nombre === nombreManejador)) {
      throw new Error(`El manejador ${nombreManejador} ya está suscrito a ${tipoEvento}`);
    }
    suscritos.push({ nombre: nombreManejador, manejador });
    this.#manejadores.set(tipoEvento, suscritos);
  }

  manejadoresDe(tipoEvento) {
    return (this.#manejadores.get(tipoEvento) ?? []).map((s) => s.nombre);
  }

  /**
   * Entrega el evento a todos sus manejadores en paralelo.
   * No lanza por fallos de manejadores: los devuelve para que el publicador
   * decida el reintento.
   * @returns {Promise<{exitosos: string[], omitidos: string[], fallidos: {manejador: string, error: Error}[]}>}
   */
  async publicar(evento) {
    if (!evento?.id || !evento?.tipo) {
      throw new Error('Un evento requiere id y tipo');
    }
    const resultado = { exitosos: [], omitidos: [], fallidos: [] };
    const suscritos = this.#manejadores.get(evento.tipo) ?? [];

    await Promise.all(
      suscritos.map(async ({ nombre, manejador }) => {
        try {
          if (await this.#registro.yaProcesado(evento.id, nombre)) {
            resultado.omitidos.push(nombre);
            return;
          }
          await manejador(evento);
          // Si marcar falla, el manejador se considera fallido y se reintenta (entrega al menos una vez).
          await this.#registro.marcarProcesado(evento.id, nombre);
          resultado.exitosos.push(nombre);
        } catch (error) {
          resultado.fallidos.push({ manejador: nombre, error });
        }
      })
    );

    return resultado;
  }
}

export const busDeEventos = new BusDeEventos();
