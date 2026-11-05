/** Roles del sistema (SRS 1.2) y utilidades de verificación de permisos. */
import { ErrorProhibido } from '../../errors/ErroresDeNegocio.js';

export const ROLES = Object.freeze({
  JEFE_COCINA: 'JEFE_COCINA',
  MESERO: 'MESERO',
  AUXILIAR_COMPRAS: 'AUXILIAR_COMPRAS',
  DIRECTOR_COMPRAS: 'DIRECTOR_COMPRAS',
  DIRECTOR_COMERCIAL: 'DIRECTOR_COMERCIAL',
  ADMINISTRADOR: 'ADMINISTRADOR',
});

/** Roles que operan dentro de un punto y por tanto deben tenerlo asignado. */
export const ROLES_CON_PUNTO = Object.freeze([ROLES.JEFE_COCINA, ROLES.MESERO]);

export function esRolValido(rol) {
  return Object.values(ROLES).includes(rol);
}

/** Defensa en profundidad: el módulo vuelve a verificar el rol que ya validó la fachada. */
export function exigirRol(actor, rolesPermitidos) {
  if (!actor || !rolesPermitidos.includes(actor.rol)) {
    throw new ErrorProhibido();
  }
}

/** Devuelve el punto del actor o falla si no tiene uno asignado. */
export function exigirPuntoDelActor(actor) {
  if (!actor?.puntoId) throw new ErrorProhibido('El usuario no tiene un punto asignado');
  return actor.puntoId;
}
