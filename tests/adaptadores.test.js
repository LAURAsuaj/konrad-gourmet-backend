/**
 * Adaptadores de servicios externos (Ministerio de Comercio, correo y redes sociales),
 * cliente HTTP seguro, plantillas de notificación (Factory Method) y el simulador
 * scripts/mockServicios.js. No usan la base de datos.
 */
import './_soporte/entorno.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { puertoLibre, esperar } from './_soporte/utiles.js';
import { MinisterioComercioAdapter } from '../src/infrastructure/adapters/MinisterioComercioAdapter.js';
import { RedesSocialesAdapter } from '../src/infrastructure/adapters/RedesSocialesAdapter.js';
import { CorreoAdapter } from '../src/infrastructure/adapters/CorreoAdapter.js';
import { solicitarJson } from '../src/infrastructure/adapters/httpSeguro.js';
import { ServicioExternoError } from '../src/domain/services/ServicioExternoError.js';
import { NotificacionFactory } from '../src/domain/factories/NotificacionFactory.js';
import { Notificacion } from '../src/domain/factories/Notificacion.js';
import { ConfirmacionSolicitudCreator } from '../src/domain/factories/creators/ConfirmacionSolicitudCreator.js';
import { AlarmaStockCreator } from '../src/domain/factories/creators/AlarmaStockCreator.js';
import { PromocionCreator } from '../src/domain/factories/creators/PromocionCreator.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Adaptadores contra un servicio HTTP simulado', () => {
  let servidor;
  let url;
  let caido = false;

  before(async () => {
    servidor = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (caido) { res.statusCode = 503; res.end('{}'); return; }
      if (u.pathname === '/precios-sugeridos') {
        const producto = u.searchParams.get('producto');
        if (req.headers.authorization !== 'Bearer K') { res.statusCode = 401; res.end('{}'); return; }
        if (producto === 'Arroz') { res.end(JSON.stringify({ precioSugerido: 4500 })); return; }
        if (producto === 'Papa') { res.end(JSON.stringify({ valor: '3200' })); return; }
        if (producto === 'Sal') { res.statusCode = 404; res.end('{}'); return; }
        if (producto === 'Raro') { res.end(JSON.stringify({ precioSugerido: 'abc' })); return; }
        if (producto === 'Lento') return; // no responde nunca
        res.end('{}');
        return;
      }
      if (u.pathname === '/tendencias') {
        res.end(JSON.stringify({ tendencias: [
          { termino: 'Ceviche', puntaje: 50 }, { termino: 'ceviche', puntaje: 90, fuente: 'tiktok' },
          { termino: ' ', puntaje: 99 }, { termino: 'Brownie', puntaje: 70, fuente: 'instagram' },
        ] }));
        return;
      }
      res.statusCode = 404; res.end('{}');
    });
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${servidor.address().port}`;
  });
  after(() => servidor.close());

  const ministerio = () => new MinisterioComercioAdapter({ config: { baseUrl: url, apiKey: 'K', timeoutMs: 400 } });

  it('Ministerio: entrega precios válidos (número o texto numérico)', async () => {
    const r = await ministerio().consultarPrecios([{ id: '1', nombre: 'Arroz', unidad: 'kg' }, { id: '2', nombre: 'Papa' }]);
    assert.deepEqual(r.map((x) => x.precioSugerido), [4500, 3200]);
  });

  it('Ministerio: separa sin precio, valor inválido y servicio lento sin tumbar el lote', async () => {
    const r = await ministerio().consultarPrecios([
      { id: '3', nombre: 'Sal' }, { id: '4', nombre: 'Raro' }, { id: '5', nombre: 'Nada' }, { id: '6', nombre: 'Lento' }, { id: '1', nombre: 'Arroz' },
    ]);
    assert.deepEqual(r.map((x) => x.motivo), ['SIN_PRECIO', 'VALOR_INVALIDO', 'SIN_PRECIO', 'SERVICIO_NO_DISPONIBLE', null]);
    assert.equal(r[4].precioSugerido, 4500);
  });

  it('Ministerio: si el servicio está caído lanza un error reintentable', async () => {
    caido = true;
    try {
      await assert.rejects(ministerio().consultarPrecios([{ id: '1', nombre: 'Arroz' }]), (e) =>
        e instanceof ServicioExternoError && e.reintentable === true && e.estado === 503);
    } finally { caido = false; }
  });

  it('Ministerio: sin credenciales falla con CONFIGURACION (no reintentable)', async () => {
    const adaptador = new MinisterioComercioAdapter({ config: { baseUrl: '', apiKey: '' } });
    await assert.rejects(adaptador.consultarPrecios([{ id: '1', nombre: 'A' }]), (e) => e.codigo === 'CONFIGURACION' && !e.reintentable);
  });

  it('Cliente HTTP: rechaza http hacia un host externo (exige TLS)', async () => {
    await assert.rejects(solicitarJson({ servicio: 't', url: 'http://servicio-externo.com/x', timeoutMs: 300 }), (e) => e.codigo === 'CONFIGURACION');
  });

  it('Redes sociales: deduplica, descarta vacíos y ordena por puntaje', async () => {
    const redes = new RedesSocialesAdapter({ config: { baseUrl: url, token: 'T', timeoutMs: 400 } });
    const t = await redes.obtenerTendencias({ limite: 5 });
    assert.equal(t.length, 2);
    assert.deepEqual([t[0].puntaje, t[0].fuente], [90, 'tiktok']);
    assert.equal((await redes.obtenerTendencias({ limite: 1 })).length, 1);
  });
});

describe('Correo (SMTP)', () => {
  const adaptador = () => new CorreoAdapter({ transporter: nodemailer.createTransport({ jsonTransport: true }) });

  it('envía con adjunto PDF', async () => {
    const r = await adaptador().enviarCorreo({ para: 'a@b.co', asunto: 'Hola', texto: 'x', adjuntos: [{ nombre: 'c.pdf', contenido: Buffer.from('pdf'), tipoMime: 'application/pdf' }] });
    assert.ok(r.messageId);
    assert.deepEqual(r.aceptados, ['a@b.co']);
  });

  it('rechaza destinatarios inválidos y contenido vacío', async () => {
    await assert.rejects(adaptador().enviarCorreo({ para: 'malo', asunto: 'x', texto: 'y' }), (e) => e.codigo === 'DATOS_INVALIDOS');
    await assert.rejects(adaptador().enviarCorreo({ para: 'a@b.co', asunto: 'x' }), (e) => e.codigo === 'DATOS_INVALIDOS');
  });

  it('sin SMTP_HOST falla con CONFIGURACION', async () => {
    await assert.rejects(new CorreoAdapter({ config: { host: '' } }).enviarCorreo({ para: 'a@b.co', asunto: 'x', texto: 'y' }), (e) => e.codigo === 'CONFIGURACION');
  });
});

describe('Plantillas de notificación (Factory Method)', () => {
  it('las clases base son abstractas', () => {
    assert.throws(() => new NotificacionFactory(), TypeError);
    assert.throws(() => new Notificacion({}), TypeError);
  });

  it('confirmación de solicitud: asunto, tipo y HTML escapado', () => {
    const n = new ConfirmacionSolicitudCreator().crear({
      solicitud: { id: 's1', consecutivo: 15, estado: 'PENDIENTE', fecha: new Date() },
      solicitante: { id: 'u1', nombre: 'Ana <b>', correo: 'ana@kg.co' },
      punto: { nombre: 'Chapinero' },
      items: [{ producto: 'Arroz', cantidad: 12.5, unidad: 'kg', marca: 'Diana' }],
    });
    assert.equal(n.tipo, 'CONFIRMACION_SOLICITUD');
    assert.ok(n.asunto.includes('15'));
    assert.ok(n.cuerpoHtml.includes('Ana &lt;b&gt;'));
  });

  it('alarma de stock: incluye producto, cantidad y punto afectado', () => {
    const n = new AlarmaStockCreator().crear({
      producto: { id: 'p', nombre: 'Pollo', unidad: 'kg' }, cantidadActual: 4, cantidadReferencia: 20,
      punto: { id: 'x', nombre: 'Usaquén' }, destinatario: { id: 'u', nombre: 'Luis', correo: 'l@kg.co' },
    });
    for (const texto of ['Pollo', 'Usaquén', '4 kg', '20 %']) assert.ok(n.cuerpo.includes(texto), texto);
  });

  it('promoción: asunto y estructura de correo', () => {
    const n = new PromocionCreator().crear({ promocion: { titulo: '2x1 Ceviche', descripcion: 'Fin de semana', origen: 'COMBINADA', producto: 'Ceviche' }, destinatario: { nombre: 'Luis', correo: 'l@kg.co' } });
    assert.equal(n.asunto, 'Promoción sugerida: 2x1 Ceviche');
    assert.equal(n.aCorreo().para, 'l@kg.co');
  });

  it('datos inválidos lanzan ErrorCreacionNotificacion', () => {
    assert.throws(() => new AlarmaStockCreator().crear({ producto: { nombre: 'x' }, cantidadActual: 1, cantidadReferencia: 0, punto: { nombre: 'p' }, destinatario: {} }), { name: 'ErrorCreacionNotificacion' });
  });
});

describe('Simulador scripts/mockServicios.js frente a los adaptadores reales', () => {
  let proceso;
  let url;

  before(async () => {
    const puerto = await puertoLibre();
    url = `http://127.0.0.1:${puerto}`;
    let salida = '';
    proceso = spawn(process.execPath, ['scripts/mockServicios.js', `--puerto=${puerto}`], { cwd: raiz });
    proceso.stdout.on('data', (d) => { salida += d; });
    assert.ok(await esperar(() => salida.includes('escuchando'), 10000), 'el simulador no arrancó');
  });
  after(() => proceso.kill());

  it('responde precios estables y el caso "sin precio"', async () => {
    const min = new MinisterioComercioAdapter({ config: { baseUrl: url, apiKey: 'clave-de-prueba', timeoutMs: 3000 } });
    const r = await min.consultarPrecios([{ id: '1', nombre: 'Arroz' }, { id: '2', nombre: 'Pollo' }, { id: '3', nombre: 'Chocolate' }, { id: '4', nombre: 'Producto sinprecio' }, { id: '5', nombre: 'Árroz ' }]);
    assert.equal(r[0].precioSugerido, 4500);
    assert.equal(r[1].precioSugerido, 12000);
    assert.ok(r[2].precioSugerido >= 2000 && r[2].precioSugerido <= 19950);
    assert.equal(r[3].motivo, 'SIN_PRECIO');
    assert.equal(r[4].precioSugerido, 4500);
    assert.equal((await min.consultarPrecios([{ id: '3', nombre: 'Chocolate' }]))[0].precioSugerido, r[2].precioSugerido);
  });

  it('entrega tendencias con "Arroz con coco" primero', async () => {
    const t = await new RedesSocialesAdapter({ config: { baseUrl: url, token: 'token-de-prueba', timeoutMs: 3000 } }).obtenerTendencias({ limite: 10 });
    assert.equal(t[0].termino, 'Arroz con coco');
  });

  it('exige la cabecera Authorization', async () => {
    assert.equal((await fetch(`${url}/precios-sugeridos?producto=Arroz`)).status, 401);
  });
});
