/** Datos de negocio mínimos que comparten varias pruebas, creados a través de la fachada. */
export const CLAVE = 'Clave1234';

/** @param {object} app resultado de iniciarAplicacion() */
export async function sembrarNegocio(app) {
  const { facade } = app;
  await facade.crearAdministradorInicial({ nombre: 'Admin', correo: 'admin@kg.co', password: 'Admin12345' });
  const admin = await app.actorDe('admin@kg.co', 'Admin12345');
  const E = (operacion, actor, datos) => facade.ejecutar(operacion, actor, datos);
  const crear = async (catalogo, cuerpo) => (await E('catalogos.crear', admin, { catalogo, cuerpo })).id;

  const ids = {};
  ids.punto = await crear('puntos', { nombre: 'Chapinero' });
  ids.punto2 = await crear('puntos', { nombre: 'Usaquén' });
  ids.kg = await crear('unidades', { nombre: 'kilogramo', abreviatura: 'kg' });
  ids.litro = await crear('unidades', { nombre: 'litro', abreviatura: 'l' });
  ids.catGranos = await crear('categorias', { nombre: 'Granos' });
  ids.catProteinas = await crear('categorias', { nombre: 'Proteínas' });
  ids.arroz = await crear('productos', { nombre: 'Arroz', categoriaId: ids.catGranos, unidadId: ids.kg });
  ids.pollo = await crear('productos', { nombre: 'Pollo', categoriaId: ids.catProteinas, unidadId: ids.kg });
  ids.provA = await crear('proveedores', { nombre: 'Proveedor A', correo: 'a@prov.co' });
  ids.provB = await crear('proveedores', { nombre: 'Proveedor B', correo: 'b@prov.co' });
  ids.provSinCorreo = await crear('proveedores', { nombre: 'Proveedor C' });
  ids.mesa = await crear('mesas', { puntoId: ids.punto, numero: 1 });
  ids.mesa2 = await crear('mesas', { puntoId: ids.punto2, numero: 1 });

  const usuario = (nombre, correo, rol, puntoId) => E('usuarios.crear', admin, { nombre, correo, password: CLAVE, rol, puntoId });
  await usuario('Jefe', 'jefe@kg.co', 'JEFE_COCINA', ids.punto);
  await usuario('Jefe Dos', 'jefe2@kg.co', 'JEFE_COCINA', ids.punto2);
  await usuario('Mesero', 'mesero@kg.co', 'MESERO', ids.punto);
  await usuario('Auxiliar', 'aux@kg.co', 'AUXILIAR_COMPRAS');
  await usuario('Compras', 'compras@kg.co', 'DIRECTOR_COMPRAS');
  await usuario('Comercial', 'comercial@kg.co', 'DIRECTOR_COMERCIAL');

  const actores = {
    admin,
    jefe: await app.actorDe('jefe@kg.co'),
    jefe2: await app.actorDe('jefe2@kg.co'),
    mesero: await app.actorDe('mesero@kg.co'),
    aux: await app.actorDe('aux@kg.co'),
    compras: await app.actorDe('compras@kg.co'),
    comercial: await app.actorDe('comercial@kg.co'),
  };
  return { ids, actores, E };
}
