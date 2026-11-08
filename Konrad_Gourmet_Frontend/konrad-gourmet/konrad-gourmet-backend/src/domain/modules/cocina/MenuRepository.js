/** Persistencia del menú por punto (tablas plato y plato_ingrediente). */
const SELECT_PLATOS = `
  SELECT p.id, p.punto_id, p.nombre, p.categoria, p.precio, p.activo,
         COALESCE(json_agg(json_build_object(
           'productoId', i.producto_id,
           'producto', pr.nombre,
           'cantidadPorPorcion', i.cantidad_por_porcion,
           'unidadId', i.unidad_id,
           'unidad', u.abreviatura) ORDER BY pr.nombre)
           FILTER (WHERE i.producto_id IS NOT NULL), '[]'::json) AS ingredientes
    FROM plato p
    LEFT JOIN plato_ingrediente i ON i.plato_id = p.id
    LEFT JOIN producto pr ON pr.id = i.producto_id
    LEFT JOIN unidad_medida u ON u.id = i.unidad_id`;

const CAMPOS_EDITABLES = ['nombre', 'categoria', 'precio', 'activo'];

export class MenuRepository {
  async buscarProductos(ids, db) {
    const { rows } = await db.query(
      'SELECT id, nombre, unidad_id, activo FROM producto WHERE id = ANY($1::uuid[])',
      [ids]
    );
    return rows;
  }

  async insertarPlato({ puntoId, nombre, categoria, precio }, db) {
    const { rows } = await db.query(
      `INSERT INTO plato (punto_id, nombre, categoria, precio)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [puntoId, nombre, categoria, precio]
    );
    return rows[0].id;
  }

  async insertarIngredientes(platoId, ingredientes, db) {
    await db.query(
      `INSERT INTO plato_ingrediente (plato_id, producto_id, cantidad_por_porcion, unidad_id)
       SELECT $1, x.producto_id, x.cantidad, x.unidad_id
         FROM unnest($2::uuid[], $3::numeric[], $4::uuid[]) AS x(producto_id, cantidad, unidad_id)`,
      [
        platoId,
        ingredientes.map((i) => i.productoId),
        ingredientes.map((i) => i.cantidadPorPorcion),
        ingredientes.map((i) => i.unidadId),
      ]
    );
  }

  async reemplazarIngredientes(platoId, ingredientes, db) {
    await db.query('DELETE FROM plato_ingrediente WHERE plato_id = $1', [platoId]);
    await this.insertarIngredientes(platoId, ingredientes, db);
  }

  /** Bloquea el plato para modificarlo; null si no existe en ese punto. */
  async bloquearPlato(platoId, puntoId, db) {
    const { rows } = await db.query(
      'SELECT id FROM plato WHERE id = $1 AND punto_id = $2 FOR UPDATE',
      [platoId, puntoId]
    );
    return rows[0] ?? null;
  }

  async actualizarPlato(platoId, cambios, db) {
    const claves = CAMPOS_EDITABLES.filter((campo) => cambios[campo] !== undefined);
    if (claves.length === 0) return;
    const asignaciones = claves.map((campo, indice) => `${campo} = $${indice + 2}`).join(', ');
    await db.query(`UPDATE plato SET ${asignaciones} WHERE id = $1`, [
      platoId,
      ...claves.map((campo) => cambios[campo]),
    ]);
  }

  async listarPorPunto(puntoId, incluirInactivos, db) {
    const { rows } = await db.query(
      `${SELECT_PLATOS}
        WHERE p.punto_id = $1 AND ($2::boolean OR p.activo)
        GROUP BY p.id
        ORDER BY p.categoria, p.nombre`,
      [puntoId, incluirInactivos]
    );
    return rows;
  }

  async obtener(platoId, puntoId, db) {
    const { rows } = await db.query(
      `${SELECT_PLATOS}
        WHERE p.id = $1 AND p.punto_id = $2
        GROUP BY p.id`,
      [platoId, puntoId]
    );
    return rows[0] ?? null;
  }
}
