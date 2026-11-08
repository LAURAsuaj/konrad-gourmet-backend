/**
 * Fachada del sistema (patrón Facade, SAD 5.2.1).
 *
 * Punto ÚNICO de entrada para los controladores HTTP y para el contenedor cron:
 *   - valida el token y el rol antes de delegar a los módulos del dominio,
 *   - coordina el inicio de sesión (con su auditoría de accesos),
 *   - registra de forma síncrona cada acción CRUD en la tabla de auditoría
 *     (usuario, acción, entidad y fecha) y
 *   - delega en el módulo correspondiente según el catálogo de operaciones.
 *
 * Si la auditoría falla DESPUÉS de que la operación se confirmó, el fallo se
 * registra en el log de errores y se devuelve el resultado: revertir un cambio
 * ya confirmado dejaría al usuario con un estado incierto.
 */
import { ErrorDeNegocio, ErrorProhibido, ErrorServicioNoDisponible } from '../domain/errors/ErroresDeNegocio.js';
import { OPERACIONES, PROCESOS_AUTOMATICOS } from './operaciones.js';

export const ACTOR_SISTEMA = Object.freeze({ id: null, rol: 'SISTEMA', correo: 'sistema', nombre: 'Sistema' });

export class SistemaFacade {
  #m;
  #db;
  #registrador;

  /**
   * @param {{modulos: object, db: object, registrador: {error: Function}}} dependencias
   *        `modulos` agrupa los servicios del dominio (ver container.js)
   */
  constructor({ modulos, db, registrador }) {
    this.#m = modulos;
    this.#db = db;
    this.#registrador = registrador;
  }

  /** @returns {{id, correo, nombre, rol, puntoId, expira}} @throws {ErrorNoAutenticado} */
  autenticarToken(token) {
    return this.#m.auth.verificarToken(token);
  }

  /** Datos de la sesión vigente (sin consultar la base de datos). */
  sesionDe(actor) {
    return { id: actor.id, nombre: actor.nombre, correo: actor.correo, rol: actor.rol, puntoId: actor.puntoId, expira: actor.expira };
  }

  /** CU-01: autentica y audita el acceso (exitoso o fallido). */
  async iniciarSesion(credenciales, contexto = {}) {
    try {
      const sesion = await this.#m.auth.autenticar(credenciales);
      await this.#auditar(sesion.usuario, 'LOGIN_OK', 'sesion', sesion.usuario.id, { ip: contexto.ip ?? null });
      return sesion;
    } catch (error) {
      if (error instanceof ErrorDeNegocio && ['CREDENCIALES_INVALIDAS', 'CUENTA_BLOQUEADA'].includes(error.codigo)) {
        const correo = typeof credenciales?.correo === 'string' ? credenciales.correo.trim().slice(0, 254) : null;
        await this.#auditar({ id: error.detalle?.usuarioId ?? null, correo }, 'LOGIN_FALLIDO', 'sesion', null, {
          ip: contexto.ip ?? null,
          motivo: error.codigo,
        });
      }
      throw error;
    }
  }

  /**
   * Ejecuta una operación del catálogo: valida el rol, delega al módulo y audita.
   * @param {string} nombre clave de OPERACIONES (p. ej. 'solicitudes.registrar')
   * @param {object} actor usuario autenticado (resultado de autenticarToken)
   * @param {object} [datos] cuerpo, parámetros y consulta ya armados por el controlador
   * @param {{ip?: string}} [contexto]
   */
  async ejecutar(nombre, actor, datos = {}, contexto = {}) {
    const operacion = OPERACIONES[nombre];
    if (!operacion) throw new Error(`Operación desconocida: ${nombre}`);

    if (!actor?.rol || !operacion.roles.includes(actor.rol)) {
      await this.registrarAccesoDenegado(actor, nombre, contexto);
      throw new ErrorProhibido();
    }

    const resultado = await operacion.ejecutar({ m: this.#m, actor, datos });

    if (operacion.auditar !== false) {
      const extra = operacion.auditoria?.(resultado, datos) ?? {};
      const entidad = typeof operacion.entidad === 'function' ? operacion.entidad(datos) : operacion.entidad;
      await this.#auditar(actor, operacion.accion, entidad, extra.entidadId ?? null, {
        operacion: nombre,
        ip: contexto.ip ?? null,
        ...(extra.detalle ?? {}),
      });
    }
    return resultado;
  }

  /** Deja constancia de un intento de acceso sin permiso. Nunca lanza. */
  async registrarAccesoDenegado(actor, nombreOperacion, contexto = {}) {
    await this.#auditar(actor ?? {}, 'ACCESO_DENEGADO', 'operacion', nombreOperacion, {
      rol: actor?.rol ?? null,
      ip: contexto.ip ?? null,
    });
  }

  /**
   * Procesos programados del contenedor cron (descuento diario, promociones,
   * reintento de precios). Se ejecutan como SISTEMA y quedan auditados.
   */
  async ejecutarProcesoAutomatico(nombre) {
    const proceso = PROCESOS_AUTOMATICOS[nombre];
    if (!proceso) throw new Error(`Proceso automático desconocido: ${nombre}`);
    try {
      const resultado = await proceso.ejecutar({ m: this.#m });
      await this.#auditar(ACTOR_SISTEMA, 'EJECUCION', proceso.entidad, null, { proceso: nombre, resultado: 'OK', ...proceso.resumen(resultado) });
      return resultado;
    } catch (error) {
      await this.#auditar(ACTOR_SISTEMA, 'EJECUCION', proceso.entidad, null, { proceso: nombre, resultado: 'ERROR', mensaje: String(error.message).slice(0, 300) });
      throw error;
    }
  }

  /** Programación vigente para el cron: hora del descuento diario y reintento de precios. */
  async consultarProgramacion() {
    const hora = await this.#m.parametros.obtener('hora_descuento_diario', this.#db, '02:00');
    const minutos = await this.#m.parametros.obtenerNumero('reintento_precio_sugerido_minutos', this.#db, 30);
    return { horaDescuentoDiario: typeof hora === 'string' ? hora : '02:00', reintentoPreciosMinutos: minutos };
  }

  /** Alta del primer Administrador (arranque); queda auditada. */
  async crearAdministradorInicial(datos, contexto = {}) {
    const usuario = await this.#m.auth.crearAdministradorInicial(datos);
    await this.#auditar({ id: null, correo: 'arranque' }, 'CREATE', 'usuario', usuario.id, {
      operacion: 'usuarios.crearAdministradorInicial',
      ip: contexto.ip ?? null,
      rol: usuario.rol,
    });
    return usuario;
  }

  /** Imagen corporativa para pintar la interfaz (pública: la necesita la pantalla de inicio de sesión). */
  async consultarApariencia() {
    return this.#m.parametrizacion.consultarApariencia();
  }

  async verificarSalud() {
    try {
      await this.#db.query('SELECT 1');
      return { estado: 'ok' };
    } catch {
      throw new ErrorServicioNoDisponible('La base de datos no está disponible');
    }
  }

  async #auditar(actor, accion, entidad, entidadId, detalle) {
    try {
      await this.#m.auditoria.registrar({
        usuarioId: actor.id ?? null,
        correo: actor.correo ?? null,
        accion,
        entidad,
        entidadId,
        detalle,
      });
    } catch (error) {
      await this.#registrador.error({
        modulo: 'fachada',
        mensaje: 'No se pudo registrar la auditoría de una operación',
        detalle: { accion, entidad, entidadId },
        error,
      });
    }
  }
}
