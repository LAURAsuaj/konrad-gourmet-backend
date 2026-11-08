/**
 * CU-01 Autenticación y roles: contraseñas cifradas (bcrypt), bloqueo de cuenta,
 * mensajes que no revelan qué dato falló, compatibilidad con hashes antiguos
 * y comportamiento de la API bajo una ráfaga de inicios de sesión.
 */
import './_soporte/entorno.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarAplicacion } from './_soporte/aplicacion.js';
import { codigoDe, dormir } from './_soporte/utiles.js';
import { PasswordHasher, concurrenciaPorDefecto, crearLimitadorDeConcurrencia } from '../src/domain/modules/auth/PasswordHasher.js';

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

  describe('Cambio y restablecimiento de contraseña', () => {
    const entrar = (correo, password) => codigoDe(() => app.facade.iniciarSesion({ correo, password }));
    const idDe = async (correo) => (await app.q('SELECT id FROM usuario WHERE correo = $1', [correo]))[0].id;
    const cambiar = (actor, datos) => codigoDe(() => app.facade.ejecutar('usuarios.cambiarPassword', actor, datos));

    it('el usuario cambia su contraseña: la nueva funciona, la anterior ya no, y queda auditado sin contraseñas', async () => {
      await crearUsuario('cambio@kg.co');
      const actor = await app.actorDe('cambio@kg.co');
      const r = await app.facade.ejecutar('usuarios.cambiarPassword', actor, { passwordActual: 'Clave1234', passwordNueva: 'NuevaClave99' });
      assert.deepEqual([r.cambiada, r.id], [true, actor.id]);
      assert.equal(await entrar('cambio@kg.co', 'NuevaClave99'), 'SIN_ERROR');
      assert.equal(await entrar('cambio@kg.co', 'Clave1234'), 'CREDENCIALES_INVALIDAS');
      const [fila] = await app.q("SELECT password_hash FROM usuario WHERE correo = 'cambio@kg.co'");
      assert.match(fila.password_hash, /^\$2[ab]\$12\$/);
      assert.equal((await app.q("SELECT 1 FROM auditoria WHERE entidad = 'usuario' AND accion = 'UPDATE' AND entidad_id = $1", [actor.id])).length, 1);
      const auditoria = JSON.stringify(await app.q('SELECT detalle FROM auditoria'));
      assert.ok(!auditoria.includes('NuevaClave99') && !auditoria.includes('Clave1234'), 'la auditoría no guarda contraseñas');
    });

    it('exige la contraseña actual y una nueva robusta y distinta', async () => {
      await crearUsuario('valida@kg.co');
      const actor = await app.actorDe('valida@kg.co');
      assert.equal(await cambiar(actor, { passwordNueva: 'NuevaClave99' }), 'VALIDACION', 'sin la actual');
      assert.equal(await cambiar(actor, { passwordActual: 'Clave1234' }), 'VALIDACION', 'sin la nueva');
      assert.equal(await cambiar(actor, { passwordActual: 'Clave1234', passwordNueva: 'corta1' }), 'VALIDACION', 'muy corta');
      assert.equal(await cambiar(actor, { passwordActual: 'Clave1234', passwordNueva: 'soloLetrasAqui' }), 'VALIDACION', 'sin números');
      assert.equal(await cambiar(actor, { passwordActual: 'Clave1234', passwordNueva: '123456789012' }), 'VALIDACION', 'sin letras');
      assert.equal(await cambiar(actor, { passwordActual: 'Clave1234', passwordNueva: 'sinmayuscula1' }), 'VALIDACION', 'sin mayúscula');
      assert.equal(await cambiar(actor, { passwordActual: 'Clave1234', passwordNueva: 'SINMINUSCULA1' }), 'VALIDACION', 'sin minúscula');
      assert.equal(await cambiar(actor, { passwordActual: 'Clave1234', passwordNueva: 'SinNumeros' }), 'VALIDACION', 'sin número');
      assert.equal(await cambiar(actor, { passwordActual: 'Clave1234', passwordNueva: 'Clave1234' }), 'VALIDACION', 'igual a la actual');
      assert.equal(await entrar('valida@kg.co', 'Clave1234'), 'SIN_ERROR', 'ningún intento inválido cambió la contraseña');
    });

    it('la regla del enunciado (mínimo 8, mayúscula, minúscula y número) también admite letras acentuadas', async () => {
      await crearUsuario('acentos@kg.co');
      const actor = await app.actorDe('acentos@kg.co');
      assert.equal(await cambiar(actor, { passwordActual: 'Clave1234', passwordNueva: 'Ñandú2026' }), 'SIN_ERROR');
      assert.equal(await entrar('acentos@kg.co', 'Ñandú2026'), 'SIN_ERROR');
    });

    it('una contraseña actual incorrecta cuenta como intento fallido y, al llegar al máximo, bloquea la cuenta', async () => {
      await crearUsuario('fuerza@kg.co');
      const actor = await app.actorDe('fuerza@kg.co');
      const mala = { passwordActual: 'Equivocada1', passwordNueva: 'NuevaClave99' };
      assert.deepEqual([await cambiar(actor, mala), await cambiar(actor, mala), await cambiar(actor, mala)], ['VALIDACION', 'VALIDACION', 'CUENTA_BLOQUEADA']);
      assert.equal(await entrar('fuerza@kg.co', 'Clave1234'), 'CUENTA_BLOQUEADA');
    });

    it('el Administrador restablece la contraseña de un usuario que la olvidó y le habilita la cuenta', async () => {
      await crearUsuario('olvido@kg.co');
      for (let i = 0; i < 3; i++) await entrar('olvido@kg.co', 'Equivocada1');
      assert.equal(await entrar('olvido@kg.co', 'Clave1234'), 'CUENTA_BLOQUEADA');

      const id = await idDe('olvido@kg.co');
      const r = await app.facade.ejecutar('usuarios.restablecerPassword', admin, { id, passwordNueva: 'Restablecida77' });
      assert.deepEqual([r.id, r.restablecida], [id, true]);
      assert.equal(await entrar('olvido@kg.co', 'Restablecida77'), 'SIN_ERROR');
      assert.equal(await entrar('olvido@kg.co', 'Clave1234'), 'CREDENCIALES_INVALIDAS');
      assert.ok(!JSON.stringify(await app.q('SELECT detalle FROM auditoria WHERE entidad_id = $1', [id])).includes('Restablecida77'));
    });

    it('solo el Administrador restablece; se valida el usuario y la contraseña nueva', async () => {
      await crearUsuario('sinpermiso@kg.co');
      const noAdmin = await app.actorDe('sinpermiso@kg.co');
      const id = await idDe('cambio@kg.co');
      const restablecer = (actor, datos) => codigoDe(() => app.facade.ejecutar('usuarios.restablecerPassword', actor, datos));
      assert.equal(await restablecer(noAdmin, { id, passwordNueva: 'Restablecida77' }), 'PROHIBIDO');
      assert.equal(await restablecer(admin, { id: 'no-es-un-uuid', passwordNueva: 'Restablecida77' }), 'VALIDACION');
      assert.equal(await restablecer(admin, { id: '00000000-0000-4000-8000-000000000000', passwordNueva: 'Restablecida77' }), 'NO_ENCONTRADO');
      assert.equal(await restablecer(admin, { id, passwordNueva: 'corta' }), 'VALIDACION');
    });

    it('por HTTP: POST /auth/cambiar-password y POST /usuarios/:id/restablecer-password', async () => {
      await crearUsuario('http@kg.co');
      const token = await app.login('http@kg.co');
      const buena = { passwordActual: 'Clave1234', passwordNueva: 'NuevaHttp88' };
      assert.equal((await app.http('POST', '/auth/cambiar-password', { cuerpo: buena })).estado, 401, 'sin token');
      const mala = await app.http('POST', '/auth/cambiar-password', { token, cuerpo: { passwordActual: 'Mala12345', passwordNueva: 'OtraHttp99' } });
      assert.equal(mala.estado, 400);
      assert.equal(mala.json.error.codigo, 'VALIDACION');
      const ok = await app.http('POST', '/auth/cambiar-password', { token, cuerpo: buena });
      assert.equal(ok.estado, 200);
      assert.equal(ok.json.datos.cambiada, true);

      const id = await idDe('http@kg.co');
      assert.equal((await app.http('POST', `/usuarios/${id}/restablecer-password`, { token, cuerpo: { passwordNueva: 'Restablecida77' } })).estado, 403);
      const tokenAdmin = await app.login('admin@kg.co', 'Admin12345');
      const restablecida = await app.http('POST', `/usuarios/${id}/restablecer-password`, { token: tokenAdmin, cuerpo: { passwordNueva: 'Restablecida77' } });
      assert.equal(restablecida.estado, 200);
      assert.equal(restablecida.json.datos.restablecida, true);
      assert.equal(await entrar('http@kg.co', 'Restablecida77'), 'SIN_ERROR');
    });
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

    assert.deepEqual(logins.map((l) => l.estado).filter((estado) => estado !== 200), [], 'ningún inicio de sesión falló ni se cayó la conexión');
    assert.ok(sondeo.every((s) => s.ok), '/salud respondió siempre durante la ráfaga');
    const peor = Math.max(...sondeo.map((s) => s.ms));
    // Con bcryptjs (JavaScript puro) el servidor llegaba a quedar congelado más de 10 segundos.
    // El margen es amplio a propósito: los servidores de integración continua son lentos y compartidos.
    assert.ok(peor < 5000, `/salud tardó ${Math.round(peor)} ms en el peor caso; debe ser menor a 5000 ms`);
  });
});

