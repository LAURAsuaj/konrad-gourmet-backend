/**
 * CU-01 Autenticación y roles: contraseñas cifradas (bcrypt), bloqueo de cuenta,
 * mensajes que no revelan qué dato falló, compatibilidad con hashes antiguos
 * y comportamiento de la API bajo una ráfaga de inicios de sesión.
 */
import './_soporte/entorno.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarAplicacion } from './_soporte/aplicacion.js';
import { codigoDe } from './_soporte/utiles.js';

// Hash de 'Clave1234' generado con la librería ANTERIOR (bcryptjs): los usuarios existentes deben seguir entrando
const HASH_ANTIGUO = '$2b$10$94FTVDYC7N0AyG4s9.NOjuQ2VNKH6KeOQm4a8bn32NomHu7jPQfJe';

describe('Autenticación (CU-01)', () => {
  let app;
  let admin;

  before(async () => {
    app = await iniciarAplicacion({ env: { BCRYPT_ROUNDS: '12' }, iniciarEventos: false });
    await app.facade.crearAdministradorInicial({ nombre: 'Admin', correo: 'admin@kg.co', password: 'Admin12345' });
    admin = await app.actorDe('admin@kg.co', 'Admin12345');
  });
  after(() => app.detener());

  const crearUsuario = (correo, rol = 'DIRECTOR_COMPRAS') =>
    app.facade.ejecutar('usuarios.crear', admin, { nombre: correo.split('@')[0], correo, password: 'Clave1234', rol });

  it('el primer administrador solo se crea una vez y la contraseña debe ser robusta', async () => {
    assert.equal(await codigoDe(() => app.facade.crearAdministradorInicial({ nombre: 'Otro', correo: 'otro@kg.co', password: 'Admin12345' })), 'CONFLICTO');
    assert.equal(await codigoDe(() => crearUsuario('debil@kg.co').then(() => app.facade.ejecutar('usuarios.crear', admin, { nombre: 'x', correo: 'x@kg.co', password: 'corta', rol: 'MESERO' }))), 'VALIDACION');
  });

  it('un usuario nuevo recibe un hash bcrypt y nunca se expone en las respuestas', async () => {
    const [fila] = await app.q("SELECT password_hash FROM usuario WHERE correo = 'debil@kg.co'");
    assert.match(fila.password_hash, /^\$2[ab]\$12\$/, 'bcrypt con el costo configurado (12)');
    const listado = await app.facade.ejecutar('usuarios.listar', admin, {});
    assert.ok(!JSON.stringify(listado).includes('hash') && !JSON.stringify(listado).includes('password'));
  });

  it('solo el Administrador crea usuarios; no se repiten correos', async () => {
    const mesero = await (async () => { await crearUsuario('mesero@kg.co', 'AUXILIAR_COMPRAS'); return app.actorDe('mesero@kg.co'); })();
    assert.equal(await codigoDe(() => app.facade.ejecutar('usuarios.crear', mesero, { nombre: 'x', correo: 'y@kg.co', password: 'Clave1234', rol: 'MESERO' })), 'PROHIBIDO');
    assert.equal(await codigoDe(() => crearUsuario('MESERO@kg.co')), 'CONFLICTO');
  });

  it('un rol con punto exige punto', async () => {
    assert.equal(await codigoDe(() => app.facade.ejecutar('usuarios.crear', admin, { nombre: 'x', correo: 'z@kg.co', password: 'Clave1234', rol: 'MESERO' })), 'VALIDACION');
  });

  it('el inicio de sesión entrega un token con el rol, y los fallos no revelan qué dato es incorrecto', async () => {
    const buena = await app.http('POST', '/auth/login', { cuerpo: { correo: 'debil@kg.co', password: 'Clave1234' } });
    assert.equal(buena.estado, 200);
    assert.equal(buena.json.datos.usuario.rol, 'DIRECTOR_COMPRAS');

    const claveMala = await app.http('POST', '/auth/login', { cuerpo: { correo: 'debil@kg.co', password: 'Incorrecta1' } });
    const noExiste = await app.http('POST', '/auth/login', { cuerpo: { correo: 'nadie@kg.co', password: 'Incorrecta1' } });
    assert.equal(claveMala.estado, 401);
    assert.deepEqual(claveMala.json, noExiste.json, 'contraseña errónea y usuario inexistente deben ser indistinguibles');
    assert.ok(!claveMala.texto.includes('usuarioId'));
  });

  it('los accesos exitosos y fallidos quedan auditados', async () => {
    const filas = await app.q("SELECT accion FROM auditoria WHERE accion IN ('LOGIN_OK','LOGIN_FALLIDO')");
    assert.ok(filas.some((f) => f.accion === 'LOGIN_OK'));
    assert.ok(filas.some((f) => f.accion === 'LOGIN_FALLIDO'));
  });

  it('tres fallos bloquean la cuenta; con clave correcta se informa el bloqueo; el Administrador la habilita', async () => {
    await crearUsuario('bloqueo@kg.co');
    const intento = (password) => codigoDe(() => app.facade.iniciarSesion({ correo: 'bloqueo@kg.co', password }));
    assert.deepEqual([await intento('Mala12345'), await intento('Mala12345'), await intento('Mala12345')], ['CREDENCIALES_INVALIDAS', 'CREDENCIALES_INVALIDAS', 'CUENTA_BLOQUEADA']);
    assert.equal(await intento('Mala12345'), 'CREDENCIALES_INVALIDAS', 'bloqueada + clave mala: mensaje genérico');
    assert.equal(await intento('Clave1234'), 'CUENTA_BLOQUEADA', 'bloqueada + clave correcta: se informa');

    const [{ id }] = await app.q("SELECT id FROM usuario WHERE correo = 'bloqueo@kg.co'");
    await app.facade.ejecutar('usuarios.desbloquear', admin, { id });
    assert.equal(await intento('Clave1234'), 'SIN_ERROR');
  });

  it('el límite de intentos sale de la regla parametrizada', async () => {
    await app.facade.ejecutar('reglas.definir', admin, { clave: 'max_intentos_login', valor: 2 });
    await crearUsuario('dos@kg.co');
    const intento = () => codigoDe(() => app.facade.iniciarSesion({ correo: 'dos@kg.co', password: 'Mala12345' }));
    assert.deepEqual([await intento(), await intento()], ['CREDENCIALES_INVALIDAS', 'CUENTA_BLOQUEADA']);
    await app.facade.ejecutar('reglas.definir', admin, { clave: 'max_intentos_login', valor: 3 });
  });

  it('un usuario cuyo hash lo creó la librería anterior (bcryptjs) sigue iniciando sesión', async () => {
    await app.q("INSERT INTO usuario (nombre, correo, password_hash, rol) VALUES ('Antiguo','antiguo@kg.co',$1,'ADMINISTRADOR')", [HASH_ANTIGUO]);
    assert.equal(await codigoDe(() => app.facade.iniciarSesion({ correo: 'antiguo@kg.co', password: 'Clave1234' })), 'SIN_ERROR');
  });

  it('100 inicios de sesión simultáneos no congelan la API para los demás (bcrypt nativo)', { timeout: 120000 }, async () => {
    for (let i = 1; i <= 5; i++) await crearUsuario(`carga${i}@kg.co`);
    let activo = true;
    const sondeo = [];
    const sonda = (async () => {
      while (activo) {
        const t0 = performance.now();
        const r = await fetch(app.base.replace('/api/v1', '/salud')).catch(() => null);
        sondeo.push({ ms: performance.now() - t0, ok: r?.status === 200 });
        await new Promise((r2) => setTimeout(r2, 50));
      }
    })();
    const logins = await Promise.all(Array.from({ length: 100 }, (_, i) =>
      app.http('POST', '/auth/login', { cuerpo: { correo: `carga${(i % 5) + 1}@kg.co`, password: 'Clave1234' } })));
    activo = false;
    await sonda;

    assert.ok(logins.every((l) => l.estado === 200), 'ningún inicio de sesión falló ni se cayó la conexión');
    assert.ok(sondeo.every((s) => s.ok), '/salud respondió siempre durante la ráfaga');
    const peor = Math.max(...sondeo.map((s) => s.ms));
    // Con bcryptjs (JavaScript puro) el servidor llegaba a quedar congelado más de 10 segundos
    assert.ok(peor < 3000, `/salud tardó ${Math.round(peor)} ms en el peor caso; debe ser menor a 3000 ms`);
  });
});
