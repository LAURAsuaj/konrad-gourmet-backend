/**
 * Simulador local de las APIs externas (SOLO PARA PRUEBAS EN TU COMPUTADOR).
 *
 * Responde lo que esperan los adaptadores del proyecto:
 *   GET /precios-sugeridos?producto=<nombre>&unidad=<unidad>   (Ministerio de Comercio)
 *   GET /tendencias?categoria=...&pais=...&limite=<n>          (redes sociales)
 * Ambas exigen una cabecera "Authorization: Bearer <cualquier valor>".
 *
 * Precios: Arroz 4.500, Pollo 12.000, Papa 3.200, Carne 28.000 y Leche 4.200. Para
 * cualquier otro producto devuelve un precio estable calculado a partir de su nombre
 * (entre 2.000 y 19.950). Un producto cuyo nombre contenga "sinprecio" responde 404,
 * para probar el caso de un producto sin precio sugerido.
 *
 * Uso:   node scripts/mockServicios.js            (puerto 4010)
 *        node scripts/mockServicios.js --puerto=4020
 *
 * Configuración en el .env del proyecto (reiniciar la API después de cambiarlo):
 *   MINCOMERCIO_API_URL=http://127.0.0.1:4010
 *   MINCOMERCIO_API_KEY=clave-de-prueba
 *   REDES_API_URL=http://127.0.0.1:4010
 *   REDES_API_TOKEN=token-de-prueba
 */
import http from 'node:http';

const argumentoPuerto = process.argv.find((a) => a.startsWith('--puerto='));
const PUERTO = Number(argumentoPuerto?.split('=')[1] ?? 4010);

const PRECIOS = { arroz: 4500, pollo: 12000, papa: 3200, carne: 28000, leche: 4200 };

const TENDENCIAS = [
  { termino: 'Arroz con coco', fuente: 'tiktok', puntaje: 95 },
  { termino: 'Ceviche de champiñones', fuente: 'instagram', puntaje: 88 },
  { termino: 'Pollo al curry', fuente: 'instagram', puntaje: 81 },
  { termino: 'Brownie vegano', fuente: 'tiktok', puntaje: 75 },
];

const normalizar = (texto) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** @returns {number|null} null cuando el producto debe responder "sin precio" */
function precioPara(nombre) {
  const clave = normalizar(nombre);
  if (clave.includes('sinprecio')) return null;
  if (PRECIOS[clave]) return PRECIOS[clave];
  let acumulado = 0;
  for (const caracter of clave) acumulado = (acumulado * 31 + caracter.charCodeAt(0)) % 360;
  return 2000 + acumulado * 50;
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const responder = (estado, cuerpo) => {
    res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(cuerpo));
  };
  console.log(`[mock] ${req.method} ${url.pathname}${url.search}`);

  if (!/^Bearer\s+\S+/.test(req.headers.authorization ?? '')) {
    responder(401, { error: 'Falta la cabecera Authorization: Bearer <token>' });
    return;
  }

  if (url.pathname === '/precios-sugeridos') {
    const producto = url.searchParams.get('producto');
    if (!producto) {
      responder(400, { error: 'Falta el parámetro producto' });
      return;
    }
    const precio = precioPara(producto);
    if (precio === null) {
      responder(404, { error: 'El Ministerio no tiene precio sugerido para este producto' });
      return;
    }
    responder(200, { producto, unidad: url.searchParams.get('unidad'), precioSugerido: precio });
    return;
  }

  if (url.pathname === '/tendencias') {
    const limite = Math.max(1, Math.min(Number(url.searchParams.get('limite')) || TENDENCIAS.length, 100));
    responder(200, { tendencias: TENDENCIAS.slice(0, limite) });
    return;
  }

  responder(404, { error: 'La ruta no existe en el simulador' });
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
  console.log('[mock] Deje esta ventana abierta mientras prueba. Para detenerlo: Ctrl + C');
});
