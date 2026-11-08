/**
 * Errores de negocio del dominio. Llevan un `codigo` estable que la capa de
 * presentación traduce a HTTP; el dominio no conoce HTTP.
 */
export class ErrorDeNegocio extends Error {
  constructor(codigo, mensaje, detalle = null) {
    super(mensaje);
    this.name = new.target.name;
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

export class ErrorValidacion extends ErrorDeNegocio {
  constructor(mensaje, detalle) {
    super('VALIDACION', mensaje, detalle);
  }
}

export class ErrorCredencialesInvalidas extends ErrorDeNegocio {
  constructor(detalle) {
    super('CREDENCIALES_INVALIDAS', 'Credenciales inválidas', detalle);
  }
}

export class ErrorCuentaBloqueada extends ErrorDeNegocio {
  constructor(detalle) {
    super('CUENTA_BLOQUEADA', 'La cuenta está bloqueada por intentos fallidos. Contacte al Administrador', detalle);
  }
}

export class ErrorNoAutenticado extends ErrorDeNegocio {
  constructor(mensaje = 'Se requiere iniciar sesión') {
    super('NO_AUTENTICADO', mensaje);
  }
}

export class ErrorProhibido extends ErrorDeNegocio {
  constructor(mensaje = 'No tiene permisos para realizar esta acción') {
    super('PROHIBIDO', mensaje);
  }
}

export class ErrorNoEncontrado extends ErrorDeNegocio {
  constructor(mensaje = 'El recurso solicitado no existe') {
    super('NO_ENCONTRADO', mensaje);
  }
}

export class ErrorConflicto extends ErrorDeNegocio {
  constructor(mensaje = 'El registro ya existe') {
    super('CONFLICTO', mensaje);
  }
}

export class ErrorServicioNoDisponible extends ErrorDeNegocio {
  constructor(mensaje = 'Un servicio externo no está disponible, intente nuevamente', detalle) {
    super('SERVICIO_NO_DISPONIBLE', mensaje, detalle);
  }
}

/**
 * Traduce errores de integridad de PostgreSQL a errores de negocio.
 * Los demás errores se devuelven sin cambios.
 */
export function traducirErrorPersistencia(error, mensajes = {}) {
  if (error instanceof ErrorDeNegocio) return error;
  switch (error?.code) {
    case '23505':
      return new ErrorConflicto(mensajes.unico ?? 'El registro ya existe');
    case '23503':
      return new ErrorValidacion(mensajes.referencia ?? 'Se hace referencia a un registro inexistente');
    case '23502':
    case '23514':
      return new ErrorValidacion(mensajes.restriccion ?? 'Los datos no cumplen las restricciones del sistema');
    case '22P02':
    case '22003':
      return new ErrorValidacion('Un identificador o valor numérico tiene un formato inválido');
    default:
      return error;
  }
}
