import { useRef } from 'react';
import estilos from './Tabs.module.css';

/**
 * Pestañas de filtro (patrón tablist de WAI-ARIA): se recorren con las flechas,
 * Inicio y Fin. `opciones`: [{ valor, etiqueta }].
 */
export function Tabs({ opciones, valor, alCambiar, etiquetaAccesible }) {
  const refs = useRef([]);

  function alTeclear(evento, indice) {
    const total = opciones.length;
    const destinos = { ArrowRight: (indice + 1) % total, ArrowLeft: (indice - 1 + total) % total, Home: 0, End: total - 1 };
    if (!(evento.key in destinos)) return;
    evento.preventDefault();
    const nuevo = destinos[evento.key];
    alCambiar(opciones[nuevo].valor);
    refs.current[nuevo]?.focus();
  }

  return (
    <div role="tablist" aria-label={etiquetaAccesible} className={estilos.lista}>
      {opciones.map((opcion, indice) => {
        const activa = opcion.valor === valor;
        return (
          <button
            key={opcion.valor}
            ref={(el) => (refs.current[indice] = el)}
            type="button"
            role="tab"
            aria-selected={activa}
            tabIndex={activa ? 0 : -1}
            className={`${estilos.pestana} ${activa ? estilos.activa : ''}`}
            onClick={() => alCambiar(opcion.valor)}
            onKeyDown={(e) => alTeclear(e, indice)}
          >
            {opcion.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
