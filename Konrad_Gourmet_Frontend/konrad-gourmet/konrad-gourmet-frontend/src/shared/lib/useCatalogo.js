import { useQuery } from '@tanstack/react-query';
import { CACHE_CATALOGO, claveCatalogo, listarCatalogo } from '../../api/catalogos.js';

/** Lee un catálogo con caché compartida. Devuelve también un Map por id para búsquedas rápidas. */
export function useCatalogo(catalogo, consulta, opciones = {}) {
  const resultado = useQuery({
    queryKey: claveCatalogo(catalogo, consulta),
    queryFn: () => listarCatalogo(catalogo, consulta),
    ...CACHE_CATALOGO,
    ...opciones,
  });
  const lista = resultado.data ?? [];
  return { ...resultado, lista, porId: new Map(lista.map((v) => [v.id, v])) };
}
