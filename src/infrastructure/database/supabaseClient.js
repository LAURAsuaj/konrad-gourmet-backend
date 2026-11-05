/**
 * Persistencia: PostgreSQL alojado en Supabase.
 *
 * - `pool` / `query` / `withTransaction`: acceso SQL directo con transacciones reales.
 *   supabase-js (PostgREST) no soporta transacciones multi-sentencia, que son
 *   indispensables para el patrón Outbox (cambio de negocio + evento atómicos).
 * - `supabase`: cliente supabase-js con la service role key, para servicios propios
 *   de la plataforma (p. ej. Realtime).
 *
 * Este archivo no importa el errorLogger para evitar dependencias circulares.
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';

const { Pool } = pg;

const ssl = env.tls.dbSsl
  ? {
      minVersion: env.tls.minVersion,
      rejectUnauthorized: env.tls.rejectUnauthorized,
      ...(env.tls.caCertificate ? { ca: env.tls.caCertificate } : {}),
    }
  : false;

export const pool = new Pool({
  connectionString: env.db.url,
  max: env.db.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl,
});

pool.on('error', (error) => {
  console.error('[db] Error en una conexión inactiva del pool:', error.message);
});

export const supabase = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Ejecuta una consulta parametrizada.
 * @param {string} texto SQL con parámetros $1, $2...
 * @param {Array} [parametros]
 * @param {{query: Function}} [ejecutor] pool o cliente de una transacción en curso
 */
export function query(texto, parametros = [], ejecutor = pool) {
  return ejecutor.query(texto, parametros);
}

/**
 * Ejecuta `trabajo(client)` dentro de una transacción. Confirma al terminar y
 * revierte ante cualquier excepción, que se vuelve a lanzar.
 * Todo cambio de estado de negocio y su evento de dominio (registrarEvento)
 * deben escribirse con el mismo `client`.
 */
export async function withTransaction(trabajo) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await trabajo(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (errorRollback) {
      console.error('[db] No se pudo revertir la transacción:', errorRollback.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Verifica conectividad con la base de datos (health check). */
export async function verificarConexion() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === 1;
}

export async function cerrarBaseDeDatos() {
  await pool.end();
}
