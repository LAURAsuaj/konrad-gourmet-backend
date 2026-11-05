/**
 * Contenedor de dependencias (composition root).
 *
 * Es el único lugar donde se conectan las capas: crea los adaptadores de
 * servicios externos, los repositorios, los servicios de cada módulo, registra
 * los manejadores en el BusDeEventos, arma el publicador del Outbox y la
 * SistemaFacade. Lo usan tanto la API (src/app.js) como el contenedor cron
 * (cron/worker.js), de modo que ambos comparten la misma composición.
 *
 * Se debe construir UNA sola vez por proceso (los manejadores se suscriben al
 * bus global). `servicios` permite sustituir adaptadores (por ejemplo en pruebas).
 */
import { env } from './config/env.js';
import { pool, withTransaction, cerrarBaseDeDatos } from './infrastructure/database/supabaseClient.js';
import { registrarError, registrarAdvertencia, registrarEjecucion } from './infrastructure/logging/errorLogger.js';
import { registrarEvento, EventOutboxPublisher } from './infrastructure/outbox/EventOutboxPublisher.js';
import { CorreoAdapter } from './infrastructure/adapters/CorreoAdapter.js';
import { MinisterioComercioAdapter } from './infrastructure/adapters/MinisterioComercioAdapter.js';
import { RedesSocialesAdapter } from './infrastructure/adapters/RedesSocialesAdapter.js';
import { busDeEventos } from './domain/events/BusDeEventos.js';

import { ParametroRepository } from './domain/modules/parametrizacion/ParametroRepository.js';
import { CatalogoRepository } from './domain/modules/parametrizacion/CatalogoRepository.js';
import { ParametrizacionService } from './domain/modules/parametrizacion/ParametrizacionService.js';
import { PasswordHasher } from './domain/modules/auth/PasswordHasher.js';
import { TokenService } from './domain/modules/auth/TokenService.js';
import { UsuarioRepository } from './domain/modules/auth/UsuarioRepository.js';
import { AuthService } from './domain/modules/auth/AuthService.js';
import { AuditoriaRepository } from './domain/modules/auditoria/AuditoriaRepository.js';
import { AuditoriaService } from './domain/modules/auditoria/AuditoriaService.js';
import { MenuRepository } from './domain/modules/cocina/MenuRepository.js';
import { MenuService } from './domain/modules/cocina/MenuService.js';
import { PedidoRepository } from './domain/modules/cocina/PedidoRepository.js';
import { PedidoService } from './domain/modules/cocina/PedidoService.js';
import { InventarioRepository } from './domain/modules/inventario/InventarioRepository.js';
import { AlarmaRepository } from './domain/modules/inventario/AlarmaRepository.js';
import { EvaluadorAlarmas } from './domain/modules/inventario/EvaluadorAlarmas.js';
import { InventarioService } from './domain/modules/inventario/InventarioService.js';
import { SolicitudRepository } from './domain/modules/compras/SolicitudRepository.js';
import { SolicitudService } from './domain/modules/compras/SolicitudService.js';
import { CotizacionRepository } from './domain/modules/compras/CotizacionRepository.js';
import { CotizacionService } from './domain/modules/compras/CotizacionService.js';
import { GeneradorPdfCotizacion } from './domain/modules/compras/GeneradorPdfCotizacion.js';
import { OrdenCompraRepository } from './domain/modules/compras/OrdenCompraRepository.js';
import { OrdenCompraService } from './domain/modules/compras/OrdenCompraService.js';
import { AnaliticaRepository } from './domain/modules/analitica/AnaliticaRepository.js';
import { TableroBamService } from './domain/modules/analitica/TableroBamService.js';
import { PromocionRepository } from './domain/modules/analitica/PromocionRepository.js';
import { PromocionService } from './domain/modules/analitica/PromocionService.js';
import { NotificacionRepository } from './domain/modules/notificaciones/NotificacionRepository.js';
import { ManejadorAlarmas } from './domain/events/handlers/ManejadorAlarmas.js';
import { ManejadorNotificaciones } from './domain/events/handlers/ManejadorNotificaciones.js';
import { ManejadorPrecioSugerido } from './domain/events/handlers/ManejadorPrecioSugerido.js';
import { ManejadorValidacionCotizaciones } from './domain/events/handlers/ManejadorValidacionCotizaciones.js';
import { ManejadorEstadoSolicitud } from './domain/events/handlers/ManejadorEstadoSolicitud.js';
import { SistemaFacade } from './facade/SistemaFacade.js';

