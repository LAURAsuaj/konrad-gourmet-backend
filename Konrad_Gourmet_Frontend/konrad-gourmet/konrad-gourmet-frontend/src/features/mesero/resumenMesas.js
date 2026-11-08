/**
 * Estado de las mesas a partir de los datos reales de la API.
 * La base de datos no guarda ocupación, capacidad ni pagos de una mesa (solo punto,
 * número y si está activa) y los pedidos no tienen estado. Por eso la interfaz solo
 * muestra lo que el sistema sabe: si la mesa tiene pedidos registrados hoy.
 *
 * Los pedidos traen el NÚMERO de mesa (no su id): se cruzan por número dentro del punto.
 */
export function resumirMesas(mesas = [], pedidos = []) {
  const porNumero = new Map();
  for (const pedido of pedidos) {
    const lista = porNumero.get(pedido.mesa) ?? [];
    lista.push(pedido);
    porNumero.set(pedido.mesa, lista);
  }

  return [...mesas]
    .sort((a, b) => a.numero - b.numero)
    .map((mesa) => {
      const deLaMesa = (porNumero.get(mesa.numero) ?? []).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      const ultimo = deLaMesa[0] ?? null;
      return {
        id: mesa.id,
        numero: mesa.numero,
        pedidosHoy: deLaMesa.length,
        platosHoy: deLaMesa.reduce((t, p) => t + p.items.reduce((s, i) => s + i.cantidad, 0), 0),
        ultimoPedido: ultimo?.fecha ?? null,
        ultimosPlatos: ultimo?.items ?? [],
        pedidos: deLaMesa,
      };
    });
}

export const FILTROS_MESA = Object.freeze({
  TODAS: 'todas',
  LIBRES: 'libres',
  CON_PEDIDOS: 'con-pedidos',
});

export function filtrarMesas(resumenes, { filtro = FILTROS_MESA.TODAS, busqueda = '' } = {}) {
  const texto = busqueda.trim();
  return resumenes.filter((m) => {
    if (filtro === FILTROS_MESA.LIBRES && m.pedidosHoy > 0) return false;
    if (filtro === FILTROS_MESA.CON_PEDIDOS && m.pedidosHoy === 0) return false;
    if (texto && !String(m.numero).includes(texto)) return false;
    return true;
  });
}

/** "2 × Pollo con arroz, 1 × Limonada" (recortado a `maximo` platos). */
export function describirPlatos(items = [], maximo = 3) {
  const partes = items.slice(0, maximo).map((i) => `${i.cantidad} × ${i.plato}`);
  if (items.length > maximo) partes.push(`y ${items.length - maximo} más`);
  return partes.join(', ');
}
