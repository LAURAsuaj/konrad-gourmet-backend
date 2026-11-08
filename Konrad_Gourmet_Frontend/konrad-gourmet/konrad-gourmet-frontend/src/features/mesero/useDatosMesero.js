import { useQuery } from '@tanstack/react-query';
import { CACHE_CATALOGO, claveCatalogo, listarCatalogo } from '../../api/catalogos.js';
import { consultaPedidosDelDia, obtenerMenu } from '../../api/cocina.js';
import { fechaDeHoy, finDelDia, inicioDelDia } from '../../shared/lib/formato.js';
import { useSesion } from '../auth/AuthProvider.jsx';

/** Mesas activas del punto, menú activo y pedidos de hoy (se refrescan cada 30 s). */
export function useDatosMesero() {
  const { usuario } = useSesion();
  const filtro = { puntoId: usuario?.puntoId };

  const mesas = useQuery({
    queryKey: claveCatalogo('mesas', filtro),
    queryFn: () => listarCatalogo('mesas', filtro),
    enabled: Boolean(usuario?.puntoId),
    ...CACHE_CATALOGO,
  });
  const menu = useQuery({ queryKey: ['menu', { incluirInactivos: false }], queryFn: () => obtenerMenu(), staleTime: 60_000 });
  const hoy = fechaDeHoy();
  const pedidos = useQuery(consultaPedidosDelDia(hoy, { desde: inicioDelDia(hoy), hasta: finDelDia(hoy) }));

  return { mesas, menu, pedidos };
}
