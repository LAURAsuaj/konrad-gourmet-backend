/**
 * Reglas parametrizables del sistema (CU-04). Solo estas claves pueden
 * modificarse, y cada valor se valida y normaliza antes de guardarse.
 */
import { ErrorValidacion } from '../../errors/ErroresDeNegocio.js';
import { rangosValidos } from '../compras/ValidadorCotizacion.js';
import { METRICAS_MEJOR_PROVEEDOR } from '../analitica/metricas.js';

function numero(valor, etiqueta) {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : NaN;
  if (!Number.isFinite(n)) throw new ErrorValidacion(`${etiqueta} debe ser un valor numérico`);
  return n;
}

function entero(minimo, maximo, etiqueta) {
  return (valor) => {
    const n = numero(valor, etiqueta);
    if (!Number.isInteger(n) || n < minimo || n > maximo) {
      throw new ErrorValidacion(`${etiqueta} debe ser un entero entre ${minimo} y ${maximo}`);
    }
    return n;
  };
}

export const REGLAS = Object.freeze({
  alarma_porcentaje: {
    descripcion: 'Porcentaje de la cantidad de referencia en el que se dispara la alarma de stock bajo (CU-07)',
    validar(valor) {
      const n = numero(valor, 'El porcentaje de alarma');
      if (n <= 0 || n > 100) throw new ErrorValidacion('El porcentaje de alarma debe ser mayor a 0 y máximo 100');
      return n;
    },
  },
  max_intentos_login: {
    descripcion: 'Intentos fallidos de inicio de sesión antes de bloquear la cuenta (CU-01)',
    validar: entero(1, 10, 'El máximo de intentos'),
  },
  hora_descuento_diario: {
    descripcion: 'Hora (HH:MM) del descuento diario de inventario (CU-06)',
    validar(valor) {
      if (typeof valor !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(valor.trim())) {
        throw new ErrorValidacion('La hora del descuento diario debe tener el formato HH:MM (24 horas)');
      }
      return valor.trim();
    },
  },
  rangos_validacion_cotizacion: {
    descripcion: 'Razón valor cotizado / valor sugerido que define RECHAZADA, SOSPECHOSA y OPCIONADA (CU-12)',
    validar(valor) {
      if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
        throw new ErrorValidacion('Los rangos deben indicarse como un objeto');
      }
      const rangos = {
        sospechosa_bajo: numero(valor.sospechosa_bajo, 'sospechosa_bajo'),
        opcionada_max: numero(valor.opcionada_max, 'opcionada_max'),
        rechazada_sobre: numero(valor.rechazada_sobre, 'rechazada_sobre'),
      };
      if (!rangosValidos(rangos)) {
        throw new ErrorValidacion('Los rangos deben ser mayores a cero y cumplir sospechosa_bajo <= opcionada_max <= rechazada_sobre');
      }
      return rangos;
    },
  },
  criterio_mejor_proveedor: {
    descripcion: 'Criterio del KPI mejor proveedor del tablero BAM (CU-14)',
    validar(valor) {
      if (!valor || typeof valor !== 'object' || !METRICAS_MEJOR_PROVEEDOR.includes(valor.metrica)) {
        throw new ErrorValidacion(`La métrica debe ser una de: ${METRICAS_MEJOR_PROVEEDOR.join(', ')}`);
      }
      return { metrica: valor.metrica };
    },
  },
  reintento_precio_sugerido_minutos: {
    descripcion: 'Minutos entre reintentos de consulta al Ministerio de Comercio (CU-10)',
    validar: entero(1, 1440, 'El intervalo de reintento'),
  },
});
