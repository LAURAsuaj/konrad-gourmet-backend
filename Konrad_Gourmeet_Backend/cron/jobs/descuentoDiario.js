/**
 * Job: descuento diario de inventario (CU-06).
 *
 * La hora la define el Administrador en la regla `hora_descuento_diario` (HH:MM);
 * si no se puede leer, se usa CRON_DESCUENTO_FALLBACK. Si el contenedor estuvo
 * apagado a la hora programada no se pierde nada: la siguiente ejecución descuenta
 * todos los pedidos pendientes (el proceso es idempotente).
 */
export const nombre = 'descuento_diario';

export function expresion({ programacion, config }) {
  const hora = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(programacion?.horaDescuentoDiario ?? '');
  return hora ? `${Number(hora[2])} ${Number(hora[1])} * * *` : config.descuentoDiarioFallback;
}

export function ejecutar({ facade }) {
  return facade.ejecutarProcesoAutomatico('descuento_diario');
}
