/**
 * Módulo Solicitudes (CU-05 y CU-08).
 *
 * registrarSolicitud guarda la solicitud (estado PENDIENTE, consecutivo
 * automático) y el evento SolicitudRegistrada en la MISMA transacción; la
 * confirmación por correo y la consulta del precio sugerido ocurren después,
 * de forma asíncrona, en los manejadores (la fachada responde sin esperarlas).
 */
import { ROLES, exigirPuntoDelActor, exigirRol } from '../auth/roles.js';
import { ESTADOS_SOLICITUD } from './estados.js';
import { ErrorNoEncontrado, ErrorValidacion, traducirErrorPersistencia } from '../../errors/ErroresDeNegocio.js';
import { TIPOS_EVENTO } from '../../events/BusDeEventos.js';
import { exigirRangoFechas, normalizarPaginacion } from '../../consulta.js';
import { exigirLista, exigirNumeroPositivo, exigirObjeto, exigirUuid } from '../../validacion.js';

export class SolicitudService {
  #db;
  #unidadDeTrabajo;
  #solicitudes;
  #registrarEvento;

  constructor({ db, unidadDeTrabajo, solicitudes, registrarEvento }) {
    this.#db = db;
    this.#unidadDeTrabajo = unidadDeTrabajo;
    this.#solicitudes = solicitudes;
    this.#registrarEvento = registrarEvento;
  }

