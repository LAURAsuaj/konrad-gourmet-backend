import { Link, useRouteError } from 'react-router-dom';
import { EmptyState } from '../shared/ui/EmptyState.jsx';
import estilos from './PaginasDeEstado.module.css';

export function PaginaNoEncontrada() {
  return (
    <div className={estilos.pagina}>
      <EmptyState titulo="Esta página no existe" descripcion="Revise la dirección o vuelva a su pantalla principal." accion={<Link to="/">Ir a mi pantalla principal</Link>} />
    </div>
  );
}

export function PaginaSinPermiso() {
  return (
    <div className={estilos.pagina}>
      <EmptyState
        titulo="Su rol no tiene acceso a esta pantalla"
        descripcion="Si necesita usarla, pida al Administrador que revise su rol."
        accion={<Link to="/">Ir a mi pantalla principal</Link>}
      />
    </div>
  );
}

/** Se muestra si una pantalla falla al dibujarse; evita que la aplicación quede en blanco. */
export function PaginaError() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  return (
    <div className={`${estilos.pagina} ${estilos.completa}`}>
      <EmptyState
        titulo="La pantalla no se pudo mostrar"
        descripcion="Recargue la página. Si vuelve a pasar, informe al Administrador la hora y lo que estaba haciendo."
        accion={<a href="/">Recargar</a>}
      />
    </div>
  );
}
