/**
 * Simulador local de las APIs externas (SOLO PARA PRUEBAS EN TU COMPUTADOR).
 *
 * 1) SERVICIO DE PRECIOS (SOAP 1.2): imita al servicio público de SIPSA (DANE), que representa
 *    al "servicio web del Ministerio de Comercio" del enunciado.
 *      POST /sipsaWS/SrvSipsaUpraBeanService          operación promediosSipsaCiudad
 *      GET  /sipsaWS/SrvSipsaUpraBeanService?WSDL     contrato del servicio
 *    Responde con el mismo formato del servicio real (un <return> por producto y ciudad, con
 *    ciudad, codProducto, fechaCaptura, precioPromedio por kilogramo y producto). No exige
 *    credenciales (el servicio real tampoco). Las demás operaciones del servicio real
 *    responden un SOAP Fault "no simulada".
 *    Productos con nombres al estilo SIPSA, por ejemplo "Arroz de primera" y "Arroz segunda":
 *    pedir "Arroz" devuelve 4.500 (promedio de sus variantes y ciudades), "Pollo" 12.000,
 *    "Papa" 3.200 y "Carne" 28.000. Un producto que no esté en la lista no tiene precio
 *    (el adaptador responde SIN_PRECIO), igual que pasaría con el servicio real.
 *    Igual que el servicio real, entrega un HISTORIAL (20 días) ordenado del día más reciente al más
 *    antiguo, y los precios de días anteriores son 1 % más baratos por día de antigüedad: así se
 *    comprueba que el adaptador usa el dato más reciente y deja de leer al salir de su ventana de días.
 *    Con --demora=<segundos> tarda ese tiempo en empezar a responder (el servicio real tarda ~17 s).
 *
 * 2) TENDENCIAS DE REDES SOCIALES (REST/JSON con Bearer): no existe una API pública gratuita de
 *    tendencias de Instagram, TikTok o X, así que se simula una con el contrato que asume el
 *    adaptador (RedesSocialesAdapter):
 *      GET /tendencias?categoria=gastronomia&pais=CO&limite=<n>[&fuente=tiktok]
 *      Authorization: Bearer <valor>
 *      200 -> { pais, categoria, actualizado, tendencias: [ { termino, fuente, puntaje, variacion, menciones } ] }
 *    28 términos de gastronomía en 4 fuentes (instagram, tiktok, youtube, x). El puntaje (5 a 100) cambia
 *    de un día a otro y sube y baja en ciclos semanales, pero es el mismo durante todo el día, de modo
 *    que la demostración es repetible. `variacion` es el cambio porcentual frente al día anterior.
 *    Algunos términos contienen nombres de productos del menú ("Arroz con coco", "Pollo al curry", "Papas
 *    rústicas") para generar promociones combinadas con los más solicitados, y otros no ("Brownie vegano")
 *    para generar promociones solo de tendencia. Un mismo término puede venir de dos fuentes.
 *    Solo conoce categoria=gastronomia y pais=CO; con otros valores responde una lista vacía.
 *    Con --redes-caidas responde 503 a las tendencias (el servicio de precios sigue funcionando), para
 *    mostrar que el sistema promociona entonces solo los productos más solicitados.
 *
 * Uso:   node scripts/mockServicios.js            (puerto 4010)
 *        node scripts/mockServicios.js --puerto=4020
 *        node scripts/mockServicios.js --demora=17     (imita la lentitud del servicio real)
 *        node scripts/mockServicios.js --redes-caidas  (las tendencias responden 503)
 *
 * Configuración en el .env del proyecto (reiniciar la API después de cambiarlo):
 *   MINCOMERCIO_API_URL=http://127.0.0.1:4010/sipsaWS/SrvSipsaUpraBeanService
 *   REDES_API_URL=http://127.0.0.1:4010
 *   REDES_API_TOKEN=token-de-prueba
 */
import http from 'node:http';

const argumentoPuerto = process.argv.find((a) => a.startsWith('--puerto='));
const PUERTO = Number(argumentoPuerto?.split('=')[1] ?? 4010);
const argumentoDemora = process.argv.find((a) => a.startsWith('--demora='));
const DEMORA_MS = Math.max(0, Number(argumentoDemora?.split('=')[1] ?? 0)) * 1000;
const DIAS_DE_HISTORIAL = 20;
const REDES_CAIDAS = process.argv.includes('--redes-caidas');