  /** @returns {Promise<{id, consecutivo, estado, fecha, puntoId, items}>} */
  async registrarSolicitud(actor, datos) {
    exigirRol(actor, [ROLES.JEFE_COCINA]);
    const puntoId = exigirPuntoDelActor(actor);
    exigirObjeto(datos, 'Los datos de la solicitud');
    exigirLista(datos.items, 'Los alimentos de la solicitud', { min: 1, max: 100 });

    const vistos = new Set();
    const items = datos.items.map((item, indice) => {
      const n = indice + 1;
      exigirObjeto(item, `El alimento ${n}`);
      const normalizado = {
        categoriaId: exigirUuid(item.categoriaId, `La categoría del alimento ${n}`),
        productoId: exigirUuid(item.productoId, `El producto del alimento ${n}`),
        marcaId: item.marcaId === undefined || item.marcaId === null || item.marcaId === ''
          ? null
          : exigirUuid(item.marcaId, `La marca del alimento ${n}`),
        cantidad: exigirNumeroPositivo(item.cantidad, `La cantidad del alimento ${n}`, { max: 99_999_999 }),
        unidadId: exigirUuid(item.unidadId, `La unidad del alimento ${n}`),
      };
      const clave = `${normalizado.productoId}|${normalizado.marcaId ?? ''}`;
      if (vistos.has(clave)) {
        throw new ErrorValidacion(`El alimento ${n} está repetido; sume las cantidades en una sola línea`);
      }
      vistos.add(clave);
      return normalizado;
    });

    await this.#validarCatalogos(items);

    try {
      return await this.#unidadDeTrabajo(async (tx) => {
        const solicitud = await this.#solicitudes.insertarSolicitud({ puntoId, solicitanteId: actor.id }, tx);
        await this.#solicitudes.insertarDetalles(solicitud.id, items, tx);
        await this.#registrarEvento(tx, TIPOS_EVENTO.SOLICITUD_REGISTRADA, {
          solicitudId: solicitud.id,
          consecutivo: Number(solicitud.consecutivo),
          puntoId,
        });
        return {
          id: solicitud.id,
          consecutivo: Number(solicitud.consecutivo),
          estado: solicitud.estado,
          fecha: solicitud.fecha,
          puntoId,
          items: items.length,
        };
      });
    } catch (error) {
      throw traducirErrorPersistencia(error, { referencia: 'Un alimento, marca o unidad no existe en el catálogo' });
    }
  }

  /** Listado de solicitudes de todos los puntos con filtros (CU-08). */
  async consultarSolicitudes(actor, filtros = {}) {
    exigirRol(actor, [ROLES.AUXILIAR_COMPRAS, ROLES.DIRECTOR_COMPRAS]);
    const { desde, hasta } = exigirRangoFechas(filtros.desde, filtros.hasta);
    if (filtros.estado !== undefined && !Object.values(ESTADOS_SOLICITUD).includes(filtros.estado)) {
      throw new ErrorValidacion('El estado indicado no es válido');
    }
    const opcional = (valor, campo) => (valor === undefined || valor === null || valor === '' ? undefined : exigirUuid(valor, campo));

    const filas = await this.#solicitudes.listar(
      {
        desde,
        hasta,
        estado: filtros.estado,
        puntoId: opcional(filtros.puntoId, 'El punto'),
        productoId: opcional(filtros.productoId, 'El producto'),
        marcaId: opcional(filtros.marcaId, 'La marca'),
        ...normalizarPaginacion(filtros),
      },
      this.#db
    );
    const total = filas.length > 0 ? Number(filas[0].total) : 0;
    const alimentosPorSolicitud = new Map();
    for (const a of await this.#solicitudes.obtenerItemsDeSolicitudes(filas.map((f) => f.id), this.#db)) {
      if (!alimentosPorSolicitud.has(a.solicitud_id)) alimentosPorSolicitud.set(a.solicitud_id, []);
      alimentosPorSolicitud.get(a.solicitud_id).push({ producto: a.producto, marca: a.marca, cantidad: Number(a.cantidad), unidad: a.unidad });
    }
    return {
      total,
      solicitudes: filas.map((f) => ({
        id: f.id,
        consecutivo: Number(f.consecutivo),
        estado: f.estado,
        fecha: f.fecha,
        punto: f.punto,
        solicitante: f.solicitante,
        items: Number(f.items),
        alimentos: alimentosPorSolicitud.get(f.id) ?? [],
        valorTotalSugerido: f.valor_total_sugerido === null ? null : Number(f.valor_total_sugerido),
      })),
      ...(total === 0 ? { mensaje: 'Ninguna solicitud cumple los filtros indicados' } : {}),
    };
  }

  /** Detalle completo de una solicitud: alimentos, valor sugerido y cotizaciones (CU-08). */
  async obtenerDetalleSolicitud(actor, solicitudId) {
    exigirRol(actor, [ROLES.AUXILIAR_COMPRAS, ROLES.DIRECTOR_COMPRAS]);
    const id = exigirUuid(solicitudId, 'La solicitud');
    const cabecera = await this.#solicitudes.obtenerCabecera(id, this.#db);
    if (!cabecera) throw new ErrorNoEncontrado('La solicitud ya no está disponible');

    const [items, cotizaciones] = await Promise.all([
      this.#solicitudes.obtenerItems(id, this.#db),
      this.#solicitudes.obtenerCotizacionesResumen(id, this.#db),
    ]);
    return {
      id: cabecera.id,
      consecutivo: Number(cabecera.consecutivo),
      estado: cabecera.estado,
      fecha: cabecera.fecha,
      punto: cabecera.punto,
      solicitante: cabecera.solicitante,
      valorTotalSugerido: cabecera.valor_total_sugerido === null ? null : Number(cabecera.valor_total_sugerido),
      items: items.map((i) => ({
        id: i.id,
        categoria: i.categoria,
        producto: i.producto,
        marca: i.marca,
        cantidad: Number(i.cantidad),
        unidad: i.unidad,
        precioSugeridoUnitario: i.precio_sugerido_unitario === null ? null : Number(i.precio_sugerido_unitario),
      })),
      cotizaciones: cotizaciones.map((c) => ({
        id: c.id,
        consecutivo: Number(c.consecutivo),
        proveedor: c.proveedor,
        estado: c.estado,
        plazoMaximo: c.plazo_maximo,
        valorTotal: c.valor_total === null ? null : Number(c.valor_total),
      })),
    };
  }

  async #validarCatalogos(items) {
    const productos = new Map(
      (await this.#solicitudes.buscarProductos([...new Set(items.map((i) => i.productoId))], this.#db)).map((p) => [p.id, p])
    );
    const categorias = new Set(await this.#solicitudes.categoriasActivas([...new Set(items.map((i) => i.categoriaId))], this.#db));
    const idsMarca = [...new Set(items.map((i) => i.marcaId).filter(Boolean))];
    const marcas = new Set(idsMarca.length > 0 ? await this.#solicitudes.marcasActivas(idsMarca, this.#db) : []);

    items.forEach((item, indice) => {
      const n = indice + 1;
      const producto = productos.get(item.productoId);
      if (!producto || !producto.activo) {
        throw new ErrorValidacion(`El producto del alimento ${n} no existe o está inactivo`);
      }
      if (!categorias.has(item.categoriaId)) {
        throw new ErrorValidacion(`La categoría del alimento ${n} no existe o está inactiva`);
      }
      if (producto.categoria_id !== item.categoriaId) {
        throw new ErrorValidacion(`El producto "${producto.nombre}" no pertenece a la categoría seleccionada`);
      }
      if (producto.unidad_id !== item.unidadId) {
        throw new ErrorValidacion(`La unidad del producto "${producto.nombre}" no coincide con la unidad del catálogo`);
      }
      if (item.marcaId && !marcas.has(item.marcaId)) {
        throw new ErrorValidacion(`La marca del alimento ${n} no existe o está inactiva`);
      }
    });
  }
}
