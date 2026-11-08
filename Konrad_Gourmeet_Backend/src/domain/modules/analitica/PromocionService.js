/**
 * Módulo Analítica - Promociones por tendencias (CU-15).
 *
 * generarPromociones() lo invoca el proceso programado (cron, vía fachada):
 *   1. Consulta las tendencias en redes sociales (ITendenciasService). Si la API
 *      falla, lo registra en el log y continúa solo con los productos más
 *      solicitados (EXCEP-1).
 *   2. Identifica los productos más solicitados (pedidos + solicitudes).
 *   3. Cruza ambos por nombre y arma las promociones:
 *        COMBINADA      producto muy solicitado que además es tendencia
 *        MAS_SOLICITADO los productos más solicitados, si ninguno coincide con una tendencia
 *        TENDENCIA      las tendencias que no corresponden a ningún producto (máx. 2)
 *   4. Guarda cada promoción y publica PromocionGenerada en la misma transacción;
 *      ManejadorNotificaciones la envía por correo a los jefes de cocina y deja
 *      constancia del resultado en cada notificación.
 * Sin tendencias ni productos relevantes no se envía nada (EXCEP-2). Una misma
 * promoción no se repite dentro de la ventana `diasSinRepetir`.
 */
import { ROLES, exigirRol } from '../auth/roles.js';
import { TIPOS_EVENTO } from '../../events/BusDeEventos.js';
import { exigirRangoFechas, normalizarPaginacion } from '../../consulta.js';

const MAX_COMBINADAS = 5;
const MAX_MAS_SOLICITADOS = 3;
const MAX_SOLO_TENDENCIA = 2;

const normalizar = (texto) => String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const coincide = (producto, termino) => {
  const p = normalizar(producto);
  const t = normalizar(termino);
  return p.length >= 3 && t.length >= 3 && (t.includes(p) || p.includes(t));
};

export class PromocionService {
  #db;
  #unidadDeTrabajo;
  #promociones;
  #analitica;
  #tendencias;
  #registrarEvento;
  #registrador;

  /**
   * @param {{db, unidadDeTrabajo, promociones: PromocionRepository, analitica: AnaliticaRepository,
   *          tendencias: ITendenciasService, registrarEvento: Function,
   *          registrador: {error: Function, ejecucion: Function}}} dependencias
   */
  constructor({ db, unidadDeTrabajo, promociones, analitica, tendencias, registrarEvento, registrador }) {
    this.#db = db;
    this.#unidadDeTrabajo = unidadDeTrabajo;
    this.#promociones = promociones;
    this.#analitica = analitica;
    this.#tendencias = tendencias;
    this.#registrarEvento = registrarEvento;
    this.#registrador = registrador;
  }

