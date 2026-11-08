/** Los 6 roles del sistema, con los nombres exactos del backend (src/domain/modules/auth/roles.js). */
export const ROLES = Object.freeze({
  ADMINISTRADOR: 'ADMINISTRADOR',
  JEFE_COCINA: 'JEFE_COCINA',
  MESERO: 'MESERO',
  AUXILIAR_COMPRAS: 'AUXILIAR_COMPRAS',
  DIRECTOR_COMPRAS: 'DIRECTOR_COMPRAS',
  DIRECTOR_COMERCIAL: 'DIRECTOR_COMERCIAL',
});

export const ETIQUETAS_ROL = Object.freeze({
  ADMINISTRADOR: 'Administrador',
  JEFE_COCINA: 'Jefe de cocina',
  MESERO: 'Mesero',
  AUXILIAR_COMPRAS: 'Auxiliar de compras',
  DIRECTOR_COMPRAS: 'Director de compras',
  DIRECTOR_COMERCIAL: 'Director comercial',
});

/** Roles que operan sobre un punto (restaurante) y lo traen en la sesión. */
export const ROLES_CON_PUNTO = Object.freeze([ROLES.JEFE_COCINA, ROLES.MESERO]);
