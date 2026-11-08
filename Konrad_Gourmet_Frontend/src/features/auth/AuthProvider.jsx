import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, configurarCliente, pedir } from '../../api/cliente.js';
import { borrarSesion, guardarSesion, leerSesion, vencimientoDelToken } from '../../api/sesionAlmacen.js';

const ContextoSesion = createContext(null);

const MINUTO = 60_000;
const RENOVAR_CADA = 10 * MINUTO; // la API recomienda renovar cada 10 min con tokens de 30
const REVISAR_CADA = 30_000;
const ACTIVIDADES = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

function sesionInicial() {
  const guardada = leerSesion();
  if (guardada?.token && guardada.expira * 1000 > Date.now()) return guardada;
  borrarSesion();
  return null;
}

/**
 * Sesión del usuario (CU-01).
 * - La sesión expira por inactividad: solo se renueva el token si hubo actividad desde
 *   la última renovación. Si el usuario no hace nada durante la vida del token (30 min),
 *   el token vence y se pide iniciar sesión otra vez.
 * - Cualquier respuesta 401 NO_AUTENTICADO cierra la sesión local con un aviso.
 * - El cierre de sesión descarta el token (la API no lo invalida en el servidor).
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [sesion, setSesion] = useState(sesionInicial);
  const [aviso, setAviso] = useState(null);
  const sesionRef = useRef(sesion);
  const ultimaActividad = useRef(Date.now());
  const ultimaRenovacion = useRef(Date.now());
  const renovando = useRef(false);
  sesionRef.current = sesion;

  const cerrarSesionLocal = useCallback(
    (motivo = null) => {
      borrarSesion();
      sesionRef.current = null;
      setSesion(null);
      queryClient.removeQueries({ predicate: (consulta) => consulta.queryKey[0] !== 'apariencia' });
      setAviso(motivo);
    },
    [queryClient]
  );

  // Se configura durante el render (no en un efecto) para que las consultas de los
  // componentes hijos, que se lanzan antes que los efectos del padre, ya lleven el token.
  configurarCliente({
    obtenerToken: () => sesionRef.current?.token ?? null,
    alNoAutenticado: () => {
      if (sesionRef.current) cerrarSesionLocal('Su sesión venció o ya no es válida. Inicie sesión de nuevo.');
    },
  });

  const establecer = useCallback((token, usuario) => {
    const expira = vencimientoDelToken(token) ?? Math.floor(Date.now() / 1000) + 30 * 60;
    const nueva = { token, usuario, expira };
    guardarSesion(nueva);
    sesionRef.current = nueva;
    setSesion(nueva);
    ultimaRenovacion.current = Date.now();
  }, []);

  const iniciarSesion = useCallback(
    async (correo, password) => {
      const datos = await pedir('/auth/login', { metodo: 'POST', cuerpo: { correo, password }, publica: true });
      queryClient.removeQueries({ predicate: (consulta) => consulta.queryKey[0] !== 'apariencia' });
      setAviso(null);
      ultimaActividad.current = Date.now();
      establecer(datos.token, datos.usuario);
      return datos.usuario;
    },
    [establecer, queryClient]
  );

  const cerrarSesion = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* aunque la API no responda, el token se descarta en este equipo */
    } finally {
      cerrarSesionLocal(null);
    }
  }, [cerrarSesionLocal]);

  const renovar = useCallback(async () => {
    if (renovando.current || !sesionRef.current) return;
    renovando.current = true;
    try {
      const datos = await api.post('/auth/refrescar');
      establecer(datos.token, datos.usuario);
    } catch {
      /* un 401 ya cerró la sesión desde el cliente; sin conexión se reintenta en la próxima revisión */
    } finally {
      renovando.current = false;
    }
  }, [establecer]);

  // Registro de actividad del usuario
  useEffect(() => {
    const marcar = () => {
      ultimaActividad.current = Date.now();
    };
    ACTIVIDADES.forEach((evento) => window.addEventListener(evento, marcar, { passive: true }));
    return () => ACTIVIDADES.forEach((evento) => window.removeEventListener(evento, marcar));
  }, []);

  // Vencimiento por inactividad y renovación por actividad
  useEffect(() => {
    if (!sesion) return undefined;
    const revisar = () => {
      const actual = sesionRef.current;
      if (!actual) return;
      const ahora = Date.now();
      const venceEn = actual.expira * 1000 - ahora;
      if (venceEn <= 0) {
        cerrarSesionLocal('Su sesión se cerró por inactividad. Inicie sesión de nuevo.');
        return;
      }
      const huboActividad = ultimaActividad.current > ultimaRenovacion.current;
      const tocaRenovar = ahora - ultimaRenovacion.current >= RENOVAR_CADA || venceEn < 2 * MINUTO;
      if (huboActividad && tocaRenovar) renovar();
    };
    const intervalo = window.setInterval(revisar, REVISAR_CADA);
    return () => window.clearInterval(intervalo);
  }, [sesion, renovar, cerrarSesionLocal]);

  const valor = useMemo(
    () => ({
      sesion,
      usuario: sesion?.usuario ?? null,
      aviso,
      limpiarAviso: () => setAviso(null),
      iniciarSesion,
      cerrarSesion,
      cerrarSesionLocal,
    }),
    [sesion, aviso, iniciarSesion, cerrarSesion, cerrarSesionLocal]
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export function useSesion() {
  const contexto = useContext(ContextoSesion);
  if (!contexto) throw new Error('useSesion debe usarse dentro de <AuthProvider>');
  return contexto;
}
