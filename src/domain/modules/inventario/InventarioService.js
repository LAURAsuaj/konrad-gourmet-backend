/**
 * Módulo Inventario (CU-06, CU-07).
 *
 * - ejecutarDescuentoDiario(): proceso automático invocado por el contenedor cron
 *   a través de SistemaFacade. Todo ocurre en UNA transacción: descuento,
 *   movimientos, marca de pedidos descontados y evento DescuentoDiarioCompletado
 *   (Outbox). Si falla, nada se confirma; si se reejecuta, los pedidos ya
 *   descontados no se vuelven a contar (SRS 6.2).
 * - Funciones adicionales para la consistencia operativa: el SRS exige un
 *   inventario por punto (CU-06 PRE-3) pero no define cómo se carga; por eso
 *   se agregan establecerInventario, consultarInventario y listarAlarmasActivas.
 */
import { ROLES, exigirPuntoDelActor, exigirRol } from '../auth/roles.js';
import { ErrorValidacion, traducirErrorPersistencia } from '../../errors/ErroresDeNegocio.js';
import { TIPOS_EVENTO } from '../../events/BusDeEventos.js';
import { exigirNumeroNoNegativo, exigirNumeroPositivo, exigirObjeto, exigirUuid } from '../../validacion.js';

const TOPE_INCONSISTENCIAS_EN_LOG = 100;

export class InventarioService {
  #db;
  #unidadDeTrabajo;
  #inventario;
  #alarmas;
  #evaluador;
  #parametros;
  #registrarEvento;
  #registrador;

  /**
   * @param {{db, unidadDeTrabajo, inventario: InventarioRepository, alarmas: AlarmaRepository,
   *          evaluador: EvaluadorAlarmas, parametros: ParametroRepository, registrarEvento: Function,
   *          registrador: {error: Function, ejecucion: Function}}} dependencias
   */
  constructor({ db, unidadDeTrabajo, inventario, alarmas, evaluador, parametros, registrarEvento, registrador }) {
    this.#db = db;
    this.#unidadDeTrabajo = unidadDeTrabajo;
    this.#inventario = inventario;
    this.#alarmas = alarmas;
    this.#evaluador = evaluador;
    this.#parametros = parametros;
    this.#registrarEvento = registrarEvento;
    this.#registrador = registrador;
  }

