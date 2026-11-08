/** Utilidades para consultas con filtros opcionales y paginación. */
import { ErrorValidacion } from './errors/ErroresDeNegocio.js';
import { exigirEnteroPositivo, exigirFecha } from './validacion.js';

/**
 * Construye una cláusula WHERE parametrizada. Cada `$?` de la plantilla se
 * reemplaza por el siguiente parámetro posicional: nunca se concatenan valores.
 */
export class FiltroSql {
  #condiciones = [];
  #valores = [];

  agregar(plantilla, ...valores) {
    let indice = 0;
    const sql = plantilla.replace(/\$\?/g, () => {
      this.#valores.push(valores[indice++]);
      return `$${this.#valores.length}`;
    });
    this.#condiciones.push(sql);
    return this;
  }

  get where() {
    return this.#condiciones.length > 0 ? `WHERE ${this.#condiciones.join(' AND ')}` : '';
  }

  get valores() {
    return [...this.#valores];
  }

  /** Posición del próximo parámetro (para LIMIT y OFFSET). */
  get siguiente() {
    return this.#valores.length + 1;
  }
}

export function normalizarPaginacion({ limite, offset } = {}, { defecto = 50, maximo = 200 } = {}) {
  const tope = limite === undefined ? defecto : Math.min(exigirEnteroPositivo(limite, 'El límite', { max: maximo }), maximo);
  let desplazamiento = 0;
  if (offset !== undefined) {
    desplazamiento = Number(offset);
    if (!Number.isInteger(desplazamiento) || desplazamiento < 0) {
      throw new ErrorValidacion('El desplazamiento debe ser un entero mayor o igual a cero');
    }
  }
  return { limite: tope, offset: desplazamiento };
}

/** Valida un rango opcional de fechas: la inicial no puede ser posterior a la final. */
export function exigirRangoFechas(desde, hasta) {
  const inicio = desde === undefined || desde === null || desde === '' ? null : exigirFecha(desde, 'La fecha inicial');
  const fin = hasta === undefined || hasta === null || hasta === '' ? null : exigirFecha(hasta, 'La fecha final');
  if (inicio && fin && inicio > fin) {
    throw new ErrorValidacion('El rango de fechas es inválido: la fecha inicial es posterior a la final');
  }
  return { desde: inicio, hasta: fin };
}
