/**
 * Módulo Parametrización (CU-04).
 *
 * Catálogos de las listas desplegables (puntos, mesas, categorías, marcas,
 * unidades, productos y proveedores) y reglas del sistema. La escritura es
 * exclusiva del Administrador; la lectura de catálogos la hacen todos los
 * usuarios autenticados para llenar sus formularios. La auditoría de cada
 * cambio la registra la fachada.
 *
 * Valores en uso no se eliminan: solo se inactivan (EXCEP-3).
 */
import { ROLES, exigirRol } from '../auth/roles.js';
import { REGLAS } from './ReglasDefinicion.js';
import { CATALOGOS } from './CatalogosDefinicion.js';
import {
  ErrorConflicto,
  ErrorNoEncontrado,
  ErrorProhibido,
  ErrorValidacion,
  traducirErrorPersistencia,
} from '../../errors/ErroresDeNegocio.js';
import { exigirCorreo, exigirEnteroPositivo, exigirObjeto, exigirTexto, exigirUuid } from '../../validacion.js';

function normalizarValor(campo, valor) {
  switch (campo.tipo) {
    case 'texto':
      return exigirTexto(valor, campo.etiqueta, { max: campo.max ?? 200 });
    case 'uuid':
      return exigirUuid(valor, campo.etiqueta);
    case 'entero':
      return exigirEnteroPositivo(valor, campo.etiqueta, { max: campo.max ?? 1_000_000 });
    case 'correo':
      return exigirCorreo(valor, campo.etiqueta);
    default:
      throw new Error(`Tipo de campo desconocido: ${campo.tipo}`);
  }
}

/** "El punto" / "La categoría" y "del punto" / "de la categoría", según el género del catálogo. */
const el = (def) => `${def.articulo === 'la' ? 'La' : 'El'} ${def.etiqueta}`;
const del = (def) => `${def.articulo === 'la' ? 'de la' : 'del'} ${def.etiqueta}`;

const estaVacio = (valor) => valor === undefined || valor === null || valor === '';

export class ParametrizacionService {
  #db;
  #catalogos;
  #parametros;

  /** @param {{db, catalogos: CatalogoRepository, parametros: ParametroRepository}} dependencias */
  constructor({ db, catalogos, parametros }) {
    this.#db = db;
    this.#catalogos = catalogos;
    this.#parametros = parametros;
  }

  /** Nombres de los catálogos disponibles. */
  nombresDeCatalogos() {
    return Object.keys(CATALOGOS);
  }

  /** Lista un catálogo. Los valores inactivos solo los ve el Administrador. */
  async listarCatalogo(actor, catalogo, { incluirInactivos = false, filtros = {} } = {}) {
    if (!actor?.id) throw new ErrorProhibido();
    const def = this.#definicion(catalogo);
    const filtrosValidos = {};
    for (const campo of def.campos.filter((c) => c.filtrable)) {
      if (!estaVacio(filtros[campo.campo])) filtrosValidos[campo.campo] = normalizarValor(campo, filtros[campo.campo]);
    }
    const filas = await this.#catalogos.listar(
      def,
      { incluirInactivos: incluirInactivos === true && actor.rol === ROLES.ADMINISTRADOR, filtros: filtrosValidos },
      this.#db
    );
    return filas.map((fila) => this.#presentar(def, fila));
  }

