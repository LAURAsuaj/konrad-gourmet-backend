/** Presentación del tablero BAM (GET /tablero): solo nombres y conteos, sin montos. */
export const METRICAS_PROVEEDOR = Object.freeze({
  ordenes_compra: { texto: 'Más órdenes de compra', corto: 'órdenes', unidad: (n) => `${n} ${n === 1 ? 'orden de compra' : 'órdenes de compra'}` },
  cotizaciones_opcionadas: { texto: 'Más cotizaciones opcionadas', corto: 'opcionadas', unidad: (n) => `${n} ${n === 1 ? 'cotización opcionada' : 'cotizaciones opcionadas'}` },
  menor_razon_precio: { texto: 'Mejores precios frente al Ministerio', corto: null, unidad: null },
});

export const metricaProveedor = (metrica) => METRICAS_PROVEEDOR[metrica] ?? { texto: metrica, corto: null, unidad: null };

/** Estado de un indicador: con datos, sin datos (mensaje) o con error de cálculo. */
export function estadoIndicador(indicador) {
  if (!indicador) return { tipo: 'error', mensaje: 'El indicador no llegó en la respuesta.' };
  if (indicador.error) return { tipo: 'error', mensaje: typeof indicador.error === 'string' ? indicador.error : 'No se pudo calcular este indicador.' };
  if (!indicador.disponible) return { tipo: 'vacio', mensaje: indicador.mensaje ?? 'No hay datos suficientes en el periodo.' };
  return { tipo: 'ok' };
}

/** Filas para barras de ranking: proporción frente al primero. */
export function filasRanking(ranking = [], { nombre, valor }) {
  const maximo = Math.max(0, ...ranking.map((r) => Number(r[valor]) || 0));
  return ranking.map((r, i) => ({ posicion: i + 1, nombre: r[nombre], valor: Number(r[valor]) || 0, maximo }));
}
