/**
 * Adapter de la API de redes sociales (CU-15). Implementa ITendenciasService.
 *
 * Contrato HTTP asumido (ajustar si la API real difiere):
 *   GET {REDES_API_URL}/tendencias?categoria=gastronomia&pais=CO&limite=<n>
 *   Authorization: Bearer {REDES_API_TOKEN}
 *   200 -> { "tendencias": [ { "termino": "ceviche", "puntaje": 87, "fuente": "instagram" } ] }
 *          (también se acepta un arreglo directo)
 */
import { env } from '../../config/env.js';
import { ITendenciasService } from '../../domain/services/ITendenciasService.js';
import {
  ServicioExternoError,
  CODIGOS_ERROR_SERVICIO as CODIGOS,
} from '../../domain/services/ServicioExternoError.js';
import { construirUrl, solicitarJson } from './httpSeguro.js';

const SERVICIO = 'redes_sociales';
const LIMITE_POR_DEFECTO = 10;

export class RedesSocialesAdapter extends ITendenciasService {
  #config;
  #solicitar;

  constructor({ config = env.redes, solicitar = solicitarJson } = {}) {
    super();
    this.#config = config;
    this.#solicitar = solicitar;
  }

  async obtenerTendencias({ limite = LIMITE_POR_DEFECTO } = {}) {
    if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
      throw new ServicioExternoError(SERVICIO, CODIGOS.DATOS_INVALIDOS, 'El límite debe ser un entero entre 1 y 100');
    }
    if (!this.#config.baseUrl || !this.#config.token) {
      throw new ServicioExternoError(
        SERVICIO,
        CODIGOS.CONFIGURACION,
        'Faltan REDES_API_URL o REDES_API_TOKEN en la configuración'
      );
    }

    const respuesta = await this.#solicitar({
      servicio: SERVICIO,
      url: construirUrl(this.#config.baseUrl, 'tendencias', { categoria: 'gastronomia', pais: 'CO', limite }),
      cabeceras: { Authorization: `Bearer ${this.#config.token}` },
      timeoutMs: this.#config.timeoutMs,
    });

    const crudas = Array.isArray(respuesta) ? respuesta : respuesta?.tendencias;
    if (!Array.isArray(crudas)) {
      throw new ServicioExternoError(
        SERVICIO,
        CODIGOS.RESPUESTA_INVALIDA,
        'La respuesta de tendencias no tiene el formato esperado'
      );
    }

    const porTermino = new Map();
    for (const item of crudas) {
      const termino = typeof item?.termino === 'string' ? item.termino.trim() : '';
      if (!termino) continue;
      const puntaje = Number.isFinite(Number(item.puntaje)) ? Number(item.puntaje) : 0;
      const clave = termino.toLowerCase();
      const existente = porTermino.get(clave);
      if (!existente || puntaje > existente.puntaje) {
        porTermino.set(clave, {
          termino,
          fuente: typeof item.fuente === 'string' && item.fuente.trim() ? item.fuente.trim() : 'redes_sociales',
          puntaje,
        });
      }
    }

    return [...porTermino.values()].sort((a, b) => b.puntaje - a.puntaje).slice(0, limite);
  }
}
