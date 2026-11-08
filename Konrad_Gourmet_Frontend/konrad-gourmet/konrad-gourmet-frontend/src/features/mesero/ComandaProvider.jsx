import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { useSesion } from '../auth/AuthProvider.jsx';
import { comandaReducer } from './comanda.js';

const ContextoComanda = createContext(null);

function leer(clave) {
  try {
    return JSON.parse(sessionStorage.getItem(clave) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

/**
 * Guarda las comandas abiertas del mesero mientras cambia de mesa. Se conservan al
 * recargar la página (sessionStorage) y se borran al cerrar la pestaña.
 */
export function ComandaProvider({ children }) {
  const { usuario } = useSesion();
  const clave = `kg.comandas.${usuario?.id ?? 'anonimo'}`;
  const [estado, despachar] = useReducer(comandaReducer, clave, leer);

  useEffect(() => {
    try {
      sessionStorage.setItem(clave, JSON.stringify(estado));
    } catch {
      /* sin almacenamiento: la comanda vive en memoria */
    }
  }, [clave, estado]);

  const valor = useMemo(
    () => ({
      comandas: estado,
      lineasDe: (mesaId) => estado[mesaId] ?? [],
      agregar: (mesaId, platoId) => despachar({ tipo: 'agregar', mesaId, platoId }),
      fijar: (mesaId, platoId, cantidad) => despachar({ tipo: 'fijar', mesaId, platoId, cantidad }),
      quitar: (mesaId, platoId) => despachar({ tipo: 'quitar', mesaId, platoId }),
      vaciar: (mesaId) => despachar({ tipo: 'vaciar', mesaId }),
    }),
    [estado]
  );

  return <ContextoComanda.Provider value={valor}>{children}</ContextoComanda.Provider>;
}

export function useComanda() {
  const contexto = useContext(ContextoComanda);
  if (!contexto) throw new Error('useComanda debe usarse dentro de <ComandaProvider>');
  return contexto;
}
