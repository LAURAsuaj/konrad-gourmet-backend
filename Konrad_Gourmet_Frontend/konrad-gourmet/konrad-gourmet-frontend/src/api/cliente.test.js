import { describe, expect, it, vi } from 'vitest';
import { ErrorApi, configurarCliente, construirUrl, interpretarRespuesta } from './cliente.js';

const respuesta = (status, cuerpo, cabeceras = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => cuerpo,
  headers: { get: (n) => cabeceras[n] ?? null },
});

describe('cliente de la API', () => {
  it('arma la URL con /api/v1 y omite filtros vacíos', () => {
    const url = construirUrl('/notificaciones', { tipo: 'PROMOCION', desde: '', limite: 20, hasta: undefined });
    expect(url).toBe('http://localhost:3000/api/v1/notificaciones?tipo=PROMOCION&limite=20');
  });

  it('devuelve los datos de una respuesta exitosa', async () => {
    await expect(interpretarRespuesta(respuesta(200, { datos: { ok: 1 } }))).resolves.toEqual({ ok: 1 });
  });

  it('convierte el error de la API en ErrorApi con código y mensaje', async () => {
    const error = await interpretarRespuesta(respuesta(409, { error: { codigo: 'CONFLICTO', mensaje: 'Ya existe' } })).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect([error.estado, error.codigo, error.message]).toEqual([409, 'CONFLICTO', 'Ya existe']);
  });

  it('lee Retry-After del límite de intentos', async () => {
    const error = await interpretarRespuesta(respuesta(429, { error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'x' } }, { 'Retry-After': '120' })).catch((e) => e);
    expect(error.reintentarEnSegundos).toBe(120);
  });

  it('avisa a la sesión ante 401 NO_AUTENTICADO, pero no en rutas públicas', async () => {
    const alNoAutenticado = vi.fn();
    configurarCliente({ alNoAutenticado });
    const cuerpo = { error: { codigo: 'NO_AUTENTICADO', mensaje: 'Token vencido' } };
    await interpretarRespuesta(respuesta(401, cuerpo)).catch(() => {});
    expect(alNoAutenticado).toHaveBeenCalledTimes(1);
    await interpretarRespuesta(respuesta(401, cuerpo), { publica: true }).catch(() => {});
    expect(alNoAutenticado).toHaveBeenCalledTimes(1);
  });

  it('un 401 de credenciales inválidas no cierra la sesión', async () => {
    const alNoAutenticado = vi.fn();
    configurarCliente({ alNoAutenticado });
    await interpretarRespuesta(respuesta(401, { error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'x' } })).catch(() => {});
    expect(alNoAutenticado).not.toHaveBeenCalled();
  });
});
