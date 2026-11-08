import { describe, expect, it } from 'vitest';
import { mejorOpcionada, plazoPorDefecto, resumirValores, validarValores } from './valoresCotizacion.js';

const alimentos = [
  { detalleSolicitudId: 'd1', cantidad: 100, precioSugeridoUnitario: 4500 },
  { detalleSolicitudId: 'd2', cantidad: 50, precioSugeridoUnitario: 12000 },
];

describe('valores de cotización', () => {
  it('exige un valor positivo para todos los alimentos', () => {
    const r = validarValores(alimentos, { d1: '4400', d2: '' });
    expect(r.valido).toBe(false);
    expect(Object.keys(r.errores)).toEqual(['d2']);
    const ok = validarValores(alimentos, { d1: '4400', d2: '11900' });
    expect(ok.valores).toEqual([
      { detalleSolicitudId: 'd1', valorUnitario: 4400 },
      { detalleSolicitudId: 'd2', valorUnitario: 11900 },
    ]);
  });

  it('calcula el total y lo compara con el sugerido del Ministerio', () => {
    const r = resumirValores(alimentos, { d1: '4400', d2: '11900' });
    expect(r.total).toBe(1035000);
    expect(r.sugerido).toBe(1050000);
    expect(r.porcentajeSugerido).toBe(99);
    expect(resumirValores(alimentos, { d1: '4400' }).total).toBeNull();
  });

  it('sin precio sugerido no compara', () => {
    expect(resumirValores([{ detalleSolicitudId: 'x', cantidad: 1, precioSugeridoUnitario: null }], { x: '10' }).porcentajeSugerido).toBeNull();
  });

  it('marca como mejor la opcionada de menor valor que cubre todos los alimentos', () => {
    const opcionadas = [
      { id: 'a', alimentos: 2, valorTotal: 1035000 },
      { id: 'b', alimentos: 1, valorTotal: 400000 },
      { id: 'c', alimentos: 2, valorTotal: 990000 },
    ];
    expect(mejorOpcionada(opcionadas, 2)).toBe('c');
    expect(mejorOpcionada([{ id: 'b', alimentos: 1, valorTotal: 1 }], 2)).toBeNull();
  });

  it('propone un plazo a tres días, cruzando meses', () => {
    expect(plazoPorDefecto('2026-11-29')).toBe('2026-12-02');
  });
});