  /**
   * @param {{dias?: number, diasSinRepetir?: number}} [opciones] ventana de análisis de demanda (30 días)
   *        y días durante los cuales no se repite una misma promoción (7 días)
   */
  async generarPromociones({ dias = 30, diasSinRepetir = 7 } = {}) {
    let tendencias = [];
    let apiDisponible = true;
    try {
      tendencias = await this.#tendencias.obtenerTendencias({ limite: 20 });
    } catch (error) {
      if (error?.name !== 'ServicioExternoError') throw error;
      apiDisponible = false;
      await this.#registrador.error({
        modulo: 'promociones',
        mensaje: 'La API de redes sociales no está disponible; las promociones se generan solo con los productos más solicitados',
        detalle: { codigo: error.codigo },
        error,
      });
    }

    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    const productos = await this.#analitica.rankingProductos({ desde, hasta: null, limite: 10 }, this.#db);

    if (tendencias.length === 0 && productos.length === 0) {
      const mensaje = 'No se identificaron tendencias ni productos relevantes; no se enviaron promociones';
      await this.#registrador.ejecucion({ modulo: 'promociones', mensaje, detalle: { apiDisponible } });
      return { apiDisponible, tendencias: 0, productosAnalizados: 0, generadas: 0, omitidasPorRepetidas: 0, mensaje };
    }

    await this.#promociones.guardarTendencias(tendencias, this.#db);

    let generadas = 0;
    let omitidasPorRepetidas = 0;
    for (const candidata of this.#armarCandidatas(productos, tendencias)) {
      if (await this.#promociones.existeReciente(candidata.titulo, diasSinRepetir, this.#db)) {
        omitidasPorRepetidas += 1;
        continue;
      }
      await this.#unidadDeTrabajo(async (tx) => {
        const promocion = await this.#promociones.crear(candidata, tx);
        await this.#registrarEvento(tx, TIPOS_EVENTO.PROMOCION_GENERADA, { promocionId: promocion.id, origen: candidata.origen });
      });
      generadas += 1;
    }

    const resumen = { apiDisponible, tendencias: tendencias.length, productosAnalizados: productos.length, generadas, omitidasPorRepetidas };
    await this.#registrador.ejecucion({ modulo: 'promociones', mensaje: 'Generación de promociones finalizada', detalle: resumen });
    return generadas === 0 ? { ...resumen, mensaje: 'No hay promociones nuevas para enviar' } : resumen;
  }

  /** Promociones generadas con el resultado de su envío. */
  async listarPromociones(actor, filtros = {}) {
    exigirRol(actor, [ROLES.DIRECTOR_COMERCIAL, ROLES.ADMINISTRADOR, ROLES.JEFE_COCINA]);
    const { desde, hasta } = exigirRangoFechas(filtros.desde, filtros.hasta);
    const filas = await this.#promociones.listar({ desde, hasta, ...normalizarPaginacion(filtros) }, this.#db);
    const total = filas.length > 0 ? Number(filas[0].total) : 0;
    return {
      total,
      promociones: filas.map((f) => ({
        id: f.id,
        titulo: f.titulo,
        descripcion: f.descripcion,
        origen: f.origen,
        producto: f.producto,
        generadaEn: f.generada_en,
        enviadas: Number(f.enviadas),
        fallidas: Number(f.fallidas),
      })),
      ...(total === 0 ? { mensaje: 'Aún no hay promociones registradas' } : {}),
    };
  }

  #armarCandidatas(productos, tendencias) {
    const ordenadas = [...tendencias].sort((a, b) => b.puntaje - a.puntaje);
    const usadas = new Set();
    const candidatas = [];

    for (const producto of productos) {
      if (candidatas.length >= MAX_COMBINADAS) break;
      const tendencia = ordenadas.find((t) => !usadas.has(t.termino) && coincide(producto.producto, t.termino));
      if (!tendencia) continue;
      usadas.add(tendencia.termino);
      candidatas.push({
        productoId: producto.producto_id,
        titulo: `Promoción de ${producto.producto}`,
        descripcion: `"${tendencia.termino}" es tendencia en ${tendencia.fuente} y ${producto.producto} está entre los productos más solicitados. Sugerimos una promoción especial con este producto.`,
        origen: 'COMBINADA',
      });
    }

    if (candidatas.length === 0) {
      for (const producto of productos.slice(0, MAX_MAS_SOLICITADOS)) {
        candidatas.push({
          productoId: producto.producto_id,
          titulo: `Promoción de ${producto.producto}`,
          descripcion: `${producto.producto} es uno de los productos más solicitados de los últimos días. Sugerimos aprovechar su alta demanda con una promoción.`,
          origen: 'MAS_SOLICITADO',
        });
      }
    }

    for (const tendencia of ordenadas.filter((t) => !usadas.has(t.termino)).slice(0, MAX_SOLO_TENDENCIA)) {
      candidatas.push({
        productoId: null,
        titulo: `Tendencia: ${tendencia.termino}`,
        descripcion: `"${tendencia.termino}" es tendencia en ${tendencia.fuente}. Evalúe incluirlo en una promoción del menú.`,
        origen: 'TENDENCIA',
      });
    }
    return candidatas;
  }
}
