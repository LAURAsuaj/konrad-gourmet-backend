/** Persistencia de cotizaciones (tablas cotizacion, cotizacion_detalle y proveedor). */
import { FiltroSql } from '../../consulta.js';

const SELECT_CABECERA = `
  SELECT c.id, c.consecutivo, c.estado, c.valor_total, c.valores_registrados_en, c.solicitud_id, c.proveedor_id,
         to_char(c.plazo_maximo, 'YYYY-MM-DD') AS plazo_maximo, c.creada_en,
         pv.nombre AS proveedor, s.consecutivo AS solicitud_consecutivo`;

export class CotizacionRepository {
  async obtenerProveedor(id, db) {
    const { rows } = await db.query('SELECT id, nombre, correo, activo FROM proveedor WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async siguienteConsecutivo(db) {
    const { rows } = await db.query("SELECT nextval('seq_consecutivo_cotizacion') AS consecutivo");
    return rows[0].consecutivo;
  }

  /** Alimentos de la solicitud que el proveedor ya tiene en una cotización vigente (no rechazada). */
  async detallesYaCotizadosPorProveedor(solicitudId, proveedorId, detalleIds, db) {
    const { rows } = await db.query(
      `SELECT cd.detalle_solicitud_id
         FROM cotizacion c
         JOIN cotizacion_detalle cd ON cd.cotizacion_id = c.id
        WHERE c.solicitud_id = $1 AND c.proveedor_id = $2 AND c.estado <> 'RECHAZADA'
          AND cd.detalle_solicitud_id = ANY($3::uuid[])`,
      [solicitudId, proveedorId, detalleIds]
    );
    return rows.map((r) => r.detalle_solicitud_id);
  }

  async insertarCotizacion({ consecutivo, solicitudId, proveedorId, plazoMaximo, creadaPor }, db) {
    const { rows } = await db.query(
      `INSERT INTO cotizacion (consecutivo, solicitud_id, proveedor_id, plazo_maximo, creada_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, consecutivo, estado, creada_en`,
      [consecutivo, solicitudId, proveedorId, plazoMaximo, creadaPor]
    );
    return rows[0];
  }

  async insertarDetalles(cotizacionId, detalleIds, db) {
    await db.query(
      `INSERT INTO cotizacion_detalle (cotizacion_id, detalle_solicitud_id)
       SELECT $1, x FROM unnest($2::uuid[]) AS x`,
      [cotizacionId, detalleIds]
    );
  }

  async bloquear(id, db) {
    const { rows } = await db.query(
      'SELECT id, estado, solicitud_id, valores_registrados_en, valor_total FROM cotizacion WHERE id = $1 FOR UPDATE',
      [id]
    );
    return rows[0] ?? null;
  }

  async obtenerCabecera(id, db) {
    const { rows } = await db.query(
      `${SELECT_CABECERA}
         FROM cotizacion c
         JOIN proveedor pv ON pv.id = c.proveedor_id
         JOIN solicitud_alimentos s ON s.id = c.solicitud_id
        WHERE c.id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  async obtenerDetalle(cotizacionId, db) {
    const { rows } = await db.query(
      `SELECT cd.detalle_solicitud_id, cd.valor_unitario, d.cantidad, d.precio_sugerido_unitario,
              pr.nombre AS producto, m.nombre AS marca, um.abreviatura AS unidad
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

  async listar({ estado, solicitudId, proveedorId, pendientesDeValor, limite, offset }, db) {
    const filtro = new FiltroSql();
    if (estado) filtro.agregar('c.estado = $?', estado);
    if (solicitudId) filtro.agregar('c.solicitud_id = $?', solicitudId);
    if (proveedorId) filtro.agregar('c.proveedor_id = $?', proveedorId);
    if (pendientesDeValor) filtro.agregar("c.estado = 'ENVIADA' AND c.valores_registrados_en IS NULL");
    const { rows } = await db.query(
      `${SELECT_CABECERA}, COUNT(*) OVER() AS total
         FROM cotizacion c
         JOIN proveedor pv ON pv.id = c.proveedor_id
         JOIN solicitud_alimentos s ON s.id = c.solicitud_id
         ${filtro.where}
        ORDER BY c.creada_en DESC, c.consecutivo DESC
        LIMIT $${filtro.siguiente} OFFSET $${filtro.siguiente + 1}`,
      [...filtro.valores, limite, offset]
    );
    return rows;
  }

  // ---- Registro de valores (CU-11) ----

  async guardarValores(cotizacionId, valores, db) {
    await db.query(
      `UPDATE cotizacion_detalle cd
          SET valor_unitario = x.valor
         FROM unnest($2::uuid[], $3::numeric[]) AS x(detalle_id, valor)
        WHERE cd.cotizacion_id = $1 AND cd.detalle_solicitud_id = x.detalle_id`,
      [cotizacionId, valores.map((v) => v.detalleId), valores.map((v) => v.valorUnitario)]
    );
  }

  async calcularValorTotal(cotizacionId, db) {
    const { rows } = await db.query(
      `SELECT SUM(d.cantidad * cd.valor_unitario) AS total
         FROM cotizacion_detalle cd
         JOIN detalle_solicitud d ON d.id = cd.detalle_solicitud_id
        WHERE cd.cotizacion_id = $1`,
      [cotizacionId]
    );
    return rows[0].total;
  }

  async marcarValoresRegistrados(cotizacionId, total, db) {
    await db.query(
      'UPDATE cotizacion SET valor_total = $2, valores_registrados_en = now() WHERE id = $1',
      [cotizacionId, total]
    );
  }

  // ---- Validación automática (CU-12) ----

  /** Valor cotizado y valor sugerido de los alimentos que cubre la cotización. */
  async obtenerTotalesParaValidacion(cotizacionId, db) {
    const { rows } = await db.query(
      `SELECT c.valor_total AS cotizado_total,
              SUM(d.cantidad * d.precio_sugerido_unitario) AS sugerido_total,
              COUNT(*) FILTER (WHERE d.precio_sugerido_unitario IS NULL) AS sin_precio
         FROM cotizacion c
         JOIN cotizacion_detalle cd ON cd.cotizacion_id = c.id
         JOIN detalle_solicitud d ON d.id = cd.detalle_solicitud_id
        WHERE c.id = $1
        GROUP BY c.id`,
      [cotizacionId]
    );
    return rows[0] ?? null;
  }

  async actualizarEstado(id, estado, db) {
    await db.query('UPDATE cotizacion SET estado = $2 WHERE id = $1', [id, estado]);
  }

  async pendientesDeValidacionPorSolicitud(solicitudId, db) {
    const { rows } = await db.query(
      `SELECT id FROM cotizacion
        WHERE solicitud_id = $1 AND estado = 'ENVIADA' AND valores_registrados_en IS NOT NULL
        ORDER BY consecutivo`,
      [solicitudId]
    );
    return rows.map((r) => r.id);
  }
}
