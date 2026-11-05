/**
 * Punto de entrada del contenedor de procesos automáticos (cron).
 *
 * - Programa los jobs de cron/jobs/ con node-cron y los ejecuta SIEMPRE a través
 *   de SistemaFacade (que los audita como ejecuciones del SISTEMA).
 * - Relee la programación de la base de datos cada minuto: si el Administrador
 *   cambia la hora del descuento diario o el intervalo de reintento, se
 *   reprograma sin reiniciar el contenedor.
 * - Evita ejecuciones superpuestas de un mismo job y, con un bloqueo asesor de
 *   PostgreSQL, que dos instancias del contenedor ejecuten el mismo job a la vez.
 * - Inicia el publicador del Outbox: el bus de eventos también funciona aquí.
 * - Escribe un "latido" que usa el HEALTHCHECK de Dockerfile.cron.
 *
 * Contrato de un job (módulo en cron/jobs/): exporta `nombre`,
 * `expresion({ programacion, config })` y `ejecutar({ facade })`.
 *
 * Uso manual (una sola ejecución y salir): node cron/worker.js --ejecutar=<job>
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import cron from 'node-cron';
import { env } from '../src/config/env.js';
import { pool } from '../src/infrastructure/database/supabaseClient.js';
import { construirContenedor } from '../src/container.js';
import * as descuentoDiario from './jobs/descuentoDiario.js';
import * as consultarTendencias from './jobs/consultarTendencias.js';
import * as reintentarPrecios from './jobs/reintentarPrecios.js';

export const JOBS = Object.freeze([descuentoDiario, consultarTendencias, reintentarPrecios]);
export const RUTA_LATIDO = path.join(os.tmpdir(), 'kg-cron-latido');

/**
 * Ejecuta `trabajo` solo si ninguna otra instancia tiene el bloqueo de ese job.
 * @returns {Promise<{omitido: boolean, resultado?: any}>}
 */
export async function bloqueoDistribuido(nombreJob, trabajo, db = pool) {
  const cliente = await db.connect();
  const clave = `konrad-gourmet:${nombreJob}`;
  let fallo;
  try {
    const { rows } = await cliente.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [clave]);
    if (!rows[0].ok) return { omitido: true };
    try {
      return { omitido: false, resultado: await trabajo() };
    } finally {
      await cliente.query('SELECT pg_advisory_unlock(hashtext($1))', [clave]);
    }
  } catch (error) {
    fallo = error;
    throw error;
  } finally {
    // Si hubo un error el cliente se destruye: así el bloqueo de sesión no queda retenido en el pool
    cliente.release(fallo);
  }
}

/**
 * @param {{facade: object, registrador: {error: Function}}} contenedor resultado de construirContenedor()
 * @param {{config?: object, jobs?: object[], intervaloSincronizacionMs?: number, bloqueo?: Function,
 *          rutaLatido?: string, esperaMaximaApagadoMs?: number}} [opciones]
 */
