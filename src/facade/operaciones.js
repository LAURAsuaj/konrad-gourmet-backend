/**
 * Catálogo de operaciones de SistemaFacade: es la ÚNICA fuente de la matriz de
 * permisos por rol (la usan la fachada y rbacMiddleware) y define a qué módulo
 * del dominio se delega cada operación y qué se audita.
 *
 * Cada operación:
 *   roles      roles autorizados (la fachada rechaza a los demás)
 *   accion     acción de auditoría: CREATE | READ | UPDATE | DELETE
 *   entidad    entidad auditada (texto, o función de los datos)
 *   auditar    false para lecturas de alto volumen que no se auditan
 *   ejecutar   delegación al módulo ({ m: módulos, actor, datos })
 *   auditoria  (resultado, datos) => { entidadId, detalle } con datos NO sensibles
 *
 * Los `datos` los arma el controlador: cuerpo, parámetros de ruta y consulta.
 */
import { ROLES } from '../domain/modules/auth/roles.js';

const R = ROLES;
const TODOS = Object.freeze(Object.values(ROLES));
const ADMIN = [R.ADMINISTRADOR];
const COMPRAS = [R.AUXILIAR_COMPRAS, R.DIRECTOR_COMPRAS];

export const OPERACIONES = Object.freeze({
  // ---- Sesión (CU-01) ----
  // Renovar no se audita (se invoca con frecuencia mientras hay actividad). Cerrar sesión sí:
  // se registra como DELETE de la entidad "sesion" porque la tabla de auditoría no tiene una
  // acción propia para ello. El token no se invalida en el servidor: el cliente debe descartarlo.
  'sesion.renovar': {
    roles: TODOS, accion: 'UPDATE', entidad: 'sesion', auditar: false,
    ejecutar: ({ m, actor }) => m.auth.renovarSesion(actor),
  },
  'sesion.cerrar': {
    roles: TODOS, accion: 'DELETE', entidad: 'sesion',
    ejecutar: ({ actor }) => ({ cerrada: true, usuarioId: actor.id }),
    auditoria: (r) => ({ entidadId: r.usuarioId }),
  },

  // ---- Usuarios (CU-01) ----
  'usuarios.crear': {
    roles: ADMIN, accion: 'CREATE', entidad: 'usuario',
    ejecutar: ({ m, actor, datos }) => m.auth.crearUsuario(actor, datos),
    auditoria: (r) => ({ entidadId: r.id, detalle: { rol: r.rol, correo: r.correo } }),
  },
  'usuarios.listar': {
    roles: ADMIN, accion: 'READ', entidad: 'usuario',
    ejecutar: ({ m, actor }) => m.auth.listarUsuarios(actor),
  },
  'usuarios.desbloquear': {
    roles: ADMIN, accion: 'UPDATE', entidad: 'usuario',
    ejecutar: ({ m, actor, datos }) => m.auth.desbloquearUsuario(actor, datos.id),
    auditoria: (r) => ({ entidadId: r.id, detalle: { cambio: 'desbloqueo de cuenta' } }),
  },

  // ---- Parametrización (CU-04) ----
  'catalogos.nombres': {
    roles: TODOS, accion: 'READ', entidad: 'catalogo', auditar: false,
    ejecutar: ({ m }) => m.parametrizacion.nombresDeCatalogos(),
  },
  'catalogos.listar': {
    roles: TODOS, accion: 'READ', entidad: 'catalogo', auditar: false,
    ejecutar: ({ m, actor, datos }) =>
      m.parametrizacion.listarCatalogo(actor, datos.catalogo, { incluirInactivos: datos.incluirInactivos === true, filtros: datos.filtros ?? {} }),
  },
  'catalogos.crear': {
    roles: ADMIN, accion: 'CREATE', entidad: (d) => `catalogo:${d.catalogo}`,
    ejecutar: ({ m, actor, datos }) => m.parametrizacion.crearValor(actor, datos.catalogo, datos.cuerpo),
    auditoria: (r) => ({ entidadId: r.id }),
  },
  'catalogos.modificar': {
    roles: ADMIN, accion: 'UPDATE', entidad: (d) => `catalogo:${d.catalogo}`,
    ejecutar: ({ m, actor, datos }) => m.parametrizacion.modificarValor(actor, datos.catalogo, datos.id, datos.cuerpo),
    auditoria: (r) => ({ entidadId: r.id, detalle: { activo: r.activo } }),
  },
  'catalogos.eliminar': {
    roles: ADMIN, accion: 'DELETE', entidad: (d) => `catalogo:${d.catalogo}`,
    ejecutar: ({ m, actor, datos }) => m.parametrizacion.eliminarValor(actor, datos.catalogo, datos.id),
    auditoria: (r) => ({ entidadId: r.id }),
  },
  'reglas.listar': {
    roles: ADMIN, accion: 'READ', entidad: 'regla',
    ejecutar: ({ m, actor }) => m.parametrizacion.listarReglas(actor),
  },
  'reglas.definir': {
    roles: ADMIN, accion: 'UPDATE', entidad: 'regla',
    ejecutar: ({ m, actor, datos }) => m.parametrizacion.definirRegla(actor, datos.clave, datos.valor),
    auditoria: (r) => ({ entidadId: r.clave, detalle: { valor: r.valor } }),
  },

  // ---- Cocina (CU-02, CU-03) ----
  'menu.listar': {
    roles: [R.JEFE_COCINA, R.MESERO], accion: 'READ', entidad: 'plato', auditar: false,
    ejecutar: ({ m, actor, datos }) => m.menu.listarMenu(actor, { incluirInactivos: datos.incluirInactivos === true }),
  },
  'menu.registrarPlato': {
    roles: [R.JEFE_COCINA], accion: 'CREATE', entidad: 'plato',
    ejecutar: ({ m, actor, datos }) => m.menu.registrarPlato(actor, datos),
    auditoria: (r) => ({ entidadId: r.id, detalle: { nombre: r.nombre } }),
  },
  'menu.modificarPlato': {
    roles: [R.JEFE_COCINA], accion: 'UPDATE', entidad: 'plato',
    ejecutar: ({ m, actor, datos }) => m.menu.modificarPlato(actor, datos.id, datos.cuerpo),
    auditoria: (r) => ({ entidadId: r.id, detalle: { activo: r.activo } }),
  },
  'pedidos.registrar': {
    roles: [R.MESERO], accion: 'CREATE', entidad: 'pedido',
    ejecutar: ({ m, actor, datos }) => m.pedidos.registrarPedido(actor, datos),
    auditoria: (r) => ({ entidadId: r.id, detalle: { mesa: r.mesa, platos: r.items.length } }),
  },
  'pedidos.listar': {
    roles: [R.JEFE_COCINA, R.MESERO], accion: 'READ', entidad: 'pedido',
    ejecutar: ({ m, actor, datos }) => m.pedidos.listarPedidos(actor, datos),
  },

  // ---- Inventario (CU-06, CU-07) ----
  'inventario.establecer': {
    roles: [R.JEFE_COCINA, R.ADMINISTRADOR], accion: 'UPDATE', entidad: 'inventario',
    ejecutar: ({ m, actor, datos }) => m.inventario.establecerInventario(actor, datos),
    auditoria: (r) => ({ entidadId: r.id, detalle: { producto: r.producto, cantidadActual: r.cantidadActual, alarma: r.alarma } }),
  },
  'inventario.consultar': {
    roles: [R.JEFE_COCINA, R.ADMINISTRADOR], accion: 'READ', entidad: 'inventario',
    ejecutar: ({ m, actor, datos }) => m.inventario.consultarInventario(actor, datos),
  },
  'inventario.alarmas': {
    roles: [R.JEFE_COCINA], accion: 'READ', entidad: 'alarma',
    ejecutar: ({ m, actor }) => m.inventario.listarAlarmasActivas(actor),
  },

  // ---- Solicitudes (CU-05, CU-08) ----
  'solicitudes.registrar': {
    roles: [R.JEFE_COCINA], accion: 'CREATE', entidad: 'solicitud_alimentos',
    ejecutar: ({ m, actor, datos }) => m.solicitudes.registrarSolicitud(actor, datos),
    auditoria: (r) => ({ entidadId: r.id, detalle: { consecutivo: r.consecutivo, alimentos: r.items } }),
  },
  'solicitudes.consultar': {
    roles: COMPRAS, accion: 'READ', entidad: 'solicitud_alimentos',
    ejecutar: ({ m, actor, datos }) => m.solicitudes.consultarSolicitudes(actor, datos),
  },
  'solicitudes.detalle': {
    roles: COMPRAS, accion: 'READ', entidad: 'solicitud_alimentos',
    ejecutar: ({ m, actor, datos }) => m.solicitudes.obtenerDetalleSolicitud(actor, datos.id),
    auditoria: (r) => ({ entidadId: r.id }),
  },

  // ---- Cotizaciones (CU-09, CU-11) ----
  'cotizaciones.generar': {
    roles: [R.AUXILIAR_COMPRAS], accion: 'CREATE', entidad: 'cotizacion',
    ejecutar: ({ m, actor, datos }) => m.cotizaciones.generarSolicitudCotizacion(actor, datos),
    auditoria: (r) => ({ entidadId: r.id, detalle: { consecutivo: r.consecutivo, proveedor: r.proveedor } }),
  },
  'cotizaciones.registrarValores': {
    roles: [R.DIRECTOR_COMPRAS], accion: 'UPDATE', entidad: 'cotizacion',
    ejecutar: ({ m, actor, datos }) => m.cotizaciones.registrarValores(actor, { ...datos.cuerpo, cotizacionId: datos.id }),
    auditoria: (r) => ({ entidadId: r.id, detalle: { cambio: 'valores registrados' } }), // sin montos (SRS 6.5)
  },
  'cotizaciones.listar': {
    roles: COMPRAS, accion: 'READ', entidad: 'cotizacion',
    ejecutar: ({ m, actor, datos }) => m.cotizaciones.listarCotizaciones(actor, datos),
  },
  'cotizaciones.detalle': {
    roles: COMPRAS, accion: 'READ', entidad: 'cotizacion',
    ejecutar: ({ m, actor, datos }) => m.cotizaciones.obtenerCotizacion(actor, datos.id),
    auditoria: (r) => ({ entidadId: r.id }),
  },

  // ---- Órdenes de compra (CU-13) ----
  'ordenes.opcionadas': {
    roles: [R.DIRECTOR_COMPRAS], accion: 'READ', entidad: 'cotizacion',
    ejecutar: ({ m, actor, datos }) => m.ordenes.consultarOpcionadas(actor, datos.solicitudId),
  },
  'ordenes.generar': {
    roles: [R.DIRECTOR_COMPRAS], accion: 'CREATE', entidad: 'orden_compra',
    ejecutar: ({ m, actor, datos }) => m.ordenes.generarOrden(actor, datos),
    auditoria: (r) => ({ entidadId: r.id, detalle: { consecutivo: r.consecutivo } }), // sin montos (SRS 6.5)
  },
  'ordenes.listar': {
    roles: COMPRAS, accion: 'READ', entidad: 'orden_compra',
    ejecutar: ({ m, actor, datos }) => m.ordenes.listarOrdenes(actor, datos),
  },
  'ordenes.detalle': {
    roles: COMPRAS, accion: 'READ', entidad: 'orden_compra',
    ejecutar: ({ m, actor, datos }) => m.ordenes.obtenerOrden(actor, datos.id),
    auditoria: (r) => ({ entidadId: r.id }),
  },

  // ---- Analítica (CU-14, CU-15) ----
  'tablero.consultar': {
    roles: [R.DIRECTOR_COMERCIAL], accion: 'READ', entidad: 'tablero_bam',
    ejecutar: ({ m, actor, datos }) => m.tablero.consultarTablero(actor, datos),
  },
  'promociones.listar': {
    roles: [R.DIRECTOR_COMERCIAL, R.ADMINISTRADOR, R.JEFE_COCINA], accion: 'READ', entidad: 'promocion',
    ejecutar: ({ m, actor, datos }) => m.promociones.listarPromociones(actor, datos),
  },

  // ---- Auditoría y logs (CU-16) ----
  'auditoria.consultar': {
    roles: ADMIN, accion: 'READ', entidad: 'auditoria',
    ejecutar: ({ m, actor, datos }) => m.auditoria.consultarAuditoria(actor, datos),
  },
  'auditoria.detalle': {
    roles: ADMIN, accion: 'READ', entidad: 'auditoria',
    ejecutar: ({ m, actor, datos }) => m.auditoria.detalleAuditoria(actor, datos.id),
    auditoria: (r) => ({ entidadId: r.id }),
  },
  'logs.consultar': {
    roles: ADMIN, accion: 'READ', entidad: 'log_error',
    ejecutar: ({ m, actor, datos }) => m.auditoria.consultarLogs(actor, datos),
  },
  'logs.detalle': {
    roles: ADMIN, accion: 'READ', entidad: 'log_error',
    ejecutar: ({ m, actor, datos }) => m.auditoria.detalleLog(actor, datos.id),
    auditoria: (r) => ({ entidadId: r.id }),
  },
});

/**
 * Procesos automáticos que invoca el contenedor cron a través de la fachada.
 * Se ejecutan con el actor SISTEMA y su resultado queda en la auditoría (EJECUCION).
 */
export const PROCESOS_AUTOMATICOS = Object.freeze({
  descuento_diario: {
    entidad: 'inventario',
    ejecutar: ({ m }) => m.inventario.ejecutarDescuentoDiario(),
    resumen: (r) => ({ pedidosProcesados: r.pedidosProcesados, movimientos: r.movimientos, inconsistencias: r.inconsistencias.length }),
  },
  promociones: {
    entidad: 'promocion',
    ejecutar: ({ m }) => m.promociones.generarPromociones(),
    resumen: (r) => ({ generadas: r.generadas, omitidasPorRepetidas: r.omitidasPorRepetidas, apiDisponible: r.apiDisponible }),
  },
  reintento_precios: {
    entidad: 'solicitud_alimentos',
    ejecutar: ({ m }) => m.precioSugerido.reintentarPendientes(),
    resumen: (r) => r,
  },
});

export function rolPermitido(operacion, rol) {
  return Boolean(OPERACIONES[operacion]?.roles.includes(rol));
}
