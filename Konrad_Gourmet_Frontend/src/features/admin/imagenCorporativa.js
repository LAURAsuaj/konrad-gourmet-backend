import { contraste, esHexValido } from '../../theme/color.js';
import { TIPOGRAFIAS } from '../../theme/fuentes.js';

/** Reglas de la imagen corporativa, iguales al backend (parametrizacion/apariencia.js). */
export const CONTRASTE_MINIMO = 4.5;
export const LOGO_INCRUSTADO_MAX = 80_000;
const TEXTOS = {
  nombreComercial: { etiqueta: 'El nombre comercial', min: 1, max: 60 },
  eslogan: { etiqueta: 'El eslogan', min: 0, max: 120 },
  textoBienvenida: { etiqueta: 'El texto de bienvenida', min: 0, max: 200 },
  textoPiePagina: { etiqueta: 'El texto del pie de página', min: 0, max: 200 },
};
const COLORES = ['colorPrimario', 'colorSecundario', 'colorFondo', 'colorTexto'];
const REGEX_PROHIBIDOS = /[<>\u0000-\u001f]/;
const REGEX_LOGO = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
export const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function validarApariencia(a) {
  const errores = {};
  for (const [campo, r] of Object.entries(TEXTOS)) {
    const v = (a[campo] ?? '').trim();
    if (v.length < r.min) errores[campo] = `${r.etiqueta} es obligatorio.`;
    else if (v.length > r.max) errores[campo] = `${r.etiqueta} admite máximo ${r.max} caracteres.`;
    else if (REGEX_PROHIBIDOS.test(v)) errores[campo] = `${r.etiqueta} no puede tener los signos < ni >.`;
  }
  for (const campo of COLORES) if (!esHexValido(a[campo])) errores[campo] = 'Use el formato #RRGGBB.';
  if (!TIPOGRAFIAS.includes(a.tipografia)) errores.tipografia = 'Elija una tipografía.';
  if (!errores.colorTexto && !errores.colorFondo && contraste(a.colorTexto, a.colorFondo) < CONTRASTE_MINIMO) {
    errores.colorTexto = `El texto debe tener un contraste de al menos ${CONTRASTE_MINIMO}:1 con el fondo (ahora ${contraste(a.colorTexto, a.colorFondo).toFixed(2)}:1).`;
  }
  if (a.logo) {
    if (a.logo.startsWith('data:')) {
      if (a.logo.length > LOGO_INCRUSTADO_MAX) errores.logo = 'La imagen pesa demasiado (máximo unos 60 KB). Use una más pequeña o una URL https.';
      else if (!REGEX_LOGO.test(a.logo)) errores.logo = 'La imagen debe ser png, jpeg, webp o gif (no se admite svg).';
    } else {
      let url = null;
      try {
        url = new URL(a.logo);
      } catch {
        url = null;
      }
      if (!url || url.protocol !== 'https:' || url.username || url.password) errores.logo = 'El logo debe ser una URL que empiece por https://.';
      else if (a.logo.length > 500) errores.logo = 'La URL del logo admite máximo 500 caracteres.';
    }
  }
  return { errores, valido: Object.keys(errores).length === 0 };
}

/** Cuerpo para PUT /reglas/imagen_corporativa (textos recortados, colores en mayúsculas). */
export function normalizarApariencia(a) {
  const salida = {};
  for (const campo of Object.keys(TEXTOS)) salida[campo] = (a[campo] ?? '').trim();
  for (const campo of COLORES) salida[campo] = a[campo].toUpperCase();
  salida.tipografia = a.tipografia;
  salida.logo = a.logo ? a.logo.trim() : null;
  return salida;
}

/** Convierte un archivo de imagen en data URI y verifica tipo y tamaño. */
export function leerLogo(archivo) {
  return new Promise((resolver, rechazar) => {
    if (!TIPOS_LOGO.includes(archivo.type)) {
      rechazar(new Error('Use una imagen png, jpeg, webp o gif (no se admite svg por seguridad).'));
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      const uri = String(lector.result);
      if (uri.length > LOGO_INCRUSTADO_MAX) rechazar(new Error('La imagen pesa demasiado: el máximo es de unos 60 KB.'));
      else resolver(uri);
    };
    lector.onerror = () => rechazar(new Error('No se pudo leer la imagen.'));
    lector.readAsDataURL(archivo);
  });
}
