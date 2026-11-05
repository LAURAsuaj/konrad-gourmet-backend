/**
 * Catálogos parametrizables (CU-04, SRS 4.1). Es una lista blanca: el servicio
 * solo opera sobre estas tablas y columnas, por lo que ningún nombre de tabla o
 * columna proviene de la entrada del usuario.
 *
 * articulo: 'el' | 'la' (para armar mensajes con el género correcto)
 * campo: nombre en la API · columna: nombre en la BD · tipo: texto|uuid|entero|correo
 * obligatorio: si falta, error · inmutable: no se modifica tras crearse
 * filtrable: se puede usar como filtro del listado · nombreUnico: sin duplicados ignorando mayúsculas
 */
const nombre = (etiqueta = 'El nombre') => ({
  campo: 'nombre', columna: 'nombre', etiqueta, tipo: 'texto', max: 120, obligatorio: true, nombreUnico: true,
});

export const CATALOGOS = Object.freeze({
  puntos: { tabla: 'punto',
    articulo: 'el', etiqueta: 'punto', orden: 'nombre', campos: [nombre()] },
  mesas: {
    tabla: 'mesa',
    articulo: 'la',
    etiqueta: 'mesa',
    orden: 'punto_id, numero',
    campos: [
      { campo: 'puntoId', columna: 'punto_id', etiqueta: 'El punto', tipo: 'uuid', obligatorio: true, inmutable: true, filtrable: true },
      { campo: 'numero', columna: 'numero', etiqueta: 'El número de mesa', tipo: 'entero', max: 9999, obligatorio: true },
    ],
  },
  categorias: { tabla: 'categoria',
    articulo: 'la', etiqueta: 'categoría', orden: 'nombre', campos: [nombre()] },
  marcas: { tabla: 'marca',
    articulo: 'la', etiqueta: 'marca', orden: 'nombre', campos: [nombre()] },
  unidades: {
    tabla: 'unidad_medida',
    articulo: 'la',
    etiqueta: 'unidad de medida',
    orden: 'nombre',
    campos: [nombre(), { campo: 'abreviatura', columna: 'abreviatura', etiqueta: 'La abreviatura', tipo: 'texto', max: 10, obligatorio: true }],
  },
  productos: {
    tabla: 'producto',
    articulo: 'el',
    etiqueta: 'producto',
    orden: 'nombre',
    campos: [
      nombre(),
      { campo: 'categoriaId', columna: 'categoria_id', etiqueta: 'La categoría', tipo: 'uuid', obligatorio: true, filtrable: true },
      // La unidad no cambia: inventario, ingredientes y solicitudes dependen de ella
      { campo: 'unidadId', columna: 'unidad_id', etiqueta: 'La unidad', tipo: 'uuid', obligatorio: true, inmutable: true },
    ],
  },
  proveedores: {
    tabla: 'proveedor',
    articulo: 'el',
    etiqueta: 'proveedor',
    orden: 'nombre',
    campos: [nombre(), { campo: 'correo', columna: 'correo', etiqueta: 'El correo', tipo: 'correo', obligatorio: false }],
  },
});
