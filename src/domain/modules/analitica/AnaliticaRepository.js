/**
 * Consultas de analítica sobre pedidos, solicitudes, cotizaciones y órdenes de
 * compra (CU-14 y CU-15). `desde` y `hasta` son opcionales (null = sin límite).
 *
 * Demanda de un producto = lo consumido por los pedidos (platos vendidos x
 * ingredientes) + lo solicitado en solicitudes de alimentos, ambos en la
 * unidad del producto.
 */
export class AnaliticaRepository {
  async rankingProductos({ desde = null, hasta = null, limite = 10 }, db) {
    const { rows } = await db.query(
      `WITH consumo AS (
         SELECT pi.producto_id, SUM(pd.cantidad * pi.cantidad_por_porcion) AS cantidad
           FROM pedido pe
           JOIN pedido_detalle pd ON pd.pedido_id = pe.id
           JOIN plato_ingrediente pi ON pi.plato_id = pd.plato_id
          WHERE ($1::timestamptz IS NULL OR pe.fecha >= $1) AND ($2::timestamptz IS NULL OR pe.fecha <= $2)
          GROUP BY pi.producto_id
       ), solicitado AS (
         SELECT d.producto_id, SUM(d.cantidad) AS cantidad
           FROM detalle_solicitud d
           JOIN solicitud_alimentos s ON s.id = d.solicitud_id
          WHERE ($1::timestamptz IS NULL OR s.fecha >= $1) AND ($2::timestamptz IS NULL OR s.fecha <= $2)
          GROUP BY d.producto_id
       )
       SELECT pr.id AS producto_id, pr.nombre AS producto, u.abreviatura AS unidad,
              COALESCE(c.cantidad, 0) AS consumo_pedidos,
              COALESCE(s.cantidad, 0) AS cantidad_solicitada,
              COALESCE(c.cantidad, 0) + COALESCE(s.cantidad, 0) AS demanda
         FROM producto pr
         JOIN unidad_medida u ON u.id = pr.unidad_id
         LEFT JOIN consumo c ON c.producto_id = pr.id
         LEFT JOIN solicitado s ON s.producto_id = pr.id
        WHERE c.producto_id IS NOT NULL OR s.producto_id IS NOT NULL
        ORDER BY demanda DESC, pr.nombre
        LIMIT $3`,
      [desde, hasta, limite]
    );
    return rows;
  }

  async demandaPorPunto({ desde = null, hasta = null, limite = 5 }, db) {
    const { rows } = await db.query(
      `SELECT pu.id AS punto_id, pu.nombre AS punto,
              SUM(pd.cantidad) AS platos_vendidos, COUNT(DISTINCT pe.id) AS pedidos
         FROM pedido pe
         JOIN punto pu ON pu.id = pe.punto_id
         JOIN pedido_detalle pd ON pd.pedido_id = pe.id
        WHERE ($1::timestamptz IS NULL OR pe.fecha >= $1) AND ($2::timestamptz IS NULL OR pe.fecha <= $2)
        GROUP BY pu.id, pu.nombre
        ORDER BY platos_vendidos DESC, pu.nombre
        LIMIT $3`,
      [desde, hasta, limite]
    );
    return rows;
  }

  /** Indicadores por proveedor para elegir al mejor según el criterio parametrizado. */
  async estadisticasProveedores({ desde = null, hasta = null }, db) {
    const { rows } = await db.query(
      `SELECT pv.id AS proveedor_id, pv.nombre AS proveedor,
              (SELECT COUNT(*) FROM cotizacion c
                WHERE c.proveedor_id = pv.id
                  AND ($1::timestamptz IS NULL OR c.creada_en >= $1) AND ($2::timestamptz IS NULL OR c.creada_en <= $2)) AS cotizaciones,
              (SELECT COUNT(*) FROM cotizacion c
                WHERE c.proveedor_id = pv.id AND c.estado = 'OPCIONADA'
                  AND ($1::timestamptz IS NULL OR c.creada_en >= $1) AND ($2::timestamptz IS NULL OR c.creada_en <= $2)) AS opcionadas,
              (SELECT COUNT(*) FROM orden_compra o
                WHERE o.proveedor_id = pv.id
                  AND ($1::timestamptz IS NULL OR o.generada_en >= $1) AND ($2::timestamptz IS NULL OR o.generada_en <= $2)) AS ordenes,
              (SELECT COALESCE(SUM(o.valor_total), 0) FROM orden_compra o
                WHERE o.proveedor_id = pv.id
                  AND ($1::timestamptz IS NULL OR o.generada_en >= $1) AND ($2::timestamptz IS NULL OR o.generada_en <= $2)) AS valor_ordenes,
              (SELECT AVG(t.razon) FROM (
                 SELECT c.valor_total / NULLIF(SUM(d.cantidad * d.precio_sugerido_unitario), 0) AS razon
                   FROM cotizacion c
                   JOIN cotizacion_detalle cd ON cd.cotizacion_id = c.id
                   JOIN detalle_solicitud d ON d.id = cd.detalle_solicitud_id
                  WHERE c.proveedor_id = pv.id AND c.valor_total IS NOT NULL
                    AND ($1::timestamptz IS NULL OR c.creada_en >= $1) AND ($2::timestamptz IS NULL OR c.creada_en <= $2)
                  GROUP BY c.id
                 HAVING COUNT(*) FILTER (WHERE d.precio_sugerido_unitario IS NULL) = 0) t) AS razon_promedio
         FROM proveedor pv`,
      [desde, hasta]
    );
    return rows;
  }
}
