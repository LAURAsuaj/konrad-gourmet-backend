import estilos from './Card.module.css';

/** Contenedor blanco con borde sutil. `titulo` y `acciones` forman su cabecera. */
export function Card({ titulo, acciones, sinRelleno = false, as: Etiqueta = 'section', className = '', children, ...resto }) {
  return (
    <Etiqueta className={`${estilos.tarjeta} ${sinRelleno ? estilos.sinRelleno : ''} ${className}`} {...resto}>
      {titulo || acciones ? (
        <div className={estilos.cabecera}>
          {titulo ? <h2 className={estilos.titulo}>{titulo}</h2> : <span />}
          {acciones}
        </div>
      ) : null}
      {children}
    </Etiqueta>
  );
}
