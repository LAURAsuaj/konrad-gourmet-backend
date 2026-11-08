import estilos from './PageHeader.module.css';

/** Título de la página (un solo h1 por pantalla), descripción opcional y acciones. */
export function PageHeader({ titulo, descripcion, acciones }) {
  return (
    <header className={estilos.cabecera}>
      <div>
        <h1 className={estilos.titulo}>{titulo}</h1>
        {descripcion ? <p className={estilos.descripcion}>{descripcion}</p> : null}
      </div>
      {acciones ? <div className={estilos.acciones}>{acciones}</div> : null}
    </header>
  );
}