const RUTA_SOAP = '/sipsaWS/SrvSipsaUpraBeanService';
const NAMESPACE = 'http://servicios.sipsa.co.gov.dane/';

// Los factores se compensan (promedio exacto 1,00) para que los promedios sean números redondos
const CIUDADES = [
  { nombre: 'BOGOTÁ, D.C.', factor: 1.0 },
  { nombre: 'MEDELLÍN', factor: 0.97 },
  { nombre: 'CALI', factor: 1.03 },
  { nombre: 'BARRANQUILLA', factor: 1.0 },
];
// Precio por kilogramo (COP), nombres al estilo SIPSA
const PRODUCTOS = [
  ['Arroz de primera', 4600], ['Arroz segunda', 4400], ['Frijol cargamanto rojo', 9800], ['Lenteja importada', 5200],
  ['Pollo entero fresco sin vísceras', 12000], ['Carne de res en canal', 28000], ['Cerdo en canal', 15500], ['Mojarra lora', 14500],
  ['Papa criolla', 3400], ['Papa pastusa', 3000], ['Yuca ICA', 2200], ['Plátano hartón verde', 2600],
  ['Cebolla cabezona blanca', 2900], ['Tomate chonto', 3300], ['Zanahoria', 1800], ['Lechuga Batavia', 3600], ['Repollo', 2400],
  ['Aguacate Hass', 8200], ['Limón Tahití', 2700], ['Banano', 2100], ['Mango Tommy', 3900], ['Naranja', 1900], ['Ajo importado', 14500],
];

// [término, fuente, popularidad base]: unos contienen productos del menú y otros no
const TERMINOS = [
  ['Arroz con coco', 'tiktok', 88], ['Arroz con coco', 'instagram', 74], ['Ceviche de champiñones', 'instagram', 77],
  ['Bowl de pollo teriyaki', 'instagram', 82], ['Pollo al curry', 'youtube', 78], ['Papas rústicas en airfryer', 'tiktok', 80],
  ['Guacamole con aguacate Hass', 'instagram', 76], ['Yuca frita crocante', 'tiktok', 72], ['Costillas BBQ', 'tiktok', 71],
  ['Patacones con hogao', 'youtube', 70], ['Limonada de coco', 'tiktok', 69], ['Sancocho de gallina', 'youtube', 68],
  ['Ajiaco santafereño', 'youtube', 67], ['Frijoles con chicharrón', 'x', 66], ['Arepa de choclo', 'instagram', 65],
  ['Lentejas veganas', 'instagram', 64], ['Mojarra frita', 'youtube', 63], ['Carne al carbón', 'x', 62],
  ['Pan de bono', 'tiktok', 61], ['Ensalada de repollo y zanahoria', 'instagram', 60], ['Brownie vegano', 'tiktok', 59],
  ['Tomate relleno', 'instagram', 58], ['Mango biche con sal', 'tiktok', 57], ['Hamburguesa de lentejas', 'x', 56],
  ['Bowl de quinoa', 'x', 55], ['Pizza de plátano', 'instagram', 54], ['Cebolla caramelizada', 'x', 52], ['Banano al horno con miel', 'youtube', 50],
];

function hashear(texto) {
  let h = 2166136261;
  for (const caracter of texto) h = Math.imul(h ^ caracter.codePointAt(0), 16777619);
  return h >>> 0;
}

/** Puntaje de un término en un día: base + ruido distinto cada día + ciclo semanal propio de cada término. */
function puntajeDelDia(termino, fuente, base, dia) {
  const ruido = (hashear(`${termino}|${fuente}|${dia}`) % 31) - 15;
  const fase = (hashear(termino) % 628) / 100;
  const ola = Math.sin(((Date.parse(dia) / 86_400_000) / 7) * 2 * Math.PI + fase) * 8;
  return Math.max(5, Math.min(100, Math.round(base + ruido + ola)));
}

function tendenciasDelDia(filtros) {
  const hoy = diaEnColombia(0);
  const ayer = diaEnColombia(-1);
  if (filtros.categoria !== 'gastronomia' || filtros.pais !== 'CO') return [];
  return TERMINOS.filter(([, fuente]) => !filtros.fuente || fuente === filtros.fuente)
    .map(([termino, fuente, base]) => {
      const puntaje = puntajeDelDia(termino, fuente, base, hoy);
      const anterior = puntajeDelDia(termino, fuente, base, ayer);
      return { termino, fuente, puntaje, variacion: Math.round(((puntaje - anterior) / anterior) * 100), menciones: puntaje * 1000 + (hashear(`${termino}|${fuente}|${hoy}`) % 900) };
    })
    .sort((a, b) => b.puntaje - a.puntaje);
}

