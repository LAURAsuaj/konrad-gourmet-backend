import { describe, expect, it } from 'vitest';
import { construirCuerpo, definicionDe } from './catalogosDefinicion.js';
import { REGLAS, franjasDeRangos } from './reglasDefinicion.js';
import { normalizarApariencia, validarApariencia } from './imagenCorporativa.js';
import { APARIENCIA_POR_DEFECTO } from '../../theme/apariencia.js';

describe('catálogos', () => {
  it('valida y arma el cuerpo de un producto nuevo', () => {
    const r = construirCuerpo(definicionDe('productos'), { nombre: ' Arroz ', categoriaId: 'c1', unidadId: 'u1' });
    expect(r).toEqual({ errores: {}, cuerpo: { nombre: 'Arroz', categoriaId: 'c1', unidadId: 'u1' }, valido: true });
  });

  it('en la edición omite los campos inmutables y los que no cambiaron', () => {
    const original = { nombre: 'Arroz', categoriaId: 'c1', unidadId: 'u1' };
    const r = construirCuerpo(definicionDe('productos'), { nombre: 'Arroz', categoriaId: 'c2', unidadId: 'u9' }, original);
    expect(r.cuerpo).toEqual({ categoriaId: 'c2' });
  });

  it('valida enteros, correos y obligatorios', () => {
    expect(construirCuerpo(definicionDe('mesas'), { puntoId: 'p', numero: '0' }).errores.numero).toBeTruthy();
    expect(construirCuerpo(definicionDe('proveedores'), { nombre: 'A', correo: 'no-correo' }).errores.correo).toBeTruthy();
    expect(construirCuerpo(definicionDe('proveedores'), { nombre: 'A', correo: 'VENTAS@X.CO' }).cuerpo.correo).toBe('ventas@x.co');
    expect(construirCuerpo(definicionDe('puntos'), { nombre: '  ' }).valido).toBe(false);
  });

  it('borrar un correo opcional en la edición lo envía como null', () => {
    expect(construirCuerpo(definicionDe('proveedores'), { nombre: 'A', correo: '' }, { nombre: 'A', correo: 'a@b.co' }).cuerpo).toEqual({ correo: null });
  });
});

describe('reglas del sistema', () => {
  it('aplica los mismos límites del backend', () => {
    expect(REGLAS.alarma_porcentaje.validar('25')).toEqual({ valor: 25 });
    expect(REGLAS.alarma_porcentaje.validar('101').error).toBeTruthy();
    expect(REGLAS.max_intentos_login.validar('2.5').error).toBeTruthy();
    expect(REGLAS.hora_descuento_diario.validar('24:00').error).toBeTruthy();
    expect(REGLAS.hora_descuento_diario.validar('02:30')).toEqual({ valor: '02:30' });
    expect(REGLAS.rangos_validacion_cotizacion.validar({ sospechosa_bajo: 0.5, opcionada_max: 1.3, rechazada_sobre: 1.25 }).error).toBeTruthy();
  });

  it('explica las franjas; con opcionada_max < rechazada_sobre aparece la franja sospechosa por cara', () => {
    expect(franjasDeRangos({ sospechosa_bajo: 0.5, opcionada_max: 1.25, rechazada_sobre: 1.25 }).map((f) => f.estado)).toEqual(['SOSPECHOSA', 'OPCIONADA', 'RECHAZADA']);
    expect(franjasDeRangos({ sospechosa_bajo: 0.5, opcionada_max: 1.1, rechazada_sobre: 1.3 })).toHaveLength(4);
  });
});

describe('imagen corporativa', () => {
  it('la apariencia por defecto es válida', () => {
    expect(validarApariencia(APARIENCIA_POR_DEFECTO).valido).toBe(true);
  });

  it('rechaza contraste insuficiente, signos < >, svg y URLs sin https', () => {
    const { errores } = validarApariencia({
      ...APARIENCIA_POR_DEFECTO,
      colorTexto: '#CCCCCC',
      colorFondo: '#FFFFFF',
      eslogan: '<b>hola</b>',
      logo: 'http://x.co/logo.png',
    });
    expect(Object.keys(errores).sort()).toEqual(['colorTexto', 'eslogan', 'logo']);
    expect(validarApariencia({ ...APARIENCIA_POR_DEFECTO, logo: 'data:image/svg+xml;base64,AAAA' }).errores.logo).toBeTruthy();
  });

  it('normaliza textos y colores', () => {
    expect(normalizarApariencia({ ...APARIENCIA_POR_DEFECTO, nombreComercial: '  KG ', colorPrimario: '#00a3b4', logo: '' })).toMatchObject({
      nombreComercial: 'KG',
      colorPrimario: '#00A3B4',
      logo: null,
    });
  });
});
