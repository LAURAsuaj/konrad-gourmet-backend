/**
 * Producto del patrón Factory Method (SAD 5.2.2): Notificacion y sus tres
 * productos concretos. Una notificación describe QUÉ se comunica y a QUIÉN;
 * el envío por correo lo hace ICorreoService (CorreoAdapter).
 */

export const TIPOS_NOTIFICACION = Object.freeze({
  CONFIRMACION_SOLICITUD: 'CONFIRMACION_SOLICITUD',
  ALARMA_STOCK: 'ALARMA_STOCK',
  PROMOCION: 'PROMOCION',
});

export const ESTADOS_NOTIFICACION = Object.freeze({
  CREADA: 'CREADA',
  ENVIADA: 'ENVIADA',
  FALLIDA: 'FALLIDA',
});

const ZONA_HORARIA = 'America/Bogota';

export function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatearNumero(valor) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(Number(valor));
}

export function formatearFecha(fecha) {
  return new Date(fecha).toLocaleString('es-CO', { timeZone: ZONA_HORARIA, dateStyle: 'medium', timeStyle: 'short' });
}

export class Notificacion {
  /**
   * @param {{
   *   tipo: string,
   *   destinatario: {usuarioId?: string, nombre?: string, correo?: string},
   *   asunto: string,
   *   cuerpo: string,
   *   cuerpoHtml?: string,
   *   referencia?: object,
   *   fecha?: Date
   * }} datos
   */
  constructor({ tipo, destinatario, asunto, cuerpo, cuerpoHtml = null, referencia = {}, fecha = new Date() }) {
    if (new.target === Notificacion) {
      throw new TypeError('Notificacion es abstracta: use NotificacionConfirmacion, NotificacionAlarmaStock o NotificacionPromocion');
    }
    if (!Object.values(TIPOS_NOTIFICACION).includes(tipo)) {
      throw new Error(`Tipo de notificación desconocido: ${tipo}`);
    }
    if (!destinatario || typeof destinatario !== 'object') {
      throw new Error('La notificación requiere un destinatario');
    }
    if (!asunto || !cuerpo) {
      throw new Error('La notificación requiere asunto y cuerpo');
    }
    this.tipo = tipo;
    this.destinatario = { ...destinatario };
    this.asunto = asunto;
    this.cuerpo = cuerpo;
    this.cuerpoHtml = cuerpoHtml;
    this.referencia = referencia;
    this.fecha = fecha;
    this.estado = ESTADOS_NOTIFICACION.CREADA;
    this.fechaEnvio = null;
  }

  /** Indica si el destinatario tiene un correo al cual enviar. */
  tieneCorreo() {
    return typeof this.destinatario.correo === 'string' && this.destinatario.correo.trim() !== '';
  }

  /** Estructura lista para ICorreoService.enviarCorreo(). */
  aCorreo() {
    return {
      para: this.destinatario.correo,
      asunto: this.asunto,
      texto: this.cuerpo,
      html: this.cuerpoHtml ?? undefined,
    };
  }

  marcarEnviada() {
    this.estado = ESTADOS_NOTIFICACION.ENVIADA;
    this.fechaEnvio = new Date();
  }

  marcarFallida() {
    this.estado = ESTADOS_NOTIFICACION.FALLIDA;
  }
}

export class NotificacionConfirmacion extends Notificacion {
  constructor(datos) {
    super({ ...datos, tipo: TIPOS_NOTIFICACION.CONFIRMACION_SOLICITUD });
  }
}

export class NotificacionAlarmaStock extends Notificacion {
  constructor(datos) {
    super({ ...datos, tipo: TIPOS_NOTIFICACION.ALARMA_STOCK });
  }
}

export class NotificacionPromocion extends Notificacion {
  constructor(datos) {
    super({ ...datos, tipo: TIPOS_NOTIFICACION.PROMOCION });
  }
}
