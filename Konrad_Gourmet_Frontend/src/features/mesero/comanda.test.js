import { describe, expect, it } from 'vitest';
import { MAXIMO_POR_PLATO, comandaReducer, detallarComanda, itemsParaPedido } from './comanda.js';

const aplicar = (acciones, inicial = {}) => acciones.reduce(comandaReducer, inicial);

describe('comanda por mesa', () => {
  it('agrega platos y acumula si se repiten, conservando el orden', () => {
    const e = aplicar([
      { tipo: 'agregar', mesaId: 'm1', platoId: 'a' },
      { tipo: 'agregar', mesaId: 'm1', platoId: 'b' },
      { tipo: 'agregar', mesaId: 'm1', platoId: 'a' },
    ]);
    expect(e.m1).toEqual([{ platoId: 'a', cantidad: 2 }, { platoId: 'b', cantidad: 1 }]);
  });

  it('cada mesa tiene su propia comanda', () => {
    const e = aplicar([
      { tipo: 'agregar', mesaId: 'm1', platoId: 'a' },
      { tipo: 'agregar', mesaId: 'm2', platoId: 'a' },
      { tipo: 'vaciar', mesaId: 'm1' },
    ]);
    expect(e).toEqual({ m2: [{ platoId: 'a', cantidad: 1 }] });
  });

  it('fijar en 0 quita la línea; no supera el máximo del backend', () => {
    let e = aplicar([{ tipo: 'agregar', mesaId: 'm1', platoId: 'a' }, { tipo: 'fijar', mesaId: 'm1', platoId: 'a', cantidad: 5000 }]);
    expect(e.m1[0].cantidad).toBe(MAXIMO_POR_PLATO);
    e = comandaReducer(e, { tipo: 'fijar', mesaId: 'm1', platoId: 'a', cantidad: 0 });
    expect(e.m1).toBeUndefined();
  });

  it('calcula el total estimado y detecta platos que ya no están en el menú', () => {
    const menu = new Map([
      ['a', { id: 'a', nombre: 'Ajiaco', precio: 25000, activo: true }],
      ['b', { id: 'b', nombre: 'Sopa', precio: 12000, activo: false }],
    ]);
    const d = detallarComanda([{ platoId: 'a', cantidad: 2 }, { platoId: 'b', cantidad: 1 }, { platoId: 'x', cantidad: 1 }], menu);
    expect(d.totalEstimado).toBe(50000);
    expect(d.unidades).toBe(2);
    expect(d.noDisponibles).toBe(2);
  });

  it('arma el cuerpo de POST /pedidos', () => {
    expect(itemsParaPedido([{ platoId: 'a', cantidad: 2 }, { platoId: 'b', cantidad: 0 }])).toEqual([{ platoId: 'a', cantidad: 2 }]);
  });
});