export function iniciarWorker(
  contenedor,
  {
    config = env.cron,
    jobs = JOBS,
    intervaloSincronizacionMs = 60_000,
    bloqueo = bloqueoDistribuido,
    rutaLatido = RUTA_LATIDO,
    esperaMaximaApagadoMs = 30_000,
  } = {}
) {
  const { facade, registrador } = contenedor;
  const tareas = new Map();
  const enEjecucion = new Map();
  let detenido = false;

  const latido = () => {
    try {
      fs.writeFileSync(rutaLatido, new Date().toISOString());
    } catch {
      /* el latido es solo informativo para el HEALTHCHECK */
    }
  };

  async function correr(job) {
    if (detenido) return;
    if (enEjecucion.has(job.nombre)) {
      console.warn(`[cron] ${job.nombre}: la ejecución anterior sigue en curso; se omite esta`);
      return;
    }
    const promesa = (async () => {
      try {
        const salida = await bloqueo(job.nombre, () => job.ejecutar({ facade }));
        if (salida.omitido) console.log(`[cron] ${job.nombre}: otra instancia lo está ejecutando`);
      } catch (error) {
        await registrador.error({ modulo: 'cron', mensaje: `Falló el job ${job.nombre}`, error });
      } finally {
        enEjecucion.delete(job.nombre);
      }
    })();
    enEjecucion.set(job.nombre, promesa);
    await promesa;
  }

  /** Lee la programación vigente y (re)programa los jobs cuya expresión cambió. */
  async function sincronizar() {
    if (detenido) return;
    let programacion = null;
    try {
      programacion = await facade.consultarProgramacion();
    } catch (error) {
      await registrador.error({
        modulo: 'cron',
        mensaje: 'No se pudo leer la programación; se mantiene la vigente o la de respaldo',
        error,
      });
    }

    for (const job of jobs) {
      if (programacion === null && tareas.has(job.nombre)) continue; // sin lectura, se conserva lo vigente
      const expresion = job.expresion({ programacion, config });
      if (!cron.validate(expresion)) {
        await registrador.error({ modulo: 'cron', mensaje: `Expresión cron inválida para ${job.nombre}: "${expresion}"` });
        continue;
      }
      if (tareas.get(job.nombre)?.expresion === expresion) continue;

      tareas.get(job.nombre)?.tarea.stop();
      const tarea = cron.schedule(expresion, () => void correr(job), { timezone: config.timezone });
      tareas.set(job.nombre, { expresion, tarea });
      console.log(`[cron] ${job.nombre} programado: "${expresion}" (${config.timezone})`);
    }
    latido();
  }

  const temporizador = setInterval(() => void sincronizar(), intervaloSincronizacionMs);

  /** Detiene la programación y espera (hasta un tope) a los jobs en curso. */
  async function detener() {
    detenido = true;
    clearInterval(temporizador);
    for (const { tarea } of tareas.values()) tarea.stop();
    const pendientes = [...enEjecucion.values()];
    if (pendientes.length > 0) {
      await Promise.race([Promise.allSettled(pendientes), new Promise((r) => setTimeout(r, esperaMaximaApagadoMs))]);
    }
  }

  return {
    sincronizar,
    correr,
    detener,
    expresiones: () => Object.fromEntries([...tareas].map(([nombreJob, { expresion }]) => [nombreJob, expresion])),
  };
}

async function principal() {
  const contenedor = construirContenedor();
  const argumento = process.argv.find((a) => a.startsWith('--ejecutar='));

  if (argumento) {
    const nombreJob = argumento.split('=')[1];
    const job = JOBS.find((j) => j.nombre === nombreJob);
    try {
      if (!job) throw new Error(`Job desconocido "${nombreJob}". Disponibles: ${JOBS.map((j) => j.nombre).join(', ')}`);
      console.log(JSON.stringify(await job.ejecutar({ facade: contenedor.facade })));
    } catch (error) {
      console.error(`[cron] ${error.message}`);
      process.exitCode = 1;
    } finally {
      await contenedor.detener();
    }
    return;
  }

  contenedor.iniciarEventos();
  const worker = iniciarWorker(contenedor);
  await worker.sincronizar();
  console.log('[cron] worker iniciado');

  let cerrando = false;
  const apagar = async (senal) => {
    if (cerrando) return;
    cerrando = true;
    console.log(`[cron] ${senal} recibida: apagado ordenado`);
    const forzar = setTimeout(() => process.exit(1), 40_000);
    forzar.unref();
    await worker.detener();
    await contenedor.detener();
    process.exit(0);
  };
  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));
  process.on('unhandledRejection', (motivo) => {
    contenedor.registrador.error({ modulo: 'cron', mensaje: 'Promesa rechazada sin manejar', error: motivo instanceof Error ? motivo : new Error(String(motivo)) });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((error) => {
    console.error('[cron] No se pudo iniciar:', error);
    process.exit(1);
  });
}
