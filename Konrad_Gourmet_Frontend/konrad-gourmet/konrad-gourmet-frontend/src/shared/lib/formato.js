/** Formatos de Colombia: fechas en la hora de Bogotá y pesos sin decimales. */
const ZONA = 'America/Bogota';

const FECHA = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, day: 'numeric', month: 'short', year: 'numeric' });
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const HORA = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' });
const MONEDA = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const NUMERO = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

const aFecha = (valor) => (valor instanceof Date ? valor : new Date(valor));
const valida = (fecha) => !Number.isNaN(fecha.getTime());

export function formatearFecha(valor) {
  const fecha = aFecha(valor);
  return valor && valida(fecha) ? FECHA.format(fecha) : '';
}

export function formatearFechaHora(valor) {
  const fecha = aFecha(valor);
  return valor && valida(fecha) ? FECHA_HORA.format(fecha) : '';
}

export function formatearHora(valor) {
  const fecha = aFecha(valor);
  return valor && valida(fecha) ? HORA.format(fecha) : '';
}

export function formatearMoneda(valor) {
  return Number.isFinite(Number(valor)) ? MONEDA.format(Number(valor)) : '';
}

export function formatearNumero(valor) {
  return Number.isFinite(Number(valor)) ? NUMERO.format(Number(valor)) : '';
}

/** "hace 5 min", "hace 2 h"... para tiempos recientes; fecha completa para lo anterior. */
export function formatearRelativo(valor, ahora = Date.now()) {
  const fecha = aFecha(valor);
  if (!valor || !valida(fecha)) return '';
  const minutos = Math.round((ahora - fecha.getTime()) / 60_000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return formatearFechaHora(fecha);
}

/** Fecha de hoy en Bogotá como AAAA-MM-DD. */
export function fechaDeHoy(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(ahora);
}

/** Colombia está en UTC−5 todo el año (sin horario de verano). */
export const inicioDelDia = (fecha) => (fecha ? `${fecha}T00:00:00.000-05:00` : undefined);
export const finDelDia = (fecha) => (fecha ? `${fecha}T23:59:59.999-05:00` : undefined);
