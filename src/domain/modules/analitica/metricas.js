/** Criterios disponibles para elegir al mejor proveedor en el tablero BAM (parametro.criterio_mejor_proveedor). */
export const METRICAS_MEJOR_PROVEEDOR = Object.freeze(['ordenes_compra', 'cotizaciones_opcionadas', 'menor_razon_precio']);
// El enunciado pide el proveedor "con los mejores precios": ese es el criterio por defecto
export const METRICA_POR_DEFECTO = 'menor_razon_precio';

// Periodos por defecto del tablero (enunciado): demanda del último mes y mejores precios del último año.
// "Último mes" se interpreta como los últimos 30 días. Un periodo indicado por el usuario los reemplaza.
export const PERIODO_DEMANDA_DIAS = 30;
export const PERIODO_PROVEEDOR_DIAS = 365;
