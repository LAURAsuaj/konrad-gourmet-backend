/**
 * Patrón Outbox (SAD 5.2.4).
 *
 * 1. Los módulos de dominio llaman a `registrarEvento(client, ...)` con el MISMO
 *    cliente de la transacción que cambia el estado del negocio: ambos se
 *    confirman o se revierten juntos.
 * 2. `EventOutboxPublisher` lee periódicamente los eventos PENDIENTES, los
 *    entrega al BusDeEventos y los marca PROCESADO. Si un manejador falla, el
 *    evento se reintenta con espera exponencial hasta agotar los intentos.
 *
 * Varios publicadores (API y cron) pueden convivir: los eventos se reclaman
 * con FOR UPDATE SKIP LOCKED y una reserva temporal (lease), por lo que un
 * evento no lo toman dos publicadores a la vez y, si uno cae, la reserva
 * vence y otro lo retoma.
 */
import { pool } from '../database/supabaseClient.js';
import { registrarError } from '../logging/errorLogger.js';
import { env } from '../../config/env.js';
import { busDeEventos as busPorDefecto, TIPOS_EVENTO } from '../../domain/events/BusDeEventos.js';

const TOPE_DEMORA_SEGUNDOS = 3600;

/**
 * Inserta un evento en la tabla outbox dentro de la transacción en curso.
 * @param {{query: Function}} client cliente de la transacción (withTransaction)
 * @param {string} tipo uno de TIPOS_EVENTO
 * @param {object} payload datos del evento (JSON serializable)
 * @param {{claveDeduplicacion?: string|null}} [opciones] si ya existe un evento con la
 *        misma clave no se inserta otro (reejecuciones sin duplicar efectos)
 * @returns {Promise<string|null>} id del evento o null si fue deduplicado
 */
export async function registrarEvento(client, tipo, payload = {}, { claveDeduplicacion = null } = {}) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('registrarEvento requiere el cliente de la transacción en curso');
  }
  if (!Object.values(TIPOS_EVENTO).includes(tipo)) {
    throw new Error(`Tipo de evento desconocido: ${tipo}`);
  }
  const { rows } = await client.query(
    `INSERT INTO outbox (tipo, payload, clave_dedup)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (clave_dedup) DO NOTHING
     RETURNING id`,
    [tipo, JSON.stringify(payload), claveDeduplicacion]
  );
  return rows[0]?.id ?? null;
}

/** Registro de eventos procesados por manejador, respaldado en PostgreSQL. */
export class RegistroProcesadosPg {
  async yaProcesado(eventoId, manejador) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM evento_procesado WHERE evento_id = $1 AND manejador = $2',
      [eventoId, manejador]
    );
    return rowCount > 0;
  }

  async marcarProcesado(eventoId, manejador) {
    await pool.query(
      `INSERT INTO evento_procesado (evento_id, manejador) VALUES ($1, $2)
       ON CONFLICT (evento_id, manejador) DO NOTHING`,
      [eventoId, manejador]
    );
  }
}

const SQL_RECLAMAR = `
  UPDATE outbox
     SET bloqueado_hasta = now() + make_interval(secs => $2)
   WHERE id IN (
           SELECT id FROM outbox
            WHERE estado = 'PENDIENTE'
              AND disponible_en <= now()
              AND (bloqueado_hasta IS NULL OR bloqueado_hasta < now())
            ORDER BY creado_en
            LIMIT $1
            FOR UPDATE SKIP LOCKED)
  RETURNING id, tipo, payload, intentos, creado_en`;

export class EventOutboxPublisher {
  #bus;
  #pollMs;
  #batchSize;
  #maxAttempts;
  #retryBaseSeconds;
  #leaseSeconds;
  #activo = false;
  #temporizador = null;
  #enCurso = Promise.resolve();

