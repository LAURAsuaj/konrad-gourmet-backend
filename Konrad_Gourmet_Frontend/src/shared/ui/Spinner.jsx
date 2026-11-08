import estilos from './Spinner.module.css';

export function Spinner({ etiqueta = 'Cargando' }) {
  return (
    <div className={estilos.contenedor} role="status">
      <span className={estilos.giro} aria-hidden="true" />
      <span>{etiqueta}</span>
    </div>
  );
}
