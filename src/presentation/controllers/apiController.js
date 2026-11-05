/**
 * Controlador HTTP de la API (/api/v1). Solo recibe la petición, arma los datos y
 * delega DIRECTAMENTE en SistemaFacade; no contiene lógica de negocio.
 *
 * Cada ruta protegida pasa por: authMiddleware (JWT) -> rbacMiddleware (rol) -> fachada.
 */
import { Router } from 'express';
import { limitarIntentosLogin } from '../middlewares/httpSecurity.js';

const esVerdadero = (valor) => valor === true || valor === 'true';

export function crearApiController({ facade, authMiddleware, rbac }) {
  const router = Router();
  const contexto = (req) => ({ ip: req.ip });

  /** Registra una ruta protegida que delega en una operación de la fachada. */
  const ruta = (metodo, camino, operacion, armarDatos = () => ({}), estado = 200) => {
    router[metodo](camino, authMiddleware, rbac(operacion), async (req, res, next) => {
      try {
        const resultado = await facade.ejecutar(operacion, req.actor, armarDatos(req), contexto(req));
        res.status(estado).json({ datos: resultado });
      } catch (error) {
        next(error);
      }
    });
  };

  const consulta = (req) => ({ ...req.query });
  const conId = (req) => ({ id: req.params.id });

  // ---- Sesión (CU-01) ----
  router.post('/auth/login', limitarIntentosLogin(), async (req, res, next) => {
    try {
      res.json({ datos: await facade.iniciarSesion(req.body, contexto(req)) });
    } catch (error) {
      next(error);
    }
  });
  router.get('/auth/sesion', authMiddleware, (req, res) => {
    res.json({ datos: { usuario: facade.sesionDe(req.actor) } });
  });

  ruta('post', '/auth/refrescar', 'sesion.renovar');
  ruta('post', '/auth/logout', 'sesion.cerrar');

  // ---- Usuarios ----
  ruta('post', '/usuarios', 'usuarios.crear', (req) => req.body, 201);
  ruta('get', '/usuarios', 'usuarios.listar');
  ruta('post', '/usuarios/:id/desbloquear', 'usuarios.desbloquear', conId);

  // ---- Parametrización (CU-04) ----
  ruta('get', '/catalogos', 'catalogos.nombres');
  ruta('get', '/catalogos/:catalogo', 'catalogos.listar', (req) => {
    const { incluirInactivos, ...filtros } = req.query;
    return { catalogo: req.params.catalogo, incluirInactivos: esVerdadero(incluirInactivos), filtros };
  });
  ruta('post', '/catalogos/:catalogo', 'catalogos.crear', (req) => ({ catalogo: req.params.catalogo, cuerpo: req.body }), 201);
  ruta('patch', '/catalogos/:catalogo/:id', 'catalogos.modificar', (req) => ({ catalogo: req.params.catalogo, id: req.params.id, cuerpo: req.body }));
  ruta('delete', '/catalogos/:catalogo/:id', 'catalogos.eliminar', (req) => ({ catalogo: req.params.catalogo, id: req.params.id }));
  ruta('get', '/reglas', 'reglas.listar');
  ruta('put', '/reglas/:clave', 'reglas.definir', (req) => ({ clave: req.params.clave, valor: req.body?.valor }));

  // ---- Cocina (CU-02, CU-03) ----
  ruta('get', '/menu', 'menu.listar', (req) => ({ incluirInactivos: esVerdadero(req.query.incluirInactivos) }));
  ruta('post', '/menu/platos', 'menu.registrarPlato', (req) => req.body, 201);
  ruta('patch', '/menu/platos/:id', 'menu.modificarPlato', (req) => ({ id: req.params.id, cuerpo: req.body }));
  ruta('post', '/pedidos', 'pedidos.registrar', (req) => req.body, 201);
  ruta('get', '/pedidos', 'pedidos.listar', consulta);

  // ---- Inventario (CU-06, CU-07) ----
  ruta('put', '/inventario', 'inventario.establecer', (req) => req.body);
  ruta('get', '/inventario', 'inventario.consultar', consulta);
  ruta('get', '/inventario/alarmas', 'inventario.alarmas');

  // ---- Solicitudes (CU-05, CU-08) ----
  ruta('post', '/solicitudes', 'solicitudes.registrar', (req) => req.body, 201);
  ruta('get', '/solicitudes', 'solicitudes.consultar', consulta);
  ruta('get', '/solicitudes/:id', 'solicitudes.detalle', conId);
  ruta('get', '/solicitudes/:id/cotizaciones-opcionadas', 'ordenes.opcionadas', (req) => ({ solicitudId: req.params.id }));

  // ---- Cotizaciones (CU-09, CU-11) ----
  ruta('post', '/cotizaciones', 'cotizaciones.generar', (req) => req.body, 201);
  ruta('get', '/cotizaciones', 'cotizaciones.listar', (req) => ({ ...req.query, pendientesDeValor: esVerdadero(req.query.pendientesDeValor) }));
  ruta('get', '/cotizaciones/:id', 'cotizaciones.detalle', conId);
  ruta('put', '/cotizaciones/:id/valores', 'cotizaciones.registrarValores', (req) => ({ id: req.params.id, cuerpo: req.body }));

  // ---- Órdenes de compra (CU-13) ----
  ruta('post', '/ordenes-compra', 'ordenes.generar', (req) => req.body, 201);
  ruta('get', '/ordenes-compra', 'ordenes.listar', consulta);
  ruta('get', '/ordenes-compra/:id', 'ordenes.detalle', conId);

  // ---- Analítica (CU-14, CU-15) ----
  ruta('get', '/tablero', 'tablero.consultar', consulta);
  ruta('get', '/promociones', 'promociones.listar', consulta);

  // ---- Auditoría y logs (CU-16) ----
  ruta('get', '/auditoria', 'auditoria.consultar', consulta);
  ruta('get', '/auditoria/:id', 'auditoria.detalle', conId);
  ruta('get', '/logs', 'logs.consultar', consulta);
  ruta('get', '/logs/:id', 'logs.detalle', conId);

  return router;
}
