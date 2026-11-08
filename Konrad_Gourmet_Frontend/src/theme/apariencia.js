import { pedir } from '../api/cliente.js';

/**
 * Valores por defecto de la imagen corporativa. Son los mismos del backend
 * (APARIENCIA_POR_DEFECTO en src/domain/modules/parametrizacion/apariencia.js) y se usan
 * mientras llega GET /api/v1/apariencia o si la API no responde.
 */
export const APARIENCIA_POR_DEFECTO = Object.freeze({
  nombreComercial: 'Konrad Gourmet',
  eslogan: '',
  colorPrimario: '#00A3B4',
  colorSecundario: '#1A202C',
  colorFondo: '#F8F9FA',
  colorTexto: '#1A202C',
  tipografia: 'sistema',
  logo: null,
  textoBienvenida: 'Bienvenido al sistema de abastecimiento',
  textoPiePagina: '',
});

/** Ruta pública: no requiere sesión, por eso se pinta también la pantalla de inicio de sesión. */
export async function obtenerApariencia() {
  const datos = await pedir('/apariencia', { publica: true });
  return { ...APARIENCIA_POR_DEFECTO, ...datos };
}
