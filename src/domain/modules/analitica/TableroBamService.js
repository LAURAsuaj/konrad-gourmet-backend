/**
 * Módulo Analítica - Tablero de control BAM (CU-14).
 * KPIs para el Director Comercial: producto más demandado, restaurante (punto)
 * con mayor demanda y mejor proveedor (según el criterio parametrizado).
 *
 * Cada KPI se calcula de forma independiente: si no hay datos suficientes se
 * informa en ese indicador (EXCEP-1) y si su cálculo falla se registra el error
 * en el log y se informa solo en ese indicador (EXCEP-2), sin tumbar el tablero.
 */
import { ROLES, exigirRol } from '../auth/roles.js';
import { METRICAS_MEJOR_PROVEEDOR, METRICA_POR_DEFECTO, PERIODO_DEMANDA_DIAS, PERIODO_PROVEEDOR_DIAS } from './metricas.js';
import { exigirRangoFechas } from '../../consulta.js';

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const DIA_MS = 86_400_000;

export class TableroBamService {
  #db;
  #analitica;
  #parametros;
  #registrador;

  /** @param {{db, analitica: AnaliticaRepository, parametros: ParametroRepository, registrador: {error: Function, advertencia: Function}}} dependencias */
  constructor({ db, analitica, parametros, registrador }) {
    this.#db = db;
    this.#analitica = analitica;
    this.#parametros = parametros;
    this.#registrador = registrador;
  }

  /**
   * Sin periodo indicado, cada indicador usa el suyo (enunciado): producto y restaurante con mayor
   * demanda en los últimos 30 días y proveedor con los mejores precios en el último año. Con un
   * periodo indicado (`desde` y/o `hasta`) los tres indicadores usan ese periodo.
   *
   * @param {{desde?: string|Date, hasta?: string|Date}} [filtros]
   */
  async consultarTablero(actor, filtros = {}) {
    exigirRol(actor, [ROLES.DIRECTOR_COMERCIAL]);
    const { desde, hasta } = exigirRangoFechas(filtros.desde, filtros.hasta);
    const indicado = desde !== null || hasta !== null;
    const ahora = Date.now();
    const periodo = (dias, descripcion) => (indicado
      ? { desde, hasta, descripcion: 'Periodo indicado por el usuario' }
      : { desde: new Date(ahora - dias * DIA_MS), hasta: null, descripcion }); // sin límite superior: incluye lo de hoy
    const periodos = {
      productoMasDemandado: periodo(PERIODO_DEMANDA_DIAS, `Últimos ${PERIODO_DEMANDA_DIAS} días`),
      restauranteMayorDemanda: periodo(PERIODO_DEMANDA_DIAS, `Últimos ${PERIODO_DEMANDA_DIAS} días`),
      mejorProveedor: periodo(PERIODO_PROVEEDOR_DIAS, 'Último año (365 días)'),
    };

    const [productoMasDemandado, restauranteMayorDemanda, mejorProveedor] = await Promise.all([
      this.#kpi('producto más demandado', () => this.#productoMasDemandado(periodos.productoMasDemandado.desde, periodos.productoMasDemandado.hasta)),
      this.#kpi('restaurante con mayor demanda', () => this.#restauranteMayorDemanda(periodos.restauranteMayorDemanda.desde, periodos.restauranteMayorDemanda.hasta)),
      this.#kpi('mejor proveedor', () => this.#mejorProveedor(periodos.mejorProveedor.desde, periodos.mejorProveedor.hasta)),
    ]);
    const publico = ({ desde: d, hasta: h, descripcion }) => ({ desde: d?.toISOString() ?? null, hasta: h?.toISOString() ?? null, descripcion });
    return {
      generadoEn: new Date().toISOString(),
      periodo: { desde: desde?.toISOString() ?? null, hasta: hasta?.toISOString() ?? null }, // el indicado por el usuario (nulo si no indicó)
      productoMasDemandado: { ...productoMasDemandado, periodo: publico(periodos.productoMasDemandado) },
      restauranteMayorDemanda: { ...restauranteMayorDemanda, periodo: publico(periodos.restauranteMayorDemanda) },
      mejorProveedor: { ...mejorProveedor, periodo: publico(periodos.mejorProveedor) },
    };
  }

