/**
 * Persistencia de solicitudes de alimentos (tablas solicitud_alimentos y
 * detalle_solicitud), incluida la actualización del precio sugerido (CU-10).
 */
import { FiltroSql } from '../../consulta.js';

export class SolicitudRepository {
  async buscarProductos(ids, db) {
    const { rows } = await db.query(
      'SELECT id, nombre, categoria_id, unidad_id, activo FROM producto WHERE id = ANY($1::uuid[])',
      [ids]
    );
    return rows;
  }

  async categoriasActivas(ids, db) {
    const { rows } = await db.query('SELECT id FROM categoria WHERE id = ANY($1::uuid[]) AND activo', [ids]);
    return rows.map((r) => r.id);
  }

  async marcasActivas(ids, db) {
    const { rows } = await db.query('SELECT id FROM marca WHERE id = ANY($1::uuid[]) AND activo', [ids]);
    return rows.map((r) => r.id);
  }

  async insertarSolicitud({ puntoId, solicitanteId }, db) {
    const { rows } = await db.query(
      `INSERT INTO solicitud_alimentos (punto_id, solicitante_id)
       VALUES ($1, $2) RETURNING id, consecutivo, estado, fecha`,
      [puntoId, solicitanteId]
    );
    return rows[0];
  }

  async insertarDetalles(solicitudId, items, db) {
    await db.query(
      `INSERT INTO detalle_solicitud (solicitud_id, categoria_id, producto_id, marca_id, cantidad, unidad_id)
       SELECT $1, x.categoria_id, x.producto_id, x.marca_id, x.cantidad, x.unidad_id
         FROM unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::numeric[], $6::uuid[])
              AS x(categoria_id, producto_id, marca_id, cantidad, unidad_id)`,
      [
        solicitudId,
        items.map((i) => i.categoriaId),
        items.map((i) => i.productoId),
        items.map((i) => i.marcaId),
        items.map((i) => i.cantidad),
        items.map((i) => i.unidadId),
      ]
    );
  }

