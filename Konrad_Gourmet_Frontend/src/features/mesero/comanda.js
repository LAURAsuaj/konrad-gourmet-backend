/**
 * Comanda (borrador del pedido) de cada mesa, antes de enviarla a cocina.
 * Vive solo en este dispositivo: la API registra el pedido completo de una vez
 * (POST /pedidos), así que el borrador es estado de la interfaz, no del sistema.
 *
 * Estado: { [mesaId]: [{ platoId, cantidad }] }, en el orden en que se agregaron.
 */
export const MAXIMO_POR_PLATO = 1000; // límite del backend por línea
export const MAXIMO_LINEAS = 100; // límite del backend por pedido

export function comandaReducer(estado, accion) {
  const lineas = estado[accion.mesaId] ?? [];
  switch (accion.tipo) {
    case 'agregar': {
      const existente = lineas.find((l) => l.platoId === accion.platoId);
      if (!existente && lineas.length >= MAXIMO_LINEAS) return estado;
      const nuevas = existente
        ? lineas.map((l) => (l.platoId === accion.platoId ? { ...l, cantidad: Math.min(MAXIMO_POR_PLATO, l.cantidad + (accion.cantidad ?? 1)) } : l))
        : [...lineas, { platoId: accion.platoId, cantidad: Math.min(MAXIMO_POR_PLATO, accion.cantidad ?? 1) }];
      return { ...estado, [accion.mesaId]: nuevas };
    }
    case 'fijar': {
      const cantidad = Math.min(MAXIMO_POR_PLATO, Math.max(0, Math.trunc(accion.cantidad)));
      if (cantidad === 0) return comandaReducer(estado, { ...accion, tipo: 'quitar' });
      if (!lineas.some((l) => l.platoId === accion.platoId)) return comandaReducer(estado, { ...accion, tipo: 'agregar' });
      return { ...estado, [accion.mesaId]: lineas.map((l) => (l.platoId === accion.platoId ? { ...l, cantidad } : l)) };
    }
    case 'quitar': {
      const nuevas = lineas.filter((l) => l.platoId !== accion.platoId);
      if (nuevas.length) return { ...estado, [accion.mesaId]: nuevas };
      const { [accion.mesaId]: _omitida, ...resto } = estado;
      return resto;
    }
    case 'vaciar': {
      const { [accion.mesaId]: _omitida, ...resto } = estado;
      return resto;
    }
    default:
      return estado;
  }
}

/** Une las líneas con los datos del menú: nombre, precio y si sigue disponible. */
export function detallarComanda(lineas = [], menuPorId = new Map()) {
  const detalle = lineas.map((l) => {
    const plato = menuPorId.get(l.platoId);
    const disponible = Boolean(plato?.activo);
    return {
      platoId: l.platoId,
      cantidad: l.cantidad,
      nombre: plato?.nombre ?? 'Plato retirado del menú',
      precio: plato?.precio ?? 0,
      disponible,
      subtotal: disponible ? plato.precio * l.cantidad : 0,
    };
  });
  return {
    lineas: detalle,
    unidades: detalle.reduce((t, l) => t + (l.disponible ? l.cantidad : 0), 0),
    totalEstimado: detalle.reduce((t, l) => t + l.subtotal, 0),
    noDisponibles: detalle.filter((l) => !l.disponible).length,
  };
}

/** Cuerpo de POST /pedidos. */
export function itemsParaPedido(lineas = []) {
  return lineas.filter((l) => l.cantidad > 0).map((l) => ({ platoId: l.platoId, cantidad: l.cantidad }));
}
