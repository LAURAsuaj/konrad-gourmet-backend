/**
 * Módulo Cotizaciones (CU-09 y CU-11, más consultas).
 *
 * CU-09: genera el PDF, lo envía al proveedor y SOLO si el correo salió crea la
 * cotización en estado ENVIADA junto con el evento SolicitudCotizacionEnviada
 * (misma transacción). Si el correo falla, no se crea nada (EXCEP-3).
 * CU-11: guarda los valores del proveedor y publica CotizacionRegistrada, que
 * activa la validación automática (CU-12) en ManejadorValidacionCotizaciones.
 */
import { ROLES, exigirRol } from '../auth/roles.js';
import { ESTADOS_COTIZACION, ESTADOS_SOLICITUD_COTIZABLES } from './estados.js';
import {
  ErrorConflicto,
  ErrorNoEncontrado,
  ErrorServicioNoDisponible,
  ErrorValidacion,
  traducirErrorPersistencia,
} from '../../errors/ErroresDeNegocio.js';
import { TIPOS_EVENTO } from '../../events/BusDeEventos.js';
import { normalizarPaginacion } from '../../consulta.js';
import { exigirLista, exigirNumeroPositivo, exigirObjeto, exigirUuid } from '../../validacion.js';

const ZONA_HORARIA = 'America/Bogota';
const EXPRESION_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hoyEnColombia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(new Date());
}

function exigirFechaCalendario(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new ErrorValidacion('El plazo máximo debe tener el formato AAAA-MM-DD');
  }
  const fecha = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
    throw new ErrorValidacion('El plazo máximo no es una fecha válida');
  }
  return valor;
}

export class CotizacionService {
  #db;
  #unidadDeTrabajo;
  #solicitudes;
  #cotizaciones;
  #correo;
  #pdf;
  #registrarEvento;
  #registrador;

  /**
   * @param {{db, unidadDeTrabajo, solicitudes: SolicitudRepository, cotizaciones: CotizacionRepository,
   *          correo: ICorreoService, pdf: GeneradorPdfCotizacion, registrarEvento: Function,
   *          registrador: {error: Function}}} dependencias
   */
  constructor({ db, unidadDeTrabajo, solicitudes, cotizaciones, correo, pdf, registrarEvento, registrador }) {
    this.#db = db;
    this.#unidadDeTrabajo = unidadDeTrabajo;
    this.#solicitudes = solicitudes;
    this.#cotizaciones = cotizaciones;
    this.#correo = correo;
    this.#pdf = pdf;
    this.#registrarEvento = registrarEvento;
    this.#registrador = registrador;
  }

