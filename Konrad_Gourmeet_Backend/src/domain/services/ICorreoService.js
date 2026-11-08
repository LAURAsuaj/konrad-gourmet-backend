/**
 * Contrato (Adapter, interfaz objetivo) para el envío de correo electrónico:
 * confirmaciones (CU-05), alarmas (CU-07), cotizaciones en PDF a proveedores
 * (CU-09) y promociones (CU-15).
 */
export class ICorreoService {
  /**
   * @param {{
   *   para: string|string[],
   *   asunto: string,
   *   texto?: string,
   *   html?: string,
   *   adjuntos?: {nombre: string, contenido: Buffer, tipoMime?: string}[]
   * }} correo al menos uno de `texto` o `html`
   * @returns {Promise<{messageId: string, aceptados: string[], rechazados: string[]}>}
   * @throws {ServicioExternoError} si el correo no pudo enviarse
   */
  // eslint-disable-next-line no-unused-vars
  async enviarCorreo(correo) {
    throw new Error(`${this.constructor.name} debe implementar enviarCorreo()`);
  }
}
