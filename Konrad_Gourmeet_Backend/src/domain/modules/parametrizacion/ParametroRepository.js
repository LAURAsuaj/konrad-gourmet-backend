/**
 * Lectura y mantenimiento de reglas parametrizadas (tabla parametro, CU-04).
 */
export class ParametroRepository {
  /** @returns el valor JSON del parámetro o `defecto` si no existe. */
  async obtener(clave, db, defecto = null) {
    const { rows } = await db.query('SELECT valor FROM parametro WHERE clave = $1', [clave]);
    return rows.length > 0 ? rows[0].valor : defecto;
  }

  async obtenerNumero(clave, db, defecto) {
    const valor = await this.obtener(clave, db, null);
    const numero = Number(valor);
    return valor !== null && Number.isFinite(numero) ? numero : defecto;
  }

  async listar(db) {
    const { rows } = await db.query(
      'SELECT clave, valor, descripcion, actualizado_en FROM parametro ORDER BY clave'
    );
    return rows;
  }

  /** Crea o actualiza una regla (CU-04). La descripción solo se establece al crearla. */
  async guardar(clave, valor, descripcion, db) {
    const { rows } = await db.query(
      `INSERT INTO parametro (clave, valor, descripcion)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()
       RETURNING clave, valor, descripcion, actualizado_en`,
      [clave, JSON.stringify(valor), descripcion]
    );
    return rows[0];
  }
}
