/** Persistencia de pedidos por mesa (tablas pedido y pedido_detalle). */
export class PedidoRepository {
  async mesaActivaDelPunto(mesaId, puntoId, db) {
    const { rows } = await db.query(
      'SELECT id, numero FROM mesa WHERE id = $1 AND punto_id = $2 AND activo',
      [mesaId, puntoId]
    );
    return rows[0] ?? null;
  }

  async platosDelPunto(ids, puntoId, db) {
    const { rows } = await db.query(
      'SELECT id, nombre, activo FROM plato WHERE id = ANY($1::uuid[]) AND punto_id = $2',
      [ids, puntoId]
    );
    return rows;
  }

  async insertarPedido({ puntoId, mesaId, meseroId }, db) {
    const { rows } = await db.query(
      'INSERT INTO pedido (punto_id, mesa_id, mesero_id) VALUES ($1, $2, $3) RETURNING id, fecha',
      [puntoId, mesaId, meseroId]
    );
    return rows[0];
  }

  async insertarDetalle(pedidoId, items, db) {
    await db.query(
      `INSERT INTO pedido_detalle (pedido_id, plato_id, cantidad)
       SELECT $1, x.plato_id, x.cantidad FROM unnest($2::uuid[], $3::int[]) AS x(plato_id, cantidad)`,
      [pedidoId, items.map((i) => i.platoId), items.map((i) => i.cantidad)]
    );
  }

  async listar({ puntoId, desde, hasta, limite }, db) {
    const { rows } = await db.query(
      `SELECT pe.id, pe.fecha, m.numero AS mesa, u.nombre AS mesero, pe.descontado_en,
              json_agg(json_build_object('platoId', pd.plato_id, 'plato', pl.nombre, 'cantidad', pd.cantidad)
                       ORDER BY pl.nombre) AS items
         FROM pedido pe
         JOIN mesa m ON m.id = pe.mesa_id
         JOIN usuario u ON u.id = pe.mesero_id
         JOIN pedido_detalle pd ON pd.pedido_id = pe.id
         JOIN plato pl ON pl.id = pd.plato_id
        WHERE pe.punto_id = $1 AND pe.fecha >= $2 AND pe.fecha <= $3
        GROUP BY pe.id, m.numero, u.nombre
        ORDER BY pe.fecha DESC
        LIMIT $4`,
      [puntoId, desde, hasta, limite]
    );
    return rows;
  }
}
