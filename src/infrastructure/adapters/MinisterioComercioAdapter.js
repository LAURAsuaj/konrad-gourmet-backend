/**
 * Adapter del servicio web de precios del Ministerio (CU-10, CU-12). Implementa IPrecioSugeridoService.
 *
 * El enunciado habla de "un servicio web publicado por el Ministerio de Comercio". Ese servicio
 * se representa con el servicio SOAP 1.2 público de SIPSA (DANE), cuyo WSDL está en
 *   https://appweb.dane.gov.co/sipsaWS/SrvSipsaUpraBeanService?WSDL
 * y cuyo método `promediosSipsaCiudad` devuelve un registro por producto, ciudad y día de captura:
 *   <return><ciudad>BUCARAMANGA</ciudad><codProducto>8</codProducto><enviado>0</enviado>
 *           <fechaCaptura>2026-11-06T00:00:00-05:00</fechaCaptura><precioPromedio>6250</precioPromedio>
 *           <producto>Pimentón</producto><regId>705783</regId>...</return>
 * (es un SUPUESTO documentado en docs/ARQUITECTURA.md; en desarrollo se usa el simulador
 * scripts/mockServicios.js, que responde con este mismo contrato).
 *
 * Comportamiento REAL del servicio, comprobado con `npm run sipsa:probar` (noviembre de 2026):
 * - No recibe parámetros: no se puede pedir un producto, una ciudad ni un rango de fechas.
 * - Responde con TODO el historial (más de 20 MB), tarda ~17 s en empezar a responder, y entrega
 *   los registros del MÁS RECIENTE al más antiguo (76 cambios de fecha, todos hacia atrás).
 * Por eso el adaptador lee la respuesta EN FLUJO, interpreta los registros a medida que llegan y
 * CORTA la conexión cuando ya pasó la ventana de MINCOMERCIO_VENTANA_DIAS días respecto del dato más
 * nuevo (o al llegar a un tope de tamaño). Así no descarga el historial completo.
 *
 * Cómo se obtiene el precio sugerido de un producto:
 * - La tabla de la ventana se guarda en memoria (MINCOMERCIO_CACHE_MINUTOS) y cada producto se
 *   responde desde ella; consultas simultáneas comparten una sola llamada al servicio.
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
import { solicitarSoapEnFlujo } from './soap.js';

const SERVICIO = 'ministerio_comercio';
const NAMESPACE = 'http://servicios.sipsa.co.gov.dane/';
const OPERACION = 'promediosSipsaCiudad';
const KILOS_POR_LIBRA = 0.45359237;
const DIA_MS = 86_400_000;
// registros seguidos más antiguos que la ventana para dar por terminada la lectura (tolera un registro suelto fuera de orden)
const REGISTROS_ANTIGUOS_PARA_CORTAR = 50;
const TOPE_DE_LECTURA_BYTES = 15_000_000;
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
  #tabla = null; // { filas, obtenidaEn, bytes, detenidaPorVentana, truncada }
  #enCurso = null;

  /**
   * @param {{config?: object, solicitar?: Function, ahora?: () => number}} [opciones]
   *        `solicitar` y `ahora` se inyectan solo en las pruebas.
   */
  constructor({ config = env.ministerio, solicitar = solicitarSoapEnFlujo, ahora = () => Date.now() } = {}) {
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
    const { filas, obtenidaEn, bytes, detenidaPorVentana, truncada } = await this.#obtenerTabla(forzar);
    const ciudades = [...new Set(filas.map((f) => f.ciudad))].sort();
    const nombres = new Map(filas.map((f) => [f.productoNorm, f.producto]));
    const fechas = filas.map((f) => f.fecha).filter(Boolean);
    return {
      registros: filas.length,
      productos: nombres.size,
      nombresDeProductos: [...nombres.values()].sort((a, b) => a.localeCompare(b, 'es')),
      ciudades,
      fechaMasReciente: fechas.length ? new Date(Math.max(...fechas)).toISOString() : null,
      fechaMasAntigua: fechas.length ? new Date(Math.min(...fechas)).toISOString() : null,
      ventanaDias: this.#config.ventanaDias,
      bytesLeidos: bytes,
      detenidaPorVentana,
      truncada,
      obtenidaEn: new Date(obtenidaEn).toISOString(),
      muestra: filas.slice(0, 3).map(({ producto, ciudad, precio, fecha }) => ({ producto, ciudad, precio, fecha: fecha ? new Date(fecha).toISOString() : null })),
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
    const ventanaMs = this.#config.ventanaDias * DIA_MS;
    const tope = this.#config.maxBytes ?? TOPE_DE_LECTURA_BYTES;
    const filas = [];
    let masReciente = 0;
    let antiguosSeguidos = 0;
    let detenidaPorVentana = false;
    let truncada = false;

    const lectura = await this.#solicitar({
      servicio: SERVICIO,
      url: this.#config.baseUrl,
      namespace: NAMESPACE,
      operacion: OPERACION,
      timeoutMs: this.#config.timeoutMs,
      permitirHttp: this.#config.permitirHttp,
      // el servicio entrega primero lo más reciente: se guarda lo de la ventana y se corta al salir de ella
      alRegistros: (registros, { bytes }) => {
        for (const registro of registros) {
          const fila = interpretarRegistro(registro);
          if (!fila) continue;
          if (fila.fecha > masReciente) masReciente = fila.fecha;
          if (masReciente && fila.fecha < masReciente - ventanaMs) {
            antiguosSeguidos += 1;
            if (antiguosSeguidos >= REGISTROS_ANTIGUOS_PARA_CORTAR) {
              detenidaPorVentana = true;
              return false;
            }
            continue;
          }
          antiguosSeguidos = 0;
          filas.push(fila);
        }
        if (bytes > tope) {
          truncada = true;
          return false;
        }
        return true;
      },
    });
    this.#tabla = { filas, obtenidaEn: this.#ahora(), bytes: lectura.bytes, detenidaPorVentana, truncada };
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
