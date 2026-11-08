/**
 * Emisión y verificación de tokens JWT (CO-2). Firma HS256 con vencimiento corto:
 * mientras el usuario esté activo el cliente renueva el token (POST /auth/refrescar);
 * si pasa inactivo más del tiempo de vida del token, este vence y se pide iniciar
 * sesión de nuevo (CU-01 EXCEP-4).
 *
 * Cada token lleva `sic` (inicio de la sesión). Las renovaciones lo conservan, de modo
 * que una sesión no se puede renovar indefinidamente: tras la duración máxima
 * (12 horas por defecto) hay que iniciar sesión otra vez.
 */
import jwt from 'jsonwebtoken';
import { ErrorNoAutenticado } from '../../errors/ErroresDeNegocio.js';

const DURACION_MAXIMA_SESION_SEGUNDOS = 12 * 60 * 60;

export class TokenService {
  #secreto;
  #expiraEn;
  #emisor;
  #duracionMaximaSegundos;

  constructor({ secreto, expiraEn = '30m', emisor = 'konrad-gourmet', duracionMaximaSesionSegundos = DURACION_MAXIMA_SESION_SEGUNDOS }) {
    if (typeof secreto !== 'string' || secreto.length < 32) {
      throw new Error('El secreto JWT debe tener al menos 32 caracteres');
    }
    this.#secreto = secreto;
    this.#expiraEn = expiraEn;
    this.#emisor = emisor;
    this.#duracionMaximaSegundos = duracionMaximaSesionSegundos;
  }

  /** @param {{inicioSesion?: number}} datos `inicioSesion` (segundos Unix) se conserva al renovar; por defecto, ahora */
  emitir({ id, correo, nombre, rol, puntoId, inicioSesion }) {
    const inicio = inicioSesion ?? Math.floor(Date.now() / 1000);
    return jwt.sign({ correo, nombre, rol, puntoId: puntoId ?? null, sic: inicio }, this.#secreto, {
      algorithm: 'HS256',
      subject: id,
      expiresIn: this.#expiraEn,
      issuer: this.#emisor,
    });
  }

  /** Indica si la sesión que empezó en `inicioSesion` (segundos Unix) ya no admite más renovaciones. */
  sesionAgotada(inicioSesion) {
    return Math.floor(Date.now() / 1000) - inicioSesion > this.#duracionMaximaSegundos;
  }

  /** @returns {{id, correo, nombre, rol, puntoId, expira, inicioSesion}} @throws {ErrorNoAutenticado} */
  verificar(token) {
    try {
      const datos = jwt.verify(token, this.#secreto, { algorithms: ['HS256'], issuer: this.#emisor });
      return {
        id: datos.sub,
        correo: datos.correo,
        nombre: datos.nombre,
        rol: datos.rol,
        puntoId: datos.puntoId ?? null,
        expira: datos.exp,
        inicioSesion: datos.sic ?? datos.iat,
      };
    } catch (error) {
      throw new ErrorNoAutenticado(
        error.name === 'TokenExpiredError' ? 'La sesión expiró, inicie sesión nuevamente' : 'Token inválido'
      );
    }
  }
}
