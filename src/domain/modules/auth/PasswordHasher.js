/**
 * Cifrado de contraseñas con bcrypt (SRS 5.1).
 *
 * Usa el módulo nativo `bcrypt`, que calcula el hash en el grupo de hilos de Node y
 * no detiene el servidor mientras tanto (la versión en JavaScript puro, `bcryptjs`,
 * lo congelaba durante cientos de milisegundos por cada inicio de sesión). Los hashes
 * generados antes con bcryptjs siguen siendo válidos: es el mismo formato.
 */
import bcrypt from 'bcrypt';

export class PasswordHasher {
  #rondas;

  constructor({ rondas = 12 } = {}) {
    if (!Number.isInteger(rondas) || rondas < 10 || rondas > 15) {
      throw new Error('Las rondas de bcrypt deben ser un entero entre 10 y 15');
    }
    this.#rondas = rondas;
  }

  hash(texto) {
    return bcrypt.hash(texto, this.#rondas);
  }

  comparar(texto, hash) {
    return bcrypt.compare(texto, hash);
  }
}
