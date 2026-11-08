import { Icono } from './Icono.jsx';
import estilos from './Banner.module.css';

const ICONOS = { info: 'info', exito: 'check', error: 'alerta' };

/** Mensaje en línea dentro de una página o formulario (resultado de una acción, error). */
export function Banner({ tono = 'info', children }) {
  return (
    <div className={`${estilos.banner} ${estilos[tono]}`} role={tono === 'error' ? 'alert' : 'status'}>
      <Icono nombre={ICONOS[tono]} className={estilos.icono} />
      <div>{children}</div>
    </div>
  );
}
