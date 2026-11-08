/**
 * Acceso genérico a los catálogos de CatalogosDefinicion.js. Las tablas y
 * columnas salen de la definición (lista blanca); los valores siempre van
 * como parámetros.
 */
import { FiltroSql } from '../../consulta.js';

export class CatalogoRepository {
  async listar(def, { incluirInactivos, filtros }, db) {
    const filtro = new FiltroSql();
    if (!incluirInactivos) filtro.agregar('activo');
    for (const campo of def.campos.filter((c) => c.filtrable)) {
      if (filtros[campo.campo]) filtro.agregar(`${campo.columna} = $?`, filtros[campo.campo]);
    }
    const columnas = def.campos.map((c) => c.columna).join(', ');
    const { rows } = await db.query(
      `SELECT id, ${columnas}, activo FROM ${def.tabla} ${filtro.where} ORDER BY ${def.orden}`,
      filtro.valores
    );
    return rows;
  }

  async buscar(def, id, db) {
    const columnas = def.campos.map((c) => c.columna).join(', ');
    const { rows } = await db.query(`SELECT id, ${columnas}, activo FROM ${def.tabla} WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async existeNombre(def, nombre, excluirId, db) {
    const { rowCount } = await db.query(
      `SELECT 1 FROM ${def.tabla} WHERE lower(nombre) = lower($1) AND ($2::uuid IS NULL OR id <> $2)`,
      [nombre, excluirId]
    );
    return rowCount > 0;
  }

  /** @param {Record<string, any>} valores clave = columna */
  async insertar(def, valores, db) {
    const columnas = Object.keys(valores);
    const marcadores = columnas.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db.query(
      `INSERT INTO ${def.tabla} (${columnas.join(', ')}) VALUES (${marcadores}) RETURNING id`,
      columnas.map((c) => valores[c])
    );
    return rows[0].id;
  }

  async actualizar(def, id, valores, db) {
    const columnas = Object.keys(valores);
    const asignaciones = columnas.map((c, i) => `${c} = $${i + 2}`).join(', ');
    await db.query(`UPDATE ${def.tabla} SET ${asignaciones} WHERE id = $1`, [id, ...columnas.map((c) => valores[c])]);
  }

  async eliminar(def, id, db) {
    const { rowCount } = await db.query(`DELETE FROM ${def.tabla} WHERE id = $1`, [id]);
    return rowCount;
  }
}
