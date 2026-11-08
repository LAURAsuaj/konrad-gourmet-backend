/**
 * Creador concreto: alarma de stock bajo (CU-07). El contenido incluye el
 * producto, la cantidad actual y el punto afectado.
 */
import { NotificacionFactory } from '../NotificacionFactory.js';
import { NotificacionAlarmaStock, escaparHtml, formatearFecha, formatearNumero } from '../Notificacion.js';

export class AlarmaStockCreator extends NotificacionFactory {
  /**
   * @param {{
   *   producto: {id?: string, nombre: string, unidad: string},
   *   cantidadActual: number,
   *   cantidadReferencia: number,
   *   punto: {id?: string, nombre: string},
   *   destinatario: {id?: string, nombre?: string, correo?: string},
   *   alarmaId?: string,
   *   fecha?: Date|string
   * }} datos
   */
  crearNotificacion({ producto, cantidadActual, cantidadReferencia, punto, destinatario, alarmaId, fecha }) {
    this.exigir(producto?.nombre, 'La alarma requiere el producto');
    this.exigir(punto?.nombre, 'La alarma requiere el punto afectado');
    this.exigir(destinatario, 'La alarma requiere un destinatario');
    this.exigir(Number.isFinite(Number(cantidadActual)) && Number(cantidadActual) >= 0, 'La cantidad actual no es válida');
    this.exigir(Number.isFinite(Number(cantidadReferencia)) && Number(cantidadReferencia) > 0, 'La cantidad de referencia no es válida');

    const porcentaje = Math.round((Number(cantidadActual) / Number(cantidadReferencia)) * 1000) / 10;
    const unidad = producto.unidad ?? '';
    const cuando = formatearFecha(fecha ?? new Date());
    const actual = `${formatearNumero(cantidadActual)} ${unidad}`.trim();
    const referencia = `${formatearNumero(cantidadReferencia)} ${unidad}`.trim();

    const cuerpo = [
      'ALARMA DE STOCK BAJO',
      '',
      `Producto: ${producto.nombre}`,
      `Cantidad actual: ${actual} (${formatearNumero(porcentaje)} % de la cantidad de referencia)`,
      `Cantidad de referencia: ${referencia}`,
      `Punto afectado: ${punto.nombre}`,
      `Generada: ${cuando}`,
      '',
      'Se recomienda registrar una solicitud de alimentos para reabastecer el punto.',
      '',
      'Konrad Gourmet',
    ].join('\n');

    const cuerpoHtml =
      '<h3>Alarma de stock bajo</h3><ul>' +
      `<li><strong>Producto:</strong> ${escaparHtml(producto.nombre)}</li>` +
      `<li><strong>Cantidad actual:</strong> ${escaparHtml(actual)} (${escaparHtml(formatearNumero(porcentaje))} % de la referencia)</li>` +
      `<li><strong>Cantidad de referencia:</strong> ${escaparHtml(referencia)}</li>` +
      `<li><strong>Punto afectado:</strong> ${escaparHtml(punto.nombre)}</li>` +
      `<li><strong>Generada:</strong> ${escaparHtml(cuando)}</li></ul>` +
      '<p>Se recomienda registrar una solicitud de alimentos para reabastecer el punto.</p><p>Konrad Gourmet</p>';

    return new NotificacionAlarmaStock({
      destinatario: { usuarioId: destinatario.id, nombre: destinatario.nombre, correo: destinatario.correo },
      asunto: `Alarma de stock bajo: ${producto.nombre} en ${punto.nombre}`,
      cuerpo,
      cuerpoHtml,
      referencia: {
        alarmaId: alarmaId ?? null,
        productoId: producto.id ?? null,
        puntoId: punto.id ?? null,
        cantidadActual: Number(cantidadActual),
        cantidadReferencia: Number(cantidadReferencia),
      },
    });
  }
}
