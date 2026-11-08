import { Navigate } from 'react-router-dom';
import { useSesion } from '../features/auth/AuthProvider.jsx';
import { rutaInicio } from '../shared/layout/navegacion.js';

/** La ruta "/" lleva a la pantalla principal del rol del usuario. */
export function InicioPorRol() {
  const { usuario } = useSesion();
  return <Navigate to={rutaInicio(usuario?.rol)} replace />;
}
