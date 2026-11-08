/**
 * Menú lateral de cada rol. Cada fase agrega aquí las secciones de su módulo
 * (los permisos reales los aplica la API; el menú solo muestra lo que cada rol puede usar).
 * Fase 2: secciones comunes. Fase 3: Mesero y Jefe de Cocina. Fase 4: Compras y Director Comercial. Fase 5: Administrador.
 */
const COMUNES = Object.freeze({
  grupo: 'Mi cuenta',
  items: [
    { a: '/notificaciones', etiqueta: 'Notificaciones', icono: 'campana' },
    { a: '/cuenta/contrasena', etiqueta: 'Cambiar contraseña', icono: 'llave' },
  ],
});

const COMPRAS = Object.freeze({
  grupo: 'Compras',
  items: [
    { a: '/compras/solicitudes', etiqueta: 'Solicitudes', icono: 'lista' },
    { a: '/compras/cotizaciones', etiqueta: 'Cotizaciones', icono: 'sobre' },
    { a: '/compras/ordenes', etiqueta: 'Órdenes de compra', icono: 'carrito' },
  ],
});

const PROPIAS = Object.freeze({
  MESERO: [
    {
      grupo: 'Servicio',
      items: [
        { a: '/mesero/mesas', etiqueta: 'Mesas', icono: 'mesa' },
        { a: '/pedidos', etiqueta: 'Pedidos del día', icono: 'lista' },
      ],
    },
  ],
  JEFE_COCINA: [
    {
      grupo: 'Cocina',
      items: [
        { a: '/cocina', etiqueta: 'Panel', icono: 'panel', exacto: true },
        { a: '/cocina/menu', etiqueta: 'Menú', icono: 'menuPlato' },
        { a: '/pedidos', etiqueta: 'Pedidos', icono: 'lista' },
      ],
    },
    {
      grupo: 'Abastecimiento',
      items: [
        { a: '/cocina/inventario', etiqueta: 'Inventario', icono: 'caja' },
        { a: '/cocina/solicitudes/nueva', etiqueta: 'Solicitar alimentos', icono: 'carrito' },
        { a: '/promociones', etiqueta: 'Promociones', icono: 'etiqueta' },
      ],
    },
  ],
  ADMINISTRADOR: [
    {
      grupo: 'Administración',
      items: [
        { a: '/admin/usuarios', etiqueta: 'Usuarios', icono: 'usuario' },
        { a: '/admin/catalogos', etiqueta: 'Catálogos', icono: 'lista' },
        { a: '/admin/reglas', etiqueta: 'Reglas del sistema', icono: 'panel' },
        { a: '/admin/imagen', etiqueta: 'Imagen corporativa', icono: 'paleta' },
      ],
    },
    {
      grupo: 'Seguimiento',
      items: [
        { a: '/admin/auditoria', etiqueta: 'Auditoría', icono: 'ojo' },
        { a: '/admin/logs', etiqueta: 'Log del sistema', icono: 'alerta' },
        { a: '/promociones', etiqueta: 'Promociones', icono: 'etiqueta' },
      ],
    },
  ],
  AUXILIAR_COMPRAS: [COMPRAS],
  DIRECTOR_COMPRAS: [COMPRAS],
  DIRECTOR_COMERCIAL: [
    {
      grupo: 'Comercial',
      items: [
        { a: '/comercial/tablero', etiqueta: 'Tablero de control', icono: 'panel' },
        { a: '/promociones', etiqueta: 'Promociones', icono: 'etiqueta' },
      ],
    },
  ],
});

export function menuDelRol(rol) {
  return [...(PROPIAS[rol] ?? []), COMUNES];
}

const INICIO = Object.freeze({
  ADMINISTRADOR: '/admin/usuarios',
  MESERO: '/mesero/mesas',
  JEFE_COCINA: '/cocina',
  AUXILIAR_COMPRAS: '/compras/solicitudes',
  DIRECTOR_COMPRAS: '/compras/cotizaciones',
  DIRECTOR_COMERCIAL: '/comercial/tablero',
});

/** Pantalla con la que abre cada rol al iniciar sesión. */
export function rutaInicio(rol) {
  return INICIO[rol] ?? '/notificaciones';
}
