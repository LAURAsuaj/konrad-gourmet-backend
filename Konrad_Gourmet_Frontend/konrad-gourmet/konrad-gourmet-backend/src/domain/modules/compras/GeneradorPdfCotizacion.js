/** Genera el PDF de la solicitud de cotización que se envía al proveedor (CU-09). */
import PDFDocument from 'pdfkit';
import { formatearFecha, formatearNumero } from '../../factories/Notificacion.js';

const COLUMNAS = [
  { titulo: 'Alimento', x: 50, ancho: 170 },
  { titulo: 'Categoría', x: 225, ancho: 110 },
  { titulo: 'Marca', x: 340, ancho: 90 },
  { titulo: 'Cantidad', x: 435, ancho: 55 },
  { titulo: 'Unidad', x: 495, ancho: 50 },
];

export class GeneradorPdfCotizacion {
  /**
   * @param {{consecutivo: number|string, solicitud: {consecutivo: number|string, punto: string},
   *          proveedor: {nombre: string}, plazoMaximo: string,
   *          items: {producto: string, categoria: string, marca?: string|null, cantidad: number, unidad: string}[]}} datos
   * @returns {Promise<Buffer>}
   */
  generar({ consecutivo, solicitud, proveedor, plazoMaximo, items }) {
    return new Promise((resolve, reject) => {
      const documento = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Solicitud de cotización N.º ${consecutivo}` } });
      const partes = [];
      documento.on('data', (parte) => partes.push(parte));
      documento.on('end', () => resolve(Buffer.concat(partes)));
      documento.on('error', reject);

      documento.fontSize(18).text('Konrad Gourmet', { align: 'left' });
      documento.fontSize(14).text(`Solicitud de cotización N.º ${consecutivo}`);
      documento.moveDown(0.5);
      documento.fontSize(10);
      documento.text(`Proveedor: ${proveedor.nombre}`);
      documento.text(`Solicitud de alimentos N.º ${solicitud.consecutivo} - Punto: ${solicitud.punto}`);
      documento.text(`Fecha de emisión: ${formatearFecha(new Date())}`);
      documento.font('Helvetica-Bold').text(`Plazo máximo para recibir su cotización: ${plazoMaximo}`).font('Helvetica');
      documento.moveDown();
      documento.text('Por favor cotice el valor unitario (por la unidad indicada) de los siguientes alimentos y responda por correo electrónico.');
      documento.moveDown();

      let y = documento.y;
      const dibujarEncabezado = () => {
        documento.font('Helvetica-Bold');
        COLUMNAS.forEach((c) => documento.text(c.titulo, c.x, y, { width: c.ancho, lineBreak: false }));
        documento.font('Helvetica');
        y += 18;
      };
      dibujarEncabezado();

      for (const item of items) {
        if (y > 760) {
          documento.addPage();
          y = 50;
          dibujarEncabezado();
        }
        const fila = [item.producto, item.categoria, item.marca ?? '-', formatearNumero(item.cantidad), item.unidad];
        COLUMNAS.forEach((c, i) => documento.text(String(fila[i]), c.x, y, { width: c.ancho, lineBreak: false, ellipsis: true }));
        y += 16;
      }
      documento.end();
    });
  }
}
