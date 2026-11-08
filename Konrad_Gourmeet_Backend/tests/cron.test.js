/**
 * Procesos automáticos (contenedor cron): expresiones de los jobs, bloqueo entre instancias,
 * programación y reprogramación en caliente, resiliencia, ejecución manual (CLI) y los
 * HEALTHCHECK de Dockerfile.api y Dockerfile.cron.
 */
import './_soporte/entorno.js';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import { iniciarAplicacion, dormir, esperar } from './_soporte/aplicacion.js';
import { puertoLibre } from './_soporte/utiles.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const descuento = await import('../cron/jobs/descuentoDiario.js');
const tendencias = await import('../cron/jobs/consultarTendencias.js');
const reintento = await import('../cron/jobs/reintentarPrecios.js');
const { JOBS, iniciarWorker, bloqueoDistribuido, RUTA_LATIDO } = await import('../cron/worker.js');
const { env } = await import('../src/config/env.js');

// Una sola aplicación por archivo: los manejadores de eventos se suscriben al bus global una vez por proceso
const app = await iniciarAplicacion();
after(() => app.detener());

/** Ejecuta un comando y devuelve { codigo, salida, error }. */
function ejecutar(argumentos, opciones = {}) {
  return new Promise((resolver) => {
    const hijo = spawn(process.execPath, argumentos, { cwd: raiz, env: process.env, ...opciones });
    let salida = '';
    let error = '';
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stderr.on('data', (d) => { error += d; });
    hijo.on('exit', (codigo) => resolver({ codigo, salida, error }));
  });
}

/** Extrae el comando de un HEALTHCHECK de un Dockerfile (formato JSON de CMD). */
function comandoHealthcheck(dockerfile) {
  const texto = fs.readFileSync(path.join(raiz, dockerfile), 'utf8');
  return JSON.parse(/HEALTHCHECK[\s\S]*?CMD (\[.*\])/.exec(texto)[1]);
}

describe('Expresiones de los jobs', () => {
  const config = { descuentoDiarioFallback: '0 2 * * *', tendencias: '0 8 * * 1', reintentoPrecios: '*/30 * * * *' };
  const expresion = (job, programacion) => job.expresion({ programacion, config });

  it('descuento diario: HH:MM se convierte en expresión cron; una hora inválida usa el respaldo', () => {
    assert.equal(expresion(descuento, { horaDescuentoDiario: '03:30' }), '30 3 * * *');
    assert.equal(expresion(descuento, { horaDescuentoDiario: '00:05' }), '5 0 * * *');
    assert.equal(expresion(descuento, { horaDescuentoDiario: '23:59' }), '59 23 * * *');
    assert.equal(expresion(descuento, { horaDescuentoDiario: '25:00' }), '0 2 * * *');
    assert.equal(expresion(descuento, null), '0 2 * * *');
  });

  it('reintento de precios: minutos, horas y diario; un valor inválido usa el respaldo', () => {
    const casos = [[30, '*/30 * * * *'], [5, '*/5 * * * *'], [59, '*/59 * * * *'], [60, '0 */1 * * *'], [90, '0 */2 * * *'], [1440, '0 0 * * *']];
    for (const [minutos, esperada] of casos) assert.equal(reintento.expresionCadaMinutos(minutos), esperada);
    assert.equal(expresion(reintento, { reintentoPreciosMinutos: 'x' }), '*/30 * * * *');
    assert.equal(expresion(reintento, null), '*/30 * * * *');
  });

  it('las expresiones generadas son válidas para node-cron y los 3 jobs están registrados', () => {
    const todas = [expresion(descuento, { horaDescuentoDiario: '03:30' }), expresion(tendencias, {}), ...[1, 30, 59, 60, 90, 720, 1440].map((m) => reintento.expresionCadaMinutos(m))];
    assert.ok(todas.every((e) => cron.validate(e)));
    assert.deepEqual(JOBS.map((j) => j.nombre), ['descuento_diario', 'consultar_tendencias', 'reintentar_precios']);
  });
});

