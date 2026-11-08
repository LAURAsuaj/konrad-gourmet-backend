import { api } from './cliente.js';

/** Analítica comercial (CU-14, CU-15). El tablero no trae montos (confidencialidad, SRS 6.5). */
export const obtenerTablero = (consulta) => api.get('/tablero', { consulta });
export const listarPromociones = (consulta) => api.get('/promociones', { consulta });
