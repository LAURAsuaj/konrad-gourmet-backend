import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/cliente.js';
import { useSesion } from '../../features/auth/AuthProvider.jsx';
import { ETIQUETAS_ROL } from '../../features/auth/roles.js';
import { Button } from '../ui/Button.jsx';
import { Icono } from '../ui/Icono.jsx';
import { Marca } from './Marca.jsx';
import { menuDelRol } from './navegacion.js';
import estilos from './Sidebar.module.css';

/** Menú lateral: fijo en escritorio, cajón deslizable en tablet y móvil. */
export function Sidebar({ abierto, alCerrar }) {
  const { usuario, cerrarSesion } = useSesion();

  // El nombre del punto (restaurante) se resuelve con el catálogo, que cualquier rol puede leer.
  const puntos = useQuery({
    queryKey: ['catalogo', 'puntos'],
    queryFn: () => api.get('/catalogos/puntos'),
    enabled: Boolean(usuario?.puntoId),
    staleTime: 10 * 60_000,
  });
  const punto = puntos.data?.find((p) => p.id === usuario?.puntoId);

  return (
    <>
      {abierto ? <button type="button" className={estilos.velo} aria-label="Cerrar menú" onClick={alCerrar} /> : null}
      <aside id="menu-principal" className={`${estilos.menu} ${abierto ? estilos.abierto : ''}`} aria-label="Menú principal">
        <div className={estilos.cabecera}>
          <Marca tamano={34} />
          <Button className={estilos.cerrar} variante="fantasma" icono="cerrar" etiquetaAccesible="Cerrar menú" onClick={alCerrar} />
        </div>

        <nav className={estilos.navegacion}>
          {menuDelRol(usuario?.rol).map((grupo) => (
            <div key={grupo.grupo} className={estilos.grupo}>
              <p className={estilos.tituloGrupo}>{grupo.grupo}</p>
              <ul className={estilos.items}>
                {grupo.items.map((item) => (
                  <li key={item.a}>
                    <NavLink to={item.a} end={Boolean(item.exacto)} className={({ isActive }) => `${estilos.enlace} ${isActive ? estilos.activo : ''}`} onClick={alCerrar}>
                      <Icono nombre={item.icono} />
                      {item.etiqueta}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={estilos.usuario}>
          <div>
            <p className={estilos.nombre}>{usuario?.nombre}</p>
            <p className={estilos.rol}>
              {ETIQUETAS_ROL[usuario?.rol] ?? usuario?.rol}
              {punto ? ` en ${punto.nombre}` : ''}
            </p>
          </div>
          <Button variante="fantasma" icono="salir" etiquetaAccesible="Cerrar sesión" onClick={cerrarSesion} />
        </div>
      </aside>
    </>
  );
}
