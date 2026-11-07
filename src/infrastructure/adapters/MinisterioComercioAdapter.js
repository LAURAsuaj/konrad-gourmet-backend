/**
 * Adapter del servicio web de precios del Ministerio (CU-10, CU-12). Implementa IPrecioSugeridoService.
 *
 * El enunciado habla de "un servicio web publicado por el Ministerio de Comercio". Ese servicio
 * se representa con el contrato SOAP 1.2 del servicio público de SIPSA (DANE), cuyo WSDL está en
 *   http://appweb.dane.gov.co/sipsaWS/SrvSipsaUpraBeanService?WSDL
 * y cuyo método `promediosSipsaCiudad` devuelve, por cada producto y ciudad, un registro como:
 *   <return><ciudad>CÚCUTA</ciudad><codProducto>8</codProducto><fechaCaptura>2017-11-23T00:00:00-05:00</fechaCaptura>
 *           <precioPromedio>2083</precioPromedio><producto>Pimentón</producto>...</return>
 * (ver docs/ARQUITECTURA.md: es un SUPUESTO documentado, y en desarrollo se usa el simulador
 * scripts/mockServicios.js, que responde con este mismo contrato).
 *
 * Cómo se obtiene el precio sugerido de un producto:
 * - El servicio no consulta por producto: entrega la tabla completa. El adaptador la pide una
 *   vez, la guarda en memoria (MINCOMERCIO_CACHE_MINUTOS) y responde cada producto desde ella.
 * - Se busca por nombre sin distinguir mayúsculas ni tildes: primero coincidencia exacta; si no
 *   hay, nombres que empiezan por el pedido ("Arroz" -> "Arroz de primera"); y si tampoco, nombres
 *   que contienen todas sus palabras. Con varias variantes se promedia el dato más reciente de cada
 *   variante y ciudad (o solo el de MINCOMERCIO_CIUDAD si se configuró).
 * - Los precios de SIPSA son por kilogramo: se convierten a gramo y libra; otra unidad (litro,
 *   unidad...) responde UNIDAD_NO_SOPORTADA.
 * - Si el servicio falla y hay datos guardados, se usan (aunque estén vencidos); si no, se lanza
 *   ServicioExternoError y el manejador reintenta más tarde.
 */
import { env } from '../../config/env.js';
import { IPrecioSugeridoService, MOTIVOS_SIN_PRECIO } from '../../domain/services/IPrecioSugeridoService.js';
import {
  ServicioExternoError,
  CODIGOS_ERROR_SERVICIO as CODIGOS,
} from '../../domain/services/ServicioExternoError.js';
import { solicitarSoap } from './soap.js';

const SERVICIO = 'ministerio_comercio';
const NAMESPACE = 'http://servicios.sipsa.co.gov.dane/';
const OPERACION = 'promediosSipsaCiudad';
const KILOS_POR_LIBRA = 0.45359237;
const FACTORES_DESDE_KILO = Object.freeze({
  kg: 1, kilo: 1, kilos: 1, kilogramo: 1, kilogramos: 1,
  g: 0.001, gr: 0.001, gramo: 0.001, gramos: 0.001,
  lb: KILOS_POR_LIBRA, libra: KILOS_POR_LIBRA, libras: KILOS_POR_LIBRA,
  t: 1000, ton: 1000, tonelada: 1000, toneladas: 1000,
});

/** Minúsculas, sin tildes ni signos y con espacios simples: "Pimentón (rojo)" -> "pimenton rojo". */
const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const redondear = (numero) => Math.round(numero * 100) / 100;

export class MinisterioComercioAdapter extends IPrecioSugeridoService {
  #config;
  #solicitar;
  #ahora;
  #tabla = null; // { filas, obtenidaEn }
  #enCurso = null;

  /**
   * @param {{config?: object, solicitar?: Function, ahora?: () => number}} [opciones]
   *        `solicitar` y `ahora` se inyectan solo en las pruebas.
   */
  constructor({ config = env.ministerio, solicitar = solicitarSoap, ahora = () => Date.now() } = {}) {
    super();
    this.#config = config;
    this.#solicitar = solicitar;
    this.#ahora = ahora;
  }

  async consultarPrecios(productos) {
    if (!Array.isArray(productos)) {
      throw new ServicioExternoError(SERVICIO, CODIGOS.DATOS_INVALIDOS, 'Se esperaba una lista de productos');
    }
    if (productos.length === 0) return [];
    for (const producto of productos) {
      if (!producto?.id || !producto?.nombre) {
        throw new ServicioExternoError(
          SERVICIO,
          CODIGOS.DATOS_INVALIDOS,
          'Cada producto requiere id y nombre para consultar su precio'
        );
      }
    }
    this.#validarConfiguracion();
    const { filas } = await this.#obtenerTabla();
    return productos.map((producto) => this.#precioDe(producto, filas));
  }

  /** Resumen de lo que entrega el servicio (para scripts/probarSipsa.js). `forzar` ignora lo guardado. */
  async resumenDeTabla({ forzar = false } = {}) {
    this.#validarConfiguracion();
    const { filas, obtenidaEn } = await this.#obtenerTabla(forzar);
    const ciudades = [...new Set(filas.map((f) => f.ciudad))].sort();
    const fechas = filas.map((f) => f.fecha).filter(Number.isFinite);
    return {
      registros: filas.length,
      productos: new Set(filas.map((f) => f.productoNorm)).size,
      ciudades,
      fechaMasReciente: fechas.length ? new Date(Math.max(...fechas)).toISOString() : null,
      obtenidaEn: new Date(obtenidaEn).toISOString(),
      muestra: filas.slice(0, 3).map(({ producto, ciudad, precio, fecha }) => ({ producto, ciudad, precio, fecha: Number.isFinite(fecha) ? new Date(fecha).toISOString() : null })),
    };
  }

  #validarConfiguracion() {
    if (!this.#config.baseUrl) {
      throw new ServicioExternoError(SERVICIO, CODIGOS.CONFIGURACION, 'Falta MINCOMERCIO_API_URL en la configuración');
    }
  }

