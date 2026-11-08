/**
 * Editores de las reglas del sistema con las mismas validaciones del backend
 * (docs/CONFIGURACION.md, "Reglas del sistema"). imagen_corporativa tiene su propia pantalla.
 */
export const METRICAS = Object.freeze([
  { valor: 'menor_razon_precio', etiqueta: 'Mejores precios frente al Ministerio' },
  { valor: 'ordenes_compra', etiqueta: 'Más órdenes de compra' },
  { valor: 'cotizaciones_opcionadas', etiqueta: 'Más cotizaciones opcionadas' },
]);

const numero = (texto) => (texto === '' || texto === null || texto === undefined ? NaN : Number(texto));

export const REGLAS = Object.freeze({
  alarma_porcentaje: {
    titulo: 'Alarma de stock bajo',
    ayuda: 'Porcentaje de la cantidad de referencia en el que se dispara la alarma.',
    tipo: 'numero',
    sufijo: '%',
    validar: (v) => {
      const n = numero(v);
      return n > 0 && n <= 100 ? { valor: n } : { error: 'Debe ser mayor que 0 y máximo 100.' };
    },
  },
  max_intentos_login: {
    titulo: 'Intentos de inicio de sesión',
    ayuda: 'Intentos fallidos permitidos antes de bloquear la cuenta.',
    tipo: 'numero',
    validar: (v) => {
      const n = numero(v);
      return Number.isInteger(n) && n >= 1 && n <= 10 ? { valor: n } : { error: 'Debe ser un entero de 1 a 10.' };
    },
  },
  hora_descuento_diario: {
    titulo: 'Hora del descuento diario de inventario',
    ayuda: 'Cuándo se descuentan del inventario los pedidos del día (hora de Bogotá).',
    tipo: 'hora',
    validar: (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v ?? '') ? { valor: v } : { error: 'Use el formato HH:MM de 24 horas.' }),
  },
  reintento_precio_sugerido_minutos: {
    titulo: 'Reintento del precio sugerido',
    ayuda: 'Minutos entre reintentos de consulta al Ministerio de Comercio.',
    tipo: 'numero',
    sufijo: 'min',
    validar: (v) => {
      const n = numero(v);
      return Number.isInteger(n) && n >= 1 && n <= 1440 ? { valor: n } : { error: 'Debe ser un entero de 1 a 1440.' };
    },
  },
  criterio_mejor_proveedor: {
    titulo: 'Criterio del mejor proveedor',
    ayuda: 'Cómo elige el tablero de control al mejor proveedor.',
    tipo: 'metrica',
    validar: (v) => (METRICAS.some((m) => m.valor === v?.metrica) ? { valor: { metrica: v.metrica } } : { error: 'Elija un criterio.' }),
  },
  rangos_validacion_cotizacion: {
    titulo: 'Rangos de validación de cotizaciones',
    ayuda: 'Razón valor cotizado ÷ valor sugerido del Ministerio.',
    tipo: 'rangos',
    validar: (v) => {
      const s = numero(v?.sospechosa_bajo);
      const o = numero(v?.opcionada_max);
      const r = numero(v?.rechazada_sobre);
      if (![s, o, r].every((n) => n > 0)) return { error: 'Los tres valores deben ser mayores que 0.' };
      if (!(s <= o && o <= r)) return { error: 'Debe cumplirse: sospechosa por debajo ≤ opcionada hasta ≤ rechazada por encima.' };
      return { valor: { sospechosa_bajo: s, opcionada_max: o, rechazada_sobre: r } };
    },
  },
});

/** Franjas que resultan de los rangos, para explicarlas en lenguaje claro. */
export function franjasDeRangos({ sospechosa_bajo: s, opcionada_max: o, rechazada_sobre: r }) {
  const pct = (n) => `${Math.round(n * 100)} %`;
  const franjas = [
    { estado: 'SOSPECHOSA', texto: `Menos del ${pct(s)} del sugerido` },
    { estado: 'OPCIONADA', texto: `Entre ${pct(s)} y ${pct(o)}` },
  ];
  if (o < r) franjas.push({ estado: 'SOSPECHOSA', texto: `Más de ${pct(o)} y hasta ${pct(r)}` });
  franjas.push({ estado: 'RECHAZADA', texto: `Más del ${pct(r)}` });
  return franjas;
}
