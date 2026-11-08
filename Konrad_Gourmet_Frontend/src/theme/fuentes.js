/**
 * Pilas tipográficas para cada valor de `tipografia` que acepta el backend
 * (`sistema`, `serif`, `redondeada`, `monoespaciada`).
 * "sistema" usa las fuentes institucionales del proyecto, empaquetadas en la aplicación
 * (no dependen de internet); las demás usan fuentes del sistema operativo.
 */
export const PILAS_TIPOGRAFICAS = Object.freeze({
  sistema: "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  redondeada: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Plus Jakarta Sans', system-ui, sans-serif",
  monoespaciada: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
});

/** Valores válidos de `tipografia`, en el orden del backend. */
export const TIPOGRAFIAS = Object.freeze(Object.keys(PILAS_TIPOGRAFICAS));

export function pilaTipografica(tipografia) {
  return PILAS_TIPOGRAFICAS[tipografia] ?? PILAS_TIPOGRAFICAS.sistema;
}
