/**
 * Registro de logs del sistema en la tabla log_error (consultable por el
 * Administrador, CU-16). Nunca lanza excepciones: si la base de datos no está
 * disponible, deja el registro en consola para no ocultar el error original.
 */
import { pool } from '../database/supabaseClient.js';

export function serializarError(error) {
  if (!error) return null;
  if (typeof error === 'string') return { mensaje: error };
  return {
    nombre: error.name ?? 'Error',
    mensaje: error.message ?? String(error),
    codigo: error.code ?? null,
    stack: error.stack ? error.stack.split('\n').slice(0, 8).join('\n') : null,
  };
}

function aJson(valor) {
  try {
    return JSON.stringify(valor);
  } catch {
    return JSON.stringify({ aviso: 'detalle no serializable', texto: String(valor) });
  }
}

async function insertar(nivel, { modulo = 'desconocido', mensaje = '', detalle, error } = {}) {
  const detalleFinal = {
    ...(detalle && typeof detalle === 'object' ? detalle : {}),
    ...(error ? { error: serializarError(error) } : {}),
  };

  if (nivel === 'ERROR') {
    console.error(`[${modulo}] ${mensaje}`, error?.message ?? '');
  }

  try {
    await pool.query(
      'INSERT INTO log_error (nivel, modulo, mensaje, detalle) VALUES ($1, $2, $3, $4::jsonb)',
      [nivel, String(modulo).slice(0, 80), String(mensaje).slice(0, 2000), aJson(detalleFinal)]
    );
  } catch (fallo) {
    console.error(
      `[log:${nivel}] ${modulo}: ${mensaje} (no se pudo persistir en BD: ${fallo.message})`
    );
  }
}

/** Errores del sistema: fallos de correo, servicios externos, inconsistencias, etc. */
export function registrarError(datos) {
  return insertar('ERROR', datos);
}

export function registrarAdvertencia(datos) {
  return insertar('WARN', datos);
}

/** Resultado de ejecuciones de procesos automáticos (p. ej. descuento diario). */
export function registrarEjecucion(datos) {
  return insertar('INFO', datos);
}
