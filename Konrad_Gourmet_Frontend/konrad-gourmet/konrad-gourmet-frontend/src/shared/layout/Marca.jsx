import { useTema } from '../../theme/TemaProvider.jsx';
import estilos from './Marca.module.css';

/**
 * Logo y nombre comercial vigentes (imagen corporativa). Sin logo cargado, muestra un
 * monograma con la inicial del nombre en el color primario.
 */
export function Marca({ tamano = 36, mostrarNombre = true, className = '' }) {
  const { apariencia } = useTema();
  const inicial = apariencia.nombreComercial.trim().charAt(0).toUpperCase() || 'K';
  return (
    <div className={`${estilos.marca} ${className}`}>
      {apariencia.logo ? (
        <img
          src={apariencia.logo}
          alt={mostrarNombre ? '' : apariencia.nombreComercial}
          className={estilos.logo}
          style={{ width: tamano, height: tamano }}
        />
      ) : (
        <span className={estilos.monograma} style={{ width: tamano, height: tamano, fontSize: tamano * 0.5 }} aria-hidden={mostrarNombre}>
          {inicial}
        </span>
      )}
      {mostrarNombre ? <span className={estilos.nombre}>{apariencia.nombreComercial}</span> : null}
    </div>
  );
}
