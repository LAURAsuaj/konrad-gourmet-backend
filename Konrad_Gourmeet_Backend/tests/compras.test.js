/**
 * Compras: solicitudes (CU-05, CU-08), precio sugerido (CU-10), cotizaciones (CU-09, CU-11),
 * validación automática (CU-12) y órdenes de compra (CU-13), más la regla de que los valores
 * de cotizaciones y órdenes solo los ve el área de compras (SRS 6.5).
 */
import './_soporte/entorno.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarAplicacion, esperar } from './_soporte/aplicacion.js';
import { sembrarNegocio } from './_soporte/datos.js';
import { codigoDe, fechaEnColombia } from './_soporte/utiles.js';
import { ESTADOS_SOLICITUD_COTIZABLES } from '../src/domain/modules/compras/estados.js';

describe('Compras', () => {
  let app;
  let ids;
  let A;
  let E;
  let marca;
  let S1; // solicitud principal: arroz 100 kg + pollo 50 kg
  let cotA;
  let cotB;
  let d1; // alimento arroz de S1
  let d2; // alimento pollo de S1
  const plazo = fechaEnColombia(1);

  before(async () => {
    app = await iniciarAplicacion();
    ({ ids, actores: A, E } = await sembrarNegocio(app));
    marca = (await E('catalogos.crear', A.admin, { catalogo: 'marcas', cuerpo: { nombre: 'Diana' } })).id;
  });
  after(() => app.detener());

  const itemArroz = (cantidad, conMarca = false) => ({ categoriaId: ids.catGranos, productoId: ids.arroz, ...(conMarca ? { marcaId: marca } : {}), cantidad, unidadId: ids.kg });
  const itemPollo = (cantidad) => ({ categoriaId: ids.catProteinas, productoId: ids.pollo, cantidad, unidadId: ids.kg });
  const solicitar = (items) => E('solicitudes.registrar', A.jefe, { items });
  const total = async (id) => { const v = (await app.q('SELECT valor_total_sugerido AS v FROM solicitud_alimentos WHERE id = $1', [id]))[0].v; return v === null ? null : Number(v); };
  const estadoSolicitud = async (id) => (await app.q('SELECT estado FROM solicitud_alimentos WHERE id = $1', [id]))[0].estado;
  const estadoCotizacion = async (id) => (await app.q('SELECT estado FROM cotizacion WHERE id = $1', [id]))[0].estado;
  const alimentos = (solicitudId) => app.q('SELECT id, producto_id FROM detalle_solicitud WHERE solicitud_id = $1', [solicitudId]);
  const cotizar = (solicitudId, proveedorId, extra = {}) => E('cotizaciones.generar', A.aux, { solicitudId, proveedorId, plazoMaximo: plazo, ...extra });
  const valores = async (solicitudId, precios) =>
    (await alimentos(solicitudId)).map((a) => ({ detalleSolicitudId: a.id, valorUnitario: a.producto_id === ids.arroz ? precios.arroz : precios.pollo }));
  const registrarValores = (cotizacionId, cuerpo) => E('cotizaciones.registrarValores', A.compras, { id: cotizacionId, cuerpo });
  const ciclo = async (cantidad, valorArroz) => {
    const s = await solicitar([itemArroz(cantidad)]);
    await app.drenado();
    const c = await cotizar(s.id, ids.provA);
    await registrarValores(c.id, { valores: await valores(s.id, { arroz: valorArroz }) });
    await app.drenado();
    return { s, c };
  };

  describe('Solicitudes de alimentos (CU-05)', () => {
    it('registra la solicitud PENDIENTE con consecutivo y guarda el evento en la misma transacción', async () => {
      S1 = await solicitar([itemArroz(100, true), itemPollo('50')]);
      assert.equal(S1.estado, 'PENDIENTE');
      assert.ok(S1.consecutivo >= 1);
      assert.equal(S1.items, 2);
      assert.ok((await app.q("SELECT 1 FROM outbox WHERE tipo = 'SolicitudRegistrada'")).length >= 1);
    });

    it('valida cantidades, unidades, categorías y repeticiones', async () => {
      assert.equal(await codigoDe(() => solicitar([itemArroz(0)])), 'VALIDACION');
      assert.equal(await codigoDe(() => solicitar([{ ...itemArroz(1), unidadId: ids.litro }])), 'VALIDACION');
      assert.equal(await codigoDe(() => solicitar([{ ...itemArroz(1), categoriaId: ids.catProteinas }])), 'VALIDACION');
      assert.equal(await codigoDe(() => solicitar([itemArroz(1), itemArroz(2)])), 'VALIDACION');
      assert.equal(await codigoDe(() => solicitar([])), 'VALIDACION');
      assert.equal(await codigoDe(() => E('solicitudes.registrar', A.mesero, { items: [itemArroz(1)] })), 'PROHIBIDO');
    });

    it('envía la confirmación al solicitante y calcula el valor sugerido (100 x 4.500 + 50 x 12.000)', async () => {
      assert.ok(await app.drenado());
      const confirmacion = app.falsos.correos.find((c) => /N\.º \d+ registrada/.test(c.asunto));
      assert.equal(confirmacion.para, 'jefe@kg.co');
      assert.ok(confirmacion.texto.includes('Pollo'));
      assert.equal(await total(S1.id), 1_050_000);
      assert.equal((await app.q("SELECT 1 FROM outbox WHERE tipo = 'PrecioSugeridoActualizado' AND estado = 'PROCESADO'")).length, 1);
      assert.ok((await app.q("SELECT 1 FROM log_error WHERE modulo = 'precio_sugerido' AND nivel = 'INFO'")).length >= 1, 'cada consulta al Ministerio queda en el log');
    });
  });

  describe('Notificaciones de las solicitudes', () => {
    it('el solicitante ve la confirmación en sus notificaciones y los demás no', async () => {
      const propias = await E('notificaciones.listarPropias', A.jefe, { tipo: 'CONFIRMACION_SOLICITUD' });
      assert.ok(propias.total >= 1);
      assert.ok(propias.notificaciones.some((n) => n.asunto.includes(`N.º ${S1.consecutivo} registrada`) && n.estado === 'ENVIADA'));
      assert.equal((await E('notificaciones.listarPropias', A.aux, {})).total, 0);
      assert.equal((await E('notificaciones.listarPropias', A.compras, {})).total, 0);
    });
  });

  describe('Consulta de solicitudes (CU-08)', () => {
    it('lista las solicitudes de todos los puntos con filtros; sin resultados informa', async () => {
      assert.ok((await E('solicitudes.consultar', A.aux, {})).total >= 1);
      assert.ok((await E('solicitudes.consultar', A.aux, { productoId: ids.arroz, marcaId: marca })).total >= 1);
      assert.match((await E('solicitudes.consultar', A.aux, { estado: 'EN TRÁMITE' })).mensaje, /Ninguna/);
      assert.equal(await codigoDe(() => E('solicitudes.consultar', A.aux, { desde: '2026-12-01', hasta: '2026-01-01' })), 'VALIDACION');
      assert.equal(await codigoDe(() => E('solicitudes.consultar', A.jefe, {})), 'PROHIBIDO');
    });

    it('el listado trae los alimentos de cada solicitud, con marca, cantidad y unidad', async () => {
      const lista = await E('solicitudes.consultar', A.aux, {});
      const s1 = lista.solicitudes.find((s) => s.id === S1.id);
      assert.equal(s1.items, 2);
      assert.deepEqual(s1.alimentos, [
        { producto: 'Arroz', marca: 'Diana', cantidad: 100, unidad: 'kg' },
        { producto: 'Pollo', marca: null, cantidad: 50, unidad: 'kg' },
      ]);
      assert.ok(lista.solicitudes.every((s) => Array.isArray(s.alimentos) && s.alimentos.length === s.items));
    });

    it('muestra el detalle con alimentos y precio sugerido; una solicitud inexistente da NO_ENCONTRADO', async () => {
      const detalle = await E('solicitudes.detalle', A.aux, { id: S1.id });
      assert.equal(detalle.items.length, 2);
      assert.ok(detalle.items.every((i) => i.precioSugeridoUnitario > 0));
      assert.equal(detalle.cotizaciones.length, 0);
      assert.equal(await codigoDe(() => E('solicitudes.detalle', A.aux, { id: '00000000-0000-4000-8000-000000000000' })), 'NO_ENCONTRADO');
    });
  });

  describe('Precio sugerido con fallas del servicio (CU-10)', () => {
    it('con el Ministerio caído la solicitud queda sin valor y se reintenta hasta completarla, sin reenviar la confirmación', { timeout: 40000 }, async () => {
      app.falsos.precios = 'caido';
      const S2 = await solicitar([itemArroz(10)]);
      assert.ok(await esperar(async () => (await app.q("SELECT intentos FROM outbox WHERE tipo = 'SolicitudRegistrada' AND payload->>'solicitudId' = $1", [S2.id]))[0].intentos >= 1));
      assert.equal(await total(S2.id), null);
      app.falsos.precios = 'ok';
      assert.ok(await app.drenado());
      assert.equal(await total(S2.id), 45000);
      assert.equal(app.falsos.correos.filter((c) => new RegExp(`N\\.º ${S2.consecutivo} registrada`).test(c.asunto)).length, 1);
      assert.ok((await app.q("SELECT 1 FROM log_error WHERE modulo = 'precio_sugerido' AND nivel = 'ERROR' AND mensaje LIKE '%No se pudo consultar%'")).length >= 1);
    });

    it('un producto sin precio deja la solicitud sin total y el reintento programado la completa', async () => {
      app.falsos.precios = 'sinPollo';
      const S3 = await solicitar([itemArroz(5), itemPollo(2)]);
      await app.drenado();
      assert.equal(await total(S3.id), null);
      assert.equal((await app.q('SELECT 1 FROM detalle_solicitud WHERE solicitud_id = $1 AND precio_sugerido_unitario IS NOT NULL', [S3.id])).length, 1, 'el precio obtenido se conserva');
      assert.ok((await app.q("SELECT 1 FROM log_error WHERE mensaje LIKE '%SIN_PRECIO%'")).length >= 1);
      app.falsos.precios = 'ok';
      const reintento = await app.facade.ejecutarProcesoAutomatico('reintento_precios');
      await app.drenado();
      assert.equal(reintento.actualizadas, 1);
      assert.equal(await total(S3.id), 46_500);
    });
  });

  describe('Solicitud de cotización (CU-09)', () => {
    it('valida plazo, proveedor, correo del proveedor y rol', async () => {
      assert.equal(await codigoDe(() => cotizar(S1.id, ids.provA, { plazoMaximo: fechaEnColombia(-1) })), 'VALIDACION', 'plazo pasado');
      assert.equal(await codigoDe(() => cotizar(S1.id, ids.provA, { plazoMaximo: '' })), 'VALIDACION', 'sin plazo');
      assert.equal(await codigoDe(() => cotizar(S1.id, ids.provA, { plazoMaximo: '15/11/2026' })), 'VALIDACION', 'formato de fecha');
      assert.equal(await codigoDe(() => E('cotizaciones.generar', A.aux, { solicitudId: S1.id, plazoMaximo: plazo })), 'VALIDACION', 'sin proveedor');
      assert.equal(await codigoDe(() => cotizar(S1.id, ids.provSinCorreo)), 'VALIDACION', 'proveedor sin correo');
      assert.equal(await codigoDe(() => E('cotizaciones.generar', A.jefe, { solicitudId: S1.id, proveedorId: ids.provA, plazoMaximo: plazo })), 'PROHIBIDO');
    });

    it('cotiza un alimento: correo con PDF al proveedor, ENVIADA, y la solicitud sigue PENDIENTE', async () => {
      [d1, d2] = await (async () => { const filas = await alimentos(S1.id); return [filas.find((f) => f.producto_id === ids.arroz), filas.find((f) => f.producto_id === ids.pollo)]; })();
      cotA = await cotizar(S1.id, ids.provA, { detalleIds: [d1.id] });
      const correo = app.falsos.correos.at(-1);
      assert.equal(cotA.estado, 'ENVIADA');
      assert.equal(correo.para, 'a@prov.co');
      assert.equal(correo.adjuntos[0].contenido.subarray(0, 4).toString(), '%PDF');
      await app.drenado();
      assert.equal(await estadoSolicitud(S1.id), 'PENDIENTE');
    });

    it('el mismo proveedor no cotiza dos veces el mismo alimento', async () => {
      assert.equal(await codigoDe(() => cotizar(S1.id, ids.provA, { detalleIds: [d1.id] })), 'CONFLICTO');
    });

    it('si el correo no puede enviarse no se crea la cotización y el error queda en el log', async () => {
      const antes = (await app.q('SELECT 1 FROM cotizacion')).length;
      app.falsos.correoFalla = 1;
      assert.equal(await codigoDe(() => cotizar(S1.id, ids.provB)), 'SERVICIO_NO_DISPONIBLE');
      assert.equal((await app.q('SELECT 1 FROM cotizacion')).length, antes);
      assert.ok((await app.q("SELECT 1 FROM log_error WHERE modulo = 'cotizaciones'")).length >= 1);
    });

    it('cuando todos los alimentos tienen cotización, la solicitud pasa a EN TRÁMITE y se audita', async () => {
      cotB = await cotizar(S1.id, ids.provB);
      await app.drenado();
      assert.equal(cotB.alimentos, 2);
      assert.equal(await estadoSolicitud(S1.id), 'EN TRÁMITE');
      assert.equal((await app.q("SELECT 1 FROM auditoria WHERE entidad = 'solicitud_alimentos' AND accion = 'UPDATE' AND entidad_id = $1", [S1.id])).length, 1);
    });
  });

  describe('Valores y validación automática (CU-11, CU-12)', () => {
    it('lista las cotizaciones pendientes de valor y valida los valores ingresados', async () => {
      assert.equal((await E('cotizaciones.listar', A.compras, { pendientesDeValor: true })).total, 2);
      const un = (valorUnitario) => ({ valores: [{ detalleSolicitudId: d1.id, valorUnitario }] });
      assert.equal(await codigoDe(() => registrarValores(cotA.id, un(''))), 'VALIDACION', 'valor vacío');
      assert.equal(await codigoDe(() => registrarValores(cotA.id, un(-5))), 'VALIDACION', 'valor negativo');
      assert.equal(await codigoDe(() => registrarValores(cotB.id, un(10))), 'VALIDACION', 'faltan alimentos de la cotización');
      assert.equal(await codigoDe(() => E('cotizaciones.registrarValores', A.aux, { id: cotA.id, cuerpo: un(10) })), 'PROHIBIDO');
    });

    it('clasifica OPCIONADA (razón 0,89) y SOSPECHOSA (razón ~0,33, precio irrealmente bajo) y audita el resultado', async () => {
      const r = await registrarValores(cotA.id, { valores: [{ detalleSolicitudId: d1.id, valorUnitario: 4000 }] });
      assert.equal(r.valorTotal, 400_000);
      await registrarValores(cotB.id, { valores: await valores(S1.id, { arroz: 1800, pollo: 3300 }) });
      assert.ok(await app.drenado());
      assert.equal(await estadoCotizacion(cotA.id), 'OPCIONADA');
      assert.equal(await estadoCotizacion(cotB.id), 'SOSPECHOSA');
      assert.equal((await app.q("SELECT 1 FROM auditoria WHERE entidad = 'cotizacion' AND detalle->>'resultado' = 'OPCIONADA'")).length, 1);
      assert.equal(await codigoDe(() => registrarValores(cotA.id, { valores: [{ detalleSolicitudId: d1.id, valorUnitario: 1 }] })), 'VALIDACION', 'una cotización clasificada no admite nuevos valores');
    });

    it('clasifica RECHAZADA (razón 1,56) y SOSPECHOSA por precio irrealmente bajo (razón 0,44)', async () => {
      const alta = await ciclo(100, 7000);
      const baja = await ciclo(100, 2000);
      assert.equal(await estadoCotizacion(alta.c.id), 'RECHAZADA');
      assert.equal(await estadoCotizacion(baja.c.id), 'SOSPECHOSA');
    });

    it('sin valor sugerido la cotización queda pendiente y se valida sola cuando llega', { timeout: 60000 }, async () => {
      app.falsos.precios = 'caido';
      const S6 = await solicitar([itemArroz(10)]);
      await esperar(async () => (await app.q("SELECT intentos FROM outbox WHERE tipo = 'SolicitudRegistrada' AND payload->>'solicitudId' = $1", [S6.id]))[0].intentos >= 1);
      const c6 = await cotizar(S6.id, ids.provA);
      const val6 = { valores: await valores(S6.id, { arroz: 4000 }) };
      await registrarValores(c6.id, val6);
      assert.ok(await esperar(async () => (await app.q("SELECT 1 FROM log_error WHERE mensaje LIKE '%pendiente de validación%'")).length >= 1));
      assert.equal(await estadoCotizacion(c6.id), 'ENVIADA');
      assert.equal(await codigoDe(() => registrarValores(c6.id, val6)), 'CONFLICTO', 'valores ya registrados: exige confirmación');
      await registrarValores(c6.id, { ...val6, confirmarSobrescritura: true });

      app.falsos.precios = 'ok';
      await app.facade.ejecutarProcesoAutomatico('reintento_precios');
      assert.ok(await app.drenado());
      assert.equal(await estadoCotizacion(c6.id), 'OPCIONADA', '40.000 / 45.000');
      assert.equal((await app.q("SELECT 1 FROM outbox WHERE tipo = 'PrecioSugeridoActualizado' AND payload->>'solicitudId' = $1", [S6.id])).length, 1, 'el evento no se duplica');
    });

    it('los rangos por defecto son los del enunciado y se aplican en sus límites exactos', async () => {
      const [{ valor }] = await app.q("SELECT valor FROM parametro WHERE clave = 'rangos_validacion_cotizacion'");
      assert.deepEqual(valor, { sospechosa_bajo: 0.5, opcionada_max: 1.25, rechazada_sobre: 1.25 });
      const { clasificarCotizacion } = await import('../src/domain/modules/compras/ValidadorCotizacion.js');
      const clasificar = (razon) => clasificarCotizacion({ valorCotizado: razon * 100, valorSugerido: 100, rangos: valor }).estado;
      // más de 25 % por encima = RECHAZADA; más de 50 % por debajo = SOSPECHOSA; lo demás (extremos incluidos) = OPCIONADA
      assert.deepEqual(
        [1.26, 1.25, 1.19, 1, 0.5, 0.49].map(clasificar),
        ['RECHAZADA', 'OPCIONADA', 'OPCIONADA', 'OPCIONADA', 'OPCIONADA', 'SOSPECHOSA']
      );
    });

    it('sin rangos parametrizados no se clasifica y se registra el error', async () => {
      await app.q("UPDATE parametro SET valor = '{}'::jsonb WHERE clave = 'rangos_validacion_cotizacion'");
      try {
        const { c } = await ciclo(10, 4000);
        assert.equal(await estadoCotizacion(c.id), 'ENVIADA');
        assert.ok((await app.q("SELECT 1 FROM log_error WHERE mensaje LIKE '%rangos de validación%'")).length >= 1);
      } finally {
        await app.q(`UPDATE parametro SET valor = '{"sospechosa_bajo": 0.50, "opcionada_max": 1.25, "rechazada_sobre": 1.25}'::jsonb WHERE clave = 'rangos_validacion_cotizacion'`);
      }
    });
  });

  describe('Órdenes de compra (CU-13)', () => {
    it('muestra las cotizaciones OPCIONADAS de la solicitud; sin ellas informa', async () => {
      const opcionadas = await E('ordenes.opcionadas', A.compras, { solicitudId: S1.id });
      assert.equal(opcionadas.cotizaciones.length, 1);
      assert.equal(opcionadas.cotizaciones[0].valorTotal, 400_000);
      const [{ solicitud_id: sinOpcionadas }] = await app.q("SELECT solicitud_id FROM cotizacion WHERE estado = 'RECHAZADA' LIMIT 1");
      assert.match((await E('ordenes.opcionadas', A.compras, { solicitudId: sinOpcionadas })).mensaje, /no tiene cotizaciones OPCIONADAS/);
    });

    it('genera la orden solo de una cotización OPCIONADA y solo una vez', async () => {
      assert.equal(await codigoDe(() => E('ordenes.generar', A.compras, {})), 'VALIDACION', 'sin cotización seleccionada');
      assert.equal(await codigoDe(() => E('ordenes.generar', A.compras, { cotizacionId: cotB.id })), 'VALIDACION', 'SOSPECHOSA no genera orden');
      assert.equal(await codigoDe(() => E('ordenes.generar', A.aux, { cotizacionId: cotA.id })), 'PROHIBIDO');
      const orden = await E('ordenes.generar', A.compras, { cotizacionId: cotA.id });
      assert.ok(orden.consecutivo >= 1);
      assert.equal(orden.valorTotal, 400_000);
      assert.equal(orden.proveedor, 'Proveedor A');
      assert.equal(orden.alimentos[0].subtotal, 400_000);
      assert.equal(await codigoDe(() => E('ordenes.generar', A.compras, { cotizacionId: cotA.id })), 'CONFLICTO');
      assert.equal((await E('ordenes.listar', A.compras, { solicitudId: S1.id })).total, 1);
    });
  });

  describe('Los valores de compras no se ven fuera del área de compras (SRS 6.5)', () => {
    it('ni la auditoría ni los logs contienen montos', async () => {
      const auditoria = JSON.stringify(await app.q('SELECT detalle FROM auditoria'));
      const logs = JSON.stringify(await app.q('SELECT mensaje, detalle FROM log_error'));
      for (const prohibido of ['valorTotal', 'valorCotizado', 'valorSugerido', '"razon"', '400000', '1250000']) {
        assert.ok(!auditoria.includes(prohibido), `la auditoría contiene ${prohibido}`);
      }
      assert.ok(!/400000|1250000|450000/.test(logs), 'los logs contienen montos');
    });

    it('otros roles no consultan cotizaciones ni órdenes', async () => {
      for (const actor of [A.comercial, A.admin, A.jefe, A.mesero]) {
        assert.equal(await codigoDe(() => E('cotizaciones.listar', actor, {})), 'PROHIBIDO');
        assert.equal(await codigoDe(() => E('ordenes.listar', actor, {})), 'PROHIBIDO');
      }
    });
  });

  describe('Cotizar solicitudes ya en trámite', () => {
    it('respeta ESTADOS_SOLICITUD_COTIZABLES (configurable en estados.js)', async () => {
      const S9 = await solicitar([itemArroz(10)]);
      await app.drenado();
      await cotizar(S9.id, ids.provA);
      await app.drenado();
      assert.equal(await estadoSolicitud(S9.id), 'EN TRÁMITE');
      const permitido = ESTADOS_SOLICITUD_COTIZABLES.includes('EN TRÁMITE');
      assert.equal(await codigoDe(() => cotizar(S9.id, ids.provB)), permitido ? 'SIN_ERROR' : 'VALIDACION',
        permitido ? 'se permite comparar proveedores sobre una solicitud en trámite' : 'el SRS solo permite cotizar solicitudes PENDIENTE');
    });
  });
});
