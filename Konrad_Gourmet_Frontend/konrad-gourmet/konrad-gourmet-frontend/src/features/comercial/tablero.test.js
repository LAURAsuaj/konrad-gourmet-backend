import { describe, expect, it } from 'vitest';
import { estadoIndicador, filasRanking, metricaProveedor } from './tablero.js';

describe('tablero BAM', () => {
  it('distingue indicador con datos, sin datos y con error', () => {
    expect(estadoIndicador({ disponible: true })).toEqual({ tipo: 'ok' });
    expect(estadoIndicador({ disponible: false, mensaje: 'Sin pedidos' })).toEqual({ tipo: 'vacio', mensaje: 'Sin pedidos' });
    expect(estadoIndicador({ disponible: false, error: 'Falló' }).tipo).toBe('error');
  });

  it('arma el ranking con la proporción frente al primero', () => {
    const filas = filasRanking([{ punto: 'A', platosVendidos: 60 }, { punto: 'B', platosVendidos: 15 }], { nombre: 'punto', valor: 'platosVendidos' });
    expect(filas).toEqual([
      { posicion: 1, nombre: 'A', valor: 60, maximo: 60 },
      { posicion: 2, nombre: 'B', valor: 15, maximo: 60 },
    ]);
  });

  it('el criterio de mejores precios no muestra cifras (confidencialidad)', () => {
    expect(metricaProveedor('menor_razon_precio').unidad).toBeNull();
    expect(metricaProveedor('ordenes_compra').unidad(2)).toBe('2 órdenes de compra');
  });
});
