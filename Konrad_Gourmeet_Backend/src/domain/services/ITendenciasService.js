/**
 * Contrato (Adapter, interfaz objetivo) para consultar las tendencias de
 * consumo en redes sociales (CU-15).
 */
export class ITendenciasService {
  /**
   * @param {{limite?: number}} [opciones]
   * @returns {Promise<{termino: string, fuente: string, puntaje: number}[]>}
   *          ordenadas de mayor a menor puntaje y sin términos repetidos
   * @throws {ServicioExternoError} si la API no está disponible
   */
  // eslint-disable-next-line no-unused-vars
  async obtenerTendencias(opciones) {
    throw new Error(`${this.constructor.name} debe implementar obtenerTendencias()`);
  }
}
