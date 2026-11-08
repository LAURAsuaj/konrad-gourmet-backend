/**
 * Creador concreto: promoción por tendencias para los jefes de cocina (CU-15).
 */
import { NotificacionFactory } from '../NotificacionFactory.js';
import { NotificacionPromocion, escaparHtml } from '../Notificacion.js';

const ETIQUETA_ORIGEN = Object.freeze({
  TENDENCIA: 'una tendencia de consumo en redes sociales',
  MAS_SOLICITADO: 'uno de los productos más solicitados',
  COMBINADA: 'una tendencia en redes sociales que coincide con uno de los productos más solicitados',
});

export class PromocionCreator extends NotificacionFactory {
  /**
   * @param {{
   *   promocion: {id?: string, titulo: string, descripcion: string, origen: string, producto?: string|null},
   *   destinatario: {id?: string, nombre?: string, correo?: string}
   * }} datos
   */
  crearNotificacion({ promocion, destinatario }) {
    this.exigir(promocion?.titulo && promocion?.descripcion, 'La promoción requiere título y descripción');
    this.exigir(destinatario, 'La promoción requiere un destinatario');

    const origen = ETIQUETA_ORIGEN[promocion.origen] ?? ETIQUETA_ORIGEN.MAS_SOLICITADO;
    const saludo = destinatario.nombre ? `Hola ${destinatario.nombre},` : 'Hola,';
    const producto = promocion.producto ? `Producto: ${promocion.producto}` : null;

    const cuerpo = [
      saludo,
      '',
      `Le sugerimos esta promoción para su punto, basada en ${origen}:`,
      '',
      promocion.titulo,
      promocion.descripcion,
      ...(producto ? ['', producto] : []),
      '',
      'Konrad Gourmet',
    ].join('\n');

    const cuerpoHtml =
      `<p>${escaparHtml(saludo)}</p>` +
      `<p>Le sugerimos esta promoción para su punto, basada en ${escaparHtml(origen)}:</p>` +
      `<h3>${escaparHtml(promocion.titulo)}</h3><p>${escaparHtml(promocion.descripcion)}</p>` +
      (producto ? `<p>${escaparHtml(producto)}</p>` : '') +
      '<p>Konrad Gourmet</p>';

    return new NotificacionPromocion({
      destinatario: { usuarioId: destinatario.id, nombre: destinatario.nombre, correo: destinatario.correo },
      asunto: `Promoción sugerida: ${promocion.titulo}`,
      cuerpo,
      cuerpoHtml,
      referencia: { promocionId: promocion.id ?? null, origen: promocion.origen },
    });
  }
}
