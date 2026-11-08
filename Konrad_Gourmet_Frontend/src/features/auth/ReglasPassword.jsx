import { Icono } from '../../shared/ui/Icono.jsx';
import { evaluarPassword } from './validarPassword.js';
import estilos from './ReglasPassword.module.css';

/** Lista de requisitos de la contraseña que se marca mientras el usuario escribe. */
export function ReglasPassword({ password, id }) {
  return (
    <ul className={estilos.lista} id={id} aria-label="Requisitos de la contraseña">
      {evaluarPassword(password).map((regla) => (
        <li key={regla.id} className={`${estilos.regla} ${regla.cumple ? estilos.cumple : ''}`}>
          <span className={estilos.marca} aria-hidden="true">
            {regla.cumple ? <Icono nombre="check" tamano={12} /> : null}
          </span>
          {regla.texto}
          <span className="kg-solo-lectores">{regla.cumple ? ': cumple' : ': pendiente'}</span>
        </li>
      ))}
    </ul>
  );
}
