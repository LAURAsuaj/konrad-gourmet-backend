/**
 * Alta del PRIMER usuario Administrador (sin él nadie puede crear cuentas).
 * Solo funciona mientras no exista ningún Administrador.
 *
 * Uso (la contraseña no se pasa como argumento para que no quede en el historial):
 *   ADMIN_NOMBRE="Nombre Apellido" ADMIN_CORREO=admin@empresa.com ADMIN_PASSWORD='Clave12345' npm run admin:crear
 *
 * Este script lee sus tres datos de entrada directamente de process.env porque son
 * de un único uso y no deben formar parte de la configuración del sistema (env.js).
 */
import { construirContenedor } from '../src/container.js';

const { ADMIN_NOMBRE: nombre, ADMIN_CORREO: correo, ADMIN_PASSWORD: password } = process.env;
if (!nombre || !correo || !password) {
  console.error('Defina ADMIN_NOMBRE, ADMIN_CORREO y ADMIN_PASSWORD antes de ejecutar el script.');
  process.exit(1);
}

const contenedor = construirContenedor();
try {
  const usuario = await contenedor.facade.crearAdministradorInicial({ nombre, correo, password }, { ip: 'consola' });
  console.log(`Administrador creado: ${usuario.correo}`);
} catch (error) {
  console.error(`No se pudo crear el administrador: ${error.message}`);
  process.exitCode = 1;
} finally {
  await contenedor.detener();
}
