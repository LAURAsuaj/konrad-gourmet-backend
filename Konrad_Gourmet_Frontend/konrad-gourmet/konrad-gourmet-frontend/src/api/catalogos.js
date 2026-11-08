import { api } from './cliente.js';

/** Catálogos del sistema: puntos, mesas, categorias, marcas, unidades, productos, proveedores. */
export const listarCatalogo = (catalogo, consulta) => api.get(`/catalogos/${catalogo}`, { consulta });

export const claveCatalogo = (catalogo, consulta) => ['catalogo', catalogo, consulta ?? {}];

/** Opciones de cache para catálogos: cambian poco. */
export const CACHE_CATALOGO = { staleTime: 5 * 60_000 };
