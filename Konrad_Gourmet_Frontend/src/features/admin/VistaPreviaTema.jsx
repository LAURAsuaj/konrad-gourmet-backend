import { useMemo } from 'react';
import { derivarTema } from '../../theme/derivarTema.js';
import estilos from './VistaPreviaTema.module.css';

/**
 * Vista previa de la imagen corporativa SIN aplicarla a la aplicación: las variables del
 * tema se definen solo en este contenedor, así el resto de la interfaz no cambia hasta guardar.
 */
export function VistaPreviaTema({ apariencia }) {
  const variables = useMemo(() => derivarTema(apariencia), [apariencia]);
  const inicial = (apariencia.nombreComercial || 'K').trim().charAt(0).toUpperCase();
  return (
    <div className={estilos.marco} style={variables} aria-label="Vista previa de la imagen corporativa" role="img">
      <div className={estilos.lateral}>
        <div className={estilos.marca}>
          {apariencia.logo ? <img className={estilos.logo} src={apariencia.logo} alt="" /> : <span className={estilos.monograma}>{inicial}</span>}
          <span>{apariencia.nombreComercial}</span>
        </div>
        <span className={`${estilos.item} ${estilos.activo}`}>Mesas</span>
        <span className={estilos.item}>Pedidos</span>
        <span className={estilos.item}>Notificaciones</span>
      </div>
      <div className={estilos.contenido}>
        <div>
          <p className={estilos.titulo}>{apariencia.textoBienvenida || 'Bienvenido'}</p>
          {apariencia.eslogan ? <p className={estilos.suave}>{apariencia.eslogan}</p> : null}
        </div>
        <div className={estilos.panel}>{apariencia.nombreComercial}</div>
        <div className={estilos.tarjeta}>
          <strong>Stock bajo</strong>
          <p className={estilos.suave}>Pollo: quedan 2 kg</p>
          <span className={estilos.enlace}>Ver inventario</span>
        </div>
        <span className={estilos.boton}>Enviar a cocina</span>
        {apariencia.textoPiePagina ? <p className={estilos.suave}>{apariencia.textoPiePagina}</p> : null}
      </div>
    </div>
  );
}
