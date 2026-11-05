/**
 * Patrón Factory Method (SAD 5.2.2) - Creador abstracto.
 *
 * Declara el método de fábrica `crearNotificacion(datos)`, que cada creador
 * concreto implementa para armar su tipo de notificación. Quien la solicita
 * (los manejadores de eventos) usa `crear(datos)` sin conocer la clase
 * concreta ni cómo se arma el contenido. Agregar un nuevo tipo solo requiere
 * un nuevo par producto-creador.
 */
import { Notificacion } from './Notificacion.js';

export class ErrorCreacionNotificacion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorCreacionNotificacion';
  }
}

export class NotificacionFactory {
  constructor() {
    if (new.target === NotificacionFactory) {
      throw new TypeError('NotificacionFactory es abstracta: use un creador concreto');
    }
  }

  /**
   * Método de fábrica: cada creador concreto lo implementa.
   * @abstract
   * @param {object} datos datos propios de cada tipo de notificación
   * @returns {Notificacion}
   */
  // eslint-disable-next-line no-unused-vars
  crearNotificacion(datos) {
    throw new Error(`${this.constructor.name} debe implementar crearNotificacion()`);
  }

  /** Punto de entrada: crea y verifica que el producto sea una Notificacion. */
  crear(datos) {
    const notificacion = this.crearNotificacion(datos);
    if (!(notificacion instanceof Notificacion)) {
      throw new ErrorCreacionNotificacion(`${this.constructor.name} no devolvió una Notificacion`);
    }
    return notificacion;
  }

  /** Utilidad para los creadores: valida un dato obligatorio. */
  exigir(condicion, mensaje) {
    if (!condicion) throw new ErrorCreacionNotificacion(mensaje);
  }
}
