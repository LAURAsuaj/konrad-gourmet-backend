import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AlertasProvider } from '../../features/alertas/AlertasProvider.jsx';
import { AlertStack } from '../../features/alertas/AlertStack.jsx';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import estilos from './AppShell.module.css';

/** Estructura de las pantallas con sesión: menú lateral, barra superior, contenido y alertas. */
export function AppShell() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const location = useLocation();
  const refContenido = useRef(null);
  const primeraVez = useRef(true);

  // Al cambiar de pantalla: cierra el menú móvil y lleva el foco al contenido (lectores de pantalla).
  useEffect(() => {
    setMenuAbierto(false);
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    refContenido.current?.focus();
  }, [location.pathname]);

  return (
    <AlertasProvider>
      <a href="#contenido" className={estilos.saltar}>
        Saltar al contenido
      </a>
      <Sidebar abierto={menuAbierto} alCerrar={() => setMenuAbierto(false)} />
      <div className={estilos.principal}>
        <Topbar menuAbierto={menuAbierto} alAbrirMenu={() => setMenuAbierto(true)} />
        <main id="contenido" ref={refContenido} tabIndex={-1} className={estilos.contenido}>
          <Outlet />
        </main>
      </div>
      <AlertStack />
    </AlertasProvider>
  );
}
