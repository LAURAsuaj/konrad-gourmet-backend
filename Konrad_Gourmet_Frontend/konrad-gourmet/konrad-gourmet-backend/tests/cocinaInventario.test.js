/**
 * Cocina e inventario: menú (CU-02), pedidos (CU-03), descuento diario (CU-06) y alarmas
 * de stock bajo (CU-07), con el flujo de eventos (Outbox) y el envío de correos.
 */
import './_soporte/entorno.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarAplicacion, esperar } from './_soporte/aplicacion.js';
import { sembrarNegocio } from './_soporte/datos.js';
import { codigoDe } from './_soporte/utiles.js';

describe('Cocina e inventario', () => {
  let app;
  let ids;
  let A; // actores
  let E;
  let platoId;

  before(async () => {
    app = await iniciarAplicacion();
    ({ ids, actores: A, E } = await sembrarNegocio(app));
  });
  after(() => app.detener());

  const saldo = async (productoId) => Number((await app.q('SELECT cantidad_actual FROM inventario WHERE producto_id = $1', [productoId]))[0].cantidad_actual);
  const correosDeAlarma = () => app.falsos.correos.filter((c) => c.asunto.startsWith('Alarma de stock bajo'));
  const ingredientes = () => [{ productoId: ids.pollo, cantidadPorPorcion: 0.3, unidadId: ids.kg }, { productoId: ids.arroz, cantidadPorPorcion: '0.2', unidadId: ids.kg }];
  const pedido = (cantidad) => E('pedidos.registrar', A.mesero, { mesaId: ids.mesa, items: [{ platoId, cantidad }] });

  describe('Menú por punto (CU-02)', () => {
    it('el Jefe de Cocina registra un plato con sus ingredientes en su punto', async () => {
      const plato = await E('menu.registrarPlato', A.jefe, { nombre: 'Pollo con arroz', categoria: 'Fuertes', precio: '25000', ingredientes: ingredientes() });
      platoId = plato.id;
      assert.equal(plato.precio, 25000);
      assert.equal(plato.ingredientes.length, 2);
      assert.equal(plato.puntoId, ids.punto);
    });

    it('rechaza duplicados, precios no numéricos, unidades distintas, sin ingredientes y campos vacíos', async () => {
      const base = { categoria: 'Fuertes', precio: 5, ingredientes: ingredientes() };
      assert.equal(await codigoDe(() => E('menu.registrarPlato', A.jefe, { ...base, nombre: 'Pollo con arroz' })), 'CONFLICTO');
      assert.equal(await codigoDe(() => E('menu.registrarPlato', A.jefe, { ...base, nombre: 'Otro', precio: 'abc' })), 'VALIDACION');
      assert.equal(await codigoDe(() => E('menu.registrarPlato', A.jefe, { ...base, nombre: 'Otro', ingredientes: [{ productoId: ids.arroz, cantidadPorPorcion: 1, unidadId: ids.litro }] })), 'VALIDACION');
      assert.equal(await codigoDe(() => E('menu.registrarPlato', A.jefe, { ...base, nombre: 'Otro', ingredientes: [] })), 'VALIDACION');
      assert.equal(await codigoDe(() => E('menu.registrarPlato', A.jefe, { ...base, nombre: '  ' })), 'VALIDACION');
    });

    it('solo el Jefe de Cocina registra platos; el Mesero ve el menú', async () => {
      assert.equal(await codigoDe(() => E('menu.registrarPlato', A.mesero, { nombre: 'X', categoria: 'F', precio: 5, ingredientes: ingredientes() })), 'PROHIBIDO');
      assert.equal((await E('menu.listar', A.mesero, {})).length, 1);
    });

    it('modifica un plato conservando sus ingredientes y no toca platos de otro punto', async () => {
      const modificado = await E('menu.modificarPlato', A.jefe, { id: platoId, cuerpo: { precio: 27000 } });
      assert.equal(modificado.precio, 27000);
      assert.equal(modificado.ingredientes.length, 2);
      assert.equal(await codigoDe(() => E('menu.modificarPlato', A.jefe2, { id: platoId, cuerpo: { precio: 1 } })), 'NO_ENCONTRADO');
    });

    it('un plato inactivo desaparece del menú del Mesero y no se puede pedir', async () => {
      await E('menu.modificarPlato', A.jefe, { id: platoId, cuerpo: { activo: false } });
      assert.equal((await E('menu.listar', A.mesero, {})).length, 0);
      assert.equal(await codigoDe(() => pedido(1)), 'VALIDACION');
      await E('menu.modificarPlato', A.jefe, { id: platoId, cuerpo: { activo: true } });
    });
  });

  describe('Pedidos por mesa (CU-03)', () => {
    it('registra el pedido y acumula las líneas repetidas del mismo plato', async () => {
      const p = await E('pedidos.registrar', A.mesero, { mesaId: ids.mesa, items: [{ platoId, cantidad: 30 }, { platoId, cantidad: 30 }] });
      assert.equal(p.items.length, 1);
      assert.equal(p.items[0].cantidad, 60);
    });

    it('valida mesa, platos y cantidades', async () => {
      assert.equal(await codigoDe(() => E('pedidos.registrar', A.mesero, { mesaId: ids.mesa2, items: [{ platoId, cantidad: 1 }] })), 'VALIDACION', 'mesa de otro punto');
      assert.equal(await codigoDe(() => E('pedidos.registrar', A.mesero, { items: [{ platoId, cantidad: 1 }] })), 'VALIDACION', 'sin mesa');
      assert.equal(await codigoDe(() => E('pedidos.registrar', A.mesero, { mesaId: ids.mesa, items: [{ platoId, cantidad: 0 }] })), 'VALIDACION', 'cantidad cero');
      assert.equal(await codigoDe(() => E('pedidos.registrar', A.mesero, { mesaId: ids.mesa, items: [] })), 'VALIDACION', 'sin platos');
      assert.equal(await codigoDe(() => E('pedidos.registrar', A.jefe, { mesaId: ids.mesa, items: [{ platoId, cantidad: 1 }] })), 'PROHIBIDO', 'solo el Mesero');
    });

    it('el pedido queda disponible para la cocina', async () => {
      assert.equal((await E('pedidos.listar', A.jefe, {})).length, 1);
    });
  });

  describe('Inventario, descuento diario y alarmas (CU-06, CU-07)', () => {
    it('carga el inventario; el Jefe solo opera sobre su punto', async () => {
      const arroz = await E('inventario.establecer', A.jefe, { productoId: ids.arroz, cantidadActual: 200, cantidadReferencia: 100 });
      const pollo = await E('inventario.establecer', A.jefe, { productoId: ids.pollo, cantidadActual: 20, cantidadReferencia: 20 });
      assert.equal(arroz.alarma, 'NINGUNA');
      assert.equal(pollo.alarma, 'NINGUNA');
      assert.equal(await codigoDe(() => E('inventario.establecer', A.jefe, { puntoId: ids.punto2, productoId: ids.arroz, cantidadActual: 1, cantidadReferencia: 1 })), 'VALIDACION');
      assert.equal(await codigoDe(() => E('inventario.establecer', A.mesero, { productoId: ids.arroz, cantidadActual: 1, cantidadReferencia: 1 })), 'PROHIBIDO');
    });

    it('el descuento diario resta lo vendido y registra los movimientos', async () => {
      const r = await app.contenedor.facade.ejecutarProcesoAutomatico('descuento_diario');
      assert.deepEqual([r.pedidosProcesados, r.movimientos, r.inconsistencias.length], [1, 2, 0]);
      assert.equal(await saldo(ids.pollo), 2, 'pollo: 20 - 60 x 0,3');
      assert.equal(await saldo(ids.arroz), 188, 'arroz: 200 - 60 x 0,2');
      assert.equal((await app.q("SELECT 1 FROM movimiento_inventario WHERE tipo = 'DESCUENTO_DIARIO' AND cantidad < 0")).length, 2);
      assert.equal((await app.q("SELECT 1 FROM outbox WHERE tipo = 'DescuentoDiarioCompletado'")).length, 1, 'el evento se guardó junto con el descuento');
    });

    it('reejecutarlo no duplica el descuento', async () => {
      const r = await app.contenedor.facade.ejecutarProcesoAutomatico('descuento_diario');
      assert.equal(r.pedidosProcesados, 0);
      assert.equal(await saldo(ids.pollo), 2);
    });

    it('al bajar del 25 % se genera una alarma, visible para el Jefe y avisada por correo', async () => {
      assert.ok(await app.drenado());
      const alarmas = await E('inventario.alarmas', A.jefe, {});
      assert.equal(alarmas.length, 1);
      assert.equal(alarmas[0].producto, 'Pollo');
      const [correo] = correosDeAlarma();
      assert.equal(correo.para, 'jefe@kg.co');
      assert.ok(correo.asunto.includes('Pollo') && correo.texto.includes('Chapinero'));
      assert.equal((await app.q("SELECT 1 FROM notificacion WHERE tipo = 'ALARMA_STOCK' AND estado = 'ENVIADA'")).length, 1);
      assert.equal(await codigoDe(() => E('inventario.alarmas', A.mesero, {})), 'PROHIBIDO');
    });

    it('el Jefe ve la alarma en sus notificaciones y cada usuario ve solo las suyas', async () => {
      const propias = await E('notificaciones.listarPropias', A.jefe, {});
      assert.equal(propias.total, 1);
      const [alarma] = propias.notificaciones;
      assert.equal(alarma.tipo, 'ALARMA_STOCK');
      assert.equal(alarma.estado, 'ENVIADA');
      assert.ok(alarma.asunto.includes('Pollo') && alarma.mensaje.includes('Chapinero'));
      assert.ok(alarma.creadaEn && alarma.enviadaEn);
      assert.equal((await E('notificaciones.listarPropias', A.jefe2, {})).total, 0, 'el Jefe de otro punto no la ve');
      assert.equal((await E('notificaciones.listarPropias', A.mesero, {})).total, 0);
      assert.match((await E('notificaciones.listarPropias', A.jefe, { tipo: 'PROMOCION' })).mensaje, /No tiene notificaciones/);
      assert.equal(await codigoDe(() => E('notificaciones.listarPropias', A.jefe, { tipo: 'INVENTADO' })), 'VALIDACION');
      assert.equal(await codigoDe(() => E('notificaciones.listarPropias', A.jefe, { desde: '2026-12-01', hasta: '2026-01-01' })), 'VALIDACION');
    });

    it('si el consumo supera lo disponible el inventario no queda negativo y no se repite la alarma', async () => {
      await pedido(20);
      const r = await app.contenedor.facade.ejecutarProcesoAutomatico('descuento_diario');
      assert.ok(r.inconsistencias.some((i) => i.tipo === 'CONSUMO_SUPERA_DISPONIBLE'));
      assert.equal(await saldo(ids.pollo), 0);
      assert.ok(await app.drenado());
      assert.equal((await app.q('SELECT 1 FROM alarma')).length, 1, 'no se duplica la alarma activa');
      assert.equal(correosDeAlarma().length, 1, 'no se reenvía el correo');
      assert.ok((await app.q("SELECT 1 FROM log_error WHERE mensaje LIKE '%CONSUMO_SUPERA_DISPONIBLE%'")).length >= 1, 'la inconsistencia queda en el log');
    });

    it('al reabastecer se cierra la alarma; una nueva caída vuelve a alertar (25 % exacto)', async () => {
      const reabastecido = await E('inventario.establecer', A.jefe, { productoId: ids.pollo, cantidadActual: 20, cantidadReferencia: 20 });
      assert.equal(reabastecido.alarma, 'RESUELTA');
      assert.equal((await app.q('SELECT 1 FROM alarma WHERE activa')).length, 0);
      await pedido(50); // pollo: 20 - 15 = 5 = 25 %
      await app.contenedor.facade.ejecutarProcesoAutomatico('descuento_diario');
      assert.ok(await app.drenado());
      assert.equal((await app.q('SELECT 1 FROM alarma')).length, 2);
      assert.equal((await app.q('SELECT 1 FROM alarma WHERE activa')).length, 1);
      assert.equal(correosDeAlarma().length, 2);
    });

    it('si el correo falla temporalmente se reintenta y se envía una sola vez, sin notificaciones duplicadas', { timeout: 30000 }, async () => {
      await E('inventario.establecer', A.jefe, { productoId: ids.pollo, cantidadActual: 20, cantidadReferencia: 20 });
      await pedido(60);
      app.falsos.correoFalla = 1;
      await app.contenedor.facade.ejecutarProcesoAutomatico('descuento_diario');
      assert.ok(await app.drenado());
      const [evento] = await app.q("SELECT intentos FROM outbox WHERE tipo = 'StockBajoDetectado' ORDER BY creado_en DESC LIMIT 1");
      assert.equal(evento.intentos, 1, 'un intento fallido y un reintento');
      assert.equal(correosDeAlarma().length, 3);
      assert.equal((await app.q("SELECT 1 FROM notificacion WHERE tipo = 'ALARMA_STOCK'")).length, 3);
      assert.equal((await app.q("SELECT 1 FROM notificacion WHERE tipo = 'ALARMA_STOCK' AND estado = 'ENVIADA'")).length, 3);
      assert.ok((await app.q("SELECT 1 FROM log_error WHERE modulo = 'notificaciones' AND nivel = 'ERROR'")).length >= 1, 'el fallo quedó en el log');
    });

    it('dos descuentos simultáneos procesan cada pedido una sola vez', async () => {
      const antes = await saldo(ids.arroz);
      await pedido(5);
      const [a, b] = await Promise.all([
        app.contenedor.facade.ejecutarProcesoAutomatico('descuento_diario'),
        app.contenedor.facade.ejecutarProcesoAutomatico('descuento_diario'),
      ]);
      assert.equal(a.pedidosProcesados + b.pedidosProcesados, 1);
      assert.ok(Math.abs(antes - (await saldo(ids.arroz)) - 1) < 1e-9, '5 platos x 0,2 kg = 1 kg, descontado una vez');
      await app.drenado();
    });

    it('el consumo de platos sin ingredientes se omite y se registra', async () => {
      await app.q("INSERT INTO plato (punto_id, nombre, categoria, precio) VALUES ($1, 'Plato sin receta', 'X', 1000)", [ids.punto]);
      const [{ id }] = await app.q("SELECT id FROM plato WHERE nombre = 'Plato sin receta'");
      await E('pedidos.registrar', A.mesero, { mesaId: ids.mesa, items: [{ platoId: id, cantidad: 2 }] });
      const r = await app.contenedor.facade.ejecutarProcesoAutomatico('descuento_diario');
      assert.ok(r.inconsistencias.some((i) => i.tipo === 'PLATO_SIN_INGREDIENTES'));
      assert.ok(await esperar(async () => (await app.q("SELECT 1 FROM log_error WHERE mensaje LIKE '%PLATO_SIN_INGREDIENTES%'")).length >= 1));
    });
  });
});
