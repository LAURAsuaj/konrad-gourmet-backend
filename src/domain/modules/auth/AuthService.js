/**
 * Módulo Autenticación y Roles (CU-01).
 *
 * - Valida credenciales con contraseñas cifradas (bcrypt) y emite el JWT con el rol.
 * - Bloquea la cuenta tras los intentos fallidos parametrizados (3 por defecto).
 * - Nunca indica cuál dato es incorrecto (SRS 3.1.2). Para no revelar qué
 *   correos existen: un usuario inexistente consume el mismo tiempo de cálculo
 *   y solo se informa el bloqueo en el intento que lo provoca o cuando la
 *   contraseña es correcta.
 * - La auditoría de accesos (exitosos y fallidos) la registra la fachada.
 */
import { randomUUID } from 'node:crypto';
import { ROLES, ROLES_CON_PUNTO, esRolValido, exigirRol } from './roles.js';
import {
  ErrorConflicto,
  ErrorCredencialesInvalidas,
  ErrorCuentaBloqueada,
  ErrorNoAutenticado,
  ErrorNoEncontrado,
  ErrorValidacion,
  traducirErrorPersistencia,
} from '../../errors/ErroresDeNegocio.js';
import { exigirCorreo, exigirObjeto, exigirTexto, exigirUuid, esUuid } from '../../validacion.js';

export class AuthService {
  #db;
  #usuarios;
  #parametros;
  #hasher;
  #tokens;
  #hashFicticio = null;

  /**
   * @param {{db: object, usuarios: UsuarioRepository, parametros: ParametroRepository,
   *          hasher: PasswordHasher, tokens: TokenService}} dependencias
   */
  constructor({ db, usuarios, parametros, hasher, tokens }) {
    this.#db = db;
    this.#usuarios = usuarios;
    this.#parametros = parametros;
    this.#hasher = hasher;
    this.#tokens = tokens;
  }