  async #kpi(nombre, calculo) {
    try {
      return await calculo();
    } catch (error) {
      await this.#registrador.error({ modulo: 'tablero_bam', mensaje: `No fue posible calcular el indicador "${nombre}"`, error });
      return { disponible: false, error: `No fue posible calcular el indicador "${nombre}"` };
    }
  }

  async #productoMasDemandado(desde, hasta) {
    const filas = await this.#analitica.rankingProductos({ desde, hasta, limite: 5 }, this.#db);
    if (filas.length === 0) {
      return { disponible: false, mensaje: 'No hay datos suficientes de pedidos y solicitudes para calcular este indicador' };
    }
    const mapear = (f) => ({
      producto: f.producto,
      unidad: f.unidad,
      demanda: numero(f.demanda),
      consumoPedidos: numero(f.consumo_pedidos),
      cantidadSolicitada: numero(f.cantidad_solicitada),
    });
    return { disponible: true, ...mapear(filas[0]), ranking: filas.map(mapear) };
  }

  async #restauranteMayorDemanda(desde, hasta) {
    const filas = await this.#analitica.demandaPorPunto({ desde, hasta, limite: 5 }, this.#db);
    if (filas.length === 0) {
      return { disponible: false, mensaje: 'No hay pedidos registrados para calcular este indicador' };
    }
    const mapear = (f) => ({ punto: f.punto, platosVendidos: numero(f.platos_vendidos), pedidos: numero(f.pedidos) });
    return { disponible: true, ...mapear(filas[0]), ranking: filas.map(mapear) };
  }

  async #mejorProveedor(desde, hasta) {
    const criterio = await this.#parametros.obtener('criterio_mejor_proveedor', this.#db, null);
    let metrica = criterio?.metrica;
    if (!METRICAS_MEJOR_PROVEEDOR.includes(metrica)) {
      await this.#registrador.advertencia({
        modulo: 'tablero_bam',
        mensaje: `El criterio de mejor proveedor "${metrica}" no es válido; se usa "${METRICA_POR_DEFECTO}"`,
      });
      metrica = METRICA_POR_DEFECTO;
    }

    const proveedores = (await this.#analitica.estadisticasProveedores({ desde, hasta }, this.#db)).map((f) => ({
      proveedor: f.proveedor,
      cotizaciones: numero(f.cotizaciones),
      opcionadas: numero(f.opcionadas),
      ordenes: numero(f.ordenes),
      valorOrdenes: numero(f.valor_ordenes),
      razonPromedio: numero(f.razon_promedio),
    }));

    const ordenar = {
      ordenes_compra: { aplica: (p) => p.ordenes > 0, comparar: (a, b) => b.ordenes - a.ordenes || b.valorOrdenes - a.valorOrdenes, valor: (p) => p.ordenes },
      cotizaciones_opcionadas: { aplica: (p) => p.opcionadas > 0, comparar: (a, b) => b.opcionadas - a.opcionadas || b.ordenes - a.ordenes, valor: (p) => p.opcionadas },
      menor_razon_precio: { aplica: (p) => p.razonPromedio !== null, comparar: (a, b) => a.razonPromedio - b.razonPromedio, valor: (p) => Math.round(p.razonPromedio * 10000) / 10000 },
    }[metrica];

    const candidatos = proveedores.filter(ordenar.aplica).sort((a, b) => ordenar.comparar(a, b) || a.proveedor.localeCompare(b.proveedor));
    if (candidatos.length === 0) {
      return { disponible: false, metrica, mensaje: 'No hay cotizaciones u órdenes de compra suficientes para calcular este indicador' };
    }
    // SRS 6.5: los valores de cotizaciones y órdenes solo los ve el área de compras. El tablero
    // (Director Comercial) muestra únicamente nombres y conteos; los montos y la razón de precio
    // se usan solo internamente para ordenar. Con el criterio de razón de precio no se publica
    // ninguna cifra: solo el orden de los proveedores.
    const publicable = metrica !== 'menor_razon_precio';
    const mejor = candidatos[0];
    return {
      disponible: true,
      metrica,
      proveedor: mejor.proveedor,
      ...(publicable ? { valorMetrica: ordenar.valor(mejor) } : {}),
      detalle: { cotizaciones: mejor.cotizaciones, cotizacionesOpcionadas: mejor.opcionadas, ordenesCompra: mejor.ordenes },
      ranking: candidatos.slice(0, 5).map((p) => ({ proveedor: p.proveedor, ...(publicable ? { valorMetrica: ordenar.valor(p) } : {}) })),
    };
  }
}