describe('Cron en ejecución', () => {
  const auditoriaDe = (proceso) => app.q("SELECT 1 FROM auditoria WHERE accion = 'EJECUCION' AND detalle->>'proceso' = $1 AND detalle->>'resultado' = 'OK'", [proceso]);

  it('el bloqueo entre instancias deja correr un job a la vez, se libera al terminar y tras un fallo', async () => {
    const lento = () => dormir(700).then(() => 'fin');
    const [a, b] = await Promise.all([bloqueoDistribuido('prueba', lento), bloqueoDistribuido('prueba', lento)]);
    assert.equal([a, b].filter((x) => x.omitido).length, 1);
    assert.equal([a, b].filter((x) => x.resultado === 'fin').length, 1);

    const [c, d] = await Promise.all([bloqueoDistribuido('uno', lento), bloqueoDistribuido('otro', lento)]);
    assert.ok(!c.omitido && !d.omitido, 'jobs distintos no se bloquean entre sí');
    assert.ok(!(await bloqueoDistribuido('prueba', async () => 1)).omitido, 'el bloqueo se libera al terminar');

    await assert.rejects(bloqueoDistribuido('falla', async () => { throw new Error('boom'); }), /boom/);
    const despues = await bloqueoDistribuido('falla', async () => 'recuperado');
    assert.deepEqual([despues.omitido, despues.resultado], [false, 'recuperado'], 'si el job falla el bloqueo no queda retenido');
  });

  it('programa los jobs, los ejecuta por la fachada como SISTEMA y se reprograma en caliente', { timeout: 60000 }, async () => {
    let ejecucionesLento = 0;
    const jobLento = { nombre: 'lento', expresion: () => '* * * * * *', ejecutar: async () => { ejecucionesLento += 1; await dormir(2500); } };
    const jobFalla = { nombre: 'falla', expresion: () => '*/2 * * * * *', ejecutar: async () => { throw new Error('fallo de prueba'); } };
    const rutaLatido = path.join(os.tmpdir(), 'kg-prueba-latido');
    const worker = iniciarWorker(app.contenedor, {
      config: { ...env.cron, tendencias: '*/2 * * * * *' }, jobs: [...JOBS, jobLento, jobFalla], intervaloSincronizacionMs: 400, rutaLatido,
    });
    try {
      await worker.sincronizar();
      const inicial = worker.expresiones();
      assert.equal(inicial.descuento_diario, '0 2 * * *', 'hora por defecto: 02:00');
      assert.equal(inicial.reintentar_precios, '*/30 * * * *');
      assert.equal(inicial.consultar_tendencias, '*/2 * * * * *');

      assert.ok(await esperar(async () => (await auditoriaDe('promociones')).length >= 2, 15000), 'el job de tendencias se ejecutó solo, varias veces');
      assert.ok((await app.q("SELECT 1 FROM auditoria WHERE accion = 'EJECUCION' AND usuario_id IS NULL AND correo = 'sistema'")).length >= 2, 'las ejecuciones quedan a nombre del SISTEMA');
      assert.ok(await esperar(async () => (await app.q("SELECT 1 FROM log_error WHERE modulo = 'cron' AND mensaje = 'Falló el job falla'")).length >= 2, 15000), 'un job que falla queda en el log y el worker sigue');
      assert.ok(ejecucionesLento >= 1 && ejecucionesLento <= 5, `un job lento no se superpone consigo mismo (${ejecucionesLento} ejecuciones)`);
      assert.ok(Date.now() - fs.statSync(rutaLatido).mtimeMs < 3000, 'el latido se renueva con cada sincronización');

      await app.q("UPDATE parametro SET valor = '\"04:15\"'::jsonb WHERE clave = 'hora_descuento_diario'");
      await app.q("UPDATE parametro SET valor = '90'::jsonb WHERE clave = 'reintento_precio_sugerido_minutos'");
      assert.ok(await esperar(async () => worker.expresiones().descuento_diario === '15 4 * * *' && worker.expresiones().reintentar_precios === '0 */2 * * *', 6000),
        'el Administrador cambia la hora y el intervalo y el cron los adopta sin reiniciar');
      assert.equal(cron.getTasks().size, 5, 'al reprogramar se elimina la tarea anterior: no se acumulan tareas en memoria');
    } finally {
      await worker.detener();
    }
    assert.equal(cron.getTasks().size, 0, 'al detener el worker no queda ninguna tarea registrada');
    const cuenta = (await auditoriaDe('promociones')).length;
    await dormir(2500);
    assert.equal((await auditoriaDe('promociones')).length, cuenta, 'tras detener() no se ejecuta ningún job más');
  });

  it('si no puede leer la programación usa el respaldo, conserva lo vigente y descarta expresiones inválidas', async () => {
    const config = { descuentoDiarioFallback: '0 2 * * *', tendencias: '0 8 * * 1', reintentoPrecios: '*/30 * * * *' };
    const errores = [];
    let lectura = 'falla';
    const falso = {
      facade: {
        consultarProgramacion: async () => { if (lectura === 'falla') throw new Error('bd caída'); return { horaDescuentoDiario: '05:00', reintentoPreciosMinutos: 10 }; },
        ejecutarProcesoAutomatico: async () => ({}),
      },
      registrador: { error: async (e) => errores.push(e.mensaje) },
    };
    const rutaLatido = path.join(os.tmpdir(), 'kg-prueba-latido-2');
    const w = iniciarWorker(falso, { config, intervaloSincronizacionMs: 60000, rutaLatido });
    const w2 = iniciarWorker(falso, { config: { ...config, tendencias: 'esto no es cron' }, intervaloSincronizacionMs: 60000, rutaLatido });
    try {
      await w.sincronizar();
      assert.equal(w.expresiones().descuento_diario, '0 2 * * *');
      assert.equal(errores.length, 1);
      lectura = 'ok';
      await w.sincronizar();
      assert.equal(w.expresiones().descuento_diario, '0 5 * * *');
      assert.equal(w.expresiones().reintentar_precios, '*/10 * * * *');
      lectura = 'falla';
      await w.sincronizar();
      assert.equal(w.expresiones().descuento_diario, '0 5 * * *', 'sin lectura conserva la programación vigente');

      lectura = 'ok';
      await w2.sincronizar();
      assert.ok(!('consultar_tendencias' in w2.expresiones()));
      assert.ok(errores.some((m) => m.includes('Expresión cron inválida')));
      assert.ok('descuento_diario' in w2.expresiones(), 'los demás jobs sí se programan');
    } finally {
      await w.detener();
      await w2.detener();
    }
  });
});

