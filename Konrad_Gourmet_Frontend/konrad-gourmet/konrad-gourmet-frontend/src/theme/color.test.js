import { describe, expect, it } from 'vitest';
import { ajustarHastaContraste, contraste, esHexValido, masLegibleSobre, mezclar } from './color.js';

describe('color (WCAG 2.1)', () => {
  it('calcula el contraste igual que el backend', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
    expect(contraste('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('valida colores #RRGGBB', () => {
    expect(esHexValido('#00A3B4')).toBe(true);
    expect(esHexValido('#FFF')).toBe(false);
    expect(esHexValido('turquesa')).toBe(false);
  });

  it('mezcla dos colores', () => {
    expect(mezclar('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mezclar('#00A3B4', '#FFFFFF', 0)).toBe('#00A3B4');
  });

  it('oscurece el turquesa hasta que se lea como texto sobre blanco (4,5:1)', () => {
    expect(contraste('#00A3B4', '#FFFFFF')).toBeLessThan(4.5);
    const fuerte = ajustarHastaContraste('#00A3B4', '#FFFFFF');
    expect(contraste(fuerte, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('elige el texto más legible sobre el turquesa: antracita, no blanco', () => {
    expect(masLegibleSobre('#00A3B4', ['#1A202C', '#FFFFFF'])).toBe('#1A202C');
    expect(contraste('#1A202C', '#00A3B4')).toBeGreaterThanOrEqual(4.5);
  });
});
