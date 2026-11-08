/**
 * Regla de validación automática de cotizaciones (CU-12).
 *
 * razón = valor cotizado / valor sugerido por el Ministerio de Comercio.
 *   - razón > rechazada_sobre                       -> RECHAZADA  (demasiado costosa)
 *   - razón < sospechosa_bajo                       -> SOSPECHOSA (precio irrealmente bajo)
 *   - opcionada_max < razón <= rechazada_sobre      -> SOSPECHOSA (por encima de lo esperado)
 *   - sospechosa_bajo <= razón <= opcionada_max     -> OPCIONADA
 * Los tres umbrales son parámetros definidos por el área de compras.
 */
import { ErrorValidacion } from '../../errors/ErroresDeNegocio.js';
import { ESTADOS_COTIZACION } from './estados.js';

/** Verifica que los rangos parametrizados existan y sean coherentes. */
export function rangosValidos(rangos) {
  if (!rangos || typeof rangos !== 'object') return false;
  const { sospechosa_bajo: bajo, opcionada_max: maximo, rechazada_sobre: rechazo } = rangos;
  return [bajo, maximo, rechazo].every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0) &&
    bajo <= maximo && maximo <= rechazo;
}

/**
 * @returns {{estado: string, razon: number}}
 * @throws {ErrorValidacion} si algún valor no es numérico mayor a cero (CU-12 EXCEP-3)
 */
export function clasificarCotizacion({ valorCotizado, valorSugerido, rangos }) {
  const cotizado = Number(valorCotizado);
  const sugerido = Number(valorSugerido);
  if (valorCotizado === null || valorCotizado === undefined || !Number.isFinite(cotizado) || cotizado <= 0) {
    throw new ErrorValidacion('El valor cotizado no es un número mayor a cero');
  }
  if (valorSugerido === null || valorSugerido === undefined || !Number.isFinite(sugerido) || sugerido <= 0) {
    throw new ErrorValidacion('El valor sugerido no es un número mayor a cero');
  }
  if (!rangosValidos(rangos)) throw new ErrorValidacion('Los rangos de validación no son válidos');

  const razon = cotizado / sugerido;
  if (razon > rangos.rechazada_sobre) return { estado: ESTADOS_COTIZACION.RECHAZADA, razon };
  if (razon < rangos.sospechosa_bajo || razon > rangos.opcionada_max) {
    return { estado: ESTADOS_COTIZACION.SOSPECHOSA, razon };
  }
  return { estado: ESTADOS_COTIZACION.OPCIONADA, razon };
}
