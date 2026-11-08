/**
 * Creador concreto: confirmación de solicitud de alimentos al Jefe de Cocina (CU-05).
 */
import { NotificacionFactory } from '../NotificacionFactory.js';
import { NotificacionConfirmacion, escaparHtml, formatearFecha, formatearNumero } from '../Notificacion.js';

export class ConfirmacionSolicitudCreator extends NotificacionFactory {
  /**
   * @param {{
   *   solicitud: {id: string, consecutivo: number|string, estado: string, fecha: Date|string},
   *   solicitante: {id?: string, nombre: string, correo: string},
   *   punto: {nombre: string},
   *   items: {producto: string, cantidad: number, unidad: string, marca?: string|null}[]
   * }} datos
   */
  crearNotificacion({ solicitud, solicitante, punto, items }) {
    this.exigir(solicitud?.consecutivo !== undefined && solicitud?.consecutivo !== null, 'La solicitud requiere consecutivo');
    this.exigir(solicitante?.nombre, 'La confirmación requiere el nombre del solicitante');
    this.exigir(punto?.nombre, 'La confirmación requiere el punto');
    this.exigir(Array.isArray(items) && items.length > 0, 'La confirmación requiere al menos un alimento');

    const fecha = formatearFecha(solicitud.fecha ?? new Date());
    const lineas = items.map((i) => {
      const marca = i.marca ? ` (marca: ${i.marca})` : '';
      return `- ${i.producto}: ${formatearNumero(i.cantidad)} ${i.unidad}${marca}`;
    });

    const cuerpo = [
      `Hola ${solicitante.nombre},`,
      '',
      `Su solicitud de alimentos N.º ${solicitud.consecutivo} fue registrada el ${fecha} con estado ${solicitud.estado}.`,
      `Punto: ${punto.nombre}`,
      '',
      'Alimentos solicitados:',
      ...lineas,
      '',
      'El área de compras la tramitará y el estado cambiará a EN TRÁMITE cuando todos los alimentos tengan cotización.',
      '',
      'Konrad Gourmet',
    ].join('\n');

    const itemsHtml = items
      .map((i) => {
        const marca = i.marca ? ` <em>(marca: ${escaparHtml(i.marca)})</em>` : '';
        return `<li>${escaparHtml(i.producto)}: ${escaparHtml(formatearNumero(i.cantidad))} ${escaparHtml(i.unidad)}${marca}</li>`;
      })
      .join('');
    const cuerpoHtml =
      `<p>Hola ${escaparHtml(solicitante.nombre)},</p>` +
      `<p>Su solicitud de alimentos <strong>N.º ${escaparHtml(solicitud.consecutivo)}</strong> fue registrada el ${escaparHtml(fecha)} ` +
      `con estado <strong>${escaparHtml(solicitud.estado)}</strong>.<br>Punto: ${escaparHtml(punto.nombre)}</p>` +
      `<p>Alimentos solicitados:</p><ul>${itemsHtml}</ul>` +
      '<p>El área de compras la tramitará y el estado cambiará a EN TRÁMITE cuando todos los alimentos tengan cotización.</p>' +
      '<p>Konrad Gourmet</p>';

    return new NotificacionConfirmacion({
      destinatario: { usuarioId: solicitante.id, nombre: solicitante.nombre, correo: solicitante.correo },
      asunto: `Solicitud de alimentos N.º ${solicitud.consecutivo} registrada`,
      cuerpo,
      cuerpoHtml,
      referencia: { solicitudId: solicitud.id, consecutivo: solicitud.consecutivo },
    });
  }
}
