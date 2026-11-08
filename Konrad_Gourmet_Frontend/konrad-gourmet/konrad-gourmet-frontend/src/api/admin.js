import { api } from './cliente.js';

/** Rutas exclusivas del Administrador (CU-01, CU-04, CU-16). */
export const listarUsuarios = () => api.get('/usuarios');
export const crearUsuario = (usuario) => api.post('/usuarios', usuario);
export const desbloquearUsuario = (id) => api.post(`/usuarios/${id}/desbloquear`);
export const restablecerPassword = (id, passwordNueva) => api.post(`/usuarios/${id}/restablecer-password`, { passwordNueva });

export const crearValorCatalogo = (catalogo, cuerpo) => api.post(`/catalogos/${catalogo}`, cuerpo);
export const actualizarValorCatalogo = (catalogo, id, cambios) => api.patch(`/catalogos/${catalogo}/${id}`, cambios);
export const eliminarValorCatalogo = (catalogo, id) => api.delete(`/catalogos/${catalogo}/${id}`);

export const listarReglas = () => api.get('/reglas');
export const definirRegla = (clave, valor) => api.put(`/reglas/${clave}`, { valor });

export const listarAuditoria = (consulta) => api.get('/auditoria', { consulta });
export const obtenerAuditoria = (id) => api.get(`/auditoria/${id}`);
export const listarLogs = (consulta) => api.get('/logs', { consulta });
export const obtenerLog = (id) => api.get(`/logs/${id}`);
