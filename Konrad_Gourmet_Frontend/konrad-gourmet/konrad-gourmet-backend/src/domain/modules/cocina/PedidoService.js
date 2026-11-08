/**
 * Módulo Cocina - Pedidos por mesa (CU-03).
 * El Mesero registra el pedido de una mesa de su punto. El pedido queda
 * disponible para la cocina (listarPedidos) y para el descuento diario de
 * inventario (CU-06) hasta que éste lo marque como descontado.
 */
import { ROLES, exigirPuntoDelActor, exigirRol } from '../auth/roles.js';
import { ErrorValidacion, traducirErrorPersistencia } from '../../errors/ErroresDeNegocio.js';
import { exigirEnteroPositivo, exigirFecha, exigirLista, exigirObjeto, exigirUuid } from '../../validacion.js';

const VENTANA_POR_DEFECTO_MS = 24 * 60 * 60 * 1000;
const LIMITE_MAXIMO = 200;

export class PedidoService {
  #db;
  #unidadDeTrabajo;
  #pedidos;

  constructor({ db, unidadDeTrabajo, pedidos }) {
    this.#db = db;
    this.#unidadDeTrabajo = unidadDeTrabajo;
    this.#pedidos = pedidos;
  }

  async registrarPedido(actor, datos) {
    exigirRol(actor, [ROLES.MESERO]);
    const puntoId = exigirPuntoDelActor(actor);
    exigirObjeto(datos, 'Los datos del pedido');
    if (!datos.mesaId) throw new ErrorValidacion('Debe seleccionar una mesa');
    const mesaId = exigirUuid(datos.mesaId, 'La mesa');
    exigirLista(datos.items, 'Los platos del pedido', { min: 1, max: 100 });

    // Un mismo plato repetido se acumula en una sola línea
    const cantidades = new Map();
    datos.items.forEach((item, indice) => {
      exigirObjeto(item, `El plato ${indice + 1}`);
      const platoId = exigirUuid(item.platoId, `El plato ${indice + 1}`);
      const cantidad = exigirEnteroPositivo(item.cantidad, `La cantidad del plato ${indice + 1}`, { max: 1000 });
      cantidades.set(platoId, (cantidades.get(platoId) ?? 0) + cantidad);
    });
    const items = [...cantidades].map(([platoId, cantidad]) => ({ platoId, cantidad }));

    try {
      return await this.#unidadDeTrabajo(async (tx) => {
        const mesa = await this.#pedidos.mesaActivaDelPunto(mesaId, puntoId, tx);
        if (!mesa) throw new ErrorValidacion('La mesa no existe en su punto o está inactiva');

        const platos = new Map(
          (await this.#pedidos.platosDelPunto(items.map((i) => i.platoId), puntoId, tx)).map((p) => [p.id, p])
        );
        for (const item of items) {
          const plato = platos.get(item.platoId);
          if (!plato || !plato.activo) {
            throw new ErrorValidacion('Un plato está inactivo o no pertenece al menú del punto');
          }
        }

        const pedido = await this.#pedidos.insertarPedido({ puntoId, mesaId, meseroId: actor.id }, tx);
        await this.#pedidos.insertarDetalle(pedido.id, items, tx);
        return {
          id: pedido.id,
          fecha: pedido.fecha,
          puntoId,
          mesa: mesa.numero,
          items: items.map((i) => ({ ...i, plato: platos.get(i.platoId).nombre })),
        };
      });
    } catch (error) {
      throw traducirErrorPersistencia(error);
    }
  }

  /** Pedidos del punto (por defecto, de las últimas 24 horas), disponibles para la cocina. */
  async listarPedidos(actor, { desde, hasta, limite = 50 } = {}) {
    exigirRol(actor, [ROLES.JEFE_COCINA, ROLES.MESERO]);
    const puntoId = exigirPuntoDelActor(actor);
    const fin = hasta === undefined ? new Date() : exigirFecha(hasta, 'La fecha final');
    const inicio = desde === undefined ? new Date(fin.getTime() - VENTANA_POR_DEFECTO_MS) : exigirFecha(desde, 'La fecha inicial');
    if (inicio > fin) throw new ErrorValidacion('La fecha inicial no puede ser posterior a la final');
    const tope = Math.min(exigirEnteroPositivo(limite, 'El límite', { max: LIMITE_MAXIMO }), LIMITE_MAXIMO);

    const filas = await this.#pedidos.listar({ puntoId, desde: inicio, hasta: fin, limite: tope }, this.#db);
    return filas.map((fila) => ({
      id: fila.id,
      fecha: fila.fecha,
      mesa: fila.mesa,
      mesero: fila.mesero,
      descontado: fila.descontado_en !== null,
      items: fila.items,
    }));
  }
}