  async obtenerCabecera(id, db) {
    const { rows } = await db.query(
      `SELECT s.id, s.consecutivo, s.estado, s.fecha, s.valor_total_sugerido, s.punto_id,
              pu.nombre AS punto, u.nombre AS solicitante
         FROM solicitud_alimentos s
         JOIN punto pu ON pu.id = s.punto_id
         JOIN usuario u ON u.id = s.solicitante_id
        WHERE s.id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async bloquear(id, db) {
    const { rows } = await db.query('SELECT id, estado FROM solicitud_alimentos WHERE id = $1 FOR UPDATE', [id]);
    return rows[0] ?? null;
  }

  async obtenerItems(solicitudId, db, { ids = null } = {}) {
    const { rows } = await db.query(
      `SELECT d.id, d.cantidad, d.precio_sugerido_unitario,
              c.nombre AS categoria, pr.nombre AS producto, m.nombre AS marca, um.abreviatura AS unidad
         FROM detalle_solicitud d
         JOIN categoria c ON c.id = d.categoria_id
         JOIN producto pr ON pr.id = d.producto_id
         LEFT JOIN marca m ON m.id = d.marca_id
         JOIN unidad_medida um ON um.id = d.unidad_id
        WHERE d.solicitud_id = $1 AND ($2::uuid[] IS NULL OR d.id = ANY($2::uuid[]))
        ORDER BY pr.nombre, m.nombre NULLS FIRST`,
      [solicitudId, ids]
    );
    return rows;
  }

  async obtenerCotizacionesResumen(solicitudId, db) {
    const { rows } = await db.query(
      `SELECT c.id, c.consecutivo, c.estado, c.valor_total, to_char(c.plazo_maximo, 'YYYY-MM-DD') AS plazo_maximo,
              pv.nombre AS proveedor
         FROM cotizacion c
         JOIN proveedor pv ON pv.id = c.proveedor_id
        WHERE c.solicitud_id = $1
        ORDER BY c.consecutivo`,
      [solicitudId]
    );
    return rows;
  }

  async listar({ desde, hasta, estado, puntoId, productoId, marcaId, limite, offset }, db) {
    const filtro = new FiltroSql();
    if (desde) filtro.agregar('s.fecha >= $?', desde);
    if (hasta) filtro.agregar('s.fecha <= $?', hasta);
    if (estado) filtro.agregar('s.estado = $?', estado);
    if (puntoId) filtro.agregar('s.punto_id = $?', puntoId);
    if (productoId && marcaId) {
      filtro.agregar(
        'EXISTS (SELECT 1 FROM detalle_solicitud d WHERE d.solicitud_id = s.id AND d.producto_id = $? AND d.marca_id = $?)',
        productoId,
        marcaId
      );
    } else if (productoId) {
      filtro.agregar('EXISTS (SELECT 1 FROM detalle_solicitud d WHERE d.solicitud_id = s.id AND d.producto_id = $?)', productoId);
    } else if (marcaId) {
      filtro.agregar('EXISTS (SELECT 1 FROM detalle_solicitud d WHERE d.solicitud_id = s.id AND d.marca_id = $?)', marcaId);
    }
    const { rows } = await db.query(
      `SELECT s.id, s.consecutivo, s.estado, s.fecha, s.valor_total_sugerido,
              pu.nombre AS punto, u.nombre AS solicitante,
              (SELECT COUNT(*) FROM detalle_solicitud d WHERE d.solicitud_id = s.id) AS items,
              COUNT(*) OVER() AS total
         FROM solicitud_alimentos s
         JOIN punto pu ON pu.id = s.punto_id
         JOIN usuario u ON u.id = s.solicitante_id
         ${filtro.where}
        ORDER BY s.fecha DESC, s.consecutivo DESC
        LIMIT $${filtro.siguiente} OFFSET $${filtro.siguiente + 1}`,
      [...filtro.valores, limite, offset]
    );
    return rows;
  }

  /** Alimentos de varias solicitudes en una sola consulta (para el listado, CU-08). */
  async obtenerItemsDeSolicitudes(solicitudIds, db) {
    if (solicitudIds.length === 0) return [];
    const { rows } = await db.query(
      `SELECT d.solicitud_id, pr.nombre AS producto, m.nombre AS marca, d.cantidad, um.abreviatura AS unidad
         FROM detalle_solicitud d
         JOIN producto pr ON pr.id = d.producto_id
         JOIN unidad_medida um ON um.id = d.unidad_id
         LEFT JOIN marca m ON m.id = d.marca_id
        WHERE d.solicitud_id = ANY($1::uuid[])
        ORDER BY pr.nombre, m.nombre NULLS FIRST`,
      [solicitudIds]
    );
    return rows;
  }

  /** Pasa a EN TRÁMITE solo si TODOS sus alimentos ya tienen alguna cotización (CU-09). */
  async pasarAEnTramiteSiCotizada(solicitudId, db) {
    const { rowCount } = await db.query(
      `UPDATE solicitud_alimentos s
          SET estado = 'EN TRÁMITE'
        WHERE s.id = $1 AND s.estado = 'PENDIENTE'
          AND NOT EXISTS (
                SELECT 1 FROM detalle_solicitud d
                 WHERE d.solicitud_id = s.id
                   AND NOT EXISTS (SELECT 1 FROM cotizacion_detalle cd WHERE cd.detalle_solicitud_id = d.id))`,
      [solicitudId]
    );
    return rowCount;
  }

  // ---- Precio sugerido (CU-10) ----

  async obtenerItemsParaPrecio(solicitudId, db) {
    const { rows } = await db.query(
      `SELECT d.id, d.producto_id, pr.nombre AS producto, um.abreviatura AS unidad, d.cantidad,
              d.precio_sugerido_unitario AS precio
         FROM detalle_solicitud d
         JOIN producto pr ON pr.id = d.producto_id
         JOIN unidad_medida um ON um.id = d.unidad_id
        WHERE d.solicitud_id = $1
        ORDER BY pr.nombre`,
      [solicitudId]
    );
    return rows;
  }

  async actualizarPreciosItems(precios, db) {
    if (precios.length === 0) return;
    await db.query(
      `UPDATE detalle_solicitud d
          SET precio_sugerido_unitario = x.precio
         FROM unnest($1::uuid[], $2::numeric[]) AS x(id, precio)
        WHERE d.id = x.id`,
      [precios.map((p) => p.detalleId), precios.map((p) => p.precio)]
    );
  }

  /** @returns {Promise<{total: string|null, faltantes: number}>} */
  async calcularTotalSugerido(solicitudId, db) {
    const { rows } = await db.query(
      `SELECT SUM(cantidad * precio_sugerido_unitario) AS total,
              COUNT(*) FILTER (WHERE precio_sugerido_unitario IS NULL) AS faltantes
         FROM detalle_solicitud WHERE solicitud_id = $1`,
      [solicitudId]
    );
    return { total: rows[0].total, faltantes: Number(rows[0].faltantes) };
  }

  async actualizarTotalSugerido(solicitudId, total, db) {
    await db.query('UPDATE solicitud_alimentos SET valor_total_sugerido = $2 WHERE id = $1', [solicitudId, total]);
  }

  async listarPendientesDePrecio(limite, db) {
    const { rows } = await db.query(
      'SELECT id FROM solicitud_alimentos WHERE valor_total_sugerido IS NULL ORDER BY fecha LIMIT $1',
      [limite]
    );
    return rows.map((r) => r.id);
  }
}
