import { createContext, useContext, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { APARIENCIA_POR_DEFECTO, obtenerApariencia } from './apariencia.js';
import { aplicarVariables, derivarTema } from './derivarTema.js';

const ContextoTema = createContext({ apariencia: APARIENCIA_POR_DEFECTO, cargando: true });

/**
 * Carga la imagen corporativa vigente y la aplica como variables CSS en <html>.
 * La API la cachea 60 s: un cambio del Administrador llega a todas las pantallas
 * sin recompilar ni reiniciar nada.
 */
export function TemaProvider({ children }) {
  const { data, isPending } = useQuery({
    queryKey: ['apariencia'],
    queryFn: obtenerApariencia,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
  const apariencia = data ?? APARIENCIA_POR_DEFECTO;

  useEffect(() => {
    aplicarVariables(derivarTema(apariencia));
    document.title = apariencia.nombreComercial;
  }, [apariencia]);

  const valor = useMemo(() => ({ apariencia, cargando: isPending }), [apariencia, isPending]);
  return <ContextoTema.Provider value={valor}>{children}</ContextoTema.Provider>;
}

export function useTema() {
  return useContext(ContextoTema);
}
