/**
 * Registro de valores de una cotización (PUT /cotizaciones/:id/valores).
 * La API exige un valor para TODOS los alimentos de la cotización.
 */
export function validarValores(alimentos = [], entradas = {}) {
  const errores = {};
  const valores = [];
  for (const a of alimentos) {
    const texto = entradas[a.detalleSolicitudId];
    const valor = Number(texto);
    if (texto === undefined || texto === '' || !Number.isFinite(valor) || valor <= 0) {
      errores[a.detalleSolicitudId] = 'Escriba un valor mayor que 0.';
    } else {
      valores.push({ detalleSolicitudId: a.detalleSolicitudId, valorUnitario: valor });
    }
  }
  return { errores, valores, valido: Object.keys(errores).length === 0 };
}

/** Total cotizado y comparación con el precio sugerido del Ministerio (solo informativa). */
export function resumirValores(alimentos = [], entradas = {}) {
  let total = 0;
  let sugerido = 0;
  let completo = true;
  let conSugerido = true;
  const lineas = alimentos.map((a) => {
    const valor = Number(entradas[a.detalleSolicitudId]);
    const valido = Number.isFinite(valor) && valor > 0;
    if (!valido) completo = false;
    if (a.precioSugeridoUnitario == null) conSugerido = false;
    const subtotal = valido ? valor * a.cantidad : null;
    const subtotalSugerido = a.precioSugeridoUnitario == null ? null : a.precioSugeridoUnitario * a.cantidad;
    if (subtotal !== null) total += subtotal;
    if (subtotalSugerido !== null) sugerido += subtotalSugerido;
    return {
      ...a,
      subtotal,
      porcentajeSugerido: valido && a.precioSugeridoUnitario ? Math.round((valor / a.precioSugeridoUnitario) * 100) : null,
    };
  });
  return {
    lineas,
    total: completo ? total : null,
    sugerido: conSugerido ? sugerido : null,
    porcentajeSugerido: completo && conSugerido && sugerido > 0 ? Math.round((total / sugerido) * 100) : null,
  };
}

/**
 * Entre las cotizaciones opcionadas, la de menor valor que cubre todos los alimentos
 * de la solicitud. Si ninguna los cubre todos, no se marca ninguna (no son comparables).
 */
export function mejorOpcionada(opcionadas = [], totalAlimentos = 0) {
  const completas = opcionadas.filter((c) => c.alimentos === totalAlimentos && c.valorTotal != null);
  if (!completas.length) return null;
  return completas.reduce((mejor, c) => (c.valorTotal < mejor.valorTotal ? c : mejor)).id;
}

/** Hoy en Bogotá como mínimo del plazo de la cotización (la API rechaza fechas pasadas). */
export function plazoPorDefecto(hoy, dias = 3) {
  const [a, m, d] = hoy.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d + dias));
  return fecha.toISOString().slice(0, 10);
}
