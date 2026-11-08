import { Link } from 'react-router-dom';
import { Button } from './Button.jsx';
import { Icono } from './Icono.jsx';
import estilos from './AlertCard.module.css';

/**
 * Alerta flotante: categoría, título, detalle, cuándo ocurrió y una acción directa.
 * La severidad se comunica con ícono y texto, no solo con color.
 * Con `flotante={false}` se usa dentro de una página (sin sombra ni animación).
 */
export function AlertCard({ categoria, titulo, detalle, momento, icono = 'alerta', destino, textoDestino = 'Ver detalle', alDescartar, flotante = true }) {
  return (
    <article className={`${estilos.alerta} ${flotante ? estilos.flotante : ''}`}>
      <Icono nombre={icono} className={estilos.icono} />
      <div>
        <p className={estilos.categoria}>{categoria}</p>
        <h3 className={estilos.titulo}>{titulo}</h3>
        {detalle ? <p className={estilos.detalle}>{detalle}</p> : null}
        <div className={estilos.pie}>
          {momento ? <span>{momento}</span> : null}
          {destino ? (
            <Link className={estilos.enlace} to={destino}>
              {textoDestino}
            </Link>
          ) : null}
        </div>
      </div>
      {alDescartar ? <Button variante="fantasma" tamano="pequeno" icono="cerrar" etiquetaAccesible={`Descartar: ${titulo}`} onClick={alDescartar} /> : null}
    </article>
  );
}
