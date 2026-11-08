/**
 * Módulo Cocina - Menú por punto (CU-02).
 * El Jefe de Cocina registra y mantiene los platos de SU punto con sus
 * ingredientes (producto, cantidad y unidad por porción). La auditoría de cada
 * creación o modificación la registra la fachada.
 */
import { ROLES, exigirPuntoDelActor, exigirRol } from '../auth/roles.js';
import { ErrorNoEncontrado, ErrorValidacion, traducirErrorPersistencia } from '../../errors/ErroresDeNegocio.js';
import {
  exigirLista,
  exigirNumeroPositivo,
  exigirObjeto,
  exigirTexto,
  exigirUuid,
} from '../../validacion.js';

const MENSAJES_PERSISTENCIA = {
  unico: 'Ya existe un plato con ese nombre en el punto',
  referencia: 'Un ingrediente o el punto no existe',
};

export class MenuService {
  #db;
  #unidadDeTrabajo;
  #menu;

  constructor({ db, unidadDeTrabajo, menu }) {
    this.#db = db;
    this.#unidadDeTrabajo = unidadDeTrabajo;
    this.#menu = menu;
  }

  async registrarPlato(actor, datos) {
    exigirRol(actor, [ROLES.JEFE_COCINA]);
    const puntoId = exigirPuntoDelActor(actor);
    exigirObjeto(datos, 'Los datos del plato');
    const nombre = exigirTexto(datos.nombre, 'El nombre', { max: 120 });
    const categoria = exigirTexto(datos.categoria, 'La categoría', { max: 80 });
    const precio = exigirNumeroPositivo(datos.precio, 'El precio', { max: 99_999_999 });

    try {
      return await this.#unidadDeTrabajo(async (tx) => {
        const ingredientes = await this.#validarIngredientes(datos.ingredientes, tx);
        const platoId = await this.#menu.insertarPlato({ puntoId, nombre, categoria, precio }, tx);
        await this.#menu.insertarIngredientes(platoId, ingredientes, tx);
        return this.#presentar(await this.#menu.obtener(platoId, puntoId, tx));
      });
    } catch (error) {
      throw traducirErrorPersistencia(error, MENSAJES_PERSISTENCIA);
    }
  }

  /** Modifica o inactiva un plato del punto. Con `ingredientes` reemplaza la lista completa. */
  async modificarPlato(actor, platoId, cambios) {
    exigirRol(actor, [ROLES.JEFE_COCINA]);
    const puntoId = exigirPuntoDelActor(actor);
    const id = exigirUuid(platoId, 'El plato');
    exigirObjeto(cambios, 'Los cambios del plato');

    const campos = {};
    if (cambios.nombre !== undefined) campos.nombre = exigirTexto(cambios.nombre, 'El nombre', { max: 120 });
    if (cambios.categoria !== undefined) campos.categoria = exigirTexto(cambios.categoria, 'La categoría', { max: 80 });
    if (cambios.precio !== undefined) campos.precio = exigirNumeroPositivo(cambios.precio, 'El precio', { max: 99_999_999 });
    if (cambios.activo !== undefined) {
      if (typeof cambios.activo !== 'boolean') throw new ErrorValidacion('activo debe ser verdadero o falso');
      campos.activo = cambios.activo;
    }
    if (Object.keys(campos).length === 0 && cambios.ingredientes === undefined) {
      throw new ErrorValidacion('No se indicó ningún cambio');
    }

    try {
      return await this.#unidadDeTrabajo(async (tx) => {
        if (!(await this.#menu.bloquearPlato(id, puntoId, tx))) {
          throw new ErrorNoEncontrado('El plato no existe en su punto');
        }
        await this.#menu.actualizarPlato(id, campos, tx);
        if (cambios.ingredientes !== undefined) {
          const ingredientes = await this.#validarIngredientes(cambios.ingredientes, tx);
          await this.#menu.reemplazarIngredientes(id, ingredientes, tx);
        }
        return this.#presentar(await this.#menu.obtener(id, puntoId, tx));
      });
    } catch (error) {
      throw traducirErrorPersistencia(error, MENSAJES_PERSISTENCIA);
    }
  }

  /** Menú del punto del usuario. Solo el Jefe de Cocina ve los platos inactivos. */
  async listarMenu(actor, { incluirInactivos = false } = {}) {
    exigirRol(actor, [ROLES.JEFE_COCINA, ROLES.MESERO]);
    const puntoId = exigirPuntoDelActor(actor);
    const verInactivos = actor.rol === ROLES.JEFE_COCINA && incluirInactivos === true;
    const filas = await this.#menu.listarPorPunto(puntoId, verInactivos, this.#db);
    return filas.map((fila) => this.#presentar(fila));
  }

  async #validarIngredientes(ingredientes, db) {
    exigirLista(ingredientes, 'Los ingredientes', { min: 1, max: 60 });
    const normalizados = ingredientes.map((item, indice) => {
      exigirObjeto(item, `El ingrediente ${indice + 1}`);
      return {
        productoId: exigirUuid(item.productoId, `El producto del ingrediente ${indice + 1}`),
        cantidadPorPorcion: exigirNumeroPositivo(item.cantidadPorPorcion, `La cantidad del ingrediente ${indice + 1}`, {
          max: 99_999_999,
        }),
        unidadId: exigirUuid(item.unidadId, `La unidad del ingrediente ${indice + 1}`),
      };
    });

    const ids = normalizados.map((i) => i.productoId);
    if (new Set(ids).size !== ids.length) {
      throw new ErrorValidacion('Un producto no puede repetirse como ingrediente del mismo plato');
    }

    const productos = new Map((await this.#menu.buscarProductos(ids, db)).map((p) => [p.id, p]));
    for (const ingrediente of normalizados) {
      const producto = productos.get(ingrediente.productoId);
      if (!producto || !producto.activo) {
        throw new ErrorValidacion('Un ingrediente no existe en el catálogo de productos, seleccione uno válido');
      }
      if (producto.unidad_id !== ingrediente.unidadId) {
        throw new ErrorValidacion(
          `La unidad del ingrediente "${producto.nombre}" debe coincidir con la unidad del producto en el inventario`
        );
      }
    }
    return normalizados;
  }

  #presentar(fila) {
    return {
      id: fila.id,
      puntoId: fila.punto_id,
      nombre: fila.nombre,
      categoria: fila.categoria,
      precio: Number(fila.precio),
      activo: fila.activo,
      ingredientes: fila.ingredientes,
    };
  }
}
