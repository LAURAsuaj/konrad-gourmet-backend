import { forwardRef } from 'react';
import { Icono } from './Icono.jsx';
import estilos from './Button.module.css';

/**
 * Botón de la interfaz. `variante`: primario (acción principal, turquesa), secundario,
 * fantasma o peligro. Con `etiquetaAccesible` y sin hijos se muestra solo el ícono.
 */
export const Button = forwardRef(function Button(
  { variante = 'primario', tamano = 'normal', icono, cargando = false, bloque = false, etiquetaAccesible, type = 'button', className = '', children, disabled, ...resto },
  ref
) {
  const soloIcono = !children && icono;
  const clases = [
    estilos.boton,
    estilos[variante],
    tamano === 'pequeno' ? estilos.pequeno : '',
    bloque ? estilos.bloque : '',
    soloIcono ? estilos.soloIcono : '',
    className,
  ].join(' ');
  return (
    <button
      ref={ref}
      type={type}
      className={clases}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      aria-label={soloIcono ? etiquetaAccesible : undefined}
      title={soloIcono ? etiquetaAccesible : undefined}
      {...resto}
    >
      {cargando ? <span className={estilos.giro} aria-hidden="true" /> : icono ? <Icono nombre={icono} tamano={18} /> : null}
      {children}
    </button>
  );
});