const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const diaEnColombia = (desplazamientoDias = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(Date.now() + desplazamientoDias * 86_400_000));

function registrosDeCiudad() {
  let regId = 212000 + DIAS_DE_HISTORIAL * PRODUCTOS.length * CIUDADES.length;
  const filas = [];
  // orden del servicio real: del día más reciente al más antiguo; dentro de cada día, por ciudad y producto
  for (let dias = 0; dias < DIAS_DE_HISTORIAL; dias += 1) {
    const dia = diaEnColombia(-dias);
    for (const { nombre, factor } of CIUDADES) {
      PRODUCTOS.forEach(([producto, base], indice) => {
        const precio = Math.round(Math.round(base * factor) * (1 - 0.01 * dias));
        regId -= 1;
        filas.push(
          `<return><ciudad>${escapar(nombre)}</ciudad><codProducto>${indice + 1}</codProducto><enviado>0</enviado>` +
            `<fechaCaptura>${dia}T00:00:00-05:00</fechaCaptura><fechaCreacion>${dia}T14:00:00-05:00</fechaCreacion>` +
            `<precioPromedio>${precio}</precioPromedio><producto>${escapar(producto)}</producto><regId>${regId}</regId></return>`
        );
      });
    }
  }
  return filas.join('');
}

const sobre = (cuerpo) =>
  `<?xml version='1.0' encoding='UTF-8'?><S:Envelope xmlns:S="http://www.w3.org/2003/05/soap-envelope"><S:Body>${cuerpo}</S:Body></S:Envelope>`;
const falla = (texto) =>
  sobre(`<S:Fault><S:Code><S:Value>S:Receiver</S:Value></S:Code><S:Reason><S:Text xml:lang="es">${escapar(texto)}</S:Text></S:Reason></S:Fault>`);

function wsdl(host) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Simulador local del servicio SIPSA (DANE): solo implementa promediosSipsaCiudad -->
<definitions xmlns:soap12="http://schemas.xmlsoap.org/wsdl/soap12/" xmlns:tns="${NAMESPACE}" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="http://schemas.xmlsoap.org/wsdl/" targetNamespace="${NAMESPACE}" name="SrvSipsaUpraBeanService">
  <types><xsd:schema><xsd:import namespace="${NAMESPACE}" schemaLocation="http://${host}${RUTA_SOAP}?xsd=1"/></xsd:schema></types>
  <message name="promediosSipsaCiudad"><part name="parameters" element="tns:promediosSipsaCiudad"/></message>
  <message name="promediosSipsaCiudadResponse"><part name="parameters" element="tns:promediosSipsaCiudadResponse"/></message>
  <portType name="SrvSipsaUpraService"><operation name="promediosSipsaCiudad"><input message="tns:promediosSipsaCiudad"/><output message="tns:promediosSipsaCiudadResponse"/></operation></portType>
  <binding name="SrvSipsaUpraPortBinding" type="tns:SrvSipsaUpraService"><soap12:binding transport="http://www.w3.org/2003/05/soap/bindings/HTTP/" style="document"/>
    <operation name="promediosSipsaCiudad"><soap12:operation soapAction=""/><input><soap12:body use="literal"/></input><output><soap12:body use="literal"/></output></operation></binding>
  <service name="SrvSipsaUpraBeanService"><port name="SrvSipsaUpraPort" binding="tns:SrvSipsaUpraPortBinding"><soap12:address location="http://${host}${RUTA_SOAP}"/></port></service>