  /**
   * @param {object} actor Auxiliar de Compras
   * @param {{solicitudId: string, proveedorId: string, plazoMaximo: string, detalleIds?: string[]}} datos
   *        `detalleIds` son los alimentos a cotizar; si se omite se cotizan todos los de la solicitud.
   */
  async generarSolicitudCotizacion(actor, datos) {
    exigirRol(actor, [ROLES.AUXILIAR_COMPRAS]);
    exigirObjeto(datos, 'Los datos de la cotización');
    const solicitudId = exigirUuid(datos.solicitudId, 'La solicitud');
    if (!datos.proveedorId) throw new ErrorValidacion('Debe seleccionar un proveedor');
    const proveedorId = exigirUuid(datos.proveedorId, 'El proveedor');
    if (!datos.plazoMaximo) throw new ErrorValidacion('Debe indicar el plazo máximo para recibir la cotización');
    const plazoMaximo = exigirFechaCalendario(datos.plazoMaximo);
    if (plazoMaximo < hoyEnColombia()) {
      throw new ErrorValidacion('El plazo máximo no puede ser una fecha anterior a la actual');
    }

    const solicitud = await this.#solicitudes.obtenerCabecera(solicitudId, this.#db);
    if (!solicitud) throw new ErrorNoEncontrado('La solicitud no existe');
    if (!ESTADOS_SOLICITUD_COTIZABLES.includes(solicitud.estado)) {
      throw new ErrorValidacion(`Solo se pueden cotizar solicitudes en estado ${ESTADOS_SOLICITUD_COTIZABLES.join(' o ')}`);
    }

    const proveedor = await this.#cotizaciones.obtenerProveedor(proveedorId, this.#db);
    if (!proveedor || !proveedor.activo) throw new ErrorValidacion('El proveedor no existe o está inactivo');
    if (!proveedor.correo || !EXPRESION_CORREO.test(proveedor.correo)) {
      throw new ErrorValidacion('El proveedor no tiene un correo electrónico válido registrado; complete el dato');
    }

    let detalleIds = null;
    if (datos.detalleIds !== undefined) {
      exigirLista(datos.detalleIds, 'Los alimentos a cotizar', { min: 1, max: 100 });
      detalleIds = [...new Set(datos.detalleIds.map((id) => exigirUuid(id, 'Un alimento a cotizar')))];
    }
    const items = await this.#solicitudes.obtenerItems(solicitudId, this.#db, { ids: detalleIds });
    if (items.length === 0 || (detalleIds && items.length !== detalleIds.length)) {
      throw new ErrorValidacion('Un alimento seleccionado no pertenece a la solicitud');
    }
    const idsAcotizar = items.map((i) => i.id);

    const yaCotizados = await this.#cotizaciones.detallesYaCotizadosPorProveedor(solicitudId, proveedorId, idsAcotizar, this.#db);
    if (yaCotizados.length > 0) {
      throw new ErrorConflicto('El proveedor ya tiene una cotización vigente para uno de los alimentos seleccionados');
    }

    const consecutivo = await this.#cotizaciones.siguienteConsecutivo(this.#db);
    const pdf = await this.#pdf.generar({
      consecutivo,
      solicitud: { consecutivo: solicitud.consecutivo, punto: solicitud.punto },
      proveedor,
      plazoMaximo,
      items: items.map((i) => ({
        producto: i.producto,
        categoria: i.categoria,
        marca: i.marca,
        cantidad: Number(i.cantidad),
        unidad: i.unidad,
      })),
    });

    try {
      await this.#correo.enviarCorreo({
        para: proveedor.correo,
        asunto: `Solicitud de cotización N.º ${consecutivo} - Konrad Gourmet`,
        texto: [
          `Estimado proveedor ${proveedor.nombre},`,
          '',
          `Adjuntamos la solicitud de cotización N.º ${consecutivo} con ${items.length} alimento(s).`,
          `Le agradecemos enviar sus valores a más tardar el ${plazoMaximo}.`,
          '',
          'Konrad Gourmet',
        ].join('\n'),
        adjuntos: [{ nombre: `cotizacion-${consecutivo}.pdf`, contenido: pdf, tipoMime: 'application/pdf' }],
      });
    } catch (error) {
      if (error?.name !== 'ServicioExternoError') throw error;
      await this.#registrador.error({
        modulo: 'cotizaciones',
        mensaje: `No se pudo enviar al proveedor la solicitud de cotización N.º ${consecutivo}`,
        detalle: { solicitudId, proveedorId, codigo: error.codigo },
        error,
      });
      throw new ErrorServicioNoDisponible('No se pudo enviar el correo al proveedor; la cotización no fue generada, intente nuevamente');
    }

    try {
      return await this.#unidadDeTrabajo(async (tx) => {
        const vigente = await this.#solicitudes.bloquear(solicitudId, tx);
        if (!vigente || !ESTADOS_SOLICITUD_COTIZABLES.includes(vigente.estado)) {
          throw new ErrorConflicto('La solicitud cambió de estado mientras se generaba la cotización');
        }
        const cotizacion = await this.#cotizaciones.insertarCotizacion(
          { consecutivo, solicitudId, proveedorId, plazoMaximo, creadaPor: actor.id },
          tx
        );
        await this.#cotizaciones.insertarDetalles(cotizacion.id, idsAcotizar, tx);
        await this.#registrarEvento(tx, TIPOS_EVENTO.SOLICITUD_COTIZACION_ENVIADA, {
          cotizacionId: cotizacion.id,
          solicitudId,
          consecutivo: Number(cotizacion.consecutivo),
          proveedorId,
        });
        return {
          id: cotizacion.id,
          consecutivo: Number(cotizacion.consecutivo),
          solicitudId,
          proveedor: proveedor.nombre,
          plazoMaximo,
          estado: cotizacion.estado,
          alimentos: idsAcotizar.length,
        };
      });
    } catch (error) {
      // El proveedor ya recibió el correo: queda constancia para conciliar manualmente
      await this.#registrador.error({
        modulo: 'cotizaciones',
        mensaje: `El correo de la cotización N.º ${consecutivo} salió, pero la cotización no pudo registrarse`,
        detalle: { solicitudId, proveedorId, consecutivo: Number(consecutivo) },
        error,
      });
      throw traducirErrorPersistencia(error);
    }
  }

  /**
   * CU-11: registra el valor unitario cotizado de CADA alimento de la cotización.
   * @param {{cotizacionId: string, valores: {detalleSolicitudId: string, valorUnitario: number}[],
   *          confirmarSobrescritura?: boolean}} datos
   */
  async registrarValores(actor, datos) {
    exigirRol(actor, [ROLES.DIRECTOR_COMPRAS]);
    exigirObjeto(datos, 'Los datos de los valores');
    const cotizacionId = exigirUuid(datos.cotizacionId, 'La cotización');
    exigirLista(datos.valores, 'Los valores cotizados', { min: 1, max: 100 });

    const valores = datos.valores.map((item, indice) => {
      exigirObjeto(item, `El valor ${indice + 1}`);
      if (item.valorUnitario === undefined || item.valorUnitario === null || item.valorUnitario === '') {
        throw new ErrorValidacion(`El valor del alimento ${indice + 1} está vacío`);
      }
      return {
        detalleId: exigirUuid(item.detalleSolicitudId, `El alimento ${indice + 1}`),
        valorUnitario: exigirNumeroPositivo(item.valorUnitario, `El valor del alimento ${indice + 1}`, { max: 999_999_999 }),
      };
    });

    try {
      return await this.#unidadDeTrabajo(async (tx) => {
        const cotizacion = await this.#cotizaciones.bloquear(cotizacionId, tx);
        if (!cotizacion) throw new ErrorNoEncontrado('La cotización no existe');
        if (cotizacion.estado !== ESTADOS_COTIZACION.ENVIADA) {
          throw new ErrorValidacion(`Solo se registran valores en cotizaciones ${ESTADOS_COTIZACION.ENVIADA}S`);
        }
        if (cotizacion.valores_registrados_en && datos.confirmarSobrescritura !== true) {
          throw new ErrorConflicto('La cotización ya tiene valores registrados; confirme para sobrescribirlos');
        }

        const esperados = new Set((await this.#cotizaciones.obtenerDetalle(cotizacionId, tx)).map((d) => d.detalle_solicitud_id));
        const recibidos = new Set(valores.map((v) => v.detalleId));
        if (recibidos.size !== valores.length || recibidos.size !== esperados.size || [...recibidos].some((id) => !esperados.has(id))) {
          throw new ErrorValidacion('Debe registrar un valor para cada alimento de la cotización, sin repetir ni agregar otros');
        }

        await this.#cotizaciones.guardarValores(cotizacionId, valores, tx);
        const total = await this.#cotizaciones.calcularValorTotal(cotizacionId, tx);
        await this.#cotizaciones.marcarValoresRegistrados(cotizacionId, total, tx);
        await this.#registrarEvento(tx, TIPOS_EVENTO.COTIZACION_REGISTRADA, {
          cotizacionId,
          solicitudId: cotizacion.solicitud_id,
          valorTotal: Number(total),
        });
        return { id: cotizacionId, valorTotal: Number(total), estado: cotizacion.estado, pendienteValidacion: true };
      });
    } catch (error) {
      throw traducirErrorPersistencia(error);
    }
  }

  /** Cotizaciones con filtros. `pendientesDeValor` lista las ENVIADAS sin valores (CU-11). */
  async listarCotizaciones(actor, filtros = {}) {
    exigirRol(actor, [ROLES.AUXILIAR_COMPRAS, ROLES.DIRECTOR_COMPRAS]);
    if (filtros.estado !== undefined && !Object.values(ESTADOS_COTIZACION).includes(filtros.estado)) {
      throw new ErrorValidacion('El estado indicado no es válido');
    }
    const opcional = (valor, campo) => (valor === undefined || valor === null || valor === '' ? undefined : exigirUuid(valor, campo));
    const filas = await this.#cotizaciones.listar(
      {
        estado: filtros.estado,
        solicitudId: opcional(filtros.solicitudId, 'La solicitud'),
        proveedorId: opcional(filtros.proveedorId, 'El proveedor'),
        pendientesDeValor: filtros.pendientesDeValor === true,
        ...normalizarPaginacion(filtros),
      },
      this.#db
    );
    const total = filas.length > 0 ? Number(filas[0].total) : 0;
    return {
      total,
      cotizaciones: filas.map((f) => this.#presentarCabecera(f)),
      ...(total === 0 ? { mensaje: 'Ninguna cotización cumple los filtros indicados' } : {}),
    };
  }

  async obtenerCotizacion(actor, cotizacionId) {
    exigirRol(actor, [ROLES.AUXILIAR_COMPRAS, ROLES.DIRECTOR_COMPRAS]);
    const id = exigirUuid(cotizacionId, 'La cotización');
    const cabecera = await this.#cotizaciones.obtenerCabecera(id, this.#db);
    if (!cabecera) throw new ErrorNoEncontrado('La cotización no existe');
    const detalle = await this.#cotizaciones.obtenerDetalle(id, this.#db);
    return {
      ...this.#presentarCabecera(cabecera),
      alimentos: detalle.map((d) => ({
        detalleSolicitudId: d.detalle_solicitud_id,
        producto: d.producto,
        marca: d.marca,
        cantidad: Number(d.cantidad),
        unidad: d.unidad,
        valorUnitario: d.valor_unitario === null ? null : Number(d.valor_unitario),
        precioSugeridoUnitario: d.precio_sugerido_unitario === null ? null : Number(d.precio_sugerido_unitario),
      })),
    };
  }

  #presentarCabecera(f) {
    return {
      id: f.id,
      consecutivo: Number(f.consecutivo),
      solicitudId: f.solicitud_id,
      solicitudConsecutivo: Number(f.solicitud_consecutivo),
      proveedor: f.proveedor,
      estado: f.estado,
      plazoMaximo: f.plazo_maximo,
      valorTotal: f.valor_total === null ? null : Number(f.valor_total),
      valoresRegistrados: f.valores_registrados_en !== null,
      creadaEn: f.creada_en,
    };
  }
}
