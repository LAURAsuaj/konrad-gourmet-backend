/**
 * La documentación no puede quedar atrás del código: si se agrega una ruta, una variable de
 * entorno, una regla, un catálogo, un rol o un evento sin documentarlo, o si un enlace interno
 * se rompe, estas pruebas fallan. No usan la base de datos.
 */
import './_soporte/entorno.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), 'utf8');

const { crearApiController } = await import('../src/presentation/controllers/apiController.js');
const { REGLAS } = await import('../src/domain/modules/parametrizacion/ReglasDefinicion.js');
const { CATALOGOS } = await import('../src/domain/modules/parametrizacion/CatalogosDefinicion.js');
const { ROLES } = await import('../src/domain/modules/auth/roles.js');
const { TIPOS_EVENTO } = await import('../src/domain/events/BusDeEventos.js');

const DOCUMENTOS = ['README.md', ...fs.readdirSync(path.join(raiz, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];

/** Rutas reales de la API, leídas del enrutador de Express. */
function rutasDeLaApi() {
  const router = crearApiController({ facade: {}, authMiddleware: (q, s, siguiente) => siguiente(), rbac: () => (q, s, siguiente) => siguiente() });
  return router.stack.filter((capa) => capa.route).flatMap((capa) => Object.keys(capa.route.methods).map((m) => ({ metodo: m.toUpperCase(), ruta: capa.route.path })));
}

/** Variables de entorno que lee src/config/env.js. */
function variablesDeEntorno() {
  const codigo = leer('src/config/env.js');
  const nombres = new Set([...codigo.matchAll(/(?:texto|entero|booleano|lista)\('([A-Z0-9_]+)'/g)].map((m) => m[1]));
  for (const m of codigo.matchAll(/process\.env\.([A-Z0-9_]+)/g)) nombres.add(m[1]);
  for (const m of /const OBLIGATORIAS = \[([^\]]+)\]/.exec(codigo)[1].matchAll(/'([A-Z0-9_]+)'/g)) nombres.add(m[1]);
  return [...nombres];
}

/** Anclas que GitHub genera para los encabezados de un documento (ignora los bloques de código). */
function anclasDe(texto) {
  const anclas = new Set();
  let enCodigo = false;
  for (const linea of texto.split('\n')) {
    if (linea.trimStart().startsWith('```')) { enCodigo = !enCodigo; continue; }
    const m = !enCodigo && /^#{1,6}\s+(.*)$/.exec(linea);
    if (m) anclas.add(m[1].toLowerCase().replace(/[`*]/g, '').trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-'));
  }
  return anclas;
}

describe('Documentación sincronizada con el código', () => {
  it('docs/API.md documenta cada ruta de la API con su encabezado y su fila en la matriz de permisos', () => {
    const api = leer('docs/API.md');
    const rutas = rutasDeLaApi();
    assert.ok(rutas.length >= 39);
    const sinDocumentar = rutas.filter(({ metodo, ruta }) => !api.includes(`### ${metodo} /api/v1${ruta}\n`) || !api.includes(`| \`${metodo} /api/v1${ruta}\` |`));
    assert.deepEqual(sinDocumentar, [], 'rutas sin documentar en docs/API.md');
    assert.ok(api.includes(`**${rutas.length} rutas**`), 'el total de rutas que anuncia docs/API.md está desactualizado');
    assert.ok(api.includes('### GET /salud\n'));
  });

  it('docs/API.md menciona cada rol', () => {
    const api = leer('docs/API.md');
    assert.deepEqual(Object.values(ROLES).filter((rol) => !api.includes(`\`${rol}\``)), []);
  });

  it('docs/CONFIGURACION.md documenta cada variable de entorno y cada una está en .env.example', () => {
    const configuracion = leer('docs/CONFIGURACION.md');
    const ejemplo = leer('.env.example');
    const variables = variablesDeEntorno();
    assert.ok(variables.length >= 41);
    assert.deepEqual(variables.filter((v) => !configuracion.includes(`| \`${v}\` |`)), [], 'variables sin documentar en docs/CONFIGURACION.md');
    assert.deepEqual(variables.filter((v) => !new RegExp(`^${v}=`, 'm').test(ejemplo)), [], 'variables que faltan en .env.example');
  });

  it('docs/CONFIGURACION.md documenta cada regla y cada catálogo', () => {
    const configuracion = leer('docs/CONFIGURACION.md');
    assert.deepEqual(Object.keys(REGLAS).filter((clave) => !configuracion.includes(`| \`${clave}\` |`)), []);
    assert.deepEqual(Object.keys(CATALOGOS).filter((nombre) => !configuracion.includes(`| \`${nombre}\` |`)), []);
  });

  it('docs/FLUJOS.md documenta cada evento del sistema', () => {
    const flujos = leer('docs/FLUJOS.md');
    assert.deepEqual(Object.values(TIPOS_EVENTO).filter((evento) => !flujos.includes(`\`${evento}\``)), []);
  });

  it('el README documenta cada comando de package.json', () => {
    const readme = leer('README.md');
    const comandos = Object.keys(JSON.parse(leer('package.json')).scripts);
    const sinDocumentar = comandos.filter((c) => !readme.includes(c === 'start' ? '`npm start`' : c === 'test' ? '`npm test`' : `\`npm run ${c}\``));
    assert.deepEqual(sinDocumentar, []);
  });
});

describe('Calidad de los documentos', () => {
  it('los enlaces internos apuntan a archivos y encabezados que existen', () => {
    const rotos = [];
    for (const documento of DOCUMENTOS) {
      const texto = leer(documento);
      for (const m of texto.matchAll(/\]\(([^)\s]+)\)/g)) {
        const destino = m[1];
        if (/^(https?:|mailto:)/.test(destino)) continue;
        const [archivo, ancla] = destino.split('#');
        const ruta = archivo ? path.join(path.dirname(documento), archivo) : documento;
        if (!fs.existsSync(path.join(raiz, ruta))) { rotos.push(`${documento}: ${destino} (el archivo no existe)`); continue; }
        if (ancla && ruta.endsWith('.md') && !anclasDe(leer(ruta)).has(ancla)) rotos.push(`${documento}: ${destino} (el encabezado no existe)`);
      }
    }
    assert.deepEqual(rotos, []);
  });

  it('todos los bloques de código están cerrados', () => {
    const desbalanceados = DOCUMENTOS.filter((d) => (leer(d).match(/^\s*```/gm) ?? []).length % 2 !== 0);
    assert.deepEqual(desbalanceados, []);
  });

  it('ningún documento contiene secretos reales (solo marcadores)', () => {
    const sospechosos = [];
    for (const documento of DOCUMENTOS) {
      const texto = leer(documento);
      if (/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/.test(texto)) sospechosos.push(`${documento}: parece un token JWT completo`);
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(texto)) sospechosos.push(`${documento}: contiene una llave privada`);
      if (/postgres(?:ql)?:\/\/[^:\s]+:(?!CAMBIAR|SuClave|\[YOUR-PASSWORD\]|CLAVE)[^@\s]{6,}@/.test(texto)) sospechosos.push(`${documento}: parece una cadena de conexión con contraseña real`);
    }
    assert.deepEqual(sospechosos, []);
  });
});
