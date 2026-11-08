import { api } from './cliente.js';

/** Cocina: menú y pedidos (CU-02, CU-03). */
export const obtenerMenu = ({ incluirInactivos = false } = {}) =>
  api.get('/menu', { consulta: { incluirInactivos: incluirInactivos ? 'true' : undefined } });
export const crearPlato = (plato) => api.post('/menu/platos', plato);
export const actualizarPlato = (id, cambios) => api.patch(`/menu/platos/${id}`, cambios);

export const registrarPedido = ({ mesaId, items }) => api.post('/pedidos', { mesaId, items });
export const listarPedidos = ({ desde, hasta, limite = 200 } = {}) => api.get('/pedidos', { consulta: { desde, hasta, limite } });

/**
 * Consulta compartida de los pedidos de hoy (mesero y jefe de cocina usan la misma caché).
 * Toda clave de pedidos empieza por 'pedidos': al registrar uno se invalidan todas.
 */
export const CLAVE_PEDIDOS = ['pedidos'];

export function consultaPedidosDelDia(fecha, { desde, hasta }) {
  return {
    queryKey: ['pedidos', 'dia', fecha],
    queryFn: () => listarPedidos({ desde, hasta }),
    refetchInterval: 30_000,
  };
}
