/**
 * Cifrado de contraseñas con bcrypt (SRS 5.1).
 *
 * Usa el módulo nativo `bcrypt`, que calcula el hash en el grupo de hilos de Node y
 * no detiene el servidor mientras tanto (la versión en JavaScript puro, `bcryptjs`,
 * lo congelaba durante cientos de milisegundos por cada inicio de sesión). Los hashes
 * generados antes con bcryptjs siguen siendo válidos: es el mismo formato.
 *
 * Límite de concurrencia: calcular un hash consume un procesador completo durante
 * cientos de milisegundos. Sin un tope, una ráfaga de inicios de sesión acapara todos
 * los procesadores y deja sin tiempo al servidor y a la conexión con la base de datos
 * (en un servidor de 2 procesadores provocó errores "connection timeout"). Por eso solo
 * se calculan a la vez tantos hashes como procesadores menos uno; el resto espera en cola.
 */
import os from 'node:os';
import bcrypt from 'bcrypt';

const MAXIMO_HILOS_DE_NODE = 4; // tamaño por defecto del grupo de hilos de libuv

/** Procesadores disponibles menos uno (siempre queda uno libre), entre 1 y 4. */
export function concurrenciaPorDefecto(procesadores = os.availableParallelism?.() ?? os.cpus().length) {
  return Math.min(MAXIMO_HILOS_DE_NODE, Math.max(1, procesadores - 1));
}

/**
 * Crea una función que ejecuta tareas asíncronas con un máximo de `maximo` a la vez.
 * Las demás esperan en una cola (orden de llegada). Una tarea que falla libera su cupo.
 */
export function crearLimitadorDeConcurrencia(maximo) {
  if (!Number.isInteger(maximo) || maximo < 1) {
    throw new Error('El límite de concurrencia debe ser un entero mayor o igual a 1');
  }
  let activos = 0;
  const cola = [];

  return async function limitar(tarea) {
    if (activos >= maximo) {
      await new Promise((resolver) => cola.push(resolver)); // al despertar, el cupo ya está reservado
    } else {
      activos += 1;
    }
    try {
      return await tarea();
    } finally {
      const siguiente = cola.shift();
      if (siguiente) siguiente(); // el cupo pasa directamente al siguiente en la cola
      else activos -= 1;
    }
  };
}

export class PasswordHasher {
  #rondas;
  #limitar;

  /** @param {{rondas?: number, concurrencia?: number}} [opciones] */
  constructor({ rondas = 12, concurrencia = concurrenciaPorDefecto() } = {}) {
    if (!Number.isInteger(rondas) || rondas < 10 || rondas > 15) {
      throw new Error('Las rondas de bcrypt deben ser un entero entre 10 y 15');
    }
    this.#rondas = rondas;
    this.#limitar = crearLimitadorDeConcurrencia(concurrencia);
  }

  hash(texto) {
    return this.#limitar(() => bcrypt.hash(texto, this.#rondas));
  }

  comparar(texto, hash) {
    return this.#limitar(() => bcrypt.compare(texto, hash));
  }
}
