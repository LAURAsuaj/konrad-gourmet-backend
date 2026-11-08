import { describe, expect, it } from 'vitest';
import { estadoStock, inventarioMasBajo, rankingPlatos, sugerirSolicitud, validarSolicitud } from './analisisCocina.js';

describe('análisis de cocina', () => {
  it('ordena los platos más pedidos sumando todas las líneas', () => {
    const pedidos = [
      { items: [{ platoId: 'a', plato: 'Ajiaco', cantidad: 2 }, { platoId: 'b', plato: 'Bandeja', cantidad: 1 }] },
      { items: [{ platoId: 'b', plato: 'Bandeja', cantidad: 4 }] },
    ];
    expect(rankingPlatos(pedidos)).toEqual([
      { platoId: 'b', plato: 'Bandeja', cantidad: 5 },
      { platoId: 'a', plato: 'Ajiaco', cantidad: 2 },
    ]);
  });

  it('clasifica el stock: agotado, en alarma (según la API) o normal', () => {
    expect(estadoStock({ cantidadActual: 0, enAlarma: true })).toBe('AGOTADO');
    expect(estadoStock({ cantidadActual: 2, enAlarma: true })).toBe('ALARMA');
    expect(estadoStock({ cantidadActual: 9, enAlarma: false })).toBe('NORMAL');
    expect(inventarioMasBajo([{ porcentaje: 80 }, { porcentaje: 10 }, { porcentaje: 50 }], 2).map((i) => i.porcentaje)).toEqual([10, 50]);
  });

  it('sugiere pedir lo que falta para llegar a la referencia', () => {
    const filas = sugerirSolicitud(['p1', 'p2', 'inexistente'], {
      inventario: [{ productoId: 'p1', cantidadActual: 2, cantidadReferencia: 20 }],
      productos: [{ id: 'p1', categoriaId: 'c1' }, { id: 'p2', categoriaId: 'c2' }],
    });
    expect(filas).toEqual([
      { categoriaId: 'c1', productoId: 'p1', marcaId: '', cantidad: '18' },
      { categoriaId: 'c2', productoId: 'p2', marcaId: '', cantidad: '' },
    ]);
  });

  it('valida campos obligatorios, cantidades y productos repetidos con la misma marca', () => {
    const { errores, valido } = validarSolicitud([
      { categoriaId: 'c', productoId: 'p', marcaId: '', cantidad: '5' },
      { categoriaId: 'c', productoId: 'p', marcaId: '', cantidad: '0' },
      { categoriaId: '', productoId: '', marcaId: '', cantidad: '' },
      { categoriaId: 'c', productoId: 'p', marcaId: 'm', cantidad: '2' },
    ]);
    expect(valido).toBe(false);
    expect(errores[0]).toEqual({});
    expect(Object.keys(errores[1]).sort()).toEqual(['cantidad', 'productoId']);
    expect(Object.keys(errores[2]).sort()).toEqual(['cantidad', 'categoriaId', 'productoId']);
    expect(errores[3]).toEqual({});
  });
});
