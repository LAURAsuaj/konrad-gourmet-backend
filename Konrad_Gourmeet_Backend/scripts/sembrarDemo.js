/**
 * Carga DATOS DE DEMOSTRACIÓN para recorrer todos los flujos de la aplicación:
 * 3 puntos con 10 mesas cada uno, catálogos, 21 productos, 4 proveedores, 11 usuarios
 * de los 6 roles, menú de 10 platos por punto, inventario (con algunos productos en
 * stock bajo para que salgan alarmas), pedidos del día en varias mesas y solicitudes
 * de alimentos pendientes de cotizar.
 *
 * Usa la API (no escribe en la base directamente), así que se aplican las mismas
 * validaciones, contraseñas cifradas, auditoría y eventos que en el uso normal.
 *
 * Uso (con la API encendida y un Administrador ya creado con `npm run admin:crear`):
 *   ADMIN_CORREO=admin@empresa.com ADMIN_PASSWORD='Clave12345' npm run demo:sembrar
 *
 * Variables opcionales:
 *   DEMO_API_URL             Dirección de la API (por defecto http://localhost:3000)
 *   DEMO_PASSWORD            Contraseña de los usuarios de demostración (por defecto Demo12345)
 *   DEMO_CORREO_PROVEEDORES  Un buzón suyo, por ejemplo laura@gmail.com, para recibir las
 *                            cotizaciones de prueba: los proveedores quedan como
 *                            laura+andino@gmail.com, laura+sabana@gmail.com… Sin ella se usan
 *                            direcciones @example.com, que no llegan a ninguna parte.
 *
 * Se puede ejecutar varias veces: solo crea lo que falta (compara por nombre o correo),
 * no modifica lo que ya existe y solo crea pedidos y solicitudes en los puntos que todavía
 * no tienen. No crea cotizaciones: esas se piden desde la aplicación para demostrar el flujo.
 */
const API = (process.env.DEMO_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '') + '/api/v1';
const PASSWORD_DEMO = process.env.DEMO_PASSWORD ?? 'Demo12345';
const { ADMIN_CORREO, ADMIN_PASSWORD, DEMO_CORREO_PROVEEDORES } = process.env;

if (!ADMIN_CORREO || !ADMIN_PASSWORD) {
  console.error('Defina ADMIN_CORREO y ADMIN_PASSWORD (la cuenta de Administrador) antes de ejecutar el script.');
  process.exit(1);
}

// ---------------------------------------------------------------- datos

const PUNTOS = ['Chapinero', 'Usaquén', 'Teusaquillo'];
const MESAS_POR_PUNTO = 10;
const CATEGORIAS = ['Granos y cereales', 'Carnes y pescados', 'Tubérculos y plátanos', 'Verduras y hortalizas', 'Frutas', 'Lácteos y huevos', 'Abarrotes'];
const UNIDADES = [
  { nombre: 'kilogramo', abreviatura: 'kg' },
  { nombre: 'litro', abreviatura: 'L' },
  { nombre: 'unidad', abreviatura: 'und' },
];
const MARCAS = ['Diana', 'Roa', 'Florhuila', 'Alpina', 'Colanta', 'Premier', 'Zenú', 'Kikes'];

// Los nombres simples coinciden con productos del servicio de precios del Ministerio
// (SIPSA), así reciben precio sugerido. Huevo, leche, queso y aceite no están en SIPSA:
// sirven para ver el caso "sin precio sugerido".
const PRODUCTOS = [
  ['Arroz', 'Granos y cereales', 'kg'],
  ['Frijol', 'Granos y cereales', 'kg'],
  ['Lenteja', 'Granos y cereales', 'kg'],
  ['Pollo', 'Carnes y pescados', 'kg'],
  ['Carne de res', 'Carnes y pescados', 'kg'],
  ['Cerdo', 'Carnes y pescados', 'kg'],
  ['Mojarra', 'Carnes y pescados', 'kg'],
  ['Papa criolla', 'Tubérculos y plátanos', 'kg'],
  ['Papa pastusa', 'Tubérculos y plátanos', 'kg'],
  ['Yuca', 'Tubérculos y plátanos', 'kg'],
  ['Plátano', 'Tubérculos y plátanos', 'kg'],
  ['Cebolla cabezona', 'Verduras y hortalizas', 'kg'],
  ['Tomate', 'Verduras y hortalizas', 'kg'],
  ['Zanahoria', 'Verduras y hortalizas', 'kg'],
  ['Lechuga', 'Verduras y hortalizas', 'kg'],
  ['Aguacate', 'Frutas', 'kg'],
  ['Limón', 'Frutas', 'kg'],
  ['Mango', 'Frutas', 'kg'],
  ['Huevo', 'Lácteos y huevos', 'und'],
  ['Leche', 'Lácteos y huevos', 'L'],
  ['Aceite', 'Abarrotes', 'L'],
];

