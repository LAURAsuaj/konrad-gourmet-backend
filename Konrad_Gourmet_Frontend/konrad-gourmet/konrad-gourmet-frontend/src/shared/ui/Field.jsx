import { forwardRef, useId } from 'react';
import estilos from './Field.module.css';

/** Envoltorio de un control con etiqueta visible, ayuda y error asociados (WCAG 1.3.1 y 3.3.1). */
function Campo({ id, etiqueta, ayuda, error, children }) {
  return (
    <div className={estilos.campo}>
      <label htmlFor={id} className={estilos.etiqueta}>
        {etiqueta}
      </label>
      {children}
      {ayuda && !error ? (
        <p id={`${id}-ayuda`} className={estilos.ayuda}>
          {ayuda}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className={estilos.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id, ayuda, error, adicional) {
  const ids = [error ? `${id}-error` : ayuda ? `${id}-ayuda` : null, adicional].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

export const TextField = forwardRef(function TextField({ etiqueta, ayuda, error, accion, className = '', 'aria-describedby': adicional, ...resto }, ref) {
  const id = useId();
  return (
    <Campo id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <div className={accion ? estilos.conAccion : undefined}>
        <input
          ref={ref}
          id={id}
          className={`${estilos.control} ${error ? estilos.controlError : ''} ${className}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, ayuda, error, adicional)}
          {...resto}
        />
        {accion ? <span className={estilos.accion}>{accion}</span> : null}
      </div>
    </Campo>
  );
});

export const SelectField = forwardRef(function SelectField({ etiqueta, ayuda, error, opciones, children, 'aria-describedby': adicional, ...resto }, ref) {
  const id = useId();
  return (
    <Campo id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <select
        ref={ref}
        id={id}
        className={`${estilos.control} ${error ? estilos.controlError : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, ayuda, error, adicional)}
        {...resto}
      >
        {opciones
          ? opciones.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))
          : children}
      </select>
    </Campo>
  );
});
