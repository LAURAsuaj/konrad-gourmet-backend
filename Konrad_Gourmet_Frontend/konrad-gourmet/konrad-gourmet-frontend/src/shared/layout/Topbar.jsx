import { Link } from 'react-router-dom';
import { useAlertas } from '../../features/alertas/AlertasProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { Icono } from '../ui/Icono.jsx';
import { Marca } from './Marca.jsx';
import estilos from './Topbar.module.css';

export function Topbar({ menuAbierto, alAbrirMenu }) {
  const { alertas } = useAlertas();
  const total = alertas.length;
  return (
    <header className={estilos.barra}>
      <Button
        className={estilos.abrir}
        variante="fantasma"
        icono="menu"
        etiquetaAccesible="Abrir menú"
        aria-expanded={menuAbierto}
        aria-controls="menu-principal"
        onClick={alAbrirMenu}
      />
      <Marca tamano={30} mostrarNombre={false} className={estilos.marcaMovil} />
      <span className={estilos.espacio} />
      <Link to="/notificaciones" className={estilos.campana} aria-label={total ? `Notificaciones: ${total} alertas nuevas` : 'Notificaciones'}>
        <Icono nombre="campana" />
        {total ? (
          <span className={`${estilos.contador} kg-cifras`} aria-hidden="true">
            {total > 9 ? '9+' : total}
          </span>
        ) : null}
      </Link>
    </header>
  );
}
