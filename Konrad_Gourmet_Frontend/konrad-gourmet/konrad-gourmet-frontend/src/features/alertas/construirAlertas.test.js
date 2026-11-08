import { describe, expect, it } from 'vitest';
import { construirAlertas, resumenMensaje } from './construirAlertas.js';

const notificacion = (id, tipo, creadaEn) => ({ id, tipo, asunto: `Asunto ${id}`, mensaje: `TITULO\n\nDetalle de ${id}`, creadaEn });
const alarma = { id: 'a1', generadaEn: '2026-11-05T05:00:00Z', producto: 'Pollo', unidad: 'kg', cantidadActual: 2, cantidadReferencia: 20 };

describe('construirAlertas', () => {
  it('muestra solo las notificaciones nuevas desde que se abrió la sesión', () => {
    const lista = construirAlertas({
      notificaciones: [notificacion('n1', 'PROMOCION', '2026-11-05T01:00:00Z'), notificacion('n2', 'PROMOCION', '2026-11-05T02:00:00Z')],
      base: new Set(['notificacion:n1']),
    });
    expect(lista.map((a) => a.id)).toEqual(['notificacion:n2']);
    expect(lista[0].detalle).toBe('Detalle de n2');
  });

  it('las alarmas de stock activas se muestran siempre hasta descartarlas', () => {
    const lista = construirAlertas({ alarmas: [alarma], rol: 'JEFE_COCINA' });
    expect(lista[0].titulo).toBe('Pollo: quedan 2 kg');
    expect(lista[0].detalle).toContain('10 %');
    expect(lista[0].destino).toBe('/cocina/inventario');
    expect(construirAlertas({ alarmas: [alarma], descartadas: new Set(['alarma:a1']) })).toEqual([]);
  });

  it('al Jefe de Cocina no le repite la alarma como notificación', () => {
    const lista = construirAlertas({ notificaciones: [notificacion('n3', 'ALARMA_STOCK', '2026-11-05T03:00:00Z')], alarmas: [alarma], rol: 'JEFE_COCINA' });
    expect(lista.map((a) => a.tipo)).toEqual(['ALARMA_STOCK']);
    expect(lista[0].id).toBe('alarma:a1');
  });

  it('ordena de la más reciente a la más antigua', () => {
    const lista = construirAlertas({
      notificaciones: [notificacion('v', 'PROMOCION', '2026-11-01T00:00:00Z'), notificacion('r', 'PROMOCION', '2026-11-04T00:00:00Z')],
    });
    expect(lista.map((a) => a.id)).toEqual(['notificacion:r', 'notificacion:v']);
  });

  it('resume el mensaje saltando títulos en mayúsculas y recorta los largos', () => {
    expect(resumenMensaje('ALARMA DE STOCK BAJO\n\nProducto: Pollo', 'Asunto')).toBe('Producto: Pollo');
    expect(resumenMensaje('x'.repeat(200), '', 20)).toHaveLength(20);
  });
});
