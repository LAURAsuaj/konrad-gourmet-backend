/**
 * Error normalizado de cualquier servicio externo (Ministerio de Comercio,
 * correo o redes sociales). Los adaptadores traducen sus fallos a este tipo
 * para que el dominio los trate en un solo lugar (SAD 5.2.3): registrar en el
 * log y continuar, o reintentar si `reintentable` es verdadero.
 */
export const CODIGOS_ERROR_SERVICIO = Object.freeze({
  CONFIGURACION: 'CONFIGURACION',
  DATOS_INVALIDOS: 'DATOS_INVALIDOS',
  TIMEOUT: 'TIMEOUT',
  RED: 'RED',
  HTTP: 'HTTP',
  RESPUESTA_INVALIDA: 'RESPUESTA_INVALIDA',
  ENVIO: 'ENVIO',
});

export class ServicioExternoError extends Error {
  /**
   * @param {string} servicio nombre lógico del servicio (p. ej. 'ministerio_comercio')
   * @param {string} codigo uno de CODIGOS_ERROR_SERVICIO
   * @param {string} mensaje
   * @param {{estado?: number, causa?: Error}} [extra]
   */
  constructor(servicio, codigo, mensaje, { estado = null, causa = null } = {}) {
    super(mensaje, causa ? { cause: causa } : undefined);
    this.name = 'ServicioExternoError';
    this.servicio = servicio;
    this.codigo = codigo;
    this.estado = estado;
  }

  /** Indica si tiene sentido reintentar la operación más tarde. */
  get reintentable() {
    if (this.codigo === CODIGOS_ERROR_SERVICIO.HTTP) {
      return this.estado === 429 || (this.estado !== null && this.estado >= 500);
    }
    return [
      CODIGOS_ERROR_SERVICIO.TIMEOUT,
      CODIGOS_ERROR_SERVICIO.RED,
      CODIGOS_ERROR_SERVICIO.ENVIO,
    ].includes(this.codigo);
  }
}
