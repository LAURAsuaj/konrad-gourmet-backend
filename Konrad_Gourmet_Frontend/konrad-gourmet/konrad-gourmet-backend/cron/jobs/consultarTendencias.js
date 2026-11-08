/**
 * Job: consulta de tendencias en redes sociales y envío de promociones (CU-15).
 * Consulta la API de tendencias, las cruza con los productos más solicitados y
 * genera las promociones (que se envían por correo mediante eventos).
 * Frecuencia: CRON_TENDENCIAS (por defecto, lunes a las 8:00).
 */
export const nombre = 'consultar_tendencias';

export function expresion({ config }) {
  return config.tendencias;
}

export function ejecutar({ facade }) {
  return facade.ejecutarProcesoAutomatico('promociones');
}
