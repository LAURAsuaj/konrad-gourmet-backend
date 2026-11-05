/** Persistencia de auditoría y logs de errores (tablas auditoria y log_error, inmutables por trigger). */
import { FiltroSql } from '../../consulta.js';

export class AuditoriaRepository {
  async insertar({ usuarioId, correo, accion, entidad, entidadId, detalle }, db) {
    const { rows } = await db.query(
      `INSERT INTO auditoria (usuario_id, correo, accion, entidad, entidad_id, detalle)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, fecha`,
      [usuarioId ?? null, correo ?? null, accion, entidad, entidadId ?? null, JSON.stringify(detalle ?? {})]
    );
    return rows[0];
  }

  async listar({ usuarioId, accion, entidad, desde, hasta, limite, offset }, db) {
    const filtro = new FiltroSql();
    if (usuarioId) filtro.agregar('a.usuario_id = $?', usuarioId);
    if (accion) filtro.agregar('a.accion = $?', accion);
    if (entidad) filtro.agregar('a.entidad = $?', entidad);
    if (desde) filtro.agregar('a.fecha >= $?', desde);
    if (hasta) filtro.agregar('a.fecha <= $?', hasta);
    const { rows } = await db.query(
      `SELECT a.id, a.usuario_id, a.correo, a.accion, a.entidad, a.entidad_id, a.fecha,
              COUNT(*) OVER() AS total
         FROM auditoria a
         ${filtro.where}
        ORDER BY a.fecha DESC, a.id DESC
        LIMIT $${filtro.siguiente} OFFSET $${filtro.siguiente + 1}`,
      [...filtro.valores, limite, offset]
    );
    return rows;
  }

  async obtener(id, db) {
    const { rows } = await db.query('SELECT * FROM auditoria WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async listarLogs({ nivel, modulo, desde, hasta, limite, offset }, db) {
    const filtro = new FiltroSql();
    if (nivel) filtro.agregar('l.nivel = $?', nivel);
    if (modulo) filtro.agregar('l.modulo = $?', modulo);
    if (desde) filtro.agregar('l.fecha >= $?', desde);
    if (hasta) filtro.agregar('l.fecha <= $?', hasta);
    const { rows } = await db.query(
      `SELECT l.id, l.nivel, l.modulo, l.mensaje, l.fecha, COUNT(*) OVER() AS total
         FROM log_error l
         ${filtro.where}
        ORDER BY l.fecha DESC, l.id DESC
        LIMIT $${filtro.siguiente} OFFSET $${filtro.siguiente + 1}`,
      [...filtro.valores, limite, offset]
    );
    return rows;
  }

  async obtenerLog(id, db) {
    const { rows } = await db.query('SELECT * FROM log_error WHERE id = $1', [id]);
    return rows[0] ?? null;
  }
}
