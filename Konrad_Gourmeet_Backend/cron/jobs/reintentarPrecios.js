/**
 * Job: reintento de la consulta del precio sugerido (CU-10).
 * Reintenta las solicitudes que aún no tienen valor total sugerido porque el
 * servicio del Ministerio de Comercio falló. El intervalo lo define la regla
 * `reintento_precio_sugerido_minutos`; si no se puede leer, CRON_REINTENTO_PRECIOS.
 */
export const nombre = 'reintentar_precios';

/** Convierte un intervalo en minutos a una expresión cron. */
export function expresionCadaMinutos(minutos) {
  if (!Number.isInteger(minutos) || minutos < 1) return null;
  if (minutos <= 59) return `*/${minutos} * * * *`;
  const horas = Math.round(minutos / 60);
  return horas >= 24 ? '0 0 * * *' : `0 */${horas} * * *`;
}

export function expresion({ programacion, config }) {
  return expresionCadaMinutos(programacion?.reintentoPreciosMinutos) ?? config.reintentoPrecios;
}

export function ejecutar({ facade }) {
  return facade.ejecutarProcesoAutomatico('reintento_precios');
}