const PROVEEDORES = [
  ['Proveedor Andino', 'andino'],
  ['Distribuidora Sabana', 'sabana'],
  ['Agrocampo del Centro', 'agrocampo'],
  ['Frigorífico La Pradera', 'pradera'],
];

/** [plato, categoría del menú, precio, [[producto, cantidad por porción]]] */
const PLATOS = [
  ['Arroz con pollo', 'Fuertes', 28000, [['Arroz', 0.15], ['Pollo', 0.25], ['Zanahoria', 0.05]]],
  ['Bandeja paisa', 'Fuertes', 38000, [['Frijol', 0.12], ['Arroz', 0.12], ['Carne de res', 0.2], ['Cerdo', 0.12], ['Huevo', 1], ['Plátano', 0.15], ['Aguacate', 0.08]]],
  ['Pechuga a la plancha', 'Fuertes', 30000, [['Pollo', 0.3], ['Lechuga', 0.05], ['Tomate', 0.05]]],
  ['Mojarra frita', 'Fuertes', 36000, [['Mojarra', 0.45], ['Plátano', 0.15], ['Limón', 0.03], ['Aceite', 0.1]]],
  ['Sobrebarriga en salsa', 'Fuertes', 34000, [['Carne de res', 0.28], ['Tomate', 0.08], ['Cebolla cabezona', 0.05], ['Papa pastusa', 0.2]]],
  ['Ajiaco santafereño', 'Sopas', 32000, [['Papa criolla', 0.2], ['Papa pastusa', 0.15], ['Pollo', 0.15]]],
  ['Sopa de lentejas', 'Sopas', 16000, [['Lenteja', 0.1], ['Zanahoria', 0.04], ['Papa pastusa', 0.08]]],
  ['Sancocho de res', 'Sopas', 30000, [['Carne de res', 0.18], ['Yuca', 0.15], ['Plátano', 0.1], ['Papa pastusa', 0.1]]],
  ['Ensalada de la casa', 'Entradas', 14000, [['Lechuga', 0.1], ['Tomate', 0.08], ['Aguacate', 0.06], ['Limón', 0.02]]],
  ['Jugo de mango en leche', 'Bebidas', 9000, [['Mango', 0.2], ['Leche', 0.2]]],
];

/** Inventario inicial: [producto, cantidad actual, cantidad de referencia]. Los marcados quedan en alarma. */
const INVENTARIO = [
  ['Arroz', 80, 100], ['Frijol', 30, 40], ['Lenteja', 25, 30], ['Pollo', 6, 60] /* alarma */, ['Carne de res', 45, 50],
  ['Cerdo', 20, 25], ['Mojarra', 4, 30] /* alarma */, ['Papa criolla', 40, 50], ['Papa pastusa', 70, 80], ['Yuca', 30, 35],
  ['Plátano', 35, 40], ['Cebolla cabezona', 20, 25], ['Tomate', 5, 30] /* alarma */, ['Zanahoria', 18, 20], ['Lechuga', 12, 15],
  ['Aguacate', 10, 15], ['Limón', 8, 10], ['Mango', 14, 20], ['Huevo', 240, 300], ['Leche', 30, 40], ['Aceite', 25, 30],
];

/** Solicitudes de alimentos por punto: [[producto, cantidad, marca opcional]] */
const SOLICITUDES = [
  [['Pollo', 60], ['Tomate', 25], ['Arroz', 50, 'Diana']],
  [['Mojarra', 30], ['Limón', 10], ['Aceite', 20, 'Premier']],
];

