/** Validaciones de entrada compartidas por los módulos de dominio. */
import { ErrorValidacion } from './errors/ErroresDeNegocio.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function esUuid(valor) {
  return typeof valor === 'string' && UUID.test(valor);
}

export function exigirUuid(valor, campo) {
  if (!esUuid(valor)) throw new ErrorValidacion(`${campo} no es un identificador válido`);
  return valor.toLowerCase();
}

export function exigirTexto(valor, campo, { max = 200 } = {}) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new ErrorValidacion(`${campo} es obligatorio`);
  }
  const texto = valor.trim();
  if (texto.length > max) throw new ErrorValidacion(`${campo} no puede superar ${max} caracteres`);
  return texto;
}

export function exigirNumeroPositivo(valor, campo, { max = 1e9 } = {}) {
  const numero =
    typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : NaN;
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new ErrorValidacion(`${campo} debe ser un valor numérico mayor a cero`);
  }
  if (numero > max) throw new ErrorValidacion(`${campo} no puede superar ${max}`);
  return numero;
}

export function exigirNumeroNoNegativo(valor, campo, { max = 1e9 } = {}) {
  const numero =
    typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : NaN;
  if (!Number.isFinite(numero) || numero < 0) {
    throw new ErrorValidacion(`${campo} debe ser un valor numérico mayor o igual a cero`);
  }
  if (numero > max) throw new ErrorValidacion(`${campo} no puede superar ${max}`);
  return numero;
}

export function exigirEnteroPositivo(valor, campo, { max = 10_000 } = {}) {
  const numero = exigirNumeroPositivo(valor, campo, { max });
  if (!Number.isInteger(numero)) throw new ErrorValidacion(`${campo} debe ser un número entero`);
  return numero;
}

export function exigirCorreo(valor, campo = 'El correo') {
  const texto = exigirTexto(valor, campo, { max: 254 }).toLowerCase();
  if (!CORREO.test(texto)) throw new ErrorValidacion(`${campo} no tiene un formato válido`);
  return texto;
}

export function exigirFecha(valor, campo) {
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (valor === undefined || valor === null || Number.isNaN(fecha.getTime())) {
    throw new ErrorValidacion(`${campo} no es una fecha válida`);
  }
  return fecha;
}

export function exigirLista(valor, campo, { min = 1, max = 100 } = {}) {
  if (!Array.isArray(valor) || valor.length < min) {
    throw new ErrorValidacion(`${campo} debe contener al menos ${min} elemento(s)`);
  }
  if (valor.length > max) throw new ErrorValidacion(`${campo} no puede superar ${max} elementos`);
  return valor;
}

export function exigirObjeto(valor, campo) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new ErrorValidacion(`${campo} es obligatorio`);
  }
  return valor;
}
