/**
 * Prueba el servicio SOAP de precios configurado en MINCOMERCIO_API_URL (el real del DANE o el
 * simulador) y explica qué entrega, SIN descargar respuestas gigantes: lee solo el principio.
 *
 * Ejecutar directamente con node (en PowerShell, "npm run ... -- --opcion" pierde las opciones):
 *   node scripts/probarSipsa.js                          inspecciona el servicio y consulta Arroz, Pollo, Papa y Carne
 *   node scripts/probarSipsa.js Arroz Pollo Yuca         consulta esos productos
 *   node scripts/probarSipsa.js --crudo                  muestra además el principio de la respuesta SOAP sin interpretar
 *   node scripts/probarSipsa.js --operacion=promediosSipsaParcial   inspecciona otra operación del servicio
 *   node scripts/probarSipsa.js --max-kb=1000            cuánto leer de la respuesta para inspeccionarla (300 por defecto)
 *   node scripts/probarSipsa.js --completo               fuerza la consulta completa aunque la respuesta sea grande (límite 20 MB)
 *
 * Qué hace: (1) lee el XSD del servicio y muestra los parámetros de entrada de la operación;
 * (2) llama la operación y analiza el principio de la respuesta (registros, fechas, ciudades,
 * productos); (3) si la respuesta es pequeña, o con --completo, consulta los precios con el
 * adaptador del sistema.
 */
import https from 'node:https';
import http from 'node:http';
import { env } from '../src/config/env.js';
import { MinisterioComercioAdapter } from '../src/infrastructure/adapters/MinisterioComercioAdapter.js';
import { construirSobre } from '../src/infrastructure/adapters/soap.js';

const NAMESPACE = 'http://servicios.sipsa.co.gov.dane/';
const argumentos = process.argv.slice(2);
const bandera = (nombre) => argumentos.includes(`--${nombre}`);
const valorDe = (nombre, defecto) => argumentos.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1] ?? defecto;
const nombres = argumentos.filter((a) => !a.startsWith('--'));
const operacion = valorDe('operacion', 'promediosSipsaCiudad');
const maxBytes = Math.max(10, Number(valorDe('max-kb', 300)) || 300) * 1024;
const productos = (nombres.length ? nombres : ['Arroz', 'Pollo', 'Papa', 'Carne']).map((nombre, i) => ({ id: String(i + 1), nombre, unidad: 'kg' }));

const { baseUrl, ciudad, permitirHttp, cacheMinutos, timeoutMs } = env.ministerio;
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Lee hasta `maxBytes` de la respuesta y corta la conexión (sirve con respuestas de cientos de MB). */
function leerInicio({ url, metodo = 'GET', cabeceras = {}, cuerpo = null, limite }) {
  return new Promise((resolve, reject) => {
    let destino;
    try { destino = new URL(url); } catch { reject(new Error('La URL no es válida')); return; }
    const esHttps = destino.protocol === 'https:';
    if (!esHttps && !permitirHttp && !HOSTS_LOCALES.has(destino.hostname)) {
      reject(new Error('El servicio está en http://. Use https:// o agregue MINCOMERCIO_PERMITIR_HTTP=true al .env'));
      return;
    }
    const inicio = Date.now();
    const partes = [];
    let bytes = 0;
    let terminado = false;
    let msPrimerByte = null;
    const cerrar = (valor) => { if (!terminado) { terminado = true; resolve(valor); } };
    const fallar = (error) => { if (!terminado) { terminado = true; reject(error); } };

    const peticion = (esHttps ? https : http).request(
      destino,
      { method: metodo, timeout: timeoutMs, headers: { ...(cuerpo ? { 'Content-Length': Buffer.byteLength(cuerpo) } : {}), ...cabeceras } },
      (respuesta) => {
        const resultado = (completa) => ({
          estado: respuesta.statusCode, cabeceras: respuesta.headers, bytes, completa, ms: Date.now() - inicio, msPrimerByte,
          texto: Buffer.concat(partes).toString('utf8'),
        });
        respuesta.on('data', (parte) => {
          msPrimerByte ??= Date.now() - inicio;
          partes.push(parte);
          bytes += parte.length;
          if (bytes >= limite) { cerrar(resultado(false)); peticion.destroy(); }
        });
        respuesta.on('end', () => cerrar(resultado(true)));
        respuesta.on('error', fallar);
      }
    );
    peticion.on('timeout', () => peticion.destroy(new Error(`El servicio no respondió en ${timeoutMs} ms`)));
    peticion.on('error', fallar);
    if (cuerpo) peticion.write(cuerpo);
    peticion.end();
  });
}

