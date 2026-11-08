/**
 * Ejecutor de las pruebas: npm test
 *
 *   npm test                  corre todos los archivos de tests/*.test.js, uno por uno
 *   npm test -- cron          corre solo los archivos cuyo nombre contenga "cron"
 *
 * Levanta una base de datos PostgreSQL temporal (embebida, en un puerto libre y sin
 * instalar nada) y la elimina al terminar. Si ya tiene una base de pruebas propia, defina
 * TEST_DATABASE_URL (debe ser local y su nombre debe contener "test") y se usará esa.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { puertoLibre } from './_soporte/utiles.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const carpetaPruebas = path.join(raiz, 'tests');

async function levantarBaseTemporal() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-pg-'));
  const puerto = await puertoLibre();
  const servidor = new EmbeddedPostgres({
    databaseDir: directorio,
    user: 'postgres',
    password: 'prueba',
    port: puerto,
    persistent: false,
    postgresFlags: ['-c', 'max_connections=100'],
    onLog: () => {},
    onError: () => {},
  });
  try {
    await servidor.initialise();
    await servidor.start();
    await servidor.createDatabase('kg_test');
  } catch (error) {
    fs.rmSync(directorio, { recursive: true, force: true });
    throw new Error(
      `No se pudo iniciar la base de datos temporal: ${error.message}\n` +
        'Si ejecuta como administrador/root, PostgreSQL se niega a arrancar: use un usuario normal.\n' +
        'Alternativa: defina TEST_DATABASE_URL con una base local de pruebas (por ejemplo postgresql://postgres:clave@localhost:5432/kg_test).'
    );
  }
  return {
    url: `postgresql://postgres:prueba@127.0.0.1:${puerto}/kg_test`,
    async detener() {
      await servidor.stop().catch(() => {});
      fs.rmSync(directorio, { recursive: true, force: true });
    },
  };
}

function banderasDelEjecutor() {
  // --test-force-exit evita que un archivo quede colgado por un temporizador abierto (Node 22+ / 20.14+)
  const [mayor, menor] = process.versions.node.split('.').map(Number);
  return mayor > 20 || (mayor === 20 && menor >= 14) ? ['--test-force-exit'] : [];
}

function correrArchivo(archivo, url) {
  return new Promise((resolver) => {
    const hijo = spawn(process.execPath, ['--test', '--test-reporter=spec', ...banderasDelEjecutor(), path.join(carpetaPruebas, archivo)], {
      cwd: raiz,
      stdio: 'inherit',
      env: { ...process.env, TEST_DATABASE_URL: url },
    });
    hijo.on('exit', (codigo) => resolver(codigo ?? 1));
  });
}

async function principal() {
  const filtro = process.argv[2];
  const archivos = fs
    .readdirSync(carpetaPruebas)
    .filter((f) => f.endsWith('.test.js') && (!filtro || f.includes(filtro)))
    .sort();
  if (archivos.length === 0) {
    console.error(`No hay archivos de prueba${filtro ? ` que coincidan con "${filtro}"` : ''}.`);
    process.exit(1);
  }

  let base = null;
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.log('Iniciando la base de datos temporal de pruebas...');
    base = await levantarBaseTemporal();
    url = base.url;
  }

  const resultados = [];
  try {
    for (const archivo of archivos) {
      console.log(`\n=== ${archivo} ===`);
      resultados.push({ archivo, codigo: await correrArchivo(archivo, url) });
    }
  } finally {
    await base?.detener();
  }

  console.log('\n=== Resumen ===');
  for (const { archivo, codigo } of resultados) console.log(`${codigo === 0 ? 'OK    ' : 'FALLA '} ${archivo}`);
  process.exitCode = resultados.every((r) => r.codigo === 0) ? 0 : 1;
}

principal().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
