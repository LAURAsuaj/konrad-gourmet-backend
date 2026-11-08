import estilos from './BarraProgreso.module.css';

/**
 * Barra horizontal de proporción (stock, ranking). `valor` y `maximo` en las mismas
 * unidades; se recorta visualmente al 100 %. El texto equivalente va en `etiqueta`.
 */
export function BarraProgreso({ valor, maximo = 100, tono = 'neutro', etiqueta, gruesa = false }) {
  const proporcion = maximo > 0 ? Math.min(1, Math.max(0, valor / maximo)) : 0;
  return (
    <div
      className={`${estilos.pista} ${estilos[tono] ?? ''} ${gruesa ? estilos.gruesa : ''}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={maximo}
      aria-valuenow={Math.min(valor, maximo)}
      aria-label={etiqueta}
    >
      <div className={estilos.relleno} style={{ width: `${proporcion * 100}%` }} />
    </div>
  );
}
