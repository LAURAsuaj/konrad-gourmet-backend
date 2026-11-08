import { describe, expect, it } from 'vitest';
import { contraste } from './color.js';
import { derivarTema } from './derivarTema.js';
import { APARIENCIA_POR_DEFECTO } from './apariencia.js';
import { PILAS_TIPOGRAFICAS } from './fuentes.js';

const CASOS = [
  APARIENCIA_POR_DEFECTO,
  { ...APARIENCIA_POR_DEFECTO, colorPrimario: '#FFD400' }, // amarillo muy claro
  { ...APARIENCIA_POR_DEFECTO, colorPrimario: '#1F6FEB', colorFondo: '#FFFFFF' },
  { ...APARIENCIA_POR_DEFECTO, colorFondo: '#121417', colorTexto: '#F1F3F5' }, // fondo oscuro
];

describe('derivarTema', () => {
  it('con la apariencia por defecto usa el turquesa institucional y el antracita', () => {
    const v = derivarTema(APARIENCIA_POR_DEFECTO);
    expect(v['--kg-primario']).toBe('#00A3B4');
    expect(v['--kg-texto']).toBe('#1A202C');
    expect(v['--kg-fondo']).toBe('#F8F9FA');
    expect(v['--kg-superficie']).toBe('#FFFFFF');
  });

  it.each(CASOS)('cumple AA (4,5:1) en textos y botones para %o', (apariencia) => {
    const v = derivarTema(apariencia);
    expect(contraste(v['--kg-texto'], v['--kg-superficie'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(v['--kg-texto-suave'], v['--kg-superficie'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(v['--kg-primario-fuerte'], v['--kg-superficie'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(v['--kg-sobre-primario'], v['--kg-primario'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(v['--kg-sobre-secundario'], v['--kg-secundario'])).toBeGreaterThanOrEqual(4.5);
  });

  it('ignora colores inválidos y usa los valores por defecto', () => {
    const v = derivarTema({ ...APARIENCIA_POR_DEFECTO, colorPrimario: 'rojo' });
    expect(v['--kg-primario']).toBe('#00A3B4');
  });

  it('traduce cada tipografía del backend a una pila de fuentes', () => {
    for (const tipografia of Object.keys(PILAS_TIPOGRAFICAS)) {
      expect(derivarTema({ ...APARIENCIA_POR_DEFECTO, tipografia })['--kg-fuente']).toBe(PILAS_TIPOGRAFICAS[tipografia]);
    }
    expect(derivarTema({ ...APARIENCIA_POR_DEFECTO, tipografia: 'comic' })['--kg-fuente']).toBe(PILAS_TIPOGRAFICAS.sistema);
  });
});
