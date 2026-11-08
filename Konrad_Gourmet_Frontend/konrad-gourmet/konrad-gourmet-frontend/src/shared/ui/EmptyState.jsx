import estilos from './EmptyState.module.css';

/** Estado vacío: dice qué pasa y, si aplica, qué hacer a continuación. */
export function EmptyState({ titulo, descripcion, accion }) {
  return (
    <div className={estilos.vacio}>
      <p className={estilos.titulo}>{titulo}</p>
      {descripcion ? <p className={estilos.descripcion}>{descripcion}</p> : null}
      {accion ? <div className={estilos.accion}>{accion}</div> : null}
    </div>
  );
}
