/**
 * Adaptadores de servicios externos (Ministerio de Comercio, correo y redes sociales),
 * cliente HTTP seguro, envío de correo contra un servidor SMTP real (STARTTLS, autenticación y
 * adjuntos), plantillas de notificación (Factory Method) y el simulador scripts/mockServicios.js.
 * No usan la base de datos.
 */
import './_soporte/entorno.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import nodemailer from 'nodemailer';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { puertoLibre, esperar } from './_soporte/utiles.js';
import { MinisterioComercioAdapter } from '../src/infrastructure/adapters/MinisterioComercioAdapter.js';
import { RedesSocialesAdapter } from '../src/infrastructure/adapters/RedesSocialesAdapter.js';
import { CorreoAdapter } from '../src/infrastructure/adapters/CorreoAdapter.js';
import { solicitarJson } from '../src/infrastructure/adapters/httpSeguro.js';
import { solicitarSoap } from '../src/infrastructure/adapters/soap.js';
import { ServicioExternoError } from '../src/domain/services/ServicioExternoError.js';
import { NotificacionFactory } from '../src/domain/factories/NotificacionFactory.js';
import { Notificacion } from '../src/domain/factories/Notificacion.js';
import { ConfirmacionSolicitudCreator } from '../src/domain/factories/creators/ConfirmacionSolicitudCreator.js';
import { AlarmaStockCreator } from '../src/domain/factories/creators/AlarmaStockCreator.js';
import { PromocionCreator } from '../src/domain/factories/creators/PromocionCreator.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Redes sociales (REST/JSON) y cliente HTTP seguro', () => {
  let servidor;
  let url;

  before(async () => {
    servidor = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
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

describe('Ministerio de Comercio · servicio SOAP con el contrato de SIPSA (DANE)', () => {
  const fila = (producto, ciudad, precio, fecha = '2026-11-06') =>
    `<return><ciudad>${ciudad}</ciudad><codProducto>1</codProducto><enviado>0</enviado><fechaCaptura>${fecha}T00:00:00-05:00</fechaCaptura><fechaCreacion>${fecha}T14:00:00-05:00</fechaCreacion><precioPromedio>${precio}</precioPromedio><producto>${producto}</producto><regId>1</regId></return>`;
  const sobre = (cuerpo) => `<?xml version='1.0' encoding='UTF-8'?><S:Envelope xmlns:S="http://www.w3.org/2003/05/soap-envelope"><S:Body>${cuerpo}</S:Body></S:Envelope>`;
  const respuesta = (filas) => sobre(`<ns2:promediosSipsaCiudadResponse xmlns:ns2="http://servicios.sipsa.co.gov.dane/">${filas.join('')}</ns2:promediosSipsaCiudadResponse>`);

  let servidor;
  let url;
  const estado = { peticiones: [], modo: 'ok', filas: [] };

  before(async () => {
    servidor = http.createServer((req, res) => {
      const partes = [];
      req.on('data', (d) => partes.push(d));
      req.on('end', () => {
        estado.peticiones.push({ metodo: req.method, tipo: req.headers['content-type'], cuerpo: Buffer.concat(partes).toString('utf8') });
        const enviar = (codigo, cuerpo) => { res.writeHead(codigo, { 'Content-Type': 'application/soap+xml' }); res.end(cuerpo); };
        switch (estado.modo) {
          case 'ok': return enviar(200, respuesta(estado.filas));
          case 'vacio': return enviar(200, sobre('<ns2:promediosSipsaCiudadResponse xmlns:ns2="http://servicios.sipsa.co.gov.dane/"/>'));
          case 'fault12': return enviar(500, sobre('<S:Fault><S:Code><S:Value>S:Receiver</S:Value></S:Code><S:Reason><S:Text xml:lang="es">Fallo de prueba 1.2</S:Text></S:Reason></S:Fault>'));
          case 'fault11': return enviar(500, '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>falla 1.1 de prueba</faultstring></soap:Fault></soap:Body></soap:Envelope>');
          case 'html500': return enviar(500, '<html><body>Error interno</body></html>');
          case 'xmlroto': return enviar(200, '<<<esto no es xml');
          case 'sinsobre': return enviar(200, '<html><body>hola</body></html>');
          case 'otraoperacion': return enviar(200, sobre('<ns2:otraCosa xmlns:ns2="x">1</ns2:otraCosa>'));
          case 'lento': return undefined; // no responde nunca
          default: return enviar(404, '');
        }
      });
    });
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${servidor.address().port}/sipsaWS/SrvSipsaUpraBeanService`;
  });
  after(() => servidor.close());

  const preparar = (modo, filas = []) => { estado.modo = modo; estado.filas = filas; estado.peticiones = []; };
  const adaptador = (config = {}, extra = {}) =>
    new MinisterioComercioAdapter({ config: { baseUrl: url, timeoutMs: 600, ciudad: '', permitirHttp: false, cacheMinutos: 60, ...config }, ...extra });
  const precios = async (a, ...nombres) => (await a.consultarPrecios(nombres.map((n, i) => (typeof n === 'string' ? { id: String(i), nombre: n } : { id: String(i), ...n })))).map((r) => r.precioSugerido);

  it('envía un sobre SOAP 1.2 por POST, sin parámetros, con el espacio de nombres del servicio', async () => {
    preparar('ok', [fila('Arroz', 'BOGOTÁ', 4500)]);
    await precios(adaptador(), 'Arroz');
    const [peticion] = estado.peticiones;
    assert.equal(peticion.metodo, 'POST');
    assert.match(peticion.tipo, /^application\/soap\+xml/);
    assert.ok(peticion.cuerpo.includes('http://www.w3.org/2003/05/soap-envelope'));
    assert.ok(peticion.cuerpo.includes('xmlns:ser="http://servicios.sipsa.co.gov.dane/"'));
    assert.match(peticion.cuerpo, /<ser:promediosSipsaCiudad><\/ser:promediosSipsaCiudad>/);
  });

  it('interpreta el ejemplo exacto de la guía del DANE (Pimentón en Cúcuta) sin distinguir tildes ni mayúsculas', async () => {
    preparar('ok', [fila('Pimentón', 'CÚCUTA', 2083, '2017-11-23')]);
    assert.deepEqual(await precios(adaptador(), 'Pimentón', 'pimenton', 'PIMENTÓN '), [2083, 2083, 2083]);
  });

  it('busca por nombre: exacto primero, luego "empieza por", luego "contiene las palabras"; con variantes promedia', async () => {
    preparar('ok', [
      fila('Arroz de primera', 'BOGOTÁ', 4600), fila('Arroz segunda', 'BOGOTÁ', 4400), fila('Papa criolla', 'BOGOTÁ', 3400),
      fila('Pollo entero fresco sin vísceras', 'BOGOTÁ', 12000), fila('Carne de res en canal', 'BOGOTÁ', 28000),
    ]);
    assert.deepEqual(await precios(adaptador(), 'Arroz', 'Papa criolla', 'Pollo', 'Res'), [4500, 3400, 12000, 28000]);
    preparar('ok', [fila('Arroz', 'BOGOTÁ', 5000), fila('Arroz de primera', 'BOGOTÁ', 4600)]);
    assert.deepEqual(await precios(adaptador(), 'Arroz'), [5000], 'la coincidencia exacta tiene prioridad');
  });

  it('usa el dato más reciente y promedia las ciudades, o solo MINCOMERCIO_CIUDAD si se configuró', async () => {
    const filas = [
      fila('Arroz', 'BOGOTÁ, D.C.', 4416, '2026-11-05'), fila('Arroz', 'BOGOTÁ, D.C.', 4600, '2026-11-06'),
      fila('Arroz', 'MEDELLÍN', 4224, '2026-11-05'), fila('Arroz', 'MEDELLÍN', 4400, '2026-11-06'),
    ];
    preparar('ok', filas);
    assert.deepEqual(await precios(adaptador(), 'Arroz'), [4500]);
    preparar('ok', filas);
    assert.deepEqual(await precios(adaptador({ ciudad: 'bogota' }), 'Arroz'), [4600]);
    preparar('ok', filas);
    assert.deepEqual((await adaptador({ ciudad: 'Cali' }).consultarPrecios([{ id: '1', nombre: 'Arroz' }]))[0].motivo, 'SIN_PRECIO');
  });

  it('convierte el precio por kilogramo a gramo y libra, y rechaza las unidades que no puede convertir', async () => {
    preparar('ok', [fila('Arroz', 'BOGOTÁ', 4500)]);
    const resultados = await adaptador().consultarPrecios([
      { id: '1', nombre: 'Arroz', unidad: 'kg' }, { id: '2', nombre: 'Arroz', unidad: 'lb' }, { id: '3', nombre: 'Arroz', unidad: 'g' },
      { id: '4', nombre: 'Arroz', unidad: 'l' }, { id: '5', nombre: 'Arroz' },
    ]);
    assert.deepEqual(resultados.map((r) => r.precioSugerido), [4500, 2041.17, 4.5, null, 4500]);
    assert.equal(resultados[3].motivo, 'UNIDAD_NO_SOPORTADA');
  });

  it('distingue producto inexistente (SIN_PRECIO) de precio inválido (VALOR_INVALIDO)', async () => {
    preparar('ok', [fila('Sal', 'BOGOTÁ', 'abc'), fila('Cero', 'BOGOTÁ', 0), fila('', 'BOGOTÁ', 100), fila('Bueno', 'BOGOTÁ', 10)]);
    const r = await adaptador().consultarPrecios([{ id: '1', nombre: 'Sal' }, { id: '2', nombre: 'Cero' }, { id: '3', nombre: 'Nada' }, { id: '4', nombre: 'Bueno' }]);
    assert.deepEqual(r.map((x) => x.motivo), ['VALOR_INVALIDO', 'VALOR_INVALIDO', 'SIN_PRECIO', null]);
  });

  it('pide la tabla UNA sola vez (también con consultas simultáneas) y la renueva cuando vence', async () => {
    preparar('ok', [fila('Arroz', 'BOGOTÁ', 4500)]);
    let reloj = 1_000_000;
    const a = adaptador({}, { ahora: () => reloj });
    await Promise.all(Array.from({ length: 5 }, () => precios(a, 'Arroz')));
    await precios(a, 'Arroz');
    assert.equal(estado.peticiones.length, 1);
    reloj += 61 * 60_000;
    await precios(a, 'Arroz');
    assert.equal(estado.peticiones.length, 2, 'vencidos los 60 minutos se vuelve a consultar');
  });

  it('si el servicio falla y hay datos guardados los usa; sin datos guardados lanza un error reintentable', async () => {
    preparar('ok', [fila('Arroz', 'BOGOTÁ', 4500)]);
    let reloj = 0;
    const a = adaptador({}, { ahora: () => reloj });
    assert.deepEqual(await precios(a, 'Arroz'), [4500]);
    estado.modo = 'html500';
    reloj += 61 * 60_000;
    assert.deepEqual(await precios(a, 'Arroz'), [4500], 'datos vencidos pero disponibles');

    await assert.rejects(adaptador().consultarPrecios([{ id: '1', nombre: 'Arroz' }]), (e) =>
      e instanceof ServicioExternoError && e.codigo === 'HTTP' && e.estado === 500 && e.reintentable === true);
  });

  it('traduce un SOAP Fault (1.2 y 1.1) a un error reintentable con el motivo del servicio', async () => {
    preparar('fault12');
    await assert.rejects(adaptador().consultarPrecios([{ id: '1', nombre: 'A' }]), (e) =>
      e.estado === 500 && e.reintentable === true && e.message.includes('SOAP Fault') && e.message.includes('Fallo de prueba 1.2'));
    preparar('fault11');
    await assert.rejects(adaptador().consultarPrecios([{ id: '1', nombre: 'A' }]), (e) => e.message.includes('falla 1.1 de prueba'));
  });

  it('rechaza respuestas que no son SOAP válido (XML roto, sin sobre o sin el elemento de la operación)', async () => {
    for (const modo of ['xmlroto', 'sinsobre', 'otraoperacion']) {
      preparar(modo);
      await assert.rejects(adaptador().consultarPrecios([{ id: '1', nombre: 'A' }]), (e) => e.codigo === 'RESPUESTA_INVALIDA', modo);
    }
  });

  it('una respuesta sin registros no es un error: todos los productos quedan SIN_PRECIO', async () => {
    preparar('vacio');
    const r = await adaptador().consultarPrecios([{ id: '1', nombre: 'Arroz' }]);
    assert.deepEqual([r[0].precioSugerido, r[0].motivo], [null, 'SIN_PRECIO']);
  });

  it('si el servicio no responde a tiempo lanza TIMEOUT (reintentable)', async () => {
    preparar('lento');
    await assert.rejects(adaptador({ timeoutMs: 300 }).consultarPrecios([{ id: '1', nombre: 'A' }]), (e) => e.codigo === 'TIMEOUT' && e.reintentable === true);
  });

  it('exige HTTPS salvo permiso explícito (MINCOMERCIO_PERMITIR_HTTP)', async () => {
    const hostExterno = 'http://servicio-externo.com/sipsaWS/SrvSipsaUpraBeanService';
    await assert.rejects(adaptador({ baseUrl: hostExterno }).consultarPrecios([{ id: '1', nombre: 'A' }]), (e) => e.codigo === 'CONFIGURACION' && /HTTPS/.test(e.message));
    // con el permiso ya no es un error de configuración: intenta conectar (y falla por red al no existir el host)
    await assert.rejects(
      adaptador({ baseUrl: 'http://localhost.invalid/sipsaWS/x', permitirHttp: true, timeoutMs: 1500 }).consultarPrecios([{ id: '1', nombre: 'A' }]),
      (e) => ['RED', 'TIMEOUT'].includes(e.codigo)
    );
  });

  it('valida la configuración y los datos de entrada', async () => {
    await assert.rejects(adaptador({ baseUrl: '' }).consultarPrecios([{ id: '1', nombre: 'A' }]), (e) => e.codigo === 'CONFIGURACION' && !e.reintentable && /MINCOMERCIO_API_URL/.test(e.message));
    await assert.rejects(adaptador().consultarPrecios('no es lista'), (e) => e.codigo === 'DATOS_INVALIDOS');
    await assert.rejects(adaptador().consultarPrecios([{ nombre: 'sin id' }]), (e) => e.codigo === 'DATOS_INVALIDOS');
    assert.deepEqual(await adaptador().consultarPrecios([]), []);
  });

  it('resumenDeTabla informa registros, productos, ciudades y la fecha más reciente (para npm run sipsa:probar)', async () => {
    preparar('ok', [fila('Arroz', 'BOGOTÁ', 4500, '2026-11-05'), fila('Arroz', 'CALI', 4300, '2026-11-06'), fila('Papa', 'CALI', 3000, '2026-11-06')]);
    const resumen = await adaptador().resumenDeTabla({ forzar: true });
    assert.deepEqual([resumen.registros, resumen.productos, resumen.ciudades], [3, 2, ['BOGOTÁ', 'CALI']]);
    assert.ok(resumen.fechaMasReciente.startsWith('2026-11-06'));
    assert.equal(resumen.muestra.length, 3);
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

describe('Correo por SMTP real (STARTTLS, autenticación y adjuntos)', () => {
  const llave = fs.readFileSync(path.join(raiz, 'tests', '_soporte', 'certificado-prueba.key'));
  const certificado = fs.readFileSync(path.join(raiz, 'tests', '_soporte', 'certificado-prueba.crt'));
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2000, 7)]);
  let verificacionAnterior;

  // El certificado de prueba es autofirmado: solo en este grupo se desactiva su verificación
  before(() => { verificacionAnterior = process.env.NODE_TLS_REJECT_UNAUTHORIZED; process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; });
  after(() => {
    if (verificacionAnterior === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = verificacionAnterior;
  });

  async function servidorSmtp(opciones = {}) {
    const estado = { recibidos: [], tls: null, intentosAuth: 0 };
    const servidor = new SMTPServer({
      key: llave, cert: certificado, allowInsecureAuth: false, ...opciones,
      onAuth(auth, session, devolver) {
        estado.intentosAuth += 1;
        if (auth.username === 'usuario' && auth.password === 'clave') devolver(null, { user: 1 });
        else devolver(new Error('Credenciales SMTP inválidas'));
      },
      onSecure(socket, session, devolver) { estado.tls = socket.getProtocol(); devolver(); },
      onData(flujo, session, devolver) { simpleParser(flujo).then((mensaje) => { estado.recibidos.push({ mensaje, seguro: session.secure }); devolver(); }); },
    });
    servidor.on('error', () => {}); // avisa cada handshake TLS rechazado: aquí es lo esperado
    await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    return { servidor, estado, puerto: servidor.server.address().port, cerrar: () => new Promise((resolver) => servidor.close(resolver)) };
  }
  const adaptador = (puerto, extra = {}, tlsMinVersion = 'TLSv1.3') =>
    new CorreoAdapter({ config: { host: '127.0.0.1', port: puerto, secure: false, user: 'usuario', pass: 'clave', remitente: 'Konrad Gourmet <no-reply@kg.co>', ...extra }, tlsMinVersion });
  const intentar = async (adaptadorCorreo) => {
    try { await adaptadorCorreo.enviarCorreo({ para: 'x@kg.co', asunto: 'a', texto: 'b' }); return null; } catch (error) { return error; }
  };

  it('envía por STARTTLS con TLS 1.3, autenticado, con asunto con tildes y el PDF adjunto intacto', async () => {
    const { estado, puerto, cerrar } = await servidorSmtp();
    const correo = adaptador(puerto);
    try {
      const r = await correo.enviarCorreo({ para: ['proveedor@kg.co'], asunto: 'Solicitud de cotización N.º 7', texto: 'Hola', html: '<p>Hola</p>', adjuntos: [{ nombre: 'cotizacion-7.pdf', contenido: pdf, tipoMime: 'application/pdf' }] });
      const { mensaje, seguro } = estado.recibidos[0];
      assert.ok(r.aceptados.includes('proveedor@kg.co'));
      assert.equal(estado.tls, 'TLSv1.3');
      assert.equal(seguro, true);
      assert.equal(mensaje.subject, 'Solicitud de cotización N.º 7');
      assert.ok(mensaje.from.text.includes('no-reply@kg.co'));
      assert.equal(mensaje.attachments.length, 1);
      assert.equal(mensaje.attachments[0].filename, 'cotizacion-7.pdf');
      assert.equal(mensaje.attachments[0].contentType, 'application/pdf');
      assert.ok(mensaje.attachments[0].content.equals(pdf), 'el PDF debe llegar sin alteraciones');
    } finally { correo.cerrar(); await cerrar(); }
  });

  it('las credenciales SMTP inválidas dan un error de envío reintentable', async () => {
    const { puerto, cerrar } = await servidorSmtp();
    const correo = adaptador(puerto, { pass: 'equivocada' });
    try {
      const error = await intentar(correo);
      assert.equal(error?.name, 'ServicioExternoError');
      assert.equal(error.codigo, 'ENVIO');
      assert.equal(error.reintentable, true);
    } finally { correo.cerrar(); await cerrar(); }
  });

  it('si el servidor no ofrece cifrado NO envía ni se autentica en claro', async () => {
    const { estado, puerto, cerrar } = await servidorSmtp({ disabledCommands: ['STARTTLS'], allowInsecureAuth: true });
    const correo = adaptador(puerto);
    try {
      assert.equal((await intentar(correo))?.codigo, 'ENVIO');
      assert.equal(estado.recibidos.length, 0);
      assert.equal(estado.intentosAuth, 0, 'las credenciales no deben viajar sin cifrar');
    } finally { correo.cerrar(); await cerrar(); }
  });

  it('exige la versión mínima de TLS configurada (CO-6): rechaza TLS 1.2 si se pide 1.3', async () => {
    const solo12 = await servidorSmtp({ maxVersion: 'TLSv1.2' });
    const exigente = adaptador(solo12.puerto);
    const permisivo = adaptador(solo12.puerto, {}, 'TLSv1.2');
    try {
      assert.equal((await intentar(exigente))?.codigo, 'ENVIO');
      assert.equal(solo12.estado.recibidos.length, 0);
      assert.equal(await intentar(permisivo), null, 'con TLS_MIN_VERSION=TLSv1.2 (solo desarrollo) sí se acepta');
      assert.equal(solo12.estado.tls, 'TLSv1.2');
    } finally { exigente.cerrar(); permisivo.cerrar(); await solo12.cerrar(); }
  });

  it('un servidor SMTP caído da un error de envío reintentable', async () => {
    const puertoCerrado = await puertoLibre();
    const correo = adaptador(puertoCerrado);
    try {
      const error = await intentar(correo);
      assert.equal(error?.codigo, 'ENVIO');
      assert.equal(error.reintentable, true);
    } finally { correo.cerrar(); }
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

  const urlSoap = () => `${url}/sipsaWS/SrvSipsaUpraBeanService`;

  it('responde el servicio SOAP de precios con el contrato de SIPSA: promedios redondos y "sin precio"', async () => {
    const min = new MinisterioComercioAdapter({ config: { baseUrl: urlSoap(), timeoutMs: 3000, ciudad: '', permitirHttp: false, cacheMinutos: 60 } });
    const r = await min.consultarPrecios([
      { id: '1', nombre: 'Arroz' }, { id: '2', nombre: 'Pollo' }, { id: '3', nombre: 'Papa' }, { id: '4', nombre: 'Carne' },
      { id: '5', nombre: 'Chocolate' }, { id: '6', nombre: 'Producto sinprecio' }, { id: '7', nombre: 'Árroz ' }, { id: '8', nombre: 'Arroz', unidad: 'lb' },
    ]);
    assert.deepEqual(r.slice(0, 4).map((x) => x.precioSugerido), [4500, 12000, 3200, 28000]);
    assert.deepEqual([r[4].motivo, r[5].motivo], ['SIN_PRECIO', 'SIN_PRECIO'], 'lo que no está en la lista no tiene precio');
    assert.equal(r[6].precioSugerido, 4500);
    assert.equal(r[7].precioSugerido, 2041.17);
    const resumen = await min.resumenDeTabla();
    assert.deepEqual([resumen.registros, resumen.productos, resumen.ciudades.length], [176, 22, 4]);
  });

  it('publica su WSDL y responde un SOAP Fault a las operaciones del servicio real que no simula', async () => {
    const wsdl = await (await fetch(`${urlSoap()}?WSDL`)).text();
    assert.ok(wsdl.includes('promediosSipsaCiudad') && wsdl.includes('soap12:address') && wsdl.includes(urlSoap()));
    await assert.rejects(
      solicitarSoap({ servicio: 'prueba', url: urlSoap(), namespace: 'http://servicios.sipsa.co.gov.dane/', operacion: 'promediosSipsaMesMadr', timeoutMs: 3000 }),
      (e) => e.estado === 500 && /no está simulada/.test(e.message)
    );
  });

  it('entrega tendencias con "Arroz con coco" primero', async () => {
    const t = await new RedesSocialesAdapter({ config: { baseUrl: url, token: 'token-de-prueba', timeoutMs: 3000 } }).obtenerTendencias({ limite: 10 });
    assert.equal(t[0].termino, 'Arroz con coco');
  });

  it('las tendencias exigen la cabecera Authorization (el servicio de precios es público, como el de SIPSA)', async () => {
    assert.equal((await fetch(`${url}/tendencias`)).status, 401);
  });
});
