/**
 * Middleware de autenticación: exige un JWT válido en `Authorization: Bearer <token>`
 * y deja el usuario en `req.actor`. La verificación la hace SistemaFacade.
 */
import { ErrorNoAutenticado } from '../../domain/errors/ErroresDeNegocio.js';

export function crearAuthMiddleware(facade) {
  return (req, res, next) => {
    const coincidencia = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
    if (!coincidencia) {
      next(new ErrorNoAutenticado());
      return;
    }
    try {
      req.actor = facade.autenticarToken(coincidencia[1]);
      next();
    } catch (error) {
      next(error);
    }
  };
}
