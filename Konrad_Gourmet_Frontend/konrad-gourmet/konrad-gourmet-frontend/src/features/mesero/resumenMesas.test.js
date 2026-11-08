import { describe, expect, it } from 'vitest';
import { FILTROS_MESA, describirPlatos, filtrarMesas, resumirMesas } from './resumenMesas.js';

const mesas = [
  { id: 'm2', numero: 2 },
  { id: 'm1', numero: 1 },
  { id: 'm3', numero: 3 },
];
const pedidos = [
  { id: 'p1', fecha: '2026-11-07T15:00:00Z', mesa: 1, items: [{ plato: 'Ajiaco', cantidad: 2 }] },
  { id: 'p2', fecha: '2026-11-07T17:00:00Z', mesa: 1, items: [{ plato: 'Limonada', cantidad: 1 }, { plato: 'Bandeja', cantidad: 3 }] },
  { id: 'p3', fecha: '2026-11-07T16:00:00Z', mesa: 3, items: [{ plato: 'Sopa', cantidad: 1 }] },
];

describe('resumirMesas', () => {
  it('cruza los pedidos por número de mesa y ordena las mesas por número', () => {
    const r = resumirMesas(mesas, pedidos);
    expect(r.map((m) => m.numero)).toEqual([1, 2, 3]);
    expect(r[0]).toMatchObject({ pedidosHoy: 2, platosHoy: 6, ultimoPedido: '2026-11-07T17:00:00Z' });
    expect(r[0].ultimosPlatos.map((i) => i.plato)).toEqual(['Limonada', 'Bandeja']);
    expect(r[1]).toMatchObject({ pedidosHoy: 0, platosHoy: 0, ultimoPedido: null });
  });

  it('filtra por mesas libres, con pedidos y por número', () => {
    const r = resumirMesas(mesas, pedidos);
    expect(filtrarMesas(r, { filtro: FILTROS_MESA.LIBRES }).map((m) => m.numero)).toEqual([2]);
    expect(filtrarMesas(r, { filtro: FILTROS_MESA.CON_PEDIDOS }).map((m) => m.numero)).toEqual([1, 3]);
    expect(filtrarMesas(r, { busqueda: '3' }).map((m) => m.numero)).toEqual([3]);
  });

  it('describe los platos de forma corta', () => {
    expect(describirPlatos([{ plato: 'A', cantidad: 2 }, { plato: 'B', cantidad: 1 }])).toBe('2 × A, 1 × B');
    expect(describirPlatos([1, 2, 3, 4, 5].map((n) => ({ plato: `P${n}`, cantidad: 1 })), 2)).toBe('1 × P1, 1 × P2, y 3 más');
  });
});
