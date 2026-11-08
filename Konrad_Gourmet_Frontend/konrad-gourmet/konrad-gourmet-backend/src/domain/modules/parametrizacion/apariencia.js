/**
 * Imagen corporativa parametrizable (requisito de interfaz gráfica del enunciado): el Administrador
 * cambia el nombre, los colores, la tipografía, el logo y los textos de la interfaz desde la
 * aplicación, sin código ni diseñador. Se guarda como la regla `imagen_corporativa` y la interfaz
 * la lee por una ruta pública (GET /api/v1/apariencia) para pintarse, incluso la pantalla de inicio
 * de sesión.
 *
 * Seguridad: los textos no admiten < ni >; el logo es una URL https o una imagen incrustada
 * (png, jpeg, webp o gif; NO svg, que puede llevar scripts) de máximo ~60 KB, para caber en el
 * límite de 100 KB de las peticiones. Accesibilidad (WCAG 2.1 AA, SRS): el texto debe tener un
 * contraste mínimo de 4,5:1 con el fondo.
 */
import { ErrorValidacion } from '../../errors/ErroresDeNegocio.js';

export const TIPOGRAFIAS = Object.freeze(['sistema', 'serif', 'redondeada', 'monoespaciada']);
export const CONTRASTE_MINIMO = 4.5;
const LOGO_URL_MAX = 500;
const LOGO_INCRUSTADO_MAX = 80_000; // caracteres del data URI (~60 KB de imagen)
const REGEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const REGEX_LOGO_INCRUSTADO = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const REGEX_PROHIBIDOS = /[<>\u0000-\u001f]/;

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

const CAMPOS_TEXTO = Object.freeze({
  nombreComercial: { etiqueta: 'El nombre comercial', min: 1, max: 60 },
  eslogan: { etiqueta: 'El eslogan', min: 0, max: 120 },
  textoBienvenida: { etiqueta: 'El texto de bienvenida', min: 0, max: 200 },
  textoPiePagina: { etiqueta: 'El texto del pie de página', min: 0, max: 200 },
});
const CAMPOS_COLOR = Object.freeze({
  colorPrimario: 'El color primario',
  colorSecundario: 'El color secundario',
  colorFondo: 'El color de fondo',
  colorTexto: 'El color del texto',
});

/** Luminancia relativa de un color #RRGGBB (WCAG 2.1). */
function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relación de contraste entre dos colores #RRGGBB (de 1 a 21). */
export function contraste(colorA, colorB) {
  const [claro, oscuro] = [luminancia(colorA), luminancia(colorB)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

function validarLogo(valor) {
  if (valor === null || valor === '') return null;
  if (typeof valor !== 'string') throw new ErrorValidacion('El logo debe ser una URL https o una imagen incrustada');
  const logo = valor.trim();
  if (logo.startsWith('data:')) {
    if (logo.length > LOGO_INCRUSTADO_MAX) {
      throw new ErrorValidacion(`El logo incrustado supera el tamaño permitido (${LOGO_INCRUSTADO_MAX} caracteres, unos 60 KB); use una imagen más pequeña o una URL https`);
    }
    if (!REGEX_LOGO_INCRUSTADO.test(logo)) {
      throw new ErrorValidacion('El logo incrustado debe ser una imagen png, jpeg, webp o gif en base64 (no se admite svg)');
    }
    return logo;
  }
  if (logo.length > LOGO_URL_MAX) throw new ErrorValidacion(`La URL del logo no puede superar ${LOGO_URL_MAX} caracteres`);
  let url;
  try {
    url = new URL(logo);
  } catch {
    throw new ErrorValidacion('El logo debe ser una URL https válida o una imagen incrustada');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new ErrorValidacion('La URL del logo debe usar https y no puede incluir credenciales');
  }
  return url.toString();
}

/**
 * Valida y completa la imagen corporativa: los campos que no se indican conservan su valor por defecto.
 * @returns {object} la apariencia completa y normalizada
 * @throws {ErrorValidacion}
 */
export function validarApariencia(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new ErrorValidacion('La imagen corporativa debe indicarse como un objeto');
  }
  const permitidos = Object.keys(APARIENCIA_POR_DEFECTO);
  const desconocidos = Object.keys(valor).filter((clave) => !permitidos.includes(clave));
  if (desconocidos.length > 0) {
    throw new ErrorValidacion(`Campos no reconocidos: ${desconocidos.join(', ')}; campos disponibles: ${permitidos.join(', ')}`);
  }

  const resultado = { ...APARIENCIA_POR_DEFECTO };
  for (const [campo, { etiqueta, min, max }] of Object.entries(CAMPOS_TEXTO)) {
    if (!(campo in valor)) continue;
    if (typeof valor[campo] !== 'string') throw new ErrorValidacion(`${etiqueta} debe ser un texto`);
    const texto = valor[campo].trim();
    if (texto.length < min || texto.length > max) {
      throw new ErrorValidacion(min > 0 ? `${etiqueta} debe tener entre ${min} y ${max} caracteres` : `${etiqueta} no puede superar ${max} caracteres`);
    }
    if (REGEX_PROHIBIDOS.test(texto)) throw new ErrorValidacion(`${etiqueta} no puede contener < ni > ni caracteres de control`);
    resultado[campo] = texto;
  }
  for (const [campo, etiqueta] of Object.entries(CAMPOS_COLOR)) {
    if (!(campo in valor)) continue;
    if (typeof valor[campo] !== 'string' || !REGEX_COLOR.test(valor[campo].trim())) {
      throw new ErrorValidacion(`${etiqueta} debe tener el formato #RRGGBB (por ejemplo #00A3B4)`);
    }
    resultado[campo] = valor[campo].trim().toUpperCase();
  }
  if ('tipografia' in valor) {
    if (!TIPOGRAFIAS.includes(valor.tipografia)) throw new ErrorValidacion(`La tipografía debe ser una de: ${TIPOGRAFIAS.join(', ')}`);
    resultado.tipografia = valor.tipografia;
  }
  if ('logo' in valor) resultado.logo = validarLogo(valor.logo);

  const razon = contraste(resultado.colorTexto, resultado.colorFondo);
  if (razon < CONTRASTE_MINIMO) {
    throw new ErrorValidacion(
      `El color del texto y el del fondo no tienen contraste suficiente: ${razon.toFixed(2)}:1; el mínimo es ${CONTRASTE_MINIMO}:1 (accesibilidad WCAG 2.1 AA)`
    );
  }
  return resultado;
}

/** Apariencia a mostrar: la guardada completada con los valores por defecto; si lo guardado fuera inválido, la de por defecto. */
export function completarApariencia(guardada) {
  if (!guardada) return { ...APARIENCIA_POR_DEFECTO };
  try {
    return validarApariencia(guardada);
  } catch {
    return { ...APARIENCIA_POR_DEFECTO };
  }
}
