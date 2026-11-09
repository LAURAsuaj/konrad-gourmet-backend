/**
 * API HTTP: cabeceras de seguridad, errores uniformes, CORS, control de acceso por rol (RBAC),
 * auditoría de intentos denegados, matriz de permisos, TLS 1.3 (CO-6) y límite de intentos de
 * inicio de sesión. Incluye el flujo completo de negocio recorrido solo por las rutas HTTP.
 */
import './_soporte/entorno.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import https from 'node:https';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { iniciarAplicacion } from './_soporte/aplicacion.js';
import { fechaEnColombia } from './_soporte/utiles.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));

describe('API HTTP', () => {
  let app;
  let T; // tokens por usuario
  const ids = {};

  before(async () => {
    app = await iniciarAplicacion({ env: { LOGIN_RATE_LIMIT_MAX: '5' } });
    await app.facade.crearAdministradorInicial({ nombre: 'Admin', correo: 'admin@kg.co', password: 'Admin12345' });
    T = { admin: await app.login('admin@kg.co', 'Admin12345') };
  });
  after(() => app.detener());

  const post = (ruta, cuerpo, token = T.admin) => app.http('POST', `/${ruta}`, { token, cuerpo });
  const idDe = async (ruta, cuerpo) => {
    const r = await post(ruta, cuerpo);
    assert.equal(r.estado, 201, `${ruta} -> ${r.estado} ${r.texto}`);
    return r.json.datos.id;
  };

  describe('Imagen corporativa pública', () => {
    it('GET /apariencia no exige sesión, se puede guardar un instante y refleja los cambios del Administrador', async () => {
      const inicial = await app.http('GET', '/apariencia');
      assert.equal(inicial.estado, 200);
      assert.equal(inicial.json.datos.nombreComercial, 'Konrad Gourmet');
      assert.match(inicial.cabeceras.get('cache-control'), /max-age=60/);

      const cambio = await app.http('PUT', '/reglas/imagen_corporativa', { token: T.admin, cuerpo: { valor: { nombreComercial: 'Mi Restaurante', colorPrimario: '#0F766E' } } });
      assert.equal(cambio.estado, 200, cambio.texto);
      const despues = await app.http('GET', '/apariencia');
      assert.deepEqual([despues.json.datos.nombreComercial, despues.json.datos.colorPrimario], ['Mi Restaurante', '#0F766E']);
    });

    it('cambiarla exige ser Administrador autenticado y un valor válido', async () => {
      assert.equal((await app.http('PUT', '/reglas/imagen_corporativa', { cuerpo: { valor: { nombreComercial: 'X' } } })).estado, 401);
      const malo = await app.http('PUT', '/reglas/imagen_corporativa', { token: T.admin, cuerpo: { valor: { colorPrimario: 'azul' } } });
      assert.equal(malo.estado, 400);
      assert.equal((await app.http('GET', '/apariencia')).json.datos.colorPrimario, '#0F766E', 'el valor inválido no cambió nada');
    });
  });

  describe('Cabeceras, errores generales y CORS', () => {
    it('/salud responde y verifica la base de datos; la respuesta lleva cabeceras de seguridad', async () => {
      const r = await fetch(app.base.replace('/api/v1', '/salud'));
      assert.equal(r.status, 200);
      assert.equal((await r.json()).datos.estado, 'ok');
      assert.equal(r.headers.get('x-powered-by'), null);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(r.headers.has('strict-transport-security'));
    });

    it('JSON mal formado -> 400; cuerpo mayor a 100 KB -> 413; ruta inexistente -> 404', async () => {
      assert.equal((await app.http('POST', '/auth/login', { cuerpo: '{"correo": ' })).estado, 400);
      assert.equal((await app.http('POST', '/auth/login', { cuerpo: { x: 'a'.repeat(150_000) } })).estado, 413);
      assert.equal((await app.http('GET', '/no-existe')).estado, 404);
    });

    it('CORS solo permite los orígenes configurados', async () => {
      const permitido = await app.http('GET', '/auth/sesion', { cabeceras: { Origin: 'http://front.test' } });
      assert.equal(permitido.cabeceras.get('access-control-allow-origin'), 'http://front.test');
      assert.equal((await app.http('GET', '/auth/sesion', { cabeceras: { Origin: 'http://malo.test' } })).estado, 403);
    });
  });

  describe('Autenticación por HTTP', () => {
    it('las credenciales inválidas dan 401 sin filtrar datos internos; el acceso queda auditado', async () => {
      const mala = await app.http('POST', '/auth/login', { cuerpo: { correo: 'admin@kg.co', password: 'Incorrecta1' } });
      assert.equal(mala.estado, 401);
      assert.equal(mala.json.error.codigo, 'CREDENCIALES_INVALIDAS');
      assert.ok(!mala.texto.includes('usuarioId'));
      assert.equal((await app.q("SELECT 1 FROM auditoria WHERE accion = 'LOGIN_FALLIDO' AND correo = 'admin@kg.co'")).length, 1);
      assert.ok((await app.q("SELECT 1 FROM auditoria WHERE accion = 'LOGIN_OK'")).length >= 1);
    });

    it('sin token, con un token inválido o con un esquema distinto de Bearer se responde 401', async () => {
      assert.equal((await app.http('GET', '/auth/sesion')).estado, 401);
      assert.equal((await app.http('GET', '/auth/sesion', { token: 'abc.def.ghi' })).estado, 401);
      assert.equal((await app.http('GET', '/usuarios', { cabeceras: { Authorization: 'Basic abc' } })).estado, 401);
      assert.equal((await app.http('GET', '/auth/sesion', { token: T.admin })).json.datos.usuario.rol, 'ADMINISTRADOR');
    });
  });

  describe('Parametrización y usuarios por HTTP', () => {
    it('el Administrador carga catálogos y crea usuarios; los errores se traducen a 400 y 409', async () => {
      ids.punto = await idDe('catalogos/puntos', { nombre: 'Chapinero' });
      ids.kg = await idDe('catalogos/unidades', { nombre: 'kilogramo', abreviatura: 'kg' });
      ids.cat = await idDe('catalogos/categorias', { nombre: 'Granos' });
      ids.catP = await idDe('catalogos/categorias', { nombre: 'Proteínas' });
      ids.arroz = await idDe('catalogos/productos', { nombre: 'Arroz', categoriaId: ids.cat, unidadId: ids.kg });
      ids.pollo = await idDe('catalogos/productos', { nombre: 'Pollo', categoriaId: ids.catP, unidadId: ids.kg });
      ids.prov = await idDe('catalogos/proveedores', { nombre: 'Proveedor A', correo: 'a@prov.co' });
      ids.mesa = await idDe('catalogos/mesas', { puntoId: ids.punto, numero: 1 });

      assert.equal((await app.http('GET', '/catalogos', { token: T.admin })).json.datos.length, 7);
      const filtrado = await app.http('GET', `/catalogos/productos?categoriaId=${ids.catP}`, { token: T.admin });
      assert.deepEqual(filtrado.json.datos.map((p) => p.nombre), ['Pollo']);
      assert.equal((await post('catalogos/categorias', { nombre: 'granos' })).estado, 409);
      assert.equal((await post('catalogos/categorias', { nombre: '' })).estado, 400);
      assert.equal((await app.http('DELETE', `/catalogos/puntos/${ids.punto}`, { token: T.admin })).estado, 409);
      assert.equal((await app.http('PUT', '/reglas/alarma_porcentaje', { token: T.admin, cuerpo: { valor: 0 } })).estado, 400);

      const usuarios = [['jefe@kg.co', 'JEFE_COCINA', ids.punto], ['mesero@kg.co', 'MESERO', ids.punto], ['aux@kg.co', 'AUXILIAR_COMPRAS'], ['compras@kg.co', 'DIRECTOR_COMPRAS'], ['comercial@kg.co', 'DIRECTOR_COMERCIAL']];
      for (const [correo, rol, puntoId] of usuarios) {
        const r = await post('usuarios', { nombre: correo.split('@')[0], correo, password: 'Clave1234', rol, puntoId });
        assert.equal(r.estado, 201);
        T[correo.split('@')[0]] = await app.login(correo);
      }
      assert.ok(!(await app.http('GET', '/usuarios', { token: T.admin })).texto.includes('password'));
    });
  });

  describe('Control de acceso por rol (RBAC)', () => {
    it('un Mesero no registra solicitudes (403) y el intento queda auditado', async () => {
      const r = await post('solicitudes', { items: [] }, T.mesero);
      assert.equal(r.estado, 403);
      assert.equal(r.json.error.codigo, 'PROHIBIDO');
      const filas = await app.q("SELECT detalle FROM auditoria WHERE accion = 'ACCESO_DENEGADO' AND entidad_id = 'solicitudes.registrar'");
      assert.equal(filas.length, 1);
      assert.equal(filas[0].detalle.rol, 'MESERO');
    });

    it('las rutas de administración están vedadas a los demás roles', async () => {
      assert.equal((await app.http('GET', '/usuarios', { token: T.aux })).estado, 403);
      assert.equal((await app.http('GET', '/auditoria', { token: T.compras })).estado, 403);
      assert.equal((await app.http('GET', '/tablero', { token: T.jefe })).estado, 403);
    });

    it('la fachada y los módulos coinciden en los permisos de todas las operaciones para los 6 roles', { timeout: 60000 }, async () => {
      const { OPERACIONES } = await import('../src/facade/operaciones.js');
      const { ROLES } = await import('../src/domain/modules/auth/roles.js');
      const problemas = [];
      for (const [nombre, operacion] of Object.entries(OPERACIONES)) {
        for (const rol of Object.values(ROLES)) {
          const actor = { id: randomUUID(), rol, correo: `${rol}@x.co`, puntoId: randomUUID() };
          const permitido = operacion.roles.includes(rol);
          try {
            await app.facade.ejecutar(nombre, actor, {});
            if (!permitido) problemas.push(`${nombre}/${rol}: debió denegarse`);
          } catch (error) {
            if (!permitido && error.codigo !== 'PROHIBIDO') problemas.push(`${nombre}/${rol}: esperaba PROHIBIDO y fue ${error.codigo ?? error.name}`);
            if (permitido && error.codigo === 'PROHIBIDO') problemas.push(`${nombre}/${rol}: la fachada lo permite pero el módulo lo deniega`);
            if (permitido && !error.codigo) problemas.push(`${nombre}/${rol}: error no controlado ${error.name}: ${error.message}`);
          }
        }
      }
      assert.deepEqual(problemas, []);
      assert.ok(Object.keys(OPERACIONES).length >= 37);
    });
  });

  describe('Flujo de negocio recorrido solo por HTTP', () => {
    it('plato, pedido, inventario, descuento diario y alarma', async () => {
      const plato = await post('menu/platos', { nombre: 'Pollo con arroz', categoria: 'Fuertes', precio: 25000, ingredientes: [{ productoId: ids.pollo, cantidadPorPorcion: 0.3, unidadId: ids.kg }, { productoId: ids.arroz, cantidadPorPorcion: 0.2, unidadId: ids.kg }] }, T.jefe);
      assert.equal(plato.estado, 201);
      assert.equal((await post('pedidos', { mesaId: ids.mesa, items: [{ platoId: plato.json.datos.id, cantidad: 60 }] }, T.mesero)).estado, 201);
      await app.http('PUT', '/inventario', { token: T.jefe, cuerpo: { productoId: ids.pollo, cantidadActual: 20, cantidadReferencia: 20 } });
      await app.http('PUT', '/inventario', { token: T.jefe, cuerpo: { productoId: ids.arroz, cantidadActual: 200, cantidadReferencia: 100 } });
      assert.equal((await app.facade.ejecutarProcesoAutomatico('descuento_diario')).pedidosProcesados, 1);
      assert.ok(await app.drenado());
      const alarmas = await app.http('GET', '/inventario/alarmas', { token: T.jefe });
      assert.deepEqual(alarmas.json.datos.map((a) => a.producto), ['Pollo']);
      assert.ok(app.falsos.correos.some((c) => c.asunto.startsWith('Alarma de stock bajo')));

      const propias = await app.http('GET', '/notificaciones?tipo=ALARMA_STOCK', { token: T.jefe });
      assert.equal(propias.estado, 200);
      assert.equal(propias.json.datos.total, 1);
      assert.match(propias.json.datos.notificaciones[0].asunto, /Pollo/);
      assert.equal((await app.http('GET', '/notificaciones', { token: T.mesero })).json.datos.total, 0, 'cada usuario ve solo las suyas');
      assert.equal((await app.http('GET', '/notificaciones?tipo=INVENTADO', { token: T.jefe })).estado, 400);
      assert.equal((await app.http('GET', '/notificaciones')).estado, 401);
    });

    it('solicitud, valor sugerido, cotización con PDF, valores, validación, orden de compra y tablero', async () => {
      const sol = await post('solicitudes', { items: [{ categoriaId: ids.cat, productoId: ids.arroz, cantidad: 100, unidadId: ids.kg }] }, T.jefe);
      assert.equal(sol.estado, 201);
      assert.equal(sol.json.datos.estado, 'PENDIENTE');
      assert.equal((await post('solicitudes', { items: [] }, T.jefe)).estado, 400);
      assert.ok(await app.drenado());
      assert.equal((await app.http('GET', `/solicitudes/${sol.json.datos.id}`, { token: T.aux })).json.datos.valorTotalSugerido, 450_000);
      const listado = (await app.http('GET', '/solicitudes?estado=PENDIENTE', { token: T.aux })).json.datos;
      assert.equal(listado.total, 1);
      assert.deepEqual(listado.solicitudes[0].alimentos, [{ producto: 'Arroz', marca: null, cantidad: 100, unidad: 'kg', precioSugeridoUnitario: 4500 }], 'el listado trae los alimentos de cada solicitud con su precio sugerido');

      const cot = await post('cotizaciones', { solicitudId: sol.json.datos.id, proveedorId: ids.prov, plazoMaximo: fechaEnColombia(1) }, T.aux);
      assert.equal(cot.estado, 201);
      assert.equal(app.falsos.correos.at(-1).adjuntos[0].contenido.subarray(0, 4).toString(), '%PDF');
      assert.ok(await app.drenado());
      assert.equal((await app.http('GET', `/solicitudes/${sol.json.datos.id}`, { token: T.aux })).json.datos.estado, 'EN TRÁMITE');

      const detalle = (await app.http('GET', `/cotizaciones/${cot.json.datos.id}`, { token: T.aux })).json.datos;
      const valores = await app.http('PUT', `/cotizaciones/${cot.json.datos.id}/valores`, { token: T.compras, cuerpo: { valores: detalle.alimentos.map((a) => ({ detalleSolicitudId: a.detalleSolicitudId, valorUnitario: 4000 })) } });
      assert.equal(valores.json.datos.valorTotal, 400_000);
      assert.ok(await app.drenado());
      assert.equal((await app.http('GET', `/cotizaciones/${cot.json.datos.id}`, { token: T.compras })).json.datos.estado, 'OPCIONADA');
      assert.equal((await app.http('GET', `/solicitudes/${sol.json.datos.id}/cotizaciones-opcionadas`, { token: T.compras })).json.datos.cotizaciones.length, 1);

      const orden = await post('ordenes-compra', { cotizacionId: cot.json.datos.id }, T.compras);
      assert.equal(orden.estado, 201);
      assert.equal(orden.json.datos.valorTotal, 400_000);
      assert.equal((await post('ordenes-compra', { cotizacionId: cot.json.datos.id }, T.compras)).estado, 409);

      const tablero = await app.http('GET', '/tablero', { token: T.comercial });
      assert.equal(tablero.json.datos.productoMasDemandado.producto, 'Arroz');
      assert.equal(tablero.json.datos.restauranteMayorDemanda.punto, 'Chapinero');
    });

    it('la creación de la orden queda auditada a nombre de quien la hizo, sin montos ni contraseñas', async () => {
      const auditoria = (await app.http('GET', '/auditoria?entidad=orden_compra&accion=CREATE', { token: T.admin })).json.datos;
      assert.equal(auditoria.total, 1);
      assert.equal(auditoria.registros[0].correo, 'compras@kg.co');
      const textoAuditoria = JSON.stringify(await app.q('SELECT detalle FROM auditoria'));
      for (const secreto of ['Clave1234', 'Admin12345', 'password_hash', '400000']) assert.ok(!textoAuditoria.includes(secreto), secreto);
    });
  });

  describe('TLS (CO-6)', () => {
    it('en producción una petición sin TLS se rechaza con 426; /salud queda exenta', async () => {
      const { exigirTls } = await import('../src/presentation/middlewares/httpSecurity.js');
      const respuesta = { codigo: null, status(c) { this.codigo = c; return this; }, json() { return this; } };
      let siguio = false;
      exigirTls({ activo: true })({ secure: false, path: '/api/v1/x' }, respuesta, () => { siguio = true; });
      assert.equal(respuesta.codigo, 426);
      assert.equal(siguio, false);
      exigirTls({ activo: true })({ secure: false, path: '/salud' }, respuesta, () => { siguio = true; });
      assert.equal(siguio, true);
      siguio = false;
      exigirTls({ activo: true })({ secure: true, path: '/api/v1/x' }, respuesta, () => { siguio = true; });
      assert.equal(siguio, true);
    });

    it('en producción la API exige HTTPS propio o un proxy TLS', async () => {
      const { validarConfiguracionTls } = await import('../src/app.js');
      assert.throws(() => validarConfiguracionTls({ esProduccion: true, certPath: '', trustProxy: false }), /HTTPS_CERT_PATH/);
      assert.doesNotThrow(() => validarConfiguracionTls({ esProduccion: true, certPath: '', trustProxy: true }));
      assert.doesNotThrow(() => validarConfiguracionTls({ esProduccion: true, certPath: '/certs/c.pem', trustProxy: false }));
      assert.doesNotThrow(() => validarConfiguracionTls({ esProduccion: false, certPath: '', trustProxy: false }));
    });

    it('el servidor HTTPS rechaza TLS 1.2 y acepta TLS 1.3', async () => {
      const { crearServidor } = await import('../src/app.js');
      const servidor = crearServidor(app.app, {
        certPath: path.join(aqui, '_soporte', 'certificado-prueba.crt'),
        keyPath: path.join(aqui, '_soporte', 'certificado-prueba.key'),
        minVersion: 'TLSv1.3',
      });
      await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
      const puerto = servidor.address().port;
      try {
        const conectar = (opciones) => new Promise((resolver) => {
          const socket = tls.connect({ host: '127.0.0.1', port: puerto, rejectUnauthorized: false, ...opciones }, () => { const protocolo = socket.getProtocol(); socket.end(); resolver(protocolo); });
          socket.on('error', (error) => resolver(`ERROR:${error.code ?? error.message}`));
        });
        assert.match(await conectar({ minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' }), /^ERROR/);
        assert.equal(await conectar({ minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' }), 'TLSv1.3');
        const salud = await new Promise((resolver) => https.get({ host: '127.0.0.1', port: puerto, path: '/salud', rejectUnauthorized: false }, (res) => { res.resume(); res.on('end', () => resolver(res.statusCode)); }));
        assert.equal(salud, 200);
      } finally {
        await new Promise((r) => servidor.close(r));
      }
    });
  });

  describe('Errores de conexión con la base de datos', () => {
    const respuestaFalsa = () => ({ cabeceras: {}, codigo: null, cuerpo: null, headersSent: false, set(k, v) { this.cabeceras[k] = v; return this; }, status(c) { this.codigo = c; return this; }, json(c) { this.cuerpo = c; return this; } });
    const manejar = async (error) => {
      const { manejadorErrores } = await import('../src/presentation/middlewares/httpSecurity.js');
      const registrados = [];
      const respuesta = respuestaFalsa();
      manejadorErrores({ error: async (e) => { registrados.push(e.mensaje); } })(error, { method: 'GET', path: '/x' }, respuesta, () => {});
      await new Promise((resolver) => setTimeout(resolver, 20));
      return { respuesta, registrados };
    };

    it('reconoce las caídas y los tiempos de espera de la base de datos, y no confunde otros errores', async () => {
      const { esErrorDeConexion } = await import('../src/presentation/middlewares/httpSecurity.js');
      for (const mensaje of ['Connection terminated due to connection timeout', 'timeout exceeded when trying to connect', 'Connection terminated unexpectedly', 'the database system is starting up']) {
        assert.equal(esErrorDeConexion(new Error(mensaje)), true, mensaje);
      }
      for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '57P01', '53300']) {
        assert.equal(esErrorDeConexion(Object.assign(new Error('x'), { code })), true, code);
      }
      for (const otro of [new Error('boom'), Object.assign(new Error('duplicado'), { code: '23505' }), new TypeError('x is not a function'), null]) {
        assert.equal(esErrorDeConexion(otro), false);
      }
    });

    it('responde 503 con Retry-After (no un 500) y registra el motivo', async () => {
      const { respuesta, registrados } = await manejar(new Error('Connection terminated due to connection timeout'));
      assert.equal(respuesta.codigo, 503);
      assert.equal(respuesta.cuerpo.error.codigo, 'SERVICIO_NO_DISPONIBLE');
      assert.equal(respuesta.cabeceras['Retry-After'], '5');
      assert.deepEqual(registrados, ['Sin conexión con la base de datos']);
    });

    it('un error inesperado sigue siendo 500 y no expone detalles', async () => {
      const { respuesta } = await manejar(new Error('detalle interno secreto'));
      assert.equal(respuesta.codigo, 500);
      assert.equal(respuesta.cuerpo.error.codigo, 'ERROR_INTERNO');
      assert.ok(!JSON.stringify(respuesta.cuerpo).includes('secreto'));
    });
  });

  describe('Límite de intentos de inicio de sesión', () => {
    it('tras 5 intentos fallidos con una cuenta se bloquea esa cuenta en ese equipo, no las demás', async () => {
      assert.equal((await app.http('POST', '/auth/login', { cuerpo: { correo: 'admin@kg.co', password: 'Admin12345' } })).estado, 200);
      const estados = [];
      for (let i = 0; i < 6; i++) estados.push((await app.http('POST', '/auth/login', { cuerpo: { correo: 'Nadie@KG.co', password: 'Incorrecta1' } })).estado);
      assert.deepEqual(estados, [401, 401, 401, 401, 401, 429]);
      const misma = await app.http('POST', '/auth/login', { cuerpo: { correo: ' nadie@kg.co ', password: 'Incorrecta1' } });
      assert.equal(misma.estado, 429, 'el correo se compara sin mayúsculas ni espacios');
      assert.ok(misma.cabeceras.has('retry-after'));
      const otra = await app.http('POST', '/auth/login', { cuerpo: { correo: 'admin@kg.co', password: 'Admin12345' } });
      assert.equal(otra.estado, 200, 'otro usuario del mismo equipo sigue pudiendo entrar');
    });

    it('con muchos fallos repartidos en varias cuentas se bloquea el equipo completo', async () => {
      // Importación tardía: la configuración se lee una sola vez y la aplica iniciarAplicacion
      const { limitarIntentosLogin } = await import('../src/presentation/middlewares/httpSecurity.js');
      const limite = limitarIntentosLogin({ max: 5, maxPorIp: 3, ventanaMs: 60_000 });
      const pedir = (correo, estadoFinal) =>
        new Promise((resolver) => {
          const oyentes = {};
          const res = {
            statusCode: estadoFinal,
            cabeceras: {},
            on: (evento, fn) => (oyentes[evento] = fn),
            set(nombre, valor) { this.cabeceras[nombre] = valor; },
            status(codigo) { this.statusCode = codigo; return this; },
            json(cuerpo) { resolver({ estado: this.statusCode, cuerpo }); },
          };
          limite({ ip: '10.0.0.9', body: { correo } }, res, () => {
            oyentes.finish();
            resolver({ estado: estadoFinal });
          });
        });
      const estados = [];
      for (const correo of ['a@x.co', 'b@x.co', 'c@x.co', 'd@x.co']) estados.push((await pedir(correo, 401)).estado);
      assert.deepEqual(estados, [401, 401, 401, 429]);
      const bloqueo = await pedir('e@x.co', 200);
      assert.equal(bloqueo.estado, 429);
      assert.match(bloqueo.cuerpo.error.mensaje, /este equipo/);
    });
  });
});