  async #obtenerTabla(forzar = false) {
    const vigente = this.#tabla && this.#ahora() - this.#tabla.obtenidaEn < this.#config.cacheMinutos * 60_000;
    if (vigente && !forzar) return this.#tabla;
    // una sola consulta al servicio aunque lleguen varias solicitudes a la vez
    this.#enCurso ??= this.#descargar().finally(() => { this.#enCurso = null; });
    try {
      return await this.#enCurso;
    } catch (error) {
      if (this.#tabla) return this.#tabla; // datos vencidos, pero mejor que ninguno
      throw error;
    }
  }

  async #descargar() {
    const respuesta = await this.#solicitar({
      servicio: SERVICIO,
      url: this.#config.baseUrl,
      namespace: NAMESPACE,
      operacion: OPERACION,
      timeoutMs: this.#config.timeoutMs,
      permitirHttp: this.#config.permitirHttp,
    });
    const filas = (respuesta?.return ?? []).map(interpretarRegistro).filter(Boolean);
    this.#tabla = { filas, obtenidaEn: this.#ahora() };
    return this.#tabla;
  }

  #precioDe(producto, filas) {
    const base = { productoId: producto.id, precioSugerido: null };
    const factor = factorDeUnidad(producto.unidad);
    if (factor === null) return { ...base, motivo: MOTIVOS_SIN_PRECIO.UNIDAD_NO_SOPORTADA };

    const pedido = normalizar(producto.nombre);
    const palabras = pedido.split(' ');
    const ciudad = normalizar(this.#config.ciudad);
    const exactos = [];
    const prefijo = [];
    const contienen = [];
    for (const fila of filas) {
      if (ciudad && !fila.ciudadNorm.includes(ciudad)) continue;
      if (fila.productoNorm === pedido) exactos.push(fila);
      else if (fila.productoNorm.startsWith(`${pedido} `)) prefijo.push(fila);
      else if (palabras.every((palabra) => fila.palabras.has(palabra))) contienen.push(fila);
    }
    const candidatos = exactos.length ? exactos : prefijo.length ? prefijo : contienen;
    if (candidatos.length === 0) return { ...base, motivo: MOTIVOS_SIN_PRECIO.SIN_PRECIO };

    // el dato más reciente de cada variante de producto y ciudad
    const recientes = new Map();
    for (const fila of candidatos) {
      if (!fila.valido) continue;
      const clave = `${fila.productoNorm}|${fila.ciudadNorm}`;
      const previa = recientes.get(clave);
      if (!previa || fila.fecha > previa.fecha) recientes.set(clave, fila);
    }
    if (recientes.size === 0) return { ...base, motivo: MOTIVOS_SIN_PRECIO.VALOR_INVALIDO };

    const porKilo = [...recientes.values()].reduce((suma, fila) => suma + fila.precio, 0) / recientes.size;
    const precio = redondear(porKilo * factor);
    return precio > 0 ? { ...base, precioSugerido: precio, motivo: null } : { ...base, motivo: MOTIVOS_SIN_PRECIO.VALOR_INVALIDO };
  }
}

function factorDeUnidad(unidad) {
  if (unidad === undefined || unidad === null || String(unidad).trim() === '') return 1; // sin unidad: se asume kg
  return FACTORES_DESDE_KILO[normalizar(unidad)] ?? null;
}

/** <return> -> fila interna; null si no trae producto. Un precio inválido se conserva marcado como no válido. */
function interpretarRegistro(registro) {
  const producto = registro?.producto === undefined ? '' : String(registro.producto).trim();
  if (!producto) return null;
  const precio = Number(registro.precioPromedio);
  const fecha = Date.parse(registro.fechaCaptura ?? '');
  const productoNorm = normalizar(producto);
  const ciudad = String(registro.ciudad ?? '').trim();
  return {
    producto,
    productoNorm,
    palabras: new Set(productoNorm.split(' ')),
    ciudad,
    ciudadNorm: normalizar(ciudad),
    precio,
    valido: registro.precioPromedio !== undefined && registro.precioPromedio !== '' && Number.isFinite(precio) && precio > 0,
    fecha: Number.isFinite(fecha) ? fecha : 0,
  };
}
