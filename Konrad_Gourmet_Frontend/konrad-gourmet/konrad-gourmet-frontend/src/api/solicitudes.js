import { api } from './cliente.js';

/** Solicitudes de alimentos (CU-05). El Jefe de Cocina solo las registra. */
export const registrarSolicitud = (items) => api.post('/solicitudes', { items });
