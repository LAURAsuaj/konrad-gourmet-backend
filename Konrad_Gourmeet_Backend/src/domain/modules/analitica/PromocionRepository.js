/** Persistencia de tendencias y promociones (tablas tendencia, promocion y notificacion). */
import { FiltroSql } from '../../consulta.js';

export class PromocionRepository {
  async guardarTendencias(tendencias, db) {
    if (tendencias.length === 0) return;
    await db.query(
      `INSERT INTO tendencia (termino, fuente, puntaje)
       SELECT * FROM unnest($1::text[], $2::text[], $3::numeric[])`,
      [tendencias.map((t) => t.termino), tendencias.map((t) => t.fuente), tendencias.map((t) => t.puntaje)]
    );
  }

  /** Evita reenviar la misma promoción dentro de la ventana indicada. */
  async existeReciente(titulo, dias, db) {
    const { rowCount } = await db.query(
      "SELECT 1 FROM promocion WHERE titulo = $1 AND generada_en > now() - make_interval(days => $2)",
      [titulo, dias]
    );
    return rowCount > 0;
  }

  async crear({ productoId, titulo, descripcion, origen }, db) {
    const { rows } = await db.query(
      `INSERT INTO promocion (producto_id, titulo, descripcion, origen)
       VALUES ($1, $2, $3, $4) RETURNING id, generada_en`,
      [productoId, titulo, descripcion, origen]
    );
    return rows[0];
  }

  /** Promociones generadas y el resultado de su envío por correo ("registrar envío", CU-15). */
  async listar({ desde, hasta, limite, offset }, db) {
    const filtro = new FiltroSql();
    if (desde) filtro.agregar('p.generada_en >= $?', desde);
    if (hasta) filtro.agregar('p.generada_en <= $?', hasta);
    const { rows } = await db.query(
      `SELECT p.id, p.titulo, p.descripcion, p.origen, p.generada_en, pr.nombre AS producto,
              (SELECT COUNT(*) FROM notificacion n WHERE n.tipo = 'PROMOCION' AND n.referencia->>'promocionId' = p.id::text AND n.estado = 'ENVIADA') AS enviadas,
              (SELECT COUNT(*) FROM notificacion n WHERE n.tipo = 'PROMOCION' AND n.referencia->>'promocionId' = p.id::text AND n.estado = 'FALLIDA') AS fallidas,
              COUNT(*) OVER() AS total
         FROM promocion p
         LEFT JOIN producto pr ON pr.id = p.producto_id
         ${filtro.where}
        ORDER BY p.generada_en DESC
        LIMIT $${filtro.siguiente} OFFSET $${filtro.siguiente + 1}`,
      [...filtro.valores, limite, offset]
    );
    return rows;
  }
}