</definitions>`;
}

function xsd() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:tns="${NAMESPACE}" xmlns:xs="http://www.w3.org/2001/XMLSchema" version="1.0" targetNamespace="${NAMESPACE}">
  <xs:element name="promediosSipsaCiudad" type="tns:promediosSipsaCiudad"/>
  <xs:element name="promediosSipsaCiudadResponse" type="tns:promediosSipsaCiudadResponse"/>
  <xs:complexType name="promediosSipsaCiudad"><xs:sequence/></xs:complexType>
  <xs:complexType name="promediosSipsaCiudadResponse"><xs:sequence><xs:element name="return" type="tns:registro" minOccurs="0" maxOccurs="unbounded"/></xs:sequence></xs:complexType>
  <xs:complexType name="registro"><xs:sequence>
    <xs:element name="ciudad" type="xs:string"/><xs:element name="codProducto" type="xs:long"/><xs:element name="enviado" type="xs:long"/>
    <xs:element name="fechaCaptura" type="xs:dateTime"/><xs:element name="fechaCreacion" type="xs:dateTime"/>
    <xs:element name="precioPromedio" type="xs:double"/><xs:element name="producto" type="xs:string"/><xs:element name="regId" type="xs:long"/>
  </xs:sequence></xs:complexType>
</xs:schema>`;
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const responder = (estado, tipo, cuerpo) => {
    res.writeHead(estado, { 'Content-Type': `${tipo}; charset=utf-8` });
    res.end(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
  };
  console.log(`[mock] ${req.method} ${url.pathname}${url.search}`);

  // ---- Servicio de precios SOAP (público: no exige credenciales) ----
  if (url.pathname === RUTA_SOAP) {
    if (req.method === 'GET') {
      const host = req.headers.host ?? `127.0.0.1:${PUERTO}`;
      if (url.searchParams.has('xsd')) return responder(200, 'text/xml', xsd());
      return responder(200, 'text/xml', wsdl(host));
    }
    if (req.method !== 'POST') return responder(405, 'application/soap+xml', falla('Método HTTP no admitido'));
    const partes = [];
    req.on('data', (parte) => partes.push(parte));
    req.on('end', () => {
      const cuerpo = Buffer.concat(partes).toString('utf8');
      const operacion = /<(?:[\w-]+:)?Body[^>]*>\s*<(?:[\w-]+:)?([A-Za-z]\w*)/.exec(cuerpo)?.[1];
      if (!operacion) return responder(400, 'application/soap+xml', falla('El mensaje no es un sobre SOAP válido'));
      if (operacion !== 'promediosSipsaCiudad') {
        return responder(500, 'application/soap+xml', falla(`La operación ${operacion} no está simulada; solo promediosSipsaCiudad`));
      }
      setTimeout(() => {
        responder(200, 'application/soap+xml', sobre(`<ns2:promediosSipsaCiudadResponse xmlns:ns2="${NAMESPACE}">${registrosDeCiudad()}</ns2:promediosSipsaCiudadResponse>`));
      }, DEMORA_MS);
    });
    return undefined;
  }

  // ---- Tendencias de redes sociales (REST/JSON con Bearer) ----
  if (!/^Bearer\s+\S+/.test(req.headers.authorization ?? '')) {
    return responder(401, 'application/json', { error: 'Falta la cabecera Authorization: Bearer <token>' });
  }
  if (url.pathname === '/tendencias') {
    if (REDES_CAIDAS) return responder(503, 'application/json', { error: 'Servicio de redes sociales no disponible (simulado con --redes-caidas)' });
    const limite = Math.max(1, Math.min(Number(url.searchParams.get('limite')) || 100, 100));
    const filtros = {
      categoria: url.searchParams.get('categoria') ?? 'gastronomia',
      pais: url.searchParams.get('pais') ?? 'CO',
      fuente: url.searchParams.get('fuente') ?? '',
    };
    return responder(200, 'application/json', {
      pais: filtros.pais, categoria: filtros.categoria, actualizado: new Date().toISOString(),
      tendencias: tendenciasDelDia(filtros).slice(0, limite),
    });
  }
  return responder(404, 'application/json', { error: 'La ruta no existe en el simulador' });
});

servidor.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `[mock] El puerto ${PUERTO} ya está en uso. Cierre la otra ventana del simulador o use --puerto=<otro>.`
      : `[mock] Error: ${error.message}`
  );
  process.exit(1);
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`[mock] Simulador de APIs externas escuchando en http://127.0.0.1:${PUERTO}`);
  console.log(`[mock] Precios (SOAP, como SIPSA/DANE): http://127.0.0.1:${PUERTO}${RUTA_SOAP}   (WSDL: agregue ?WSDL)`);
  if (REDES_CAIDAS) console.log('[mock] Las tendencias de redes sociales responden 503 (--redes-caidas)');
  if (DEMORA_MS) console.log(`[mock] Los precios tardan ${DEMORA_MS / 1000} s en responder (--demora)`);
  console.log('[mock] Deje esta ventana abierta mientras prueba. Para detenerlo: Ctrl + C');
});
