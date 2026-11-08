/**
 * Utilidades de color con las fórmulas de WCAG 2.1, las mismas que usa el backend
 * (src/domain/modules/parametrizacion/apariencia.js) para validar la imagen corporativa.
 */
const REGEX_HEX = /^#[0-9a-fA-F]{6}$/;

export function esHexValido(valor) {
  return typeof valor === 'string' && REGEX_HEX.test(valor);
}

export function hexARgb(hex) {
  if (!esHexValido(hex)) throw new Error(`Color inválido: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

export function rgbAHex([r, g, b]) {
  return `#${[r, g, b]
    .map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

/** Luminancia relativa (WCAG 2.1). */
export function luminancia(hex) {
  const [r, g, b] = hexARgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relación de contraste entre dos colores, de 1 a 21. */
export function contraste(a, b) {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Mezcla `a` con `b`; `peso` es la proporción de `b` (0 = solo a, 1 = solo b). */
export function mezclar(a, b, peso) {
  const ra = hexARgb(a);
  const rb = hexARgb(b);
  return rgbAHex(ra.map((c, i) => c + (rb[i] - c) * peso));
}

/**
 * Lleva `color` hacia `destino` en pasos pequeños hasta alcanzar el contraste mínimo
 * con `fondo`. Sirve para obtener una versión del color de marca legible como texto.
 */
export function ajustarHastaContraste(color, fondo, minimo = 4.5, destino = '#000000') {
  if (contraste(color, fondo) >= minimo) return color.toUpperCase();
  for (let paso = 0.04; paso <= 1; paso += 0.04) {
    const candidato = mezclar(color, destino, paso);
    if (contraste(candidato, fondo) >= minimo) return candidato;
  }
  return destino.toUpperCase();
}

/** De varias opciones, la que mejor se lee sobre `fondo`. */
export function masLegibleSobre(fondo, opciones) {
  return opciones.reduce((mejor, opcion) => (contraste(opcion, fondo) > contraste(mejor, fondo) ? opcion : mejor));
}

export function esOscuro(hex) {
  return luminancia(hex) < 0.18;
}
