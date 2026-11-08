/**
 * Reglas de contraseña del enunciado, idénticas a las del backend
 * (AuthService#validarPassword): mínimo 8 caracteres, al menos una mayúscula, una
 * minúscula y un número, y máximo 72 bytes. La API vuelve a validarlas: aquí solo
 * sirven para guiar al usuario mientras escribe.
 */
const bytes = (texto) => new TextEncoder().encode(texto).length;

export const REGLAS_PASSWORD = Object.freeze([
  { id: 'longitud', texto: 'Al menos 8 caracteres', cumple: (p) => p.length >= 8 },
  { id: 'mayuscula', texto: 'Una letra mayúscula', cumple: (p) => /\p{Lu}/u.test(p) },
  { id: 'minuscula', texto: 'Una letra minúscula', cumple: (p) => /\p{Ll}/u.test(p) },
  { id: 'numero', texto: 'Un número', cumple: (p) => /\d/.test(p) },
  { id: 'maximo', texto: 'No más de 72 bytes', cumple: (p) => bytes(p) <= 72 },
]);

export function evaluarPassword(password = '') {
  return REGLAS_PASSWORD.map((regla) => ({ id: regla.id, texto: regla.texto, cumple: regla.cumple(password) }));
}

export function passwordValida(password = '') {
  return evaluarPassword(password).every((r) => r.cumple);
}
