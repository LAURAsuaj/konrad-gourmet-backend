import estilos from './QuantityStepper.module.css';

/**
 * Selector de cantidad con botones − y + (objetivo táctil de 40 px) y campo editable.
 * `etiqueta` nombra lo que se cuenta, para los lectores de pantalla ("Pollo con arroz").
 */
export function QuantityStepper({ valor, alCambiar, min = 0, max = 1000, etiqueta, compacto = false }) {
  const fijar = (n) => alCambiar(Math.min(max, Math.max(min, n)));
  return (
    <div className={`${estilos.control} ${compacto ? estilos.compacto : ''}`} role="group" aria-label={`Cantidad de ${etiqueta}`}>
      <button type="button" className={estilos.boton} onClick={() => fijar(valor - 1)} disabled={valor <= min} aria-label={`Quitar uno de ${etiqueta}`}>
        −
      </button>
      <input
        className={`${estilos.valor} kg-cifras`}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={valor}
        aria-label={`Cantidad de ${etiqueta}`}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          fijar(Number.isFinite(n) ? n : min);
        }}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" className={estilos.boton} onClick={() => fijar(valor + 1)} disabled={valor >= max} aria-label={`Agregar uno de ${etiqueta}`}>
        +
      </button>
    </div>
  );
}
