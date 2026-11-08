import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/cliente.js';
import { useSesion } from '../auth/AuthProvider.jsx';
import { construirAlertas } from './construirAlertas.js';

const ContextoAlertas = createContext({ alertas: [], descartar: () => {}, descartarTodas: () => {} });

const INTERVALO = 60_000;

function leer(clave) {
  try {
    return JSON.parse(sessionStorage.getItem(clave) ?? 'null');
  } catch {
    return null;
  }
}

function escribir(clave, valor) {
  try {
    sessionStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: el estado vive solo en memoria */
  }
}

/**
 * Consulta periódica de alarmas y notificaciones. La API no las empuja en tiempo real
 * (decisión de la Fase 1 del backend: Supabase Realtime no sirve con nuestro JWT propio),
 * así que se piden cada minuto mientras la pestaña está visible.
 */
export function AlertasProvider({ children }) {
  const { usuario } = useSesion();
  const clave = `kg.alertas.${usuario?.id ?? 'anonimo'}`;
  const [estado, setEstado] = useState(() => leer(clave) ?? { base: null, descartadas: [] });

  const notificaciones = useQuery({
    queryKey: ['notificaciones', 'recientes'],
    queryFn: () => api.get('/notificaciones', { consulta: { limite: 20 } }),
    refetchInterval: INTERVALO,
    enabled: Boolean(usuario),
  });

  const alarmas = useQuery({
    queryKey: ['inventario', 'alarmas'],
    queryFn: () => api.get('/inventario/alarmas'),
    refetchInterval: INTERVALO,
    enabled: usuario?.rol === 'JEFE_COCINA',
  });

  // La primera respuesta marca qué notificaciones ya existían al entrar: esas no se
  // muestran como alertas nuevas (siguen en la página de Notificaciones).
  useEffect(() => {
    if (estado.base || !notificaciones.data) return;
    const base = (notificaciones.data.notificaciones ?? []).map((n) => `notificacion:${n.id}`);
    setEstado((actual) => ({ ...actual, base }));
  }, [notificaciones.data, estado.base]);

  useEffect(() => {
    escribir(clave, estado);
  }, [clave, estado]);

  const alertas = useMemo(
    () =>
      estado.base
        ? construirAlertas({
            notificaciones: notificaciones.data?.notificaciones ?? [],
            alarmas: alarmas.data ?? [],
            base: new Set(estado.base),
            descartadas: new Set(estado.descartadas),
            rol: usuario?.rol,
          })
        : [],
    [estado, notificaciones.data, alarmas.data, usuario?.rol]
  );

  const descartar = useCallback((id) => setEstado((e) => ({ ...e, descartadas: [...new Set([...e.descartadas, id])] })), []);
  const descartarTodas = useCallback(
    () => setEstado((e) => ({ ...e, descartadas: [...new Set([...e.descartadas, ...alertas.map((a) => a.id)])] })),
    [alertas]
  );

  const valor = useMemo(() => ({ alertas, descartar, descartarTodas }), [alertas, descartar, descartarTodas]);
  return <ContextoAlertas.Provider value={valor}>{children}</ContextoAlertas.Provider>;
}

export function useAlertas() {
  return useContext(ContextoAlertas);
}
