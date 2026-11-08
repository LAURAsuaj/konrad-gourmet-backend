/** Persistencia de alarmas de stock bajo (tabla alarma). */
export class AlarmaRepository {
  /** Estado actual de inventario con los datos necesarios para evaluar y notificar. */
  async obtenerNiveles(inventarioIds, db) {
    const { rows } = await db.query(
      `SELECT i.id AS inventario_id, i.punto_id, pu.nombre AS punto,
              i.producto_id, pr.nombre AS producto, u.abreviatura AS unidad,
              i.cantidad_actual, i.cantidad_referencia
         FROM inventario i
         JOIN punto pu ON pu.id = i.punto_id
         JOIN producto pr ON pr.id = i.producto_id
         JOIN unidad_medida u ON u.id = pr.unidad_id
        WHERE i.id = ANY($1::uuid[])`,
      [inventarioIds]
    );
    return rows;
  }

  /** Crea la alarma activa; devuelve null si ya existe una (no se repite, CU-07 EXCEP-1). */
  async crearSiNoExiste(inventarioId, cantidadActual, db) {
    const { rows } = await db.query(
      `INSERT INTO alarma (inventario_id, cantidad_al_generar)
       VALUES ($1, $2)
       ON CONFLICT (inventario_id) WHERE activa DO NOTHING
       RETURNING id`,
      [inventarioId, cantidadActual]
    );
    return rows[0]?.id ?? null;
  }

  /** Cierra la alarma activa cuando el producto fue reabastecido. @returns {Promise<number>} alarmas cerradas */
  async resolverActiva(inventarioId, db) {
    const { rowCount } = await db.query(
      'UPDATE alarma SET activa = false, resuelta_en = now() WHERE inventario_id = $1 AND activa',
      [inventarioId]
    );
    return rowCount;
  }

  /** Alarmas activas del punto, para mostrarlas en la aplicación al Jefe de Cocina. */
  async listarActivasPorPunto(puntoId, db) {
    const { rows } = await db.query(
      `SELECT a.id, a.generada_en, a.cantidad_al_generar,
              pr.nombre AS producto, u.abreviatura AS unidad,
              i.cantidad_actual, i.cantidad_referencia
         FROM alarma a
         JOIN inventario i ON i.id = a.inventario_id
         JOIN producto pr ON pr.id = i.producto_id
         JOIN unidad_medida u ON u.id = pr.unidad_id
        WHERE i.punto_id = $1 AND a.activa
        ORDER BY a.generada_en DESC`,
      [puntoId]
    );
    return rows;
  }
}
