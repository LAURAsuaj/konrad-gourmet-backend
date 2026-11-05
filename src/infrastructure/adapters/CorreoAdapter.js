/**
 * Adapter del servicio de correo electrónico (CU-05, CU-07, CU-09, CU-15).
 * Implementa ICorreoService sobre SMTP (nodemailer) exigiendo TLS con la
 * versión mínima configurada (1.3 por defecto, CO-6). También envía el PDF de
 * solicitud de cotización a los proveedores como adjunto.
 *
 * Las credenciales se leen únicamente de config/env.js.
 */
import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { ICorreoService } from '../../domain/services/ICorreoService.js';
import {
  ServicioExternoError,
  CODIGOS_ERROR_SERVICIO as CODIGOS,
} from '../../domain/services/ServicioExternoError.js';

const SERVICIO = 'correo';
const EXPRESION_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CorreoAdapter extends ICorreoService {
  #config;
  #tlsMinVersion;
  #transporter;

  /**
   * @param {{config?: object, tlsMinVersion?: string, transporter?: object}} [opciones]
   *        `transporter` permite inyectar un transporte de nodemailer (pruebas).
   */
  constructor({ config = env.correo, tlsMinVersion = env.tls.minVersion, transporter = null } = {}) {
    super();
    this.#config = config;
    this.#tlsMinVersion = tlsMinVersion;
    this.#transporter = transporter;
  }

  async enviarCorreo({ para, asunto, texto, html, adjuntos = [] } = {}) {
    const destinatarios = this.#validarDestinatarios(para);
    if (typeof asunto !== 'string' || asunto.trim() === '') {
      throw new ServicioExternoError(SERVICIO, CODIGOS.DATOS_INVALIDOS, 'El correo requiere un asunto');
    }
    if (!texto && !html) {
      throw new ServicioExternoError(SERVICIO, CODIGOS.DATOS_INVALIDOS, 'El correo requiere contenido (texto o html)');
    }
    for (const adjunto of adjuntos) {
      if (!adjunto?.nombre || !Buffer.isBuffer(adjunto.contenido)) {
        throw new ServicioExternoError(
          SERVICIO,
          CODIGOS.DATOS_INVALIDOS,
          'Cada adjunto requiere nombre y contenido en un Buffer'
        );
      }
    }

    const transporter = this.#obtenerTransporter();
    let info;
    try {
      info = await transporter.sendMail({
        from: this.#config.remitente,
        to: destinatarios,
        subject: asunto.trim(),
        text: texto,
        html,
        attachments: adjuntos.map((a) => ({
          filename: a.nombre,
          content: a.contenido,
          contentType: a.tipoMime ?? 'application/octet-stream',
        })),
      });
    } catch (error) {
      throw new ServicioExternoError(SERVICIO, CODIGOS.ENVIO, `No se pudo enviar el correo: ${error.message}`, {
        causa: error,
      });
    }

    const aceptados = info.accepted ?? destinatarios;
    const rechazados = info.rejected ?? [];
    if (aceptados.length === 0) {
      throw new ServicioExternoError(SERVICIO, CODIGOS.ENVIO, 'El servidor de correo rechazó a todos los destinatarios');
    }
    return { messageId: info.messageId, aceptados, rechazados };
  }

  /** Cierra las conexiones del transporte (apagado ordenado). */
  cerrar() {
    this.#transporter?.close?.();
  }

  #validarDestinatarios(para) {
    const lista = (Array.isArray(para) ? para : [para]).map((c) => (typeof c === 'string' ? c.trim() : ''));
    if (lista.length === 0 || lista.some((c) => !EXPRESION_CORREO.test(c))) {
      throw new ServicioExternoError(SERVICIO, CODIGOS.DATOS_INVALIDOS, 'El destinatario no tiene un correo válido');
    }
    return lista;
  }

  #obtenerTransporter() {
    if (this.#transporter) return this.#transporter;
    if (!this.#config.host) {
      throw new ServicioExternoError(SERVICIO, CODIGOS.CONFIGURACION, 'Falta SMTP_HOST en la configuración');
    }
    this.#transporter = nodemailer.createTransport({
      host: this.#config.host,
      port: this.#config.port,
      secure: this.#config.secure,
      requireTLS: !this.#config.secure,
      auth: this.#config.user ? { user: this.#config.user, pass: this.#config.pass } : undefined,
      tls: { minVersion: this.#tlsMinVersion },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    return this.#transporter;
  }
}
