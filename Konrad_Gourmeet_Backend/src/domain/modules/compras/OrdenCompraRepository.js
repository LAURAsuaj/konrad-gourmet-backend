/** Persistencia de órdenes de compra (tabla orden_compra). */
const SELECT_ORDEN = `
  SELECT o.id, o.consecutivo, o.valor_total, o.generada_en, o.solicitud_id, o.cotizacion_id,
         pv.nombre AS proveedor, s.consecutivo AS solicitud_consecutivo, c.consecutivo AS cotizacion_consecutivo,
         u.nombre AS generada_por
    FROM orden_compra o
    JOIN proveedor pv ON pv.id = o.proveedor_id
    JOIN solicitud_alimentos s ON s.id = o.solicitud_id
    JOIN cotizacion c ON c.id = o.cotizacion_id
    JOIN usuario u ON u.id = o.generada_por`;

export class OrdenCompraRepository {
  async ordenDeCotizacion(cotizacionId, db) {
    const { rows } = await db.query('SELECT id, consecutivo FROM orden_compra WHERE cotizacion_id = $1', [cotizacionId]);
    return rows[0] ?? null;
  }

  async insertar({ cotizacionId, solicitudId, proveedorId, valorTotal, generadaPor }, db) {
    const { rows } = await db.query(
      `INSERT INTO orden_compra (cotizacion_id, solicitud_id, proveedor_id, valor_total, generada_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, consecutivo`,
      [cotizacionId, solicitudId, proveedorId, valorTotal, generadaPor]
    );
    return rows[0];
  }

  async proveedorDeCotizacion(cotizacionId, db) {
    const { rows } = await db.query('SELECT proveedor_id FROM cotizacion WHERE id = $1', [cotizacionId]);
    return rows[0]?.proveedor_id ?? null;
  }

  async obtener(id, db) {
    const { rows } = await db.query(`${SELECT_ORDEN} WHERE o.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async obtenerItems(cotizacionId, db) {
    const { rows } = await db.query(
      `SELECT pr.nombre AS producto, m.nombre AS marca, um.abreviatura AS unidad, d.cantidad, cd.valor_unitario,
              (d.cantidad * cd.valor_unitario) AS subtotal
         FROM cotizacion_detalle cd
         JOIN detalle_solicitud d ON d.id = cd.detalle_solicitud_id
         JOIN producto pr ON pr.id = d.producto_id
         LEFT JOIN marca m ON m.id = d.marca_id
         JOIN unidad_medida um ON um.id = d.unidad_id
        WHERE cd.cotizacion_id = $1
        ORDER BY pr.nombre, m.nombre NULLS FIRST`,
      [cotizacionId]
    );
    return rows;
  }

  async listar({ solicitudId, limite, offset }, db) {
    const { rows } = await db.query(
      `${SELECT_ORDEN.replace('SELECT o.id', 'SELECT COUNT(*) OVER() AS total, o.id')}
        WHERE ($1::uuid IS NULL OR o.solicitud_id = $1)
        ORDER BY o.generada_en DESC, o.consecutivo DESC
        LIMIT $2 OFFSET $3`,
      [solicitudId ?? null, limite, offset]
    );
    return rows;
  }
}
