import { createBrowserRouter } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage.jsx';
import { CambiarPasswordPage } from '../features/auth/CambiarPasswordPage.jsx';
import { NotificacionesPage } from '../features/alertas/NotificacionesPage.jsx';
import { MeseroLayout } from '../features/mesero/MeseroLayout.jsx';
import { MesasPage } from '../features/mesero/MesasPage.jsx';
import { TomaOrdenPage } from '../features/mesero/TomaOrdenPage.jsx';
import { PanelCocinaPage } from '../features/cocina/PanelCocinaPage.jsx';
import { MenuPage } from '../features/cocina/MenuPage.jsx';
import { InventarioPage } from '../features/cocina/InventarioPage.jsx';
import { SolicitudPage } from '../features/cocina/SolicitudPage.jsx';
import { PedidosPage } from '../features/cocina/PedidosPage.jsx';
import { SolicitudesPage } from '../features/compras/SolicitudesPage.jsx';
import { DetalleSolicitudPage } from '../features/compras/DetalleSolicitudPage.jsx';
import { CotizacionesPage } from '../features/compras/CotizacionesPage.jsx';
import { DetalleCotizacionPage } from '../features/compras/DetalleCotizacionPage.jsx';
import { OrdenesPage } from '../features/compras/OrdenesPage.jsx';
import { DetalleOrdenPage } from '../features/compras/DetalleOrdenPage.jsx';
import { TableroPage } from '../features/comercial/TableroPage.jsx';
import { PromocionesPage } from '../features/comercial/PromocionesPage.jsx';
import { UsuariosPage } from '../features/admin/UsuariosPage.jsx';
import { CatalogosPage } from '../features/admin/CatalogosPage.jsx';
import { ReglasPage } from '../features/admin/ReglasPage.jsx';
import { ImagenCorporativaPage } from '../features/admin/ImagenCorporativaPage.jsx';
import { AuditoriaPage, LogsPage } from '../features/admin/RegistrosPage.jsx';
import { ROLES } from '../features/auth/roles.js';
import { AppShell } from '../shared/layout/AppShell.jsx';
import { RutaProtegida } from './RutaProtegida.jsx';
import { InicioPorRol } from './InicioPorRol.jsx';
import { PaginaError, PaginaNoEncontrada } from './PaginasDeEstado.jsx';

const solo = (roles, elemento) => <RutaProtegida roles={roles}>{elemento}</RutaProtegida>;
const COMPRAS = [ROLES.AUXILIAR_COMPRAS, ROLES.DIRECTOR_COMPRAS];

/**
 * Rutas de la aplicación. Cada fase agrega las de su módulo dentro de `children`,
 * con los mismos roles que exige la API para esas operaciones.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <PaginaError /> },
  {
    path: '/',
    element: (
      <RutaProtegida>
        <AppShell />
      </RutaProtegida>
    ),
    errorElement: <PaginaError />,
    children: [
      { index: true, element: <InicioPorRol /> },
      { path: 'notificaciones', element: <NotificacionesPage /> },
      { path: 'cuenta/contrasena', element: <CambiarPasswordPage /> },

      // Fase 3: Mesero
      {
        path: 'mesero',
        element: solo([ROLES.MESERO], <MeseroLayout />),
        children: [
          { path: 'mesas', element: <MesasPage /> },
          { path: 'mesas/:mesaId', element: <TomaOrdenPage /> },
        ],
      },
      { path: 'pedidos', element: solo([ROLES.MESERO, ROLES.JEFE_COCINA], <PedidosPage />) },

      // Fase 3: Jefe de Cocina
      { path: 'cocina', element: solo([ROLES.JEFE_COCINA], <PanelCocinaPage />) },
      { path: 'cocina/menu', element: solo([ROLES.JEFE_COCINA], <MenuPage />) },
      { path: 'cocina/inventario', element: solo([ROLES.JEFE_COCINA], <InventarioPage />) },
      { path: 'cocina/solicitudes/nueva', element: solo([ROLES.JEFE_COCINA], <SolicitudPage />) },

      // Fase 4: Compras
      { path: 'compras/solicitudes', element: solo(COMPRAS, <SolicitudesPage />) },
      { path: 'compras/solicitudes/:id', element: solo(COMPRAS, <DetalleSolicitudPage />) },
      { path: 'compras/cotizaciones', element: solo(COMPRAS, <CotizacionesPage />) },
      { path: 'compras/cotizaciones/:id', element: solo(COMPRAS, <DetalleCotizacionPage />) },
      { path: 'compras/ordenes', element: solo(COMPRAS, <OrdenesPage />) },
      { path: 'compras/ordenes/:id', element: solo(COMPRAS, <DetalleOrdenPage />) },

      // Fase 4: Director Comercial (promociones también para Jefe de Cocina y Administrador)
      { path: 'comercial/tablero', element: solo([ROLES.DIRECTOR_COMERCIAL], <TableroPage />) },
      { path: 'promociones', element: solo([ROLES.DIRECTOR_COMERCIAL, ROLES.JEFE_COCINA, ROLES.ADMINISTRADOR], <PromocionesPage />) },

      // Fase 5: Administrador
      { path: 'admin/usuarios', element: solo([ROLES.ADMINISTRADOR], <UsuariosPage />) },
      { path: 'admin/catalogos', element: solo([ROLES.ADMINISTRADOR], <CatalogosPage />) },
      { path: 'admin/reglas', element: solo([ROLES.ADMINISTRADOR], <ReglasPage />) },
      { path: 'admin/imagen', element: solo([ROLES.ADMINISTRADOR], <ImagenCorporativaPage />) },
      { path: 'admin/auditoria', element: solo([ROLES.ADMINISTRADOR], <AuditoriaPage />) },
      { path: 'admin/logs', element: solo([ROLES.ADMINISTRADOR], <LogsPage />) },

      { path: '*', element: <PaginaNoEncontrada /> },
    ],
  },
]);
