import { Navigate, useLocation } from 'react-router-dom';
import { useSesion } from '../features/auth/AuthProvider.jsx';
import { PaginaSinPermiso } from './PaginasDeEstado.jsx';

/**
 * Exige sesión y, si se indican `roles`, uno de ellos. Es solo una ayuda de navegación:
 * la autorización real la hace la API en cada ruta (403 PROHIBIDO).
 */
export function RutaProtegida({ roles, children }) {
  const { sesion } = useSesion();
  const location = useLocation();
  if (!sesion) return <Navigate to="/login" replace state={{ desde: location.pathname + location.search }} />;
  if (roles && !roles.includes(sesion.usuario.rol)) return <PaginaSinPermiso />;
  return children;
}
