/**
 * Persistencia y consultas de apoyo para las notificaciones (tabla notificacion).
 * Los datos que necesita cada notificación se leen aquí a partir de los
 * identificadores que viajan en los eventos.
 */
export class NotificacionRepository {
  /** Datos de la solicitud para la confirmación al Jefe de Cocina (CU-05). */
  async obtenerDatosConfirmacion(solicitudId, db) {
    const { rows } = await db.query(
      `SELECT s.id, s.consecutivo, s.estado, s.fecha,
              u.id AS solicitante_id, u.nombre AS solicitante_nombre, u.correo AS solicitante_correo,
              pu.nombre AS punto
         FROM solicitud_alimentos s
         JOIN usuario u ON u.id = s.solicitante_id
         JOIN punto pu ON pu.id = s.punto_id
        WHERE s.id = $1`,
      [solicitudId]
    );
    if (rows.length === 0) return null;
    const solicitud = rows[0];

    const items = await db.query(
      `SELECT pr.nombre AS producto, d.cantidad, um.abreviatura AS unidad, m.nombre AS marca
         FROM detalle_solicitud d
         JOIN producto pr ON pr.id = d.producto_id
         JOIN unidad_medida um ON um.id = d.unidad_id
         LEFT JOIN marca m ON m.id = d.marca_id
        WHERE d.solicitud_id = $1
        ORDER BY pr.nombre`,
      [solicitudId]
    );

    return {
      solicitud: {
        id: solicitud.id,
        consecutivo: solicitud.consecutivo,
        estado: solicitud.estado,
        fecha: solicitud.fecha,
      },
      solicitante: {
        id: solicitud.solicitante_id,
        nombre: solicitud.solicitante_nombre,
        correo: solicitud.solicitante_correo,
      },
      punto: { nombre: solicitud.punto },
      items: items.rows.map((i) => ({
        producto: i.producto,
        cantidad: Number(i.cantidad),
        unidad: i.unidad,
        marca: i.marca,
      })),
    };
  }

  /** Producto, cantidades y punto de una alarma, para armar su notificación (CU-07). */
  async obtenerContextoAlarma(alarmaId, db) {
    const { rows } = await db.query(
      `SELECT a.id, a.generada_en, a.cantidad_al_generar,
              i.cantidad_referencia, i.punto_id, pu.nombre AS punto,
              i.producto_id, pr.nombre AS producto, u.abreviatura AS unidad
         FROM alarma a
         JOIN inventario i ON i.id = a.inventario_id
         JOIN punto pu ON pu.id = i.punto_id
         JOIN producto pr ON pr.id = i.producto_id
         JOIN unidad_medida u ON u.id = pr.unidad_id
        WHERE a.id = $1`,
      [alarmaId]
    );
    return rows[0] ?? null;
  }

  async obtenerPromocion(promocionId, db) {
    const { rows } = await db.query(
      `SELECT p.id, p.titulo, p.descripcion, p.origen, pr.nombre AS producto
         FROM promocion p
         LEFT JOIN producto pr ON pr.id = p.producto_id
        WHERE p.id = $1`,
      [promocionId]
    );
    return rows[0] ?? null;
  }

  /** Jefes de Cocina activos; con `puntoId` solo los de ese punto. */
  async obtenerJefesCocina({ puntoId = null } = {}, db) {
    const { rows } = await db.query(
      `SELECT id, nombre, correo
         FROM usuario
        WHERE rol = 'JEFE_COCINA' AND activo AND ($1::uuid IS NULL OR punto_id = $1)
        ORDER BY nombre`,
      [puntoId]
    );
    return rows;
  }

  /** Notificación ya creada para este evento y destinatario (evita duplicados al reintentar). */
  async buscarPorEvento({ tipo, eventoId, usuarioId }, db) {
    const { rows } = await db.query(
      `SELECT id, estado FROM notificacion
        WHERE tipo = $1 AND referencia->>'eventoId' = $2
          AND usuario_destino_id IS NOT DISTINCT FROM $3::uuid
        LIMIT 1`,
      [tipo, eventoId, usuarioId ?? null]
    );
    return rows[0] ?? null;
  }

  async guardar(notificacion, eventoId, db) {
    const { rows } = await db.query(
      `INSERT INTO notificacion (tipo, usuario_destino_id, correo_destino, asunto, cuerpo, referencia)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id`,
      [
        notificacion.tipo,
        notificacion.destinatario.usuarioId ?? null,
        notificacion.destinatario.correo ?? null,
        notificacion.asunto,
        notificacion.cuerpo,
        JSON.stringify({ ...notificacion.referencia, eventoId }),
      ]
    );
    return rows[0].id;
  }

  async actualizarEstado(id, estado, db) {
    await db.query(
      `UPDATE notificacion
          SET estado = $2, enviada_en = CASE WHEN $2 = 'ENVIADA' THEN now() ELSE enviada_en END
        WHERE id = $1`,
      [id, estado]
    );
  }
}
