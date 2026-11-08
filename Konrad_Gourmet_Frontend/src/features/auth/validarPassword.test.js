import { describe, expect, it } from 'vitest';
import { evaluarPassword, passwordValida } from './validarPassword.js';

describe('reglas de contraseña (enunciado)', () => {
  it('acepta mínimo 8 caracteres con mayúscula, minúscula y número', () => {
    expect(passwordValida('Clave1234')).toBe(true);
    expect(passwordValida('ÑandúRojo9')).toBe(true);
  });

  it.each([
    ['Clave12', 'longitud'],
    ['clave1234', 'mayuscula'],
    ['CLAVE1234', 'minuscula'],
    ['ClaveSegura', 'numero'],
    [`Aa1${'ñ'.repeat(35)}`, 'maximo'],
  ])('rechaza "%s" por la regla %s', (password, regla) => {
    expect(passwordValida(password)).toBe(false);
    expect(evaluarPassword(password).find((r) => r.id === regla).cumple).toBe(false);
  });
});
