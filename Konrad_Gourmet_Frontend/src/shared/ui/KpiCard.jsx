import estilos from './KpiCard.module.css';

/** Indicador: etiqueta, cifra grande y detalle. `destacado` marca lo que requiere atención. */
export function KpiCard({ etiqueta, valor, detalle, destacado = false, children }) {
  return (
    <div className={`${estilos.kpi} ${destacado ? estilos.destacado : ''}`}>
      <p className={estilos.etiqueta}>{etiqueta}</p>
      <p className={`${estilos.valor} kg-cifras`}>{valor}</p>
      {children}
      {detalle ? <p className={estilos.detalle}>{detalle}</p> : null}
    </div>
  );
}

/** Fila de indicadores que se acomoda al ancho disponible. */
export function KpiGrid({ children, etiquetaAccesible }) {
  return (
    <section className={estilos.grilla} aria-label={etiquetaAccesible}>
      {children}
    </section>
  );
}
