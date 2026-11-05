/**
 * CU-01 Sesión: renovación mientras hay actividad, expiración por inactividad,
 * revalidación de la cuenta al renovar, duración máxima y cierre de sesión.
 * Los tokens duran solo 3 segundos para poder observar la expiración sin esperar.
 */
import './_soporte/entorno.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarAplicacion, dormir } from './_soporte/aplicacion.js';

describe('Sesión (CU-01)', () => {
  let app;

  before(async () => {
    app = await iniciarAplicacion({ env: { JWT_EXPIRES_IN: '3s' }, iniciarEventos: false });
    await app.facade.crearAdministradorInicial({ nombre: 'Admin', correo: 'admin@kg.co', password: 'Admin12345' });
    const token = await app.login('admin@kg.co', 'Admin12345');
    await app.http('POST', '/usuarios', { token, cuerpo: { nombre: 'Compras', correo: 'compras@kg.co', password: 'Clave1234', rol: 'DIRECTOR_COMPRAS' } });
  });
  after(() => app.detener());

  const sesion = (token) => app.http('GET', '/auth/sesion', { token });
  const renovar = (token) => app.http('POST', '/auth/refrescar', { token });

  it('POST /auth/refrescar entrega un token nuevo con vencimiento posterior', async () => {
    const A = await app.login('compras@kg.co');
    const antes = (await sesion(A)).json.datos.usuario;
    await dormir(1100); // para que el vencimiento cambie (resolución de 1 s)
    const r = await renovar(A);
    assert.equal(r.estado, 200);
    const B = r.json.datos.token;
    const despues = (await sesion(B)).json.datos.usuario;
    assert.notEqual(B, A);
    assert.ok(despues.expira > antes.expira);
    assert.equal(despues.correo, 'compras@kg.co');
    assert.equal(despues.rol, 'DIRECTOR_COMPRAS');
  });

  it('sin token o con un token inválido se responde 401', async () => {
    assert.equal((await renovar(undefined)).estado, 401);
    assert.equal((await renovar('a.b.c')).estado, 401);
    assert.equal((await app.http('POST', '/auth/logout')).estado, 401);
  });

  it('un usuario activo que renueva conserva la sesión; sin renovar, el token vence', { timeout: 30000 }, async () => {
    const original = await app.login('compras@kg.co');
    await dormir(2000);
    const renovado = (await renovar(original)).json.datos.token; // activo a los 2 s
    await dormir(1800); // ya pasaron ~3,8 s desde el inicio de sesión
    assert.equal((await sesion(renovado)).estado, 200, 'quien renovó sigue con sesión');
    const vencido = await sesion(original);
    assert.equal(vencido.estado, 401);
    assert.match(vencido.json.error.mensaje, /expiró/);
  });

  it('un usuario inactivo pierde la sesión y no puede renovar un token vencido', { timeout: 30000 }, async () => {
    const token = await app.login('compras@kg.co');
    await dormir(3500);
    const r = await sesion(token);
    assert.equal(r.estado, 401);
    assert.match(r.json.error.mensaje, /expiró/);
    assert.equal((await renovar(token)).estado, 401);
  });

  it('al renovar se revalida la cuenta: rol vigente, bloqueo e inactivación', async () => {
    const token = await app.login('compras@kg.co');
    await app.q("UPDATE usuario SET rol = 'AUXILIAR_COMPRAS' WHERE correo = 'compras@kg.co'");
    const cambio = await renovar(token);
    assert.equal(cambio.json.datos.usuario.rol, 'AUXILIAR_COMPRAS', 'el token renovado trae el rol actual');

    await app.q("UPDATE usuario SET bloqueado = true WHERE correo = 'compras@kg.co'");
    const bloqueada = await renovar(cambio.json.datos.token);
    assert.equal(bloqueada.estado, 401);
    assert.match(bloqueada.json.error.mensaje, /ya no es válida/);

    await app.q("UPDATE usuario SET bloqueado = false, activo = false WHERE correo = 'compras@kg.co'");
    assert.equal((await renovar(cambio.json.datos.token)).estado, 401);
    await app.q("UPDATE usuario SET activo = true WHERE correo = 'compras@kg.co'");
  });

  it('la sesión no se renueva indefinidamente: tiene una duración máxima', { timeout: 30000 }, async () => {
    const { TokenService } = await import('../src/domain/modules/auth/TokenService.js');
    const { AuthService } = await import('../src/domain/modules/auth/AuthService.js');
    const { UsuarioRepository } = await import('../src/domain/modules/auth/UsuarioRepository.js');
    const { ParametroRepository } = await import('../src/domain/modules/parametrizacion/ParametroRepository.js');
    const { PasswordHasher } = await import('../src/domain/modules/auth/PasswordHasher.js');
    const { pool } = await import('../src/infrastructure/database/supabaseClient.js');

    const auth = new AuthService({
      db: pool, usuarios: new UsuarioRepository(), parametros: new ParametroRepository(), hasher: new PasswordHasher({ rondas: 10 }),
      tokens: new TokenService({ secreto: 'x'.repeat(40), expiraEn: '1h', duracionMaximaSesionSegundos: 2 }),
    });
    const inicio = await auth.autenticar({ correo: 'compras@kg.co', password: 'Clave1234' });
    const actor0 = auth.verificarToken(inicio.token);
    await dormir(1100);
    const renovada = await auth.renovarSesion(actor0);
    const actor1 = auth.verificarToken(renovada.token);
    assert.equal(actor1.inicioSesion, actor0.inicioSesion, 'al renovar se conserva el inicio de la sesión original');
    await dormir(2600);
    await assert.rejects(auth.renovarSesion(actor1), /duración máxima/);

    const porDefecto = new TokenService({ secreto: 'x'.repeat(40) });
    const ahora = Math.floor(Date.now() / 1000);
    assert.equal(porDefecto.sesionAgotada(ahora - 11 * 3600), false);
    assert.equal(porDefecto.sesionAgotada(ahora - 13 * 3600), true, 'el tope por defecto es de 12 horas');
  });

  it('POST /auth/logout se audita (DELETE sobre "sesion"); renovar no se audita', async () => {
    const token = await app.login('admin@kg.co', 'Admin12345');
    const r = await app.http('POST', '/auth/logout', { token });
    assert.equal(r.estado, 200);
    assert.equal(r.json.datos.cerrada, true);
    const filas = await app.q("SELECT correo, detalle FROM auditoria WHERE entidad = 'sesion' AND accion = 'DELETE'");
    assert.equal(filas.length, 1);
    assert.equal(filas[0].correo, 'admin@kg.co');
    assert.equal(filas[0].detalle.operacion, 'sesion.cerrar');
    assert.equal((await app.q("SELECT 1 FROM auditoria WHERE detalle->>'operacion' = 'sesion.renovar'")).length, 0);
  });
});