  /**
   * Descuenta lo vendido desde la última ejecución.
   * @param {{hasta?: Date}} [opciones] solo se descuentan los pedidos registrados hasta esa fecha
   * @returns {Promise<{pedidosProcesados: number, movimientos: number, inconsistencias: object[], eventoId: string|null}>}
   */
  async ejecutarDescuentoDiario({ hasta = new Date() } = {}) {
    const inicio = Date.now();
    let resumen;

    try {
      resumen = await this.#unidadDeTrabajo(async (tx) => {
        const pedidos = await this.#inventario.bloquearPedidosPendientes(hasta, tx);
        if (pedidos.length === 0) {
          return { pedidosProcesados: 0, movimientos: 0, inconsistencias: [], eventoId: null };
        }

        const pedidoIds = pedidos.map((p) => p.id);
        const inconsistencias = [];

        // CU-06 EXCEP-2: los platos sin ingredientes se omiten del cálculo y se registran
        for (const plato of await this.#inventario.platosSinIngredientes(pedidoIds, tx)) {
          inconsistencias.push({ tipo: 'PLATO_SIN_INGREDIENTES', platoId: plato.id, plato: plato.nombre, puntoId: plato.punto_id });
        }

        const inventarioIds = [];
        let movimientos = 0;
        for (const fila of await this.#inventario.calcularConsumo(pedidoIds, tx)) {
          const resultado = await this.#inventario.descontar(fila.punto_id, fila.producto_id, fila.consumo, tx);
          if (!resultado) {
            inconsistencias.push({ tipo: 'SIN_INVENTARIO', puntoId: fila.punto_id, productoId: fila.producto_id, consumo: fila.consumo });
            continue;
          }
          if (resultado.insuficiente) {
            // CU-06 EXCEP-1: el inventario no queda en negativo y se deja constancia
            inconsistencias.push({
              tipo: 'CONSUMO_SUPERA_DISPONIBLE',
              puntoId: fila.punto_id,
              productoId: fila.producto_id,
              consumo: fila.consumo,
              descontado: resultado.descontado,
            });
          }
          if (Number(resultado.descontado) > 0) {
            await this.#inventario.insertarMovimiento(
              {
                inventarioId: resultado.id,
                tipo: 'DESCUENTO_DIARIO',
                cantidad: `-${resultado.descontado}`,
                saldo: resultado.saldo,
                detalle: `Descuento diario de ${pedidos.length} pedido(s)`,
              },
              tx
            );
            movimientos += 1;
          }
          inventarioIds.push(resultado.id); // se evalúa aunque ya estuviera en cero
        }

        await this.#inventario.marcarPedidosDescontados(pedidoIds, tx);

        const eventoId = await this.#registrarEvento(tx, TIPOS_EVENTO.DESCUENTO_DIARIO_COMPLETADO, {
          hasta: hasta.toISOString(),
          pedidosProcesados: pedidoIds.length,
          puntos: [...new Set(pedidos.map((p) => p.punto_id))],
          inventarioIds,
        });
        return { pedidosProcesados: pedidoIds.length, movimientos, inconsistencias, eventoId };
      });
    } catch (error) {
      await this.#registrador.error({
        modulo: 'inventario',
        mensaje: 'Falló el descuento diario de inventario; puede reejecutarse sin duplicar descuentos',
        error,
      });
      throw error;
    }

    await this.#registrador.ejecucion({
      modulo: 'inventario',
      mensaje: 'Descuento diario de inventario finalizado',
      detalle: {
        pedidosProcesados: resumen.pedidosProcesados,
        movimientos: resumen.movimientos,
        inconsistencias: resumen.inconsistencias.length,
        duracionMs: Date.now() - inicio,
      },
    });
    for (const inconsistencia of resumen.inconsistencias.slice(0, TOPE_INCONSISTENCIAS_EN_LOG)) {
      await this.#registrador.error({
        modulo: 'inventario',
        mensaje: `Inconsistencia en el descuento diario: ${inconsistencia.tipo}`,
        detalle: inconsistencia,
      });
    }
    return resumen;
  }

  /**
   * Carga o ajusta el inventario de un producto en un punto y evalúa la alarma
   * en la misma transacción. El Jefe de Cocina opera sobre su punto; el
   * Administrador debe indicar `puntoId`.
   */
  async establecerInventario(actor, datos) {
    exigirRol(actor, [ROLES.JEFE_COCINA, ROLES.ADMINISTRADOR]);
    exigirObjeto(datos, 'Los datos del inventario');
    const puntoId = this.#resolverPunto(actor, datos.puntoId);
    const productoId = exigirUuid(datos.productoId, 'El producto');
    const cantidadActual = exigirNumeroNoNegativo(datos.cantidadActual, 'La cantidad actual', { max: 99_999_999 });
    const cantidadReferencia = exigirNumeroPositivo(datos.cantidadReferencia, 'La cantidad de referencia', {
      max: 99_999_999,
    });

    try {
      return await this.#unidadDeTrabajo(async (tx) => {
        const existente = await this.#inventario.buscarPorPuntoProducto(puntoId, productoId, tx);
        const fila = existente
          ? await this.#inventario.actualizar(existente.id, { cantidadActual, cantidadReferencia }, tx)
          : await this.#inventario.crear({ puntoId, productoId, cantidadActual, cantidadReferencia }, tx);

        const variacion = Number(fila.delta);
        if (variacion !== 0) {
          await this.#inventario.insertarMovimiento(
            {
              inventarioId: fila.id,
              tipo: variacion > 0 ? 'REABASTECIMIENTO' : 'AJUSTE',
              cantidad: fila.delta,
              saldo: fila.cantidad_actual,
              detalle: `Ajuste manual por ${actor.correo ?? actor.id}`,
            },
            tx
          );
        }

        const umbral = await this.#parametros.obtenerNumero('alarma_porcentaje', tx, 25);
        const [nivel] = await this.#alarmas.obtenerNiveles([fila.id], tx);
        const alarma = await this.#evaluador.evaluar(tx, nivel, umbral);
        return {
          id: fila.id,
          puntoId,
          productoId,
          producto: nivel.producto,
          unidad: nivel.unidad,
          cantidadActual: Number(fila.cantidad_actual),
          cantidadReferencia: Number(fila.cantidad_referencia),
          alarma: alarma.accion,
        };
      });
    } catch (error) {
      throw traducirErrorPersistencia(error, { referencia: 'El punto o el producto no existe' });
    }
  }

  async consultarInventario(actor, { puntoId } = {}) {
    exigirRol(actor, [ROLES.JEFE_COCINA, ROLES.ADMINISTRADOR]);
    const filas = await this.#inventario.listarPorPunto(this.#resolverPunto(actor, puntoId), this.#db);
    return filas.map((fila) => ({
      id: fila.id,
      productoId: fila.producto_id,
      producto: fila.producto,
      unidad: fila.unidad,
      cantidadActual: Number(fila.cantidad_actual),
      cantidadReferencia: Number(fila.cantidad_referencia),
      porcentaje: Number(fila.porcentaje),
      enAlarma: fila.en_alarma,
    }));
  }

  /** Alarmas activas del punto del Jefe de Cocina (CU-07: "se muestra dentro de la aplicación"). */
  async listarAlarmasActivas(actor) {
    exigirRol(actor, [ROLES.JEFE_COCINA]);
    const filas = await this.#alarmas.listarActivasPorPunto(exigirPuntoDelActor(actor), this.#db);
    return filas.map((fila) => ({
      id: fila.id,
      generadaEn: fila.generada_en,
      producto: fila.producto,
      unidad: fila.unidad,
      cantidadActual: Number(fila.cantidad_actual),
      cantidadReferencia: Number(fila.cantidad_referencia),
    }));
  }

  #resolverPunto(actor, puntoIndicado) {
    if (actor.rol === ROLES.JEFE_COCINA) {
      const propio = exigirPuntoDelActor(actor);
      if (puntoIndicado !== undefined && puntoIndicado !== null && puntoIndicado !== propio) {
        throw new ErrorValidacion('Solo puede operar sobre el inventario de su punto');
      }
      return propio;
    }
    if (!puntoIndicado) throw new ErrorValidacion('Debe indicar el punto');
    return exigirUuid(puntoIndicado, 'El punto');
  }
}
