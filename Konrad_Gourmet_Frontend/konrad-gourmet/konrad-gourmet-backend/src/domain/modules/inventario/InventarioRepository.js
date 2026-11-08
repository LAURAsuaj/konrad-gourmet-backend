/**
 * Persistencia de inventario y descuento diario (tablas inventario,
 * movimiento_inventario y pedido). Los métodos que bloquean filas deben
 * ejecutarse dentro de una transacción.
 *
 * Convención: movimiento_inventario.cantidad es la variación con signo
 * (negativa en los descuentos, positiva en los reabastecimientos).
 */
export class InventarioRepository {
  /** Bloquea los pedidos aún no descontados, registrados hasta `hasta` (reejecución sin duplicar, SRS 6.2). */
  async bloquearPedidosPendientes(hasta, db) {
    const { rows } = await db.query(
      `SELECT id, punto_id FROM pedido
        WHERE descontado_en IS NULL AND fecha <= $1
        ORDER BY fecha
        FOR UPDATE`,
      [hasta]
    );
    return rows;
  }

  /** Consumo por punto y producto según los ingredientes de cada plato vendido. */
  async calcularConsumo(pedidoIds, db) {
    const { rows } = await db.query(
      `SELECT pe.punto_id, pi.producto_id, SUM(pd.cantidad * pi.cantidad_por_porcion) AS consumo
         FROM pedido pe
         JOIN pedido_detalle pd ON pd.pedido_id = pe.id
         JOIN plato_ingrediente pi ON pi.plato_id = pd.plato_id
        WHERE pe.id = ANY($1::uuid[])
        GROUP BY pe.punto_id, pi.producto_id
        ORDER BY pe.punto_id, pi.producto_id`,
      [pedidoIds]
    );
    return rows;
  }

  async platosSinIngredientes(pedidoIds, db) {
    const { rows } = await db.query(
      `SELECT DISTINCT pl.id, pl.nombre, pl.punto_id
         FROM pedido_detalle pd
         JOIN plato pl ON pl.id = pd.plato_id
        WHERE pd.pedido_id = ANY($1::uuid[])
          AND NOT EXISTS (SELECT 1 FROM plato_ingrediente x WHERE x.plato_id = pl.id)`,
      [pedidoIds]
    );
    return rows;
  }

  /**
   * Descuenta sin dejar saldos negativos: resta el menor entre el consumo y lo disponible.
   * @returns {Promise<{id, descontado, saldo, insuficiente: boolean}|null>} null si el producto no tiene inventario
   */
  async descontar(puntoId, productoId, consumo, db) {
    const { rows } = await db.query(
      `WITH previo AS (
         SELECT id, cantidad_actual FROM inventario
          WHERE punto_id = $1 AND producto_id = $2
          FOR UPDATE)
       UPDATE inventario i
          SET cantidad_actual = i.cantidad_actual - LEAST(p.cantidad_actual, $3::numeric)
         FROM previo p
        WHERE i.id = p.id
        RETURNING i.id,
                  LEAST(p.cantidad_actual, $3::numeric) AS descontado,
                  i.cantidad_actual AS saldo,
                  ($3::numeric > p.cantidad_actual) AS insuficiente`,
      [puntoId, productoId, consumo]
    );
    return rows[0] ?? null;
  }

  async insertarMovimiento({ inventarioId, tipo, cantidad, saldo, detalle = null }, db) {
    await db.query(
      `INSERT INTO movimiento_inventario (inventario_id, tipo, cantidad, saldo_resultante, detalle)
       VALUES ($1, $2, $3, $4, $5)`,
      [inventarioId, tipo, cantidad, saldo, detalle]
    );
  }

  async marcarPedidosDescontados(pedidoIds, db) {
    await db.query('UPDATE pedido SET descontado_en = now() WHERE id = ANY($1::uuid[])', [pedidoIds]);
  }

  async buscarPorPuntoProducto(puntoId, productoId, db) {
    const { rows } = await db.query(
      'SELECT id FROM inventario WHERE punto_id = $1 AND producto_id = $2',
      [puntoId, productoId]
    );
    return rows[0] ?? null;
  }

  async crear({ puntoId, productoId, cantidadActual, cantidadReferencia }, db) {
    const { rows } = await db.query(
      `INSERT INTO inventario (punto_id, producto_id, cantidad_actual, cantidad_referencia)
       VALUES ($1, $2, $3, $4)
       RETURNING id, cantidad_actual, cantidad_referencia, cantidad_actual AS delta`,
      [puntoId, productoId, cantidadActual, cantidadReferencia]
    );
    return rows[0];
  }

  /** Reemplaza las cantidades y devuelve la variación respecto al saldo anterior. */
  async actualizar(inventarioId, { cantidadActual, cantidadReferencia }, db) {
    const { rows } = await db.query(
      `WITH previo AS (SELECT id, cantidad_actual FROM inventario WHERE id = $1 FOR UPDATE)
       UPDATE inventario i
          SET cantidad_actual = $2::numeric, cantidad_referencia = $3::numeric
         FROM previo p
        WHERE i.id = p.id
        RETURNING i.id, i.cantidad_actual, i.cantidad_referencia, (i.cantidad_actual - p.cantidad_actual) AS delta`,
      [inventarioId, cantidadActual, cantidadReferencia]
    );
    return rows[0];
  }

  async listarPorPunto(puntoId, db) {
    const { rows } = await db.query(
      `SELECT i.id, i.producto_id, pr.nombre AS producto, u.abreviatura AS unidad,
              i.cantidad_actual, i.cantidad_referencia,
              ROUND(i.cantidad_actual / i.cantidad_referencia * 100, 1) AS porcentaje,
              EXISTS (SELECT 1 FROM alarma a WHERE a.inventario_id = i.id AND a.activa) AS en_alarma
         FROM inventario i
         JOIN producto pr ON pr.id = i.producto_id
         JOIN unidad_medida u ON u.id = pr.unidad_id
        WHERE i.punto_id = $1
        ORDER BY pr.nombre`,
      [puntoId]
    );
    return rows;
  }
}
