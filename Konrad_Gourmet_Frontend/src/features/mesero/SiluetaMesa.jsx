/**
 * Pictograma de una mesa vista desde arriba. Es solo una referencia visual del plano:
 * la base de datos no guarda la capacidad, así que no indica número de puestos.
 */
export function SiluetaMesa({ className }) {
  return (
    <svg viewBox="0 0 96 72" className={className} aria-hidden="true" focusable="false">
      <rect x="40" y="2" width="16" height="9" rx="3" className="silla" />
      <rect x="40" y="61" width="16" height="9" rx="3" className="silla" />
      <rect x="2" y="28" width="9" height="16" rx="3" className="silla" />
      <rect x="85" y="28" width="9" height="16" rx="3" className="silla" />
      <rect x="15" y="14" width="66" height="44" rx="8" className="tablero" />
    </svg>
  );
}
