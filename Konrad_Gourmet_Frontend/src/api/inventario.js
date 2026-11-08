import { api } from './cliente.js';

/** Inventario y alarmas del punto (CU-06, CU-07). */
export const listarInventario = (consulta) => api.get('/inventario', { consulta });
export const ajustarInventario = ({ productoId, cantidadActual, cantidadReferencia }) =>
  api.put('/inventario', { productoId, cantidadActual, cantidadReferencia });
export const listarAlarmas = () => api.get('/inventario/alarmas');