  constructor({
    bus = busPorDefecto,
    pollMs = env.outbox.pollMs,
    batchSize = env.outbox.batchSize,
    maxAttempts = env.outbox.maxAttempts,
    retryBaseSeconds = env.outbox.retryBaseSeconds,
    leaseSeconds = env.outbox.leaseSeconds,
  } = {}) {
    this.#bus = bus;
    this.#pollMs = pollMs;
    this.#batchSize = batchSize;
    this.#maxAttempts = maxAttempts;
    this.#retryBaseSeconds = retryBaseSeconds;
    this.#leaseSeconds = leaseSeconds;
    // La idempotencia por manejador se respalda en la base de datos.
    this.#bus.usarRegistro(new RegistroProcesadosPg());
  }

  /** Inicia el sondeo periódico de la tabla outbox. */
  iniciar() {
    if (this.#activo) return;
    this.#activo = true;
    this.#programar(0);
  }

  /** Detiene el sondeo y espera a que termine el lote en curso. */
  async detener() {
    this.#activo = false;
    if (this.#temporizador) clearTimeout(this.#temporizador);
    this.#temporizador = null;
    await this.#enCurso;
  }

  #programar(demoraMs) {
    if (!this.#activo) return;
    this.#temporizador = setTimeout(() => {
      this.#enCurso = this.#ciclo();
    }, demoraMs);
  }

  async #ciclo() {
    let procesados = 0;
    try {
      procesados = await this.procesarLote();
    } catch (error) {
      await registrarError({
        modulo: 'outbox',
        mensaje: 'Falló un ciclo del publicador de eventos',
        error,
      });
    }
    // Si el lote vino lleno, hay más pendientes: continuar sin esperar.
    this.#programar(procesados >= this.#batchSize ? 0 : this.#pollMs);
  }

  /**
   * Reclama y entrega un lote de eventos pendientes.
   * @returns {Promise<number>} cantidad de eventos reclamados
   */
  async procesarLote() {
    const { rows } = await pool.query(SQL_RECLAMAR, [this.#batchSize, this.#leaseSeconds]);
    for (const fila of rows) {
      await this.#entregar(fila);
    }
    return rows.length;
  }

  async #entregar(fila) {
    const evento = {
      id: fila.id,
      tipo: fila.tipo,
      payload: fila.payload,
      creadoEn: fila.creado_en,
    };

    let resultado;
    try {
      resultado = await this.#bus.publicar(evento);
    } catch (error) {
      resultado = { fallidos: [{ manejador: 'bus', error }] };
    }

    if (resultado.fallidos.length === 0) {
      await pool.query(
        `UPDATE outbox
            SET estado = 'PROCESADO', procesado_en = now(), bloqueado_hasta = NULL, ultimo_error = NULL
          WHERE id = $1`,
        [fila.id]
      );
      return;
    }

    await this.#registrarFallo(fila, resultado.fallidos);
  }

  async #registrarFallo(fila, fallidos) {
    const intentos = fila.intentos + 1;
    const agotado = intentos >= this.#maxAttempts;
    const resumen = fallidos
      .map((f) => `${f.manejador}: ${f.error?.message ?? f.error}`)
      .join(' | ')
      .slice(0, 1000);
    const demora = Math.min(this.#retryBaseSeconds * 2 ** (intentos - 1), TOPE_DEMORA_SEGUNDOS);

    await pool.query(
      `UPDATE outbox
          SET intentos = $2,
              ultimo_error = $3,
              estado = $4,
              disponible_en = now() + make_interval(secs => $5),
              bloqueado_hasta = NULL
        WHERE id = $1`,
      [fila.id, intentos, resumen, agotado ? 'FALLIDO' : 'PENDIENTE', demora]
    );

    await registrarError({
      modulo: 'outbox',
      mensaje: agotado
        ? `El evento ${fila.tipo} agotó sus reintentos`
        : `Falló la entrega de ${fila.tipo}; se reintentará`,
      detalle: {
        eventoId: fila.id,
        intentos,
        manejadores: fallidos.map((f) => f.manejador),
      },
      error: fallidos[0].error,
    });
  }
}