/**
 * @param {{servicios?: {correo?: object, precios?: object, tendencias?: object},
 *          outbox?: object}} [opciones]
 */
export function construirContenedor({ servicios = {}, outbox = {} } = {}) {
  const db = pool;
  const unidadDeTrabajo = withTransaction;
  const registrador = { error: registrarError, advertencia: registrarAdvertencia, ejecucion: registrarEjecucion };

  // Servicios externos (Adapter)
  const correo = servicios.correo ?? new CorreoAdapter();
  const precios = servicios.precios ?? new MinisterioComercioAdapter();
  const tendencias = servicios.tendencias ?? new RedesSocialesAdapter();

  // Repositorios compartidos
  const parametros = new ParametroRepository();
  const solicitudesRepo = new SolicitudRepository();
  const cotizacionesRepo = new CotizacionRepository();
  const alarmasRepo = new AlarmaRepository();
  const analiticaRepo = new AnaliticaRepository();

  // Servicios de dominio
  const auth = new AuthService({
    db,
    usuarios: new UsuarioRepository(),
    parametros,
    hasher: new PasswordHasher({ rondas: env.security.bcryptRounds }),
    tokens: new TokenService({ secreto: env.jwt.secret, expiraEn: env.jwt.expiresIn, emisor: env.jwt.issuer }),
  });
  const auditoria = new AuditoriaService({ db, auditoria: new AuditoriaRepository() });
  const parametrizacion = new ParametrizacionService({ db, catalogos: new CatalogoRepository(), parametros });
  const menu = new MenuService({ db, unidadDeTrabajo, menu: new MenuRepository() });
  const pedidos = new PedidoService({ db, unidadDeTrabajo, pedidos: new PedidoRepository() });
  const evaluador = new EvaluadorAlarmas({ alarmas: alarmasRepo, registrarEvento });
  const inventario = new InventarioService({
    db, unidadDeTrabajo, inventario: new InventarioRepository(), alarmas: alarmasRepo, evaluador, parametros, registrarEvento, registrador,
  });
  const solicitudes = new SolicitudService({ db, unidadDeTrabajo, solicitudes: solicitudesRepo, registrarEvento });
  const cotizaciones = new CotizacionService({
    db, unidadDeTrabajo, solicitudes: solicitudesRepo, cotizaciones: cotizacionesRepo, correo, pdf: new GeneradorPdfCotizacion(), registrarEvento, registrador,
  });
  const ordenes = new OrdenCompraService({ db, unidadDeTrabajo, ordenes: new OrdenCompraRepository(), cotizaciones: cotizacionesRepo });
  const tablero = new TableroBamService({ db, analitica: analiticaRepo, parametros, registrador });
  const promociones = new PromocionService({
    db, unidadDeTrabajo, promociones: new PromocionRepository(), analitica: analiticaRepo, tendencias, registrarEvento, registrador,
  });

  // Manejadores de eventos (EDA)
  const precioSugerido = new ManejadorPrecioSugerido({ db, unidadDeTrabajo, solicitudes: solicitudesRepo, precios, registrarEvento, registrador });
  [
    new ManejadorAlarmas({ db, unidadDeTrabajo, alarmas: alarmasRepo, evaluador, parametros, registrador }),
    new ManejadorNotificaciones({ db, notificaciones: new NotificacionRepository(), correo, registrador }),
    precioSugerido,
    new ManejadorValidacionCotizaciones({ db, unidadDeTrabajo, cotizaciones: cotizacionesRepo, parametros, auditoria, registrador }),
    new ManejadorEstadoSolicitud({ unidadDeTrabajo, solicitudes: solicitudesRepo, auditoria }),
  ].forEach((manejador) => manejador.registrar(busDeEventos));

  const publicador = new EventOutboxPublisher(outbox);
  const modulos = Object.freeze({
    auth, auditoria, parametrizacion, menu, pedidos, inventario, solicitudes, cotizaciones, ordenes, tablero, promociones, precioSugerido, parametros,
  });
  const facade = new SistemaFacade({ modulos, db, registrador });

  return {
    facade,
    registrador,
    /** Arranca el publicador del Outbox (lee la tabla outbox y publica en el bus). */
    iniciarEventos: () => publicador.iniciar(),
    /** Apagado ordenado: detiene el publicador y cierra el pool de conexiones. */
    detener: async () => {
      await publicador.detener();
      correo.cerrar?.();
      await cerrarBaseDeDatos();
    },
  };
}