const campo = (registro, nombre) => new RegExp(`<${nombre}>([^<]*)</${nombre}>`).exec(registro)?.[1];
const formatoBytes = (n) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`);

function mostrarXsd(texto) {
  const bloque = (nombre) => new RegExp(`<(?:\\w+:)?complexType name="${nombre}"[\\s\\S]*?</(?:\\w+:)?complexType>`).exec(texto)?.[0];
  const entrada = bloque(operacion);
  const salida = bloque(`${operacion}Response`);
  if (!entrada && !salida) {
    console.log('  No encontré la definición de la operación en el XSD; primeros 2500 caracteres:');
    console.log(texto.slice(0, 2500));
    return;
  }
  console.log(`  PARÁMETROS DE ENTRADA de ${operacion}:`);
  console.log(`    ${(entrada ?? '(no encontrado)').replace(/\s+/g, ' ')}`);
  console.log('  Estructura de la respuesta:');
  console.log(`    ${(salida ?? '(no encontrado)').replace(/\s+/g, ' ')}`);
}

console.log('Servicio de precios (SOAP 1.2)');
console.log(`  URL:              ${baseUrl || '(sin configurar: defina MINCOMERCIO_API_URL en el .env)'}`);
console.log(`  Operación:        ${operacion}`);
console.log(`  Ciudad:           ${ciudad || '(todas: se promedia entre ciudades)'}`);
console.log(`  HTTP sin cifrar:  ${permitirHttp ? 'permitido (MINCOMERCIO_PERMITIR_HTTP=true)' : 'no permitido (solo HTTPS)'}`);
console.log(`  Espera máxima:    ${timeoutMs} ms | lectura de inspección: ${formatoBytes(maxBytes)}\n`);

if (!baseUrl) { console.error('FALLÓ: falta MINCOMERCIO_API_URL en el .env'); process.exit(1); }

let respuestaCompletaPequena = false;

// ---- 1) XSD: parámetros de entrada ----
console.log('1) Definición del servicio (XSD)');
try {
  const xsd = await leerInicio({ url: `${baseUrl}?xsd=1`, limite: 400 * 1024 });
  if (xsd.estado === 200) mostrarXsd(xsd.texto);
  else console.log(`  El XSD respondió HTTP ${xsd.estado}; no se pudo leer.`);
} catch (error) {
  console.log(`  No se pudo leer el XSD: ${error.message}`);
}

// ---- 2) Respuesta: inspección ligera ----
console.log(`\n2) Respuesta de ${operacion} (se lee solo el principio)`);
try {
  const r = await leerInicio({
    url: baseUrl, metodo: 'POST', limite: maxBytes,
    cabeceras: { 'Content-Type': 'application/soap+xml; charset=utf-8; action=""', Accept: 'application/soap+xml, text/xml' },
    cuerpo: construirSobre({ namespace: NAMESPACE, operacion }),
  });
  const registros = r.texto.match(/<return>[\s\S]*?<\/return>/g) ?? [];
  console.log(`  HTTP ${r.estado} | primer byte a los ${((r.msPrimerByte ?? r.ms) / 1000).toFixed(2)} s | ${formatoBytes(r.bytes)} leídos en ${(r.ms / 1000).toFixed(2)} s | tipo: ${r.cabeceras['content-type'] ?? '?'} | tamaño declarado: ${r.cabeceras['content-length'] ? formatoBytes(Number(r.cabeceras['content-length'])) : 'no informado (respuesta por partes)'}`);
  if (r.completa) {
    console.log(`  Respuesta COMPLETA: ${formatoBytes(r.bytes)}, ${registros.length} registros.`);
    respuestaCompletaPequena = true;
  } else {
    const porRegistro = registros.length ? r.bytes / registros.length : 0;
    console.log(`  La respuesta es MAYOR que ${formatoBytes(r.bytes)} (se cortó la lectura a propósito).`);
    if (porRegistro) console.log(`  Cada registro pesa ~${Math.round(porRegistro)} bytes: 20 MB serían unos ${Math.round(20_000_000 / porRegistro).toLocaleString('es-CO')} registros, y el servicio entrega más.`);
  }
  if (registros.length) {
    const fechas = registros.map((x) => campo(x, 'fechaCaptura') ?? campo(x, 'fechaMesIni') ?? campo(x, 'enmaFecha') ?? campo(x, 'fechaIni')).filter(Boolean).map((f) => f.slice(0, 10)).sort();
    const ciudades = [...new Set(registros.map((x) => campo(x, 'ciudad') ?? campo(x, 'muniNombre')).filter(Boolean))];
    const prods = new Set(registros.map((x) => campo(x, 'producto') ?? campo(x, 'artiNombre')).filter(Boolean));
    const enviados = registros.reduce((acc, x) => { const v = campo(x, 'enviado'); if (v !== undefined) acc[v] = (acc[v] ?? 0) + 1; return acc; }, {});
    console.log(`  En lo leído: ${registros.length} registros | fechas ${fechas[0] ?? '?'} → ${fechas.at(-1) ?? '?'} | ${ciudades.length} ciudades | ${prods.size} productos | campo "enviado": ${JSON.stringify(enviados)}`);
    console.log(`  Ciudades vistas: ${ciudades.slice(0, 10).join(' · ')}`);

    // ORDEN en que llegan los datos: decide si basta con leer el principio de la respuesta
    const filas = registros.map((x) => ({
      fecha: (campo(x, 'fechaCaptura') ?? campo(x, 'fechaMesIni') ?? campo(x, 'enmaFecha') ?? campo(x, 'fechaIni') ?? '?').slice(0, 10),
      ciudad: campo(x, 'ciudad') ?? campo(x, 'muniNombre') ?? '?',
    }));
    const grupos = [];
    for (const f of filas) {
      const g = grupos.at(-1);
      if (g && g.fecha === f.fecha && g.ciudad === f.ciudad) g.n += 1; else grupos.push({ ...f, n: 1 });
    }
    let subidas = 0;
    let bajadas = 0;
    for (let i = 1; i < grupos.length; i += 1) {
      if (grupos[i].fecha > grupos[i - 1].fecha) subidas += 1;
      else if (grupos[i].fecha < grupos[i - 1].fecha) bajadas += 1;
    }
    const porFecha = filas.reduce((acc, f) => ({ ...acc, [f.fecha]: (acc[f.fecha] ?? 0) + 1 }), {});
    console.log('\n  ORDEN DE LOS DATOS en lo leído');
    console.log(`    Registros por fecha: ${Object.entries(porFecha).sort((x, y) => (x[0] < y[0] ? 1 : -1)).slice(0, 14).map(([f, n]) => `${f}: ${n}`).join(' | ')}`);
    console.log(`    Bloques consecutivos (fecha + ciudad): ${grupos.length}. Cambios de fecha entre bloques: ${bajadas} hacia fechas MÁS ANTIGUAS, ${subidas} hacia fechas MÁS NUEVAS.`);
    console.log('    Primeros bloques (fecha · ciudad · registros):');
    for (const g of grupos.slice(0, 14)) console.log(`      ${g.fecha} · ${g.ciudad} · ${g.n}`);
    if (grupos.length > 14) console.log(`      … (${grupos.length - 14} bloques más)`);
    console.log(`    Último bloque leído: ${grupos.at(-1).fecha} · ${grupos.at(-1).ciudad}`);
    console.log(`  Primer registro: ${registros[0].replace(/\s+/g, ' ')}`);
  } else {
    console.log('  No se vieron registros <return> en lo leído.');
  }
  if (bandera('crudo') || registros.length === 0) console.log(`\n  Principio de la respuesta cruda:\n${r.texto.slice(0, 1500)}`);
} catch (error) {
  console.log(`  FALLÓ: ${error.message}`);
  process.exitCode = 1;
}

// ---- 3) Consulta de precios con el adaptador del sistema ----
if (operacion !== 'promediosSipsaCiudad') process.exit();
if (!respuestaCompletaPequena && !bandera('completo')) {
  console.log('\n3) Consulta de precios con el adaptador: OMITIDA porque la respuesta es grande (use --completo para intentarla; límite 20 MB).');
} else {
  console.log('\n3) Consulta de precios con el adaptador del sistema');
  try {
    const adaptador = new MinisterioComercioAdapter();
    const inicio = Date.now();
    const resumen = await adaptador.resumenDeTabla({ forzar: true });
    console.log(`  OK en ${((Date.now() - inicio) / 1000).toFixed(2)} s: ${resumen.registros} registros, ${resumen.productos} productos distintos, ${resumen.ciudades.length} ciudades.`);
    console.log(`  Fecha de captura más reciente: ${resumen.fechaMasReciente ?? '(sin fechas)'}`);
    console.log('  Precio sugerido por kilogramo:');
    (await adaptador.consultarPrecios(productos)).forEach((p, i) => console.log(`    ${productos[i].nombre.padEnd(22)} ${p.precioSugerido === null ? `sin precio (${p.motivo})` : p.precioSugerido}`));
  } catch (error) {
    console.error(`  FALLÓ: ${error.message}${error.codigo ? ` [${error.codigo}${error.estado ? ` | HTTP ${error.estado}` : ''}]` : ''}`);
    process.exitCode = 1;
  }
}
