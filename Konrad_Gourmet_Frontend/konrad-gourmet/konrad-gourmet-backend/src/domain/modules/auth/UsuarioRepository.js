/** Persistencia de usuarios (tabla usuario). Cada método recibe el ejecutor SQL (pool o transacción). */
const COLUMNAS_PUBLICAS =
  'id, nombre, correo, rol, punto_id, intentos_fallidos, bloqueado, activo, creado_en';

export class UsuarioRepository {
  async buscarPorCorreo(correo, db) {
    const { rows } = await db.query(
      `SELECT id, nombre, correo, password_hash, rol, punto_id, intentos_fallidos, bloqueado, activo
         FROM usuario WHERE lower(correo) = lower($1)`,
      [correo]
    );
    return rows[0] ?? null;
  }

  /** Estado vigente de la cuenta (para renovar la sesión con el rol y el punto actuales). */
  async buscarPorId(id, db) {
    const { rows } = await db.query(
      'SELECT id, nombre, correo, rol, punto_id, bloqueado, activo FROM usuario WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  }

  /** Suma un intento fallido y bloquea la cuenta al alcanzar el máximo, de forma atómica. */
  async registrarFallo(id, maxIntentos, db) {
    const { rows } = await db.query(
      `UPDATE usuario
          SET intentos_fallidos = intentos_fallidos + 1,
              bloqueado = bloqueado OR (intentos_fallidos + 1 >= $2)
        WHERE id = $1
        RETURNING intentos_fallidos, bloqueado`,
      [id, maxIntentos]
    );
    return rows[0];
  }

  async reiniciarIntentos(id, db) {
    await db.query('UPDATE usuario SET intentos_fallidos = 0 WHERE id = $1', [id]);
  }

  /** Credenciales y estado de la cuenta (incluye el hash: solo para verificar contraseñas). */
  async obtenerCredenciales(id, db) {
    const { rows } = await db.query(
      'SELECT id, password_hash, activo, bloqueado, intentos_fallidos FROM usuario WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  }

  /** Guarda un hash nuevo y reinicia los intentos; con `desbloquear` también habilita la cuenta. */
  async actualizarPassword(id, passwordHash, db, { desbloquear = false } = {}) {
    const { rows } = await db.query(
      `UPDATE usuario
          SET password_hash = $2,
              intentos_fallidos = 0,
              bloqueado = CASE WHEN $3::boolean THEN false ELSE bloqueado END
        WHERE id = $1
        RETURNING ${COLUMNAS_PUBLICAS}`,
      [id, passwordHash, desbloquear]
    );
    return rows[0] ?? null;
  }

  async crear({ nombre, correo, passwordHash, rol, puntoId }, db) {
    const { rows } = await db.query(
      `INSERT INTO usuario (nombre, correo, password_hash, rol, punto_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNAS_PUBLICAS}`,
      [nombre, correo, passwordHash, rol, puntoId]
    );
    return rows[0];
  }

  async desbloquear(id, db) {
    const { rows } = await db.query(
      `UPDATE usuario SET bloqueado = false, intentos_fallidos = 0
        WHERE id = $1 RETURNING ${COLUMNAS_PUBLICAS}`,
      [id]
    );
    return rows[0] ?? null;
  }

  async listar(db) {
    const { rows } = await db.query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuario ORDER BY nombre`);
    return rows;
  }

  async existeAdministrador(db) {
    const { rowCount } = await db.query("SELECT 1 FROM usuario WHERE rol = 'ADMINISTRADOR' LIMIT 1");
    return rowCount > 0;
  }

  async puntoActivoExiste(puntoId, db) {
    const { rowCount } = await db.query('SELECT 1 FROM punto WHERE id = $1 AND activo', [puntoId]);
    return rowCount > 0;
  }
}
