import { api } from './cliente.js';

/** Área de compras: solicitudes (consulta), cotizaciones y órdenes de compra (CU-08 a CU-13). */
export const listarSolicitudes = (consulta) => api.get('/solicitudes', { consulta });
export const obtenerSolicitud = (id) => api.get(`/solicitudes/${id}`);
export const listarOpcionadas = (solicitudId) => api.get(`/solicitudes/${solicitudId}/cotizaciones-opcionadas`);

export const solicitarCotizacion = ({ solicitudId, proveedorId, plazoMaximo, detalleIds }) =>
  api.post('/cotizaciones', { solicitudId, proveedorId, plazoMaximo, ...(detalleIds?.length ? { detalleIds } : {}) });
export const listarCotizaciones = (consulta) => api.get('/cotizaciones', { consulta });
export const obtenerCotizacion = (id) => api.get(`/cotizaciones/${id}`);
export const registrarValores = (id, { valores, confirmarSobrescritura = false }) =>
  api.put(`/cotizaciones/${id}/valores`, { valores, confirmarSobrescritura });

export const generarOrden = (cotizacionId) => api.post('/ordenes-compra', { cotizacionId });
export const listarOrdenes = (consulta) => api.get('/ordenes-compra', { consulta });
export const obtenerOrden = (id) => api.get(`/ordenes-compra/${id}`);
