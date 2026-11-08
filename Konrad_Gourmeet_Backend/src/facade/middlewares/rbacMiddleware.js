/**
 * Middleware de control de acceso por rol (RBAC). Se ubica antes del controlador:
 * si el rol del usuario no está autorizado para la operación, deja constancia
 * (ACCESO_DENEGADO) y responde 403 sin llegar a la fachada.
 */
import { ErrorProhibido } from '../../domain/errors/ErroresDeNegocio.js';
import { rolPermitido } from '../operaciones.js';

export function crearRbacMiddleware(facade) {
  /** @param {string} operacion clave de OPERACIONES */
  return (operacion) => (req, res, next) => {
    if (rolPermitido(operacion, req.actor?.rol)) {
      next();
      return;
    }
    facade
      .registrarAccesoDenegado(req.actor, operacion, { ip: req.ip })
      .then(() => next(new ErrorProhibido()));
  };
}
