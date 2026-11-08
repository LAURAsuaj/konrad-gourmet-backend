/** Cálculos del panel de cocina a partir de pedidos e inventario reales. */

/** Platos más pedidos: suma de cantidades por plato, de mayor a menor. */
export function rankingPlatos(pedidos = [], limite = 5) {
  const totales = new Map();
  for (const pedido of pedidos) {
    for (const item of pedido.items) {
      const actual = totales.get(item.platoId) ?? { platoId: item.platoId, plato: item.plato, cantidad: 0 };
      actual.cantidad += item.cantidad;
      totales.set(item.platoId, actual);
    }
  }
  return [...totales.values()].sort((a, b) => b.cantidad - a.cantidad || a.plato.localeCompare(b.plato, 'es')).slice(0, limite);
}

export const ESTADOS_STOCK = Object.freeze({
  AGOTADO: { tono: 'error', texto: 'Agotado', barra: 'error' },
  ALARMA: { tono: 'marca', texto: 'Stock bajo', barra: 'marca' },
  NORMAL: { tono: 'neutro', texto: 'Normal', barra: 'neutro' },
});

/** Agotado (0), en alarma (lo decide el backend con la regla alarma_porcentaje) o normal. */
export function estadoStock(item) {
  if (Number(item.cantidadActual) <= 0) return 'AGOTADO';
  if (item.enAlarma) return 'ALARMA';
  return 'NORMAL';
}

/** Productos con menor porcentaje frente a su referencia. */
export function inventarioMasBajo(inventario = [], limite = 5) {
  return [...inventario].sort((a, b) => a.porcentaje - b.porcentaje).slice(0, limite);
}

/**
 * Filas iniciales de una solicitud de alimentos para los productos indicados:
 * sugiere pedir lo que falta para volver a la cantidad de referencia.
 */
export function sugerirSolicitud(productoIds = [], { inventario = [], productos = [] } = {}) {
  const porProducto = new Map(inventario.map((i) => [i.productoId, i]));
  const catalogo = new Map(productos.map((p) => [p.id, p]));
  return productoIds
    .filter((id) => catalogo.has(id))
    .map((id) => {
      const producto = catalogo.get(id);
      const stock = porProducto.get(id);
      const faltante = stock ? Math.max(0, Number(stock.cantidadReferencia) - Number(stock.cantidadActual)) : 0;
      return {
        categoriaId: producto.categoriaId,
        productoId: id,
        marcaId: '',
        cantidad: faltante > 0 ? String(Math.round(faltante * 1000) / 1000) : '',
      };
    });
}

/** Valida las filas de la solicitud antes de enviarla; devuelve errores por fila. */
export function validarSolicitud(filas) {
  const errores = filas.map(() => ({}));
  const vistos = new Map();
  filas.forEach((fila, i) => {
    if (!fila.categoriaId) errores[i].categoriaId = 'Elija la categoría.';
    if (!fila.productoId) errores[i].productoId = 'Elija el producto.';
    const cantidad = Number(fila.cantidad);
    if (!fila.cantidad || !Number.isFinite(cantidad) || cantidad <= 0) errores[i].cantidad = 'Escriba una cantidad mayor que 0.';
    else if (cantidad > 99_999_999) errores[i].cantidad = 'La cantidad es demasiado grande.';
    const clave = `${fila.productoId}|${fila.marcaId || ''}`;
    if (fila.productoId && vistos.has(clave)) errores[i].productoId = `Repetido con la fila ${vistos.get(clave) + 1}: sume las cantidades en una sola.`;
    else vistos.set(clave, i);
  });
  return { errores, valido: errores.every((e) => Object.keys(e).length === 0) };
}
