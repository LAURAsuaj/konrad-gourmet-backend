/**
 * Campos de cada catálogo, iguales a la lista blanca del backend
 * (src/domain/modules/parametrizacion/CatalogosDefinicion.js).
 * tipo: texto | correo | entero | referencia (id de otro catálogo).
 * articulo: 'el' | 'la', para los mensajes ("Se creó la categoría").
 */
const nombre = { campo: 'nombre', etiqueta: 'Nombre', tipo: 'texto', max: 120, obligatorio: true };

export const CATALOGOS = Object.freeze([
  { clave: 'puntos', articulo: 'el', titulo: 'Puntos', singular: 'punto', campos: [nombre] },
  {
    clave: 'mesas',
    articulo: 'la',
    titulo: 'Mesas',
    singular: 'mesa',
    campos: [
      { campo: 'puntoId', etiqueta: 'Punto', tipo: 'referencia', catalogo: 'puntos', obligatorio: true, inmutable: true },
      { campo: 'numero', etiqueta: 'Número de mesa', tipo: 'entero', max: 9999, obligatorio: true },
    ],
  },
  { clave: 'categorias', articulo: 'la', titulo: 'Categorías', singular: 'categoría', campos: [nombre] },
  { clave: 'marcas', articulo: 'la', titulo: 'Marcas', singular: 'marca', campos: [nombre] },
  {
    clave: 'unidades',
    articulo: 'la',
    titulo: 'Unidades',
    singular: 'unidad de medida',
    campos: [nombre, { campo: 'abreviatura', etiqueta: 'Abreviatura', tipo: 'texto', max: 10, obligatorio: true }],
  },
  {
    clave: 'productos',
    articulo: 'el',
    titulo: 'Productos',
    singular: 'producto',
    campos: [
      nombre,
      { campo: 'categoriaId', etiqueta: 'Categoría', tipo: 'referencia', catalogo: 'categorias', obligatorio: true },
      { campo: 'unidadId', etiqueta: 'Unidad', tipo: 'referencia', catalogo: 'unidades', obligatorio: true, inmutable: true },
    ],
  },
  {
    clave: 'proveedores',
    articulo: 'el',
    titulo: 'Proveedores',
    singular: 'proveedor',
    campos: [nombre, { campo: 'correo', etiqueta: 'Correo', tipo: 'correo', max: 254, obligatorio: false }],
  },
]);

export const definicionDe = (clave) => CATALOGOS.find((c) => c.clave === clave);

/** Catálogos que se deben leer para mostrar y elegir las referencias de `definicion`. */
export const referenciasDe = (definicion) => [...new Set(definicion.campos.filter((c) => c.tipo === 'referencia').map((c) => c.catalogo))];

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida el formulario y arma el cuerpo. En la edición (`original`) solo se envían los
 * campos que cambiaron y nunca los inmutables.
 */
export function construirCuerpo(definicion, entradas, original = null) {
  const errores = {};
  const cuerpo = {};
  for (const c of definicion.campos) {
    if (original && c.inmutable) continue;
    const bruto = entradas[c.campo] ?? '';
    const texto = typeof bruto === 'string' ? bruto.trim() : String(bruto);
    if (!texto) {
      if (c.obligatorio) errores[c.campo] = `${c.etiqueta} es obligatorio.`;
      else if (original && original[c.campo]) cuerpo[c.campo] = null;
      continue;
    }
    let valor = texto;
    if (c.tipo === 'entero') {
      valor = Number(texto);
      if (!Number.isInteger(valor) || valor < 1 || valor > c.max) {
        errores[c.campo] = `Escriba un entero entre 1 y ${c.max}.`;
        continue;
      }
    } else if (c.tipo === 'correo') {
      valor = texto.toLowerCase();
      if (!REGEX_CORREO.test(valor)) {
        errores[c.campo] = 'Escriba un correo válido.';
        continue;
      }
    }
    if ((c.tipo === 'texto' || c.tipo === 'correo') && valor.length > c.max) {
      errores[c.campo] = `Máximo ${c.max} caracteres.`;
      continue;
    }
    if (!original || original[c.campo] !== valor) cuerpo[c.campo] = valor;
  }
  return { errores, cuerpo, valido: Object.keys(errores).length === 0 };
}
