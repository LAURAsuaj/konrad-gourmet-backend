/** Utilidades sin dependencia del entorno. */
import net from 'node:net';

export const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** Espera hasta que `condicion()` sea verdadera. @returns {Promise<boolean>} */
export async function esperar(condicion, ms = 20000, paso = 100) {
  const inicio = Date.now();
  while (Date.now() - inicio < ms) {
    if (await condicion()) return true;
    await dormir(paso);
  }
  return false;
}

export function puertoLibre() {
  return new Promise((resolver, rechazar) => {
    const servidor = net.createServer();
    servidor.on('error', rechazar);
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      servidor.close(() => resolver(port));
    });
  });
}

/** Ejecuta `fn` y devuelve el `codigo` del error de negocio (o 'SIN_ERROR'). */
export async function codigoDe(fn) {
  try {
    await fn();
    return 'SIN_ERROR';
  } catch (error) {
    return error.codigo ?? `${error.name}: ${error.message}`;
  }
}

/** Fecha AAAA-MM-DD en Colombia, `dias` días a partir de hoy. */
export function fechaEnColombia(dias = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(Date.now() + dias * 86_400_000));
}
