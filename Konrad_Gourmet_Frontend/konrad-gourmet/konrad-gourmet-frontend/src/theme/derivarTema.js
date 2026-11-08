import { ajustarHastaContraste, esHexValido, esOscuro, masLegibleSobre, mezclar } from './color.js';
import { pilaTipografica } from './fuentes.js';
import { APARIENCIA_POR_DEFECTO } from './apariencia.js';

const BLANCO = '#FFFFFF';

/**
 * Convierte la imagen corporativa (4 colores y una tipografía) en las variables CSS
 * que usa toda la interfaz. Las variantes se calculan para cumplir WCAG 2.1 AA:
 *  - primario-fuerte: el primario oscurecido hasta tener contraste 4,5:1 sobre la superficie
 *    (para textos y enlaces de marca).
 *  - sobre-primario: el color de texto que mejor se lee encima del primario (botones).
 *  - texto-suave: el texto aclarado sin bajar de 4,5:1 sobre la superficie.
 */
export function derivarTema(apariencia = APARIENCIA_POR_DEFECTO) {
  const color = (campo) => (esHexValido(apariencia?.[campo]) ? apariencia[campo] : APARIENCIA_POR_DEFECTO[campo]);
  const primario = color('colorPrimario');
  const secundario = color('colorSecundario');
  const fondo = color('colorFondo');
  const texto = color('colorTexto');

  // Si el fondo elegido es oscuro, la superficie de tarjetas se aclara un poco sobre él.
  const superficie = esOscuro(fondo) ? mezclar(fondo, BLANCO, 0.06) : BLANCO;
  const destinoContraste = esOscuro(fondo) ? BLANCO : '#000000';

  const textoSuave = ajustarHastaContraste(mezclar(texto, superficie, 0.4), superficie, 4.5, texto);

  return {
    '--kg-primario': primario,
    '--kg-primario-fuerte': ajustarHastaContraste(primario, superficie, 4.5, destinoContraste),
    '--kg-primario-suave': mezclar(primario, superficie, 0.9),
    '--kg-sobre-primario': masLegibleSobre(primario, [texto, BLANCO, '#1A202C']),
    '--kg-secundario': secundario,
    '--kg-sobre-secundario': masLegibleSobre(secundario, [BLANCO, texto]),
    '--kg-fondo': fondo,
    '--kg-superficie': superficie,
    '--kg-texto': texto,
    '--kg-texto-suave': textoSuave,
    '--kg-borde': mezclar(texto, superficie, 0.88),
    '--kg-borde-fuerte': mezclar(texto, superficie, 0.72),
    '--kg-neutro-suave': mezclar(texto, superficie, 0.93),
    '--kg-fuente': pilaTipografica(apariencia?.tipografia),
  };
}

export function aplicarVariables(variables, elemento = document.documentElement) {
  for (const [nombre, valor] of Object.entries(variables)) elemento.style.setProperty(nombre, valor);
}