  /** @returns {Promise<{token: string, usuario: object}>} */
  async autenticar({ correo, password } = {}) {
    if (typeof correo !== 'string' || typeof password !== 'string' || !correo.trim() || !password) {
      throw new ErrorCredencialesInvalidas();
    }

    const usuario = await this.#usuarios.buscarPorCorreo(correo.trim(), this.#db);
    if (!usuario || !usuario.activo) {
      await this.#hasher.comparar(password, await this.#obtenerHashFicticio());
      throw new ErrorCredencialesInvalidas();
    }

    const coincide = await this.#hasher.comparar(password, usuario.password_hash);
    if (!coincide) {
      if (usuario.bloqueado) throw new ErrorCredencialesInvalidas({ usuarioId: usuario.id });
      const maximo = await this.#parametros.obtenerNumero('max_intentos_login', this.#db, 3);
      const estado = await this.#usuarios.registrarFallo(usuario.id, maximo, this.#db);
      if (estado.bloqueado) throw new ErrorCuentaBloqueada({ usuarioId: usuario.id });
      throw new ErrorCredencialesInvalidas({ usuarioId: usuario.id });
    }

    if (usuario.bloqueado) throw new ErrorCuentaBloqueada({ usuarioId: usuario.id });
    if (usuario.intentos_fallidos > 0) await this.#usuarios.reiniciarIntentos(usuario.id, this.#db);

    const sesion = {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      puntoId: usuario.punto_id,
    };
    return { token: this.#tokens.emitir(sesion), usuario: sesion };
  }

  /**
   * Renueva el token mientras el usuario esté activo (CU-01: la sesión expira por inactividad).
   * Se rechaza si la cuenta ya no existe, se inactivó o se bloqueó, o si la sesión llegó a su
   * duración máxima. El nuevo token lleva el rol y el punto vigentes en la base de datos.
   * @param {{id: string, inicioSesion: number}} actor resultado de verificarToken()
   */
  async renovarSesion(actor) {
    if (!actor?.id) throw new ErrorNoAutenticado();
    if (this.#tokens.sesionAgotada(actor.inicioSesion)) {
      throw new ErrorNoAutenticado('La sesión alcanzó su duración máxima; inicie sesión nuevamente');
    }
    const usuario = await this.#usuarios.buscarPorId(actor.id, this.#db);
    if (!usuario || !usuario.activo || usuario.bloqueado) {
      throw new ErrorNoAutenticado('La sesión ya no es válida; inicie sesión nuevamente');
    }
    const sesion = { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol, puntoId: usuario.punto_id };
    return { token: this.#tokens.emitir({ ...sesion, inicioSesion: actor.inicioSesion }), usuario: sesion };
  }

  /** Verifica el token y devuelve el actor (usado por el middleware de la fachada). */
  verificarToken(token) {
    return this.#tokens.verificar(token);
  }

  /** Alta de cuentas y asignación de rol: solo el Administrador (SRS 3.1.1). */
  async crearUsuario(actor, datos) {
    exigirRol(actor, [ROLES.ADMINISTRADOR]);
    exigirObjeto(datos, 'Los datos del usuario');

    const nombre = exigirTexto(datos.nombre, 'El nombre', { max: 120 });
    const correo = exigirCorreo(datos.correo);
    const password = this.#validarPassword(datos.password);
    if (!esRolValido(datos.rol)) throw new ErrorValidacion('El rol indicado no es válido');

    let puntoId = null;
    if (ROLES_CON_PUNTO.includes(datos.rol)) {
      puntoId = exigirUuid(datos.puntoId, 'El punto');
      if (!(await this.#usuarios.puntoActivoExiste(puntoId, this.#db))) {
        throw new ErrorValidacion('El punto indicado no existe o está inactivo');
      }
    } else if (datos.puntoId !== undefined && datos.puntoId !== null) {
      throw new ErrorValidacion('Este rol no se asocia a un punto');
    }

    const passwordHash = await this.#hasher.hash(password);
    try {
      return this.#presentar(
        await this.#usuarios.crear({ nombre, correo, passwordHash, rol: datos.rol, puntoId }, this.#db)
      );
    } catch (error) {
      throw traducirErrorPersistencia(error, { unico: 'Ya existe un usuario con ese correo' });
    }
  }

  /**
   * Alta del PRIMER Administrador (arranque del sistema). Solo funciona mientras
   * no exista ningún Administrador; después las cuentas las crea el Administrador.
   */
  async crearAdministradorInicial(datos) {
    exigirObjeto(datos, 'Los datos del administrador');
    if (await this.#usuarios.existeAdministrador(this.#db)) {
      throw new ErrorConflicto('Ya existe un Administrador; las demás cuentas se crean desde la gestión de usuarios');
    }
    return this.crearUsuario({ rol: ROLES.ADMINISTRADOR }, { ...datos, rol: ROLES.ADMINISTRADOR });
  }

  /** Habilita una cuenta bloqueada por intentos fallidos (CU-01 EXCEP-2). */
  async desbloquearUsuario(actor, usuarioId) {
    exigirRol(actor, [ROLES.ADMINISTRADOR]);
    if (!esUuid(usuarioId)) throw new ErrorValidacion('El usuario no es un identificador válido');
    const usuario = await this.#usuarios.desbloquear(usuarioId, this.#db);
    if (!usuario) throw new ErrorNoEncontrado('El usuario no existe');
    return this.#presentar(usuario);
  }

  /**
   * El propio usuario cambia su contraseña. Exige la actual: un token robado no basta. Una contraseña
   * actual incorrecta cuenta como intento fallido y, al llegar al máximo, bloquea la cuenta.
   * Los tokens ya emitidos siguen vigentes hasta vencer (la sesión no tiene estado en el servidor).
   */
  async cambiarPassword(actor, { passwordActual, passwordNueva } = {}) {
    if (!actor?.id) throw new ErrorNoAutenticado();
    if (typeof passwordActual !== 'string' || !passwordActual) throw new ErrorValidacion('Debe indicar la contraseña actual');
    this.#validarPassword(passwordNueva);

    const cuenta = await this.#usuarios.obtenerCredenciales(actor.id, this.#db);
    if (!cuenta || !cuenta.activo || cuenta.bloqueado) {
      throw new ErrorNoAutenticado('La sesión ya no es válida; inicie sesión nuevamente');
    }
    if (!(await this.#hasher.comparar(passwordActual, cuenta.password_hash))) {
      const maximo = await this.#parametros.obtenerNumero('max_intentos_login', this.#db, 3);
      const estado = await this.#usuarios.registrarFallo(cuenta.id, maximo, this.#db);
      if (estado.bloqueado) throw new ErrorCuentaBloqueada({ usuarioId: cuenta.id });
      throw new ErrorValidacion('La contraseña actual no es correcta');
    }
    if (passwordNueva === passwordActual) throw new ErrorValidacion('La contraseña nueva debe ser distinta de la actual');

    await this.#usuarios.actualizarPassword(cuenta.id, await this.#hasher.hash(passwordNueva), this.#db);
    return { id: cuenta.id, cambiada: true };
  }

  /** El Administrador fija una contraseña nueva a otro usuario (olvido) y habilita su cuenta si estaba bloqueada. */
  async restablecerPassword(actor, { id, passwordNueva } = {}) {
    exigirRol(actor, [ROLES.ADMINISTRADOR]);
    if (!esUuid(id)) throw new ErrorValidacion('El usuario no es un identificador válido');
    this.#validarPassword(passwordNueva);
    const usuario = await this.#usuarios.actualizarPassword(id, await this.#hasher.hash(passwordNueva), this.#db, { desbloquear: true });
    if (!usuario) throw new ErrorNoEncontrado('El usuario no existe');
    return { id: usuario.id, restablecida: true };
  }

  async listarUsuarios(actor) {
    exigirRol(actor, [ROLES.ADMINISTRADOR]);
    return (await this.#usuarios.listar(this.#db)).map((u) => this.#presentar(u));
  }

  #presentar(fila) {
    return {
      id: fila.id,
      nombre: fila.nombre,
      correo: fila.correo,
      rol: fila.rol,
      puntoId: fila.punto_id,
      bloqueado: fila.bloqueado,
      activo: fila.activo,
      creadoEn: fila.creado_en,
    };
  }

  #validarPassword(password) {
    if (typeof password !== 'string' || password.length < 8) {
      throw new ErrorValidacion('La contraseña debe tener al menos 8 caracteres');
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new ErrorValidacion('La contraseña no puede superar 72 bytes');
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new ErrorValidacion('La contraseña debe combinar letras y números');
    }
    return password;
  }

  async #obtenerHashFicticio() {
    this.#hashFicticio ??= await this.#hasher.hash(randomUUID());
    return this.#hashFicticio;
  }
}
