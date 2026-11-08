import estilos from './StatusPill.module.css';

/**
 * Etiqueta de estado. Tonos: neutro, marca (turquesa, para lo nuevo o activo),
 * contorno y error. El texto siempre nombra el estado: el color nunca es la única pista.
 */
export function StatusPill({ tono = 'neutro', children }) {
  return (
    <span className={`${estilos.pastilla} ${estilos[tono] ?? estilos.neutro}`}>
      <span className={estilos.punto} aria-hidden="true" />
      {children}
    </span>
  );
}
