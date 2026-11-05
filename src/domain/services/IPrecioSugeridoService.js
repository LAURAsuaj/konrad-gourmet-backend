/**
 * Contrato (Adapter, interfaz objetivo) para obtener el precio sugerido
 * estandarizado por producto (CU-10). El dominio depende de esta interfaz,
 * nunca del servicio concreto del Ministerio de Comercio.
 */
export const MOTIVOS_SIN_PRECIO = Object.freeze({
  SIN_PRECIO: 'SIN_PRECIO', // el servicio no devolvió valor para el producto (CU-10 EXCEP-2)
  VALOR_INVALIDO: 'VALOR_INVALIDO', // el valor devuelto no es numérico o es <= 0 (CU-10 EXCEP-3)
  SERVICIO_NO_DISPONIBLE: 'SERVICIO_NO_DISPONIBLE', // falla temporal: se reintenta después (CU-10 EXCEP-1)
});

export class IPrecioSugeridoService {
  /**
   * Consulta el precio sugerido unitario de cada producto.
   *
   * @param {{id: string, nombre: string, unidad?: string}[]} productos
   * @returns {Promise<{productoId: string, precioSugerido: number|null, motivo: string|null}[]>}
   *          un resultado por producto, en el mismo orden. `precioSugerido` es un
   *          número > 0 o null (con `motivo` de MOTIVOS_SIN_PRECIO).
   * @throws {ServicioExternoError} si el servicio no puede consultarse en absoluto
   */
  // eslint-disable-next-line no-unused-vars
  async consultarPrecios(productos) {
    throw new Error(`${this.constructor.name} debe implementar consultarPrecios()`);
  }
}
