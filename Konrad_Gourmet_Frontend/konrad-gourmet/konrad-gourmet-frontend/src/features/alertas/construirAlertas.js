import { formatearNumero } from '../../shared/lib/formato.js';

export const TIPOS_NOTIFICACION = Object.freeze({
  ALARMA_STOCK: { etiqueta: 'Alarma de stock', icono: 'alerta' },
  CONFIRMACION_SOLICITUD: { etiqueta: 'Solicitud confirmada', icono: 'check' },
  PROMOCION: { etiqueta: 'Promoción', icono: 'etiqueta' },
});

/** Primera línea del mensaje que aporte algo distinto al asunto, recortada. */
export function resumenMensaje(mensaje = '', asunto = '', maximo = 140) {
  const linea = mensaje
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && l !== asunto && l !== l.toUpperCase());
  if (!linea) return '';
  return linea.length > maximo ? `${linea.slice(0, maximo - 1)}…` : linea;
}

/**
 * Arma la lista de alertas flotantes a partir de lo que devuelve la API.
 * - Las alarmas de stock activas (Jefe de Cocina) se muestran siempre, hasta descartarlas:
 *   son críticas y la API no las empuja en tiempo real.
 * - Las notificaciones se muestran solo si llegaron después de abrir la sesión
 *   (`base` son las que ya existían) y no se descartaron.
 * - Al Jefe de Cocina no se le repite como notificación una alarma que ya ve como alarma.
 */
export function construirAlertas({ notificaciones = [], alarmas = [], base = new Set(), descartadas = new Set(), rol }) {
  const lista = [];

  for (const alarma of alarmas) {
    const id = `alarma:${alarma.id}`;
    if (descartadas.has(id)) continue;
    const porcentaje = alarma.cantidadReferencia > 0 ? Math.round((alarma.cantidadActual / alarma.cantidadReferencia) * 100) : 0;
    lista.push({
      id,
      tipo: 'ALARMA_STOCK',
      categoria: 'Stock bajo',
      icono: 'alerta',
      titulo: `${alarma.producto}: quedan ${formatearNumero(alarma.cantidadActual)} ${alarma.unidad}`,
      detalle: `Es el ${porcentaje} % de la cantidad de referencia (${formatearNumero(alarma.cantidadReferencia)} ${alarma.unidad}).`,
      fecha: alarma.generadaEn,
      destino: '/cocina/inventario',
      textoDestino: 'Ver inventario',
    });
  }

  for (const n of notificaciones) {
    const id = `notificacion:${n.id}`;
    if (base.has(id) || descartadas.has(id)) continue;
    if (rol === 'JEFE_COCINA' && n.tipo === 'ALARMA_STOCK') continue;
    const tipo = TIPOS_NOTIFICACION[n.tipo] ?? { etiqueta: 'Notificación', icono: 'info' };
    lista.push({
      id,
      tipo: n.tipo,
      categoria: tipo.etiqueta,
      icono: tipo.icono,
      titulo: n.asunto,
      detalle: resumenMensaje(n.mensaje, n.asunto),
      fecha: n.creadaEn,
      destino: `/notificaciones?tipo=${n.tipo}`,
      textoDestino: 'Ver detalle',
    });
  }

  return lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}