describe('Ejecución manual (CLI): node cron/worker.js --ejecutar=<job>', () => {
  const ultimaLinea = (salida) => JSON.parse(salida.trim().split('\n').pop());

  it('descuento_diario y reintentar_precios terminan con código 0 y devuelven su resultado', async () => {
    const d = await ejecutar(['cron/worker.js', '--ejecutar=descuento_diario']);
    assert.equal(d.codigo, 0);
    assert.equal(ultimaLinea(d.salida).pedidosProcesados, 0);
    const r = await ejecutar(['cron/worker.js', '--ejecutar=reintentar_precios']);
    assert.equal(r.codigo, 0);
    assert.equal(ultimaLinea(r.salida).pendientes, 0);
  });

  it('consultar_tendencias sin la API configurada termina bien y lo registra', async () => {
    const t = await ejecutar(['cron/worker.js', '--ejecutar=consultar_tendencias']);
    assert.equal(t.codigo, 0);
    assert.equal(ultimaLinea(t.salida).apiDisponible, false);
  });

  it('un job desconocido termina con código 1 y lista los disponibles', async () => {
    const x = await ejecutar(['cron/worker.js', '--ejecutar=inventado']);
    assert.equal(x.codigo, 1);
    assert.match(x.error, /Job desconocido/);
    assert.match(x.error, /descuento_diario/);
  });
});

describe('Contenedor cron y HEALTHCHECK', () => {
  it('el proceso del contenedor cron arranca con la programación de la base de datos, corre los jobs y se apaga en orden', { timeout: 60000, skip: process.platform === 'win32' ? 'en Windows SIGTERM no permite un apagado ordenado' : false }, async () => {
    await app.q("UPDATE parametro SET valor = '\"04:15\"'::jsonb WHERE clave = 'hora_descuento_diario'");
    const inicio = new Date();
    let salida = '';
    const hijo = spawn(process.execPath, ['cron/worker.js'], { cwd: raiz, env: { ...process.env, CRON_TENDENCIAS: '*/2 * * * * *' } });
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stderr.on('data', (d) => { salida += d; });
    const cerrado = new Promise((resolver) => hijo.on('exit', resolver));
    try {
      assert.ok(await esperar(() => salida.includes('worker iniciado'), 15000), 'el worker no arrancó');
      assert.ok(salida.includes('descuento_diario programado: "15 4 * * *"'), 'programación tomada de la base de datos');
      assert.ok(await esperar(async () => (await app.q("SELECT 1 FROM auditoria WHERE accion = 'EJECUCION' AND detalle->>'proceso' = 'promociones' AND fecha > $1", [inicio])).length >= 2, 15000), 'los jobs corren dentro del proceso');

      const [, ...argumentos] = comandoHealthcheck('Dockerfile.cron');
      assert.ok(fs.existsSync(RUTA_LATIDO));
      assert.equal((await ejecutar(argumentos, { cwd: raiz })).codigo, 0, 'HEALTHCHECK saludable con el worker vivo');
    } finally {
      hijo.kill('SIGTERM');
    }
    assert.equal(await Promise.race([cerrado, dormir(10000).then(() => 'TIMEOUT')]), 0, 'SIGTERM produce un apagado ordenado (código 0)');
    const viejo = new Date(Date.now() - 600_000);
    fs.utimesSync(RUTA_LATIDO, viejo, viejo);
    const [, ...argumentos] = comandoHealthcheck('Dockerfile.cron');
    assert.equal((await ejecutar(argumentos)).codigo, 1, 'HEALTHCHECK no saludable si el latido tiene más de 3 minutos');
  });

  it('HEALTHCHECK de Dockerfile.api: saludable si la API responde y no saludable si nadie escucha', async () => {
    const [, ...argumentos] = comandoHealthcheck('Dockerfile.api');
    const puerto = app.servidor.address().port;
    const sano = await ejecutar(argumentos, { env: { ...process.env, PORT: String(puerto), HTTPS_CERT_PATH: '' } });
    assert.equal(sano.codigo, 0);
    const libre = await puertoLibre();
    const caido = await ejecutar(argumentos, { env: { ...process.env, PORT: String(libre), HTTPS_CERT_PATH: '' } });
    assert.equal(caido.codigo, 1);
  });
});