// ---------------------------------------------------------------- utilidades

let semilla = 7;
const azar = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280); // repetible entre ejecuciones
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
const minus = (t) => t.trim().toLocaleLowerCase('es');
const correoProveedor = (alias) => {
  if (!DEMO_CORREO_PROVEEDORES) return `ventas@${alias}.example.com`;
  const [usuario, dominio] = DEMO_CORREO_PROVEEDORES.split('@');
  return `${usuario}+${alias}@${dominio}`;
};
const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const resumen = { creados: {}, omitidos: {} };
const contar = (tipo, creado) => {
  const destino = creado ? resumen.creados : resumen.omitidos;
  destino[tipo] = (destino[tipo] ?? 0) + 1;
};

async function pedir(metodo, ruta, { token, cuerpo, permitir = [] } = {}) {
  const respuesta = await fetch(API + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const json = await respuesta.json().catch(() => ({}));
  if (respuesta.ok) return json.datos;
  if (permitir.includes(respuesta.status)) return null;
  const error = new Error(`${metodo} ${ruta} → ${respuesta.status} ${json.error?.codigo ?? ''}: ${json.error?.mensaje ?? 'sin detalle'}`);
  error.estado = respuesta.status;
  throw error;
}

const entrar = async (correo, password) => (await pedir('POST', '/auth/login', { cuerpo: { correo, password } })).token;

/** Crea en un catálogo lo que falta. `clave` dice cuándo dos valores son el mismo. */
async function asegurarCatalogo(token, catalogo, valores, clave) {
  const existentes = await pedir('GET', `/catalogos/${catalogo}?incluirInactivos=true`, { token });
  const indice = new Map(existentes.map((v) => [clave(v), v]));
  for (const valor of valores) {
    if (indice.has(clave(valor))) {
      contar(catalogo, false);
      continue;
    }
    const creado = await pedir('POST', `/catalogos/${catalogo}`, { token, cuerpo: valor });
    indice.set(clave(creado), creado);
    contar(catalogo, true);
  }
  return indice;
}

// ---------------------------------------------------------------- carga

async function principal() {
  console.log(`Sembrando datos de demostración en ${API}`);
  const admin = await entrar(ADMIN_CORREO, ADMIN_PASSWORD);

  // Catálogos
  const puntos = await asegurarCatalogo(admin, 'puntos', PUNTOS.map((nombre) => ({ nombre })), (v) => minus(v.nombre));
  const categorias = await asegurarCatalogo(admin, 'categorias', CATEGORIAS.map((nombre) => ({ nombre })), (v) => minus(v.nombre));
  const existentesUnidades = await pedir('GET', '/catalogos/unidades?incluirInactivos=true', { token: admin });
  const unidades = new Map();
  for (const u of UNIDADES) {
    const ya = existentesUnidades.find((e) => minus(e.abreviatura) === minus(u.abreviatura) || minus(e.nombre) === minus(u.nombre));
    unidades.set(u.abreviatura, ya ?? (await pedir('POST', '/catalogos/unidades', { token: admin, cuerpo: u })));
    contar('unidades', !ya);
  }
  const marcas = await asegurarCatalogo(admin, 'marcas', MARCAS.map((nombre) => ({ nombre })), (v) => minus(v.nombre));
  await asegurarCatalogo(
    admin,
    'proveedores',
    PROVEEDORES.map(([nombre, alias]) => ({ nombre, correo: correoProveedor(alias) })),
    (v) => minus(v.nombre)
  );

  // Productos: si ya existe uno con el mismo nombre (por ejemplo su "Arroz"), se reutiliza
  const existentesProductos = await pedir('GET', '/catalogos/productos?incluirInactivos=true', { token: admin });
  const productos = new Map(existentesProductos.map((p) => [minus(p.nombre), p]));
  for (const [nombre, categoria, abreviatura] of PRODUCTOS) {
    if (productos.has(minus(nombre))) {
      contar('productos', false);
      continue;
    }
    const creado = await pedir('POST', '/catalogos/productos', {
      token: admin,
      cuerpo: { nombre, categoriaId: categorias.get(minus(categoria)).id, unidadId: unidades.get(abreviatura).id },
    });
    productos.set(minus(nombre), creado);
    contar('productos', true);
  }
  const producto = (nombre) => productos.get(minus(nombre));

  // Mesas: 1 a 10 en cada punto de demostración (no toca las que ya existan)
  for (const nombrePunto of PUNTOS) {
    const punto = puntos.get(minus(nombrePunto));
    const existentes = await pedir('GET', `/catalogos/mesas?incluirInactivos=true&puntoId=${punto.id}`, { token: admin });
    const numeros = new Set(existentes.map((m) => m.numero));
    for (let numero = 1; numero <= MESAS_POR_PUNTO; numero += 1) {
      if (numeros.has(numero)) {
        contar('mesas', false);
        continue;
      }
      await pedir('POST', '/catalogos/mesas', { token: admin, cuerpo: { puntoId: punto.id, numero } });
      contar('mesas', true);
    }
  }

  // Usuarios
  const usuarios = new Set((await pedir('GET', '/usuarios', { token: admin })).map((u) => u.correo));
  const cuentas = [
    { nombre: 'Julián Torres', correo: 'auxiliar@kg-demo.co', rol: 'AUXILIAR_COMPRAS' },
    { nombre: 'Marta Gómez', correo: 'director.compras@kg-demo.co', rol: 'DIRECTOR_COMPRAS' },
    { nombre: 'Sofía Díaz', correo: 'comercial@kg-demo.co', rol: 'DIRECTOR_COMERCIAL' },
  ];
  const personal = [
    ['Andrés Rojas', 'Camila Pérez', 'Diego Martínez'],
    ['Paula Herrera', 'Santiago López', 'Valentina Ruiz'],
    ['Felipe Castro', 'Daniela Moreno', 'Mateo Vargas'],
  ];
  PUNTOS.forEach((nombrePunto, i) => {
    const puntoId = puntos.get(minus(nombrePunto)).id;
    const s = slug(nombrePunto);
    const [jefe, mesero1, mesero2] = personal[i];
    cuentas.push(
      { nombre: jefe, correo: `jefe.${s}@kg-demo.co`, rol: 'JEFE_COCINA', puntoId },
      { nombre: mesero1, correo: `mesero1.${s}@kg-demo.co`, rol: 'MESERO', puntoId },
      { nombre: mesero2, correo: `mesero2.${s}@kg-demo.co`, rol: 'MESERO', puntoId }
    );
  });
  for (const cuenta of cuentas) {
    if (usuarios.has(cuenta.correo)) {
      contar('usuarios', false);
      continue;
    }
    await pedir('POST', '/usuarios', { token: admin, cuerpo: { ...cuenta, password: PASSWORD_DEMO } });
    contar('usuarios', true);
  }

  const auxiliar = await entrar('auxiliar@kg-demo.co', PASSWORD_DEMO);

  // Por punto: menú, inventario, pedidos y solicitudes (los hace cada rol, como en la realidad)
  for (const nombrePunto of PUNTOS) {
    const punto = puntos.get(minus(nombrePunto));
    const s = slug(nombrePunto);
    const jefe = await entrar(`jefe.${s}@kg-demo.co`, PASSWORD_DEMO);

    const menu = await pedir('GET', '/menu?incluirInactivos=true', { token: jefe });
    const platos = new Map(menu.map((p) => [minus(p.nombre), p]));
    for (const [nombre, categoria, precio, ingredientes] of PLATOS) {
      if (platos.has(minus(nombre))) {
        contar('platos', false);
        continue;
      }
      const creado = await pedir('POST', '/menu/platos', {
        token: jefe,
        cuerpo: {
          nombre,
          categoria,
          precio,
          ingredientes: ingredientes.map(([p, cantidadPorPorcion]) => ({ productoId: producto(p).id, cantidadPorPorcion, unidadId: producto(p).unidadId })),
        },
      });
      platos.set(minus(nombre), creado);
      contar('platos', true);
    }

    const inventario = new Set((await pedir('GET', '/inventario', { token: jefe })).map((i) => i.productoId));
    for (const [nombre, actual, referencia] of INVENTARIO) {
      const id = producto(nombre).id;
      if (inventario.has(id)) {
        contar('inventario', false);
        continue;
      }
      // Primero se carga lleno y luego se baja: así el paso por debajo del umbral genera la alarma
      await pedir('PUT', '/inventario', { token: jefe, cuerpo: { productoId: id, cantidadActual: referencia, cantidadReferencia: referencia } });
      if (actual !== referencia) await pedir('PUT', '/inventario', { token: jefe, cuerpo: { productoId: id, cantidadActual: actual, cantidadReferencia: referencia } });
      contar('inventario', true);
    }

    // Pedidos del día: solo si el punto todavía no tiene pedidos recientes
    const mesero = await entrar(`mesero1.${s}@kg-demo.co`, PASSWORD_DEMO);
    const mesero2 = await entrar(`mesero2.${s}@kg-demo.co`, PASSWORD_DEMO);
    const yaHayPedidos = (await pedir('GET', '/pedidos?limite=1', { token: mesero })).length > 0;
    if (yaHayPedidos) {
      contar('pedidos (punto ya tenía)', false);
    } else {
      const mesas = (await pedir('GET', `/catalogos/mesas?puntoId=${punto.id}`, { token: mesero })).sort((a, b) => a.numero - b.numero);
      const ocupadas = mesas.filter((m) => [1, 2, 4, 5, 7, 9].includes(m.numero));
      const activos = [...platos.values()].filter((p) => p.activo !== false);
      for (const [indice, mesa] of ocupadas.entries()) {
        const rondas = indice % 3 === 0 ? 2 : 1;
        for (let r = 0; r < rondas; r += 1) {
          const lineas = new Map();
          const cuantos = 1 + Math.floor(azar() * 3);
          for (let k = 0; k < cuantos; k += 1) {
            const plato = elegir(activos);
            lineas.set(plato.id, (lineas.get(plato.id) ?? 0) + 1 + Math.floor(azar() * 2));
          }
          await pedir('POST', '/pedidos', {
            token: r === 0 ? mesero : mesero2,
            cuerpo: { mesaId: mesa.id, items: [...lineas].map(([platoId, cantidad]) => ({ platoId, cantidad })) },
          });
          contar('pedidos', true);
        }
      }
    }

    // Solicitudes: solo si el punto todavía no tiene ninguna
    const yaHaySolicitudes = (await pedir('GET', `/solicitudes?puntoId=${punto.id}&limite=1`, { token: auxiliar })).total > 0;
    if (yaHaySolicitudes) {
      contar('solicitudes (punto ya tenía)', false);
    } else {
      for (const solicitud of SOLICITUDES) {
        await pedir('POST', '/solicitudes', {
          token: jefe,
          cuerpo: {
            items: solicitud.map(([nombre, cantidad, marca]) => ({
              categoriaId: producto(nombre).categoriaId,
              productoId: producto(nombre).id,
              ...(marca ? { marcaId: marcas.get(minus(marca)).id } : {}),
              cantidad,
              unidadId: producto(nombre).unidadId,
            })),
          },
        });
        contar('solicitudes', true);
      }
    }
  }

  console.log('\nListo.');
  console.log('Creados:', resumen.creados);
  console.log('Ya existían (no se tocaron):', resumen.omitidos);
  console.log(`\nCuentas de demostración (contraseña: ${PASSWORD_DEMO})`);
  console.table(cuentas.map((c) => ({ rol: c.rol, correo: c.correo, punto: c.puntoId ? PUNTOS.find((p) => puntos.get(minus(p)).id === c.puntoId) : '' })));
  if (!DEMO_CORREO_PROVEEDORES) {
    console.log('Los proveedores tienen correos @example.com. Para recibir las cotizaciones de prueba, vuelva a ejecutar con DEMO_CORREO_PROVEEDORES=su@correo.com en una base sin esos proveedores, o cámbielos en Catálogos > Proveedores.');
  }
}

principal().catch((error) => {
  console.error(`\nNo se pudo terminar la carga: ${error.message}`);
  if (error.cause?.code === 'ECONNREFUSED') console.error(`La API no responde en ${API}. Enciéndala con npm start o defina DEMO_API_URL.`);
  process.exit(1);
});