describe('Límite de cálculos de contraseña simultáneos', () => {
  it('por defecto deja un procesador libre: procesadores - 1, entre 1 y 4', () => {
    const casos = [[1, 1], [2, 1], [3, 2], [4, 3], [8, 4], [64, 4]];
    for (const [procesadores, esperado] of casos) assert.equal(concurrenciaPorDefecto(procesadores), esperado, `${procesadores} procesadores`);
  });

  it('nunca ejecuta más tareas a la vez que el límite, y todas terminan en orden de llegada', async () => {
    const limitar = crearLimitadorDeConcurrencia(3);
    let activas = 0;
    let maximoVisto = 0;
    const inicios = [];
    await Promise.all(Array.from({ length: 12 }, (_, i) => limitar(async () => {
      inicios.push(i);
      activas += 1;
      maximoVisto = Math.max(maximoVisto, activas);
      await dormir(15);
      activas -= 1;
      return i;
    })));
    assert.equal(maximoVisto, 3);
    assert.deepEqual(inicios, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('una tarea que falla libera su cupo y no bloquea a las demás', async () => {
    const limitar = crearLimitadorDeConcurrencia(1);
    const resultados = await Promise.allSettled([
      limitar(async () => { throw new Error('boom'); }),
      limitar(async () => 'segunda'),
      limitar(async () => 'tercera'),
    ]);
    assert.deepEqual(resultados.map((r) => r.status), ['rejected', 'fulfilled', 'fulfilled']);
    assert.equal(resultados[2].value, 'tercera');
  });

  it('rechaza límites inválidos', () => {
    for (const invalido of [0, -1, 1.5, '2', undefined]) assert.throws(() => crearLimitadorDeConcurrencia(invalido), /entero mayor o igual a 1/);
  });

  it('el PasswordHasher sigue cifrando y comparando correctamente a través del límite', async () => {
    const hasher = new PasswordHasher({ rondas: 10, concurrencia: 1 });
    const hashes = await Promise.all(['Clave1234', 'OtraClave99'].map((p) => hasher.hash(p)));
    assert.equal(await hasher.comparar('Clave1234', hashes[0]), true);
    assert.equal(await hasher.comparar('Clave1234', hashes[1]), false);
    assert.match(hashes[0], /^\$2[ab]\$10\$/);
  });
});

