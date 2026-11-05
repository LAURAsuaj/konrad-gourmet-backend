/**
 * Adapter del servicio web del Ministerio de Comercio (CU-10, CU-12).
 * Implementa IPrecioSugeridoService.
 *
 * Contrato HTTP asumido (ajustar si el servicio real difiere):
 *   GET {MINCOMERCIO_API_URL}/precios-sugeridos?producto=<nombre>&unidad=<unidad>
 *   Authorization: Bearer {MINCOMERCIO_API_KEY}
 *   200 -> { "precioSugerido": 4500 }   (también se acepta "precio_sugerido" o "valor")
 *   404 -> el Ministerio no tiene precio para el producto
 *
 * Reglas:
 * - Fallos por producto (sin precio, valor inválido, servicio caído) NO tumban
 *   la consulta completa: se informan por producto con su motivo.
 * - Solo si TODOS los productos fallan por indisponibilidad se lanza
 *   ServicioExternoError, para que el manejador registre el error y reintente.
 */
import { env } from '../../config/env.js';
import { IPrecioSugeridoService, MOTIVOS_SIN_PRECIO } from '../../domain/services/IPrecioSugeridoService.js';
import {
  ServicioExternoError,
  CODIGOS_ERROR_SERVICIO as CODIGOS,
} from '../../domain/services/ServicioExternoError.js';
import { construirUrl, solicitarJson } from './httpSeguro.js';

const SERVICIO = 'ministerio_comercio';
const CONSULTAS_SIMULTANEAS = 5;

export class MinisterioComercioAdapter extends IPrecioSugeridoService {
  #config;
  #solicitar;

  constructor({ config = env.ministerio, solicitar = solicitarJson } = {}) {
    super();
    this.#config = config;
    this.#solicitar = solicitar;
  }

  async consultarPrecios(productos) {
    if (!Array.isArray(productos)) {
      throw new ServicioExternoError(SERVICIO, CODIGOS.DATOS_INVALIDOS, 'Se esperaba una lista de productos');
    }
    if (productos.length === 0) return [];
    for (const producto of productos) {
      if (!producto?.id || !producto?.nombre) {
        throw new ServicioExternoError(
          SERVICIO,
          CODIGOS.DATOS_INVALIDOS,
          'Cada producto requiere id y nombre para consultar su precio'
        );
      }
    }
    this.#validarConfiguracion();

    const resultados = [];
    for (let i = 0; i < productos.length; i += CONSULTAS_SIMULTANEAS) {
      const lote = productos.slice(i, i + CONSULTAS_SIMULTANEAS);
      resultados.push(...(await Promise.all(lote.map((producto) => this.#consultarProducto(producto)))));
    }

    const caidos = resultados.filter((r) => r.motivo === MOTIVOS_SIN_PRECIO.SERVICIO_NO_DISPONIBLE);
    if (caidos.length === resultados.length) {
      throw caidos[0].errorOriginal;
    }

    return resultados.map(({ productoId, precioSugerido, motivo }) => ({ productoId, precioSugerido, motivo }));
  }

  #validarConfiguracion() {
    if (!this.#config.baseUrl || !this.#config.apiKey) {
      throw new ServicioExternoError(
        SERVICIO,
        CODIGOS.CONFIGURACION,
        'Faltan MINCOMERCIO_API_URL o MINCOMERCIO_API_KEY en la configuración'
      );
    }
  }

  async #consultarProducto(producto) {
    const base = { productoId: producto.id, precioSugerido: null };
    try {
      const url = construirUrl(this.#config.baseUrl, 'precios-sugeridos', {
        producto: producto.nombre,
        unidad: producto.unidad,
      });
      const respuesta = await this.#solicitar({
        servicio: SERVICIO,
        url,
        cabeceras: { Authorization: `Bearer ${this.#config.apiKey}` },
        timeoutMs: this.#config.timeoutMs,
      });

      const crudo = respuesta?.precioSugerido ?? respuesta?.precio_sugerido ?? respuesta?.valor;
      if (crudo === undefined || crudo === null) {
        return { ...base, motivo: MOTIVOS_SIN_PRECIO.SIN_PRECIO };
      }
      const precio =
        typeof crudo === 'number' ? crudo : typeof crudo === 'string' && crudo.trim() !== '' ? Number(crudo) : NaN;
      if (!Number.isFinite(precio) || precio <= 0) {
        return { ...base, motivo: MOTIVOS_SIN_PRECIO.VALOR_INVALIDO };
      }
      return { ...base, precioSugerido: precio, motivo: null };
    } catch (error) {
      if (error instanceof ServicioExternoError && error.estado === 404) {
        return { ...base, motivo: MOTIVOS_SIN_PRECIO.SIN_PRECIO };
      }
      const errorOriginal =
        error instanceof ServicioExternoError
          ? error
          : new ServicioExternoError(SERVICIO, CODIGOS.RED, error.message, { causa: error });
      return { ...base, motivo: MOTIVOS_SIN_PRECIO.SERVICIO_NO_DISPONIBLE, errorOriginal };
    }
  }
}