  async crearValor(actor, catalogo, datos) {
    exigirRol(actor, [ROLES.ADMINISTRADOR]);
    const def = this.#definicion(catalogo);
    exigirObjeto(datos, `Los datos ${del(def)}`);
    this.#rechazarCamposDesconocidos(def, datos, false);

    const valores = {};
    for (const campo of def.campos) {
      const crudo = datos[campo.campo];
      if (estaVacio(crudo)) {
        if (campo.obligatorio) throw new ErrorValidacion(`${campo.etiqueta} es obligatorio`);
        valores[campo.columna] = null;
      } else {
        valores[campo.columna] = normalizarValor(campo, crudo);
      }
      if (campo.nombreUnico && (await this.#catalogos.existeNombre(def, valores[campo.columna], null, this.#db))) {
        throw new ErrorConflicto(`${el(def)} "${valores[campo.columna]}" ya existe en el catálogo`);
      }
    }

    try {
      const id = await this.#catalogos.insertar(def, valores, this.#db);
      return this.#presentar(def, await this.#catalogos.buscar(def, id, this.#db));
    } catch (error) {
      throw traducirErrorPersistencia(error, {
        unico: `${el(def)} ya existe en el catálogo`,
        referencia: `Un valor relacionado ${del(def)} no existe`,
      });
    }
  }

  /** Modifica campos del valor o lo activa/inactiva con `activo`. */
  async modificarValor(actor, catalogo, id, cambios) {
    exigirRol(actor, [ROLES.ADMINISTRADOR]);
    const def = this.#definicion(catalogo);
    const valorId = exigirUuid(id, `${el(def)}`);
    exigirObjeto(cambios, `Los cambios ${del(def)}`);
    this.#rechazarCamposDesconocidos(def, cambios, true);

    const valores = {};
    for (const campo of def.campos) {
      if (cambios[campo.campo] === undefined) continue;
      if (campo.inmutable) throw new ErrorValidacion(`${campo.etiqueta} no puede modificarse una vez creado ${def.articulo === 'la' ? 'la' : 'el'} ${def.etiqueta}`);
      if (estaVacio(cambios[campo.campo])) {
        if (campo.obligatorio) throw new ErrorValidacion(`${campo.etiqueta} es obligatorio`);
        valores[campo.columna] = null;
      } else {
        valores[campo.columna] = normalizarValor(campo, cambios[campo.campo]);
        if (campo.nombreUnico && (await this.#catalogos.existeNombre(def, valores[campo.columna], valorId, this.#db))) {
          throw new ErrorConflicto(`${el(def)} "${valores[campo.columna]}" ya existe en el catálogo`);
        }
      }
    }
    if (cambios.activo !== undefined) {
      if (typeof cambios.activo !== 'boolean') throw new ErrorValidacion('activo debe ser verdadero o falso');
      valores.activo = cambios.activo;
    }
    if (Object.keys(valores).length === 0) throw new ErrorValidacion('No se indicó ningún cambio');

    if (!(await this.#catalogos.buscar(def, valorId, this.#db))) {
      throw new ErrorNoEncontrado(`${el(def)} no existe`);
    }
    try {
      await this.#catalogos.actualizar(def, valorId, valores, this.#db);
    } catch (error) {
      throw traducirErrorPersistencia(error, { unico: `${el(def)} ya existe en el catálogo` });
    }
    return this.#presentar(def, await this.#catalogos.buscar(def, valorId, this.#db));
  }

  /** Elimina un valor sin uso. Si otros registros lo usan, solo puede inactivarse (EXCEP-3). */
  async eliminarValor(actor, catalogo, id) {
    exigirRol(actor, [ROLES.ADMINISTRADOR]);
    const def = this.#definicion(catalogo);
    const valorId = exigirUuid(id, `${el(def)}`);
    try {
      if ((await this.#catalogos.eliminar(def, valorId, this.#db)) === 0) {
        throw new ErrorNoEncontrado(`${el(def)} no existe`);
      }
    } catch (error) {
      if (error?.code === '23503') {
        throw new ErrorConflicto(`${el(def)} está en uso por otros registros y no puede eliminarse; solo puede inactivarse`);
      }
      throw error;
    }
    return { id: valorId, eliminado: true };
  }

  async listarReglas(actor) {
    exigirRol(actor, [ROLES.ADMINISTRADOR]);
    const filas = await this.#parametros.listar(this.#db);
    return filas
      .filter((f) => REGLAS[f.clave])
      .map((f) => ({ clave: f.clave, valor: f.valor, descripcion: f.descripcion ?? REGLAS[f.clave].descripcion, actualizadoEn: f.actualizado_en }));
  }

  async definirRegla(actor, clave, valor) {
    exigirRol(actor, [ROLES.ADMINISTRADOR]);
    const regla = REGLAS[clave];
    if (!regla) throw new ErrorValidacion(`La regla "${clave}" no existe; reglas disponibles: ${Object.keys(REGLAS).join(', ')}`);
    if (valor === undefined || valor === null || valor === '') throw new ErrorValidacion('Debe indicar el valor de la regla');
    const normalizado = regla.validar(valor);
    const fila = await this.#parametros.guardar(clave, normalizado, regla.descripcion, this.#db);
    return { clave: fila.clave, valor: fila.valor, descripcion: fila.descripcion, actualizadoEn: fila.actualizado_en };
  }

  #definicion(catalogo) {
    const def = CATALOGOS[catalogo];
    if (!def) throw new ErrorValidacion(`El catálogo "${catalogo}" no existe; disponibles: ${Object.keys(CATALOGOS).join(', ')}`);
    return def;
  }

  #rechazarCamposDesconocidos(def, datos, permiteActivo) {
    const permitidos = new Set([...def.campos.map((c) => c.campo), ...(permiteActivo ? ['activo'] : [])]);
    const extra = Object.keys(datos).find((clave) => !permitidos.has(clave));
    if (extra) throw new ErrorValidacion(`El campo "${extra}" no es válido para este catálogo`);
  }

  #presentar(def, fila) {
    const salida = { id: fila.id };
    for (const campo of def.campos) salida[campo.campo] = fila[campo.columna];
    salida.activo = fila.activo;
    return salida;
  }
}
