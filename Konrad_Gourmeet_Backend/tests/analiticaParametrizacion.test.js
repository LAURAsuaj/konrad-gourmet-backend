/**
 * Parametrización (CU-04), tablero BAM (CU-14), promociones por tendencias (CU-15)
 * y auditoría y logs (CU-16).
 */
import './_soporte/entorno.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarAplicacion } from './_soporte/aplicacion.js';
import { sembrarNegocio } from './_soporte/datos.js';
import { codigoDe } from './_soporte/utiles.js';

describe('Parametrización, analítica y auditoría', () => {
  let app;
  let ids;
  let A;
  let E;

  before(async () => {
    app = await iniciarAplicacion();
    ({ ids, actores: A, E } = await sembrarNegocio(app));
  });
  after(() => app.detener());

  const crear = (catalogo, cuerpo, actor = A.admin) => E('catalogos.crear', actor, { catalogo, cuerpo });

  describe('Catálogos (CU-04)', () => {
    it('lista los 7 catálogos y crea valores normalizados', async () => {
      assert.equal((await E('catalogos.nombres', A.jefe, {})).length, 7);
      const proveedor = await crear('proveedores', { nombre: 'Lácteos SA', correo: 'VENTAS@Lacteos.co' });
      assert.equal(proveedor.correo, 'ventas@lacteos.co');
      assert.equal(proveedor.activo, true);
      assert.equal((await crear('proveedores', { nombre: 'Sin correo' })).correo, null, 'el correo del proveedor es opcional');
    });

    it('rechaza duplicados (sin distinguir mayúsculas), vacíos, formatos y campos no permitidos', async () => {
      await crear('categorias', { nombre: 'Lacteos' });
      assert.equal(await codigoDe(() => crear('categorias', { nombre: 'LACTEOS' })), 'CONFLICTO');
      assert.equal(await codigoDe(() => crear('categorias', { nombre: '  ' })), 'VALIDACION');
      assert.equal(await codigoDe(() => crear('unidades', { nombre: 'gramo' })), 'VALIDACION', 'falta la abreviatura');
      assert.equal(await codigoDe(() => crear('proveedores', { nombre: 'X', correo: 'no-es-correo' })), 'VALIDACION');
      assert.equal(await codigoDe(() => crear('marcas', { nombre: 'X', otro: 1 })), 'VALIDACION');
      assert.equal(await codigoDe(() => crear('inventado', { nombre: 'X' })), 'VALIDACION');
      assert.equal(await codigoDe(() => crear('marcas', { nombre: 'X' }, A.mesero)), 'PROHIBIDO');
    });

    it('valida mesas: sin repetir número en el punto y con punto existente', async () => {
      assert.equal(await codigoDe(() => crear('mesas', { puntoId: ids.punto, numero: 1 })), 'CONFLICTO');
      assert.equal(await codigoDe(() => crear('mesas', { puntoId: '00000000-0000-4000-8000-000000000000', numero: 5 })), 'VALIDACION');
    });

    it('modifica, inactiva y filtra; la unidad de un producto no cambia', async () => {
      const marca = await crear('marcas', { nombre: 'Temporal' });
      assert.equal((await E('catalogos.modificar', A.admin, { catalogo: 'marcas', id: marca.id, cuerpo: { nombre: 'Temporal 2' } })).nombre, 'Temporal 2');
      await crear('marcas', { nombre: 'Diana' });
      assert.equal(await codigoDe(() => E('catalogos.modificar', A.admin, { catalogo: 'marcas', id: marca.id, cuerpo: { nombre: 'diana' } })), 'CONFLICTO');
      assert.equal(await codigoDe(() => E('catalogos.modificar', A.admin, { catalogo: 'productos', id: ids.arroz, cuerpo: { unidadId: ids.kg } })), 'VALIDACION');
      assert.equal(await codigoDe(() => E('catalogos.modificar', A.admin, { catalogo: 'marcas', id: marca.id, cuerpo: {} })), 'VALIDACION');
      assert.equal(await codigoDe(() => E('catalogos.modificar', A.admin, { catalogo: 'marcas', id: '00000000-0000-4000-8000-000000000000', cuerpo: { nombre: 'Z' } })), 'NO_ENCONTRADO');

      await E('catalogos.modificar', A.admin, { catalogo: 'marcas', id: marca.id, cuerpo: { activo: false } });
      const visibles = (await E('catalogos.listar', A.jefe, { catalogo: 'marcas' })).map((m) => m.nombre);
      assert.ok(!visibles.includes('Temporal 2'), 'los inactivos no se ofrecen a los usuarios');
      assert.ok((await E('catalogos.listar', A.admin, { catalogo: 'marcas', incluirInactivos: true })).some((m) => m.nombre === 'Temporal 2'));
      assert.deepEqual((await E('catalogos.listar', A.jefe, { catalogo: 'productos', filtros: { categoriaId: ids.catProteinas } })).map((p) => p.nombre), ['Pollo']);
    });

    it('un valor en uso no se elimina (solo se inactiva); uno sin uso sí', async () => {
      assert.equal(await codigoDe(() => E('catalogos.eliminar', A.admin, { catalogo: 'puntos', id: ids.punto })), 'CONFLICTO');
      assert.equal(await codigoDe(() => E('catalogos.eliminar', A.admin, { catalogo: 'productos', id: ids.arroz })), 'SIN_ERROR', 'el arroz aún no se usa en ninguna parte');
      assert.equal(await codigoDe(() => E('catalogos.eliminar', A.admin, { catalogo: 'productos', id: ids.arroz })), 'NO_ENCONTRADO');
      ids.arroz = await crear('productos', { nombre: 'Arroz', categoriaId: ids.catGranos, unidadId: ids.kg }).then((p) => p.id);
    });
  });

  describe('Reglas del sistema (CU-04)', () => {
    it('lista las 7 reglas (la imagen corporativa aunque no se haya guardado) y aplica los cambios a los demás módulos', async () => {
      const reglas = await E('reglas.listar', A.admin, {});
      assert.equal(reglas.length, 7);
      const imagen = reglas.find((r) => r.clave === 'imagen_corporativa');
      assert.equal(imagen.valor.nombreComercial, 'Konrad Gourmet');
      assert.equal(imagen.actualizadoEn, null);
      assert.equal((await E('reglas.definir', A.admin, { clave: 'alarma_porcentaje', valor: 30 })).valor, 30);
      const { ParametroRepository } = await import('../src/domain/modules/parametrizacion/ParametroRepository.js');
      const { pool } = await import('../src/infrastructure/database/supabaseClient.js');
      assert.equal(await new ParametroRepository().obtenerNumero('alarma_porcentaje', pool, 25), 30);
      await E('reglas.definir', A.admin, { clave: 'alarma_porcentaje', valor: 25 });
    });

    it('rechaza valores inválidos y claves inventadas', async () => {
      const invalidas = [
        ['alarma_porcentaje', 0], ['alarma_porcentaje', 150], ['max_intentos_login', 2.5], ['hora_descuento_diario', '25:00'],
        ['rangos_validacion_cotizacion', { sospechosa_bajo: 1.2, opcionada_max: 1.1, rechazada_sobre: 1.3 }],
        ['criterio_mejor_proveedor', { metrica: 'otra' }], ['regla_inventada', 1],
      ];
      for (const [clave, valor] of invalidas) {
        assert.equal(await codigoDe(() => E('reglas.definir', A.admin, { clave, valor })), 'VALIDACION', `${clave} = ${JSON.stringify(valor)}`);
      }
      assert.equal(await codigoDe(() => E('reglas.definir', A.comercial, { clave: 'alarma_porcentaje', valor: 20 })), 'PROHIBIDO');
    });

    it('acepta y normaliza valores válidos', async () => {
      assert.equal((await E('reglas.definir', A.admin, { clave: 'hora_descuento_diario', valor: '03:30' })).valor, '03:30');
      const rangos = await E('reglas.definir', A.admin, { clave: 'rangos_validacion_cotizacion', valor: { sospechosa_bajo: '0.8', opcionada_max: 1.05, rechazada_sobre: 1.2 } });
      assert.equal(rangos.valor.sospechosa_bajo, 0.8);
      await E('reglas.definir', A.admin, { clave: 'rangos_validacion_cotizacion', valor: { sospechosa_bajo: 0.5, opcionada_max: 1.25, rechazada_sobre: 1.25 } });
      await E('reglas.definir', A.admin, { clave: 'hora_descuento_diario', valor: '02:00' });
    });
  });

  describe('Imagen corporativa parametrizable (interfaz gráfica)', () => {
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const definir = (valor, actor = A.admin) => E('reglas.definir', actor, { clave: 'imagen_corporativa', valor });

    it('sin configurar entrega la apariencia por defecto, sin necesidad de sesión', async () => {
      const a = await app.facade.consultarApariencia();
      assert.deepEqual([a.nombreComercial, a.colorPrimario, a.tipografia, a.logo], ['Konrad Gourmet', '#00A3B4', 'sistema', null]);
    });

    it('el Administrador cambia nombre, colores, tipografía y textos; lo no indicado conserva su valor y los colores se normalizan', async () => {
      const r = await definir({ nombreComercial: '  Konrad Lorenz Gourmet ', colorPrimario: '#1f6feb', tipografia: 'serif', textoBienvenida: 'Hola equipo' });
      assert.deepEqual([r.valor.nombreComercial, r.valor.colorPrimario, r.valor.colorSecundario, r.valor.tipografia], ['Konrad Lorenz Gourmet', '#1F6FEB', '#1A202C', 'serif']);
      const a = await app.facade.consultarApariencia();
      assert.deepEqual([a.nombreComercial, a.colorPrimario, a.textoBienvenida], ['Konrad Lorenz Gourmet', '#1F6FEB', 'Hola equipo']);
      assert.ok(r.actualizadoEn);
    });

    it('rechaza colores, textos, tipografías, campos, contrastes y logos inválidos, y a quien no es Administrador', async () => {
      const invalidos = [
        { colorPrimario: 'rojo' }, { colorPrimario: '#FFF' }, { colorFondo: 12 }, { nombreComercial: '' }, { nombreComercial: 'a'.repeat(61) },
        { textoBienvenida: '<script>alert(1)</script>' }, { eslogan: 5 }, { tipografia: 'comic' }, { campoInventado: 1 },
        { colorTexto: '#CCCCCC', colorFondo: '#FFFFFF' }, // contraste insuficiente (WCAG 2.1 AA)
        { logo: 'http://konrad.test/logo.png' }, { logo: 'javascript:alert(1)' }, { logo: 'https://usuario:clave@konrad.test/logo.png' }, { logo: 'no es una url' },
        { logo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }, { logo: `data:image/png;base64,${'A'.repeat(80_000)}` }, { logo: 7 },
        5, ['x'], 'texto',
      ];
      for (const valor of invalidos) {
        assert.equal(await codigoDe(() => definir(valor)), 'VALIDACION', JSON.stringify(valor).slice(0, 90));
      }
      assert.equal(await codigoDe(() => definir({ nombreComercial: 'X' }, A.comercial)), 'PROHIBIDO');
      assert.equal((await app.facade.consultarApariencia()).nombreComercial, 'Konrad Lorenz Gourmet', 'ningún intento inválido cambió la apariencia');
    });

    it('acepta un logo https o incrustado (png) y permite quitarlo; la auditoría no guarda la imagen completa', async () => {
      assert.equal((await definir({ logo: 'https://konrad.test/logo.png' })).valor.logo, 'https://konrad.test/logo.png');
      assert.equal((await definir({ logo: PNG })).valor.logo, PNG);
      const [{ detalle }] = await app.q("SELECT detalle FROM auditoria WHERE entidad = 'regla' AND entidad_id = 'imagen_corporativa' ORDER BY fecha DESC, id DESC LIMIT 1");
      assert.match(detalle.valor.logo, /^\[imagen incrustada de \d+ caracteres\]$/);
      assert.equal((await definir({ logo: null })).valor.logo, null);
    });

    it('si lo guardado fuera inválido (edición directa de la base), se usa la apariencia por defecto', async () => {
      await app.q(`UPDATE parametro SET valor = '{"colorPrimario": "x"}'::jsonb WHERE clave = 'imagen_corporativa'`);
      assert.equal((await app.facade.consultarApariencia()).colorPrimario, '#00A3B4');
      await definir({}); // deja la apariencia por defecto
    });

    it('calcula el contraste según WCAG 2.1', async () => {
      const { contraste } = await import('../src/domain/modules/parametrizacion/apariencia.js');
      assert.ok(Math.abs(contraste('#000000', '#FFFFFF') - 21) < 0.01);
      assert.ok(contraste('#767676', '#FFFFFF') >= 4.5, 'el gris #767676 es el más claro que cumple AA sobre blanco');
      assert.ok(contraste('#777777', '#FFFFFF') < 4.5);
    });
  });

  describe('Tablero BAM (CU-14)', () => {
    it('sin datos cada indicador informa; solo el Director Comercial accede; el periodo debe ser válido', async () => {
      const vacio = await E('tablero.consultar', A.comercial, {});
      for (const kpi of [vacio.productoMasDemandado, vacio.restauranteMayorDemanda, vacio.mejorProveedor]) {
        assert.equal(kpi.disponible, false);
        assert.ok(kpi.mensaje);
      }
      assert.equal(await codigoDe(() => E('tablero.consultar', A.jefe, {})), 'PROHIBIDO');
      assert.equal(await codigoDe(() => E('tablero.consultar', A.comercial, { desde: '2026-12-01', hasta: '2026-01-01' })), 'VALIDACION');
    });

    it('sin periodo indicado usa 30 días para la demanda y 365 para el proveedor; con periodo indicado, ese para los tres', async () => {
      const { TableroBamService } = await import('../src/domain/modules/analitica/TableroBamService.js');
      const llamadas = {};
      const analitica = {
        rankingProductos: async (p) => { llamadas.productos = p; return []; },
        demandaPorPunto: async (p) => { llamadas.puntos = p; return []; },
        estadisticasProveedores: async (p) => { llamadas.proveedores = p; return []; },
      };
      const servicio = new TableroBamService({
        db: {}, analitica, parametros: { obtener: async () => ({ metrica: 'menor_razon_precio' }) },
        registrador: { error: async () => {}, advertencia: async () => {} },
      });
      const dias = (fecha) => Math.round((Date.now() - fecha.getTime()) / 86_400_000);

      const t = await servicio.consultarTablero(A.comercial);
      assert.deepEqual([dias(llamadas.productos.desde), dias(llamadas.puntos.desde), dias(llamadas.proveedores.desde)], [30, 30, 365]);
      assert.deepEqual([llamadas.productos.hasta, llamadas.puntos.hasta, llamadas.proveedores.hasta], [null, null, null], 'sin límite superior: incluye lo de hoy');
      assert.deepEqual(
        [t.productoMasDemandado.periodo.descripcion, t.restauranteMayorDemanda.periodo.descripcion, t.mejorProveedor.periodo.descripcion],
        ['Últimos 30 días', 'Últimos 30 días', 'Último año (365 días)']
      );
      assert.deepEqual(t.periodo, { desde: null, hasta: null });

      const t2 = await servicio.consultarTablero(A.comercial, { desde: '2026-01-01', hasta: '2026-02-01' });
      for (const l of [llamadas.productos, llamadas.puntos, llamadas.proveedores]) {
        assert.ok(l.desde.toISOString().startsWith('2026-01-01') && l.hasta.toISOString().startsWith('2026-02-0'));
      }
      assert.equal(t2.mejorProveedor.periodo.descripcion, 'Periodo indicado por el usuario');
    });

    describe('con datos', () => {
      before(async () => {
        const [{ id: mesero }] = await app.q("SELECT id FROM usuario WHERE correo = 'mesero@kg.co'");
        const [{ id: jefe }] = await app.q("SELECT id FROM usuario WHERE correo = 'jefe@kg.co'");
        const [{ id: compras }] = await app.q("SELECT id FROM usuario WHERE correo = 'compras@kg.co'");
        const plato = async (puntoId) => {
          const [p] = await app.q("INSERT INTO plato (punto_id, nombre, categoria, precio) VALUES ($1, 'Pollo con arroz', 'Fuertes', 25000) RETURNING id", [puntoId]);
          await app.q('INSERT INTO plato_ingrediente (plato_id, producto_id, cantidad_por_porcion, unidad_id) VALUES ($1,$2,0.3,$4),($1,$3,0.2,$4)', [p.id, ids.pollo, ids.arroz, ids.kg]);
          return p.id;
        };
        const pedido = async (puntoId, mesaId, platoId, cantidad) => {
          const [p] = await app.q('INSERT INTO pedido (punto_id, mesa_id, mesero_id) VALUES ($1,$2,$3) RETURNING id', [puntoId, mesaId, mesero]);
          await app.q('INSERT INTO pedido_detalle (pedido_id, plato_id, cantidad) VALUES ($1,$2,$3)', [p.id, platoId, cantidad]);
        };
        await pedido(ids.punto, ids.mesa, await plato(ids.punto), 60);
        await pedido(ids.punto2, ids.mesa2, await plato(ids.punto2), 10);

        const conOrden = async (proveedorId, valorTotal) => {
          const [s] = await app.q("INSERT INTO solicitud_alimentos (punto_id, solicitante_id, estado) VALUES ($1,$2,'EN TRÁMITE') RETURNING id", [ids.punto, jefe]);
          const [d] = await app.q('INSERT INTO detalle_solicitud (solicitud_id, categoria_id, producto_id, cantidad, unidad_id, precio_sugerido_unitario) VALUES ($1,$2,$3,100,$4,4500) RETURNING id', [s.id, ids.catGranos, ids.arroz, ids.kg]);
          const [c] = await app.q("INSERT INTO cotizacion (solicitud_id, proveedor_id, plazo_maximo, estado, valor_total, valores_registrados_en, creada_por) VALUES ($1,$2,current_date+1,'OPCIONADA',$3,now(),$4) RETURNING id", [s.id, proveedorId, valorTotal, compras]);
          await app.q('INSERT INTO cotizacion_detalle (cotizacion_id, detalle_solicitud_id, valor_unitario) VALUES ($1,$2,$3)', [c.id, d.id, valorTotal / 100]);
          await app.q('INSERT INTO orden_compra (cotizacion_id, solicitud_id, proveedor_id, valor_total, generada_por) VALUES ($1,$2,$3,$4,$5)', [c.id, s.id, proveedorId, valorTotal, compras]);
        };
        await conOrden(ids.provA, 472_500);
        await conOrden(ids.provA, 472_500);
        await conOrden(ids.provB, 360_000);
      });

      it('calcula producto más demandado, punto con mayor demanda y mejor proveedor (por defecto, el de mejores precios)', async () => {
        const t = await E('tablero.consultar', A.comercial, {});
        assert.equal(t.productoMasDemandado.producto, 'Arroz');
        assert.deepEqual([t.productoMasDemandado.consumoPedidos, t.productoMasDemandado.cantidadSolicitada, t.productoMasDemandado.demanda], [14, 300, 314]);
        assert.equal(t.productoMasDemandado.ranking[1].producto, 'Pollo');
        assert.equal(t.productoMasDemandado.ranking[1].demanda, 21);
        assert.deepEqual([t.restauranteMayorDemanda.punto, t.restauranteMayorDemanda.platosVendidos], ['Chapinero', 60]);
        assert.deepEqual([t.mejorProveedor.metrica, t.mejorProveedor.proveedor], ['menor_razon_precio', 'Proveedor B'], 'el enunciado pide el proveedor con los mejores precios');
        assert.ok(!('valorMetrica' in t.mejorProveedor));

        await E('reglas.definir', A.admin, { clave: 'criterio_mejor_proveedor', valor: { metrica: 'ordenes_compra' } });
        const porOrdenes = (await E('tablero.consultar', A.comercial, {})).mejorProveedor;
        assert.deepEqual([porOrdenes.metrica, porOrdenes.proveedor, porOrdenes.valorMetrica], ['ordenes_compra', 'Proveedor A', 2]);
        await E('reglas.definir', A.admin, { clave: 'criterio_mejor_proveedor', valor: { metrica: 'menor_razon_precio' } });
      });

      it('el criterio parametrizado cambia el mejor proveedor, sin exponer montos ni razones de precio', async () => {
        await E('reglas.definir', A.admin, { clave: 'criterio_mejor_proveedor', valor: { metrica: 'menor_razon_precio' } });
        const t = await E('tablero.consultar', A.comercial, {});
        assert.equal(t.mejorProveedor.proveedor, 'Proveedor B');
        assert.ok(!('valorMetrica' in t.mejorProveedor) && t.mejorProveedor.ranking.every((r) => !('valorMetrica' in r)));
        const json = JSON.stringify(t);
        for (const prohibido of ['valorOrdenes', 'razonPromedio', '"razon"', '472500', '360000']) assert.ok(!json.includes(prohibido), prohibido);

        await E('reglas.definir', A.admin, { clave: 'criterio_mejor_proveedor', valor: { metrica: 'cotizaciones_opcionadas' } });
        assert.equal((await E('tablero.consultar', A.comercial, {})).mejorProveedor.proveedor, 'Proveedor A');
      });

      it('un criterio inválido usa el predeterminado y deja una advertencia', async () => {
        await app.q(`UPDATE parametro SET valor = '{"metrica":"xx"}'::jsonb WHERE clave = 'criterio_mejor_proveedor'`);
        assert.equal((await E('tablero.consultar', A.comercial, {})).mejorProveedor.metrica, 'menor_razon_precio');
        assert.equal((await app.q("SELECT 1 FROM log_error WHERE nivel = 'WARN' AND modulo = 'tablero_bam'")).length, 1);
        await E('reglas.definir', A.admin, { clave: 'criterio_mejor_proveedor', valor: { metrica: 'menor_razon_precio' } });
      });

      it('un periodo sin actividad deja los indicadores sin datos', async () => {
        const futuro = await E('tablero.consultar', A.comercial, { desde: new Date(Date.now() + 365 * 86_400_000).toISOString() });
        assert.equal(futuro.productoMasDemandado.disponible, false);
        assert.equal(futuro.mejorProveedor.disponible, false);
      });

      it('un indicador que falla no tumba el tablero y se registra el error', async () => {
        const { TableroBamService } = await import('../src/domain/modules/analitica/TableroBamService.js');
        const { AnaliticaRepository } = await import('../src/domain/modules/analitica/AnaliticaRepository.js');
        const { ParametroRepository } = await import('../src/domain/modules/parametrizacion/ParametroRepository.js');
        const { pool } = await import('../src/infrastructure/database/supabaseClient.js');
        const { registrarError, registrarAdvertencia } = await import('../src/infrastructure/logging/errorLogger.js');
        const rota = Object.create(new AnaliticaRepository());
        rota.demandaPorPunto = async () => { throw new Error('consulta fallida'); };
        const t = await new TableroBamService({ db: pool, analitica: rota, parametros: new ParametroRepository(), registrador: { error: registrarError, advertencia: registrarAdvertencia } }).consultarTablero(A.comercial);
        assert.equal(t.restauranteMayorDemanda.disponible, false);
        assert.ok(t.restauranteMayorDemanda.error);
        assert.equal(t.productoMasDemandado.disponible, true);
        assert.equal((await app.q("SELECT 1 FROM log_error WHERE modulo = 'tablero_bam' AND nivel = 'ERROR'")).length, 1);
      });

      describe('Promociones por tendencias (CU-15)', () => {
        const correosDePromocion = () => app.falsos.correos.filter((c) => c.asunto.startsWith('Promoción sugerida'));

        it('cruza tendencias y productos solicitados y envía cada promoción a los jefes de cocina', async () => {
          const r = await app.facade.ejecutarProcesoAutomatico('promociones');
          assert.deepEqual([r.generadas, r.apiDisponible, r.tendencias], [3, true, 3]);
          const promos = (await app.q('SELECT titulo, origen FROM promocion ORDER BY titulo')).map((p) => `${p.titulo}|${p.origen}`);
          assert.deepEqual(promos, ['Promoción de Pollo|COMBINADA', 'Tendencia: Brownie|TENDENCIA', 'Tendencia: ceviche|TENDENCIA']);
          assert.ok(await app.drenado());
          assert.equal(correosDePromocion().length, 6, '3 promociones x 2 jefes de cocina');
          assert.equal((await app.q("SELECT 1 FROM notificacion WHERE tipo = 'PROMOCION' AND estado = 'ENVIADA'")).length, 6);
          assert.equal((await app.q('SELECT 1 FROM tendencia')).length, 3);
        });

        it('no repite una promoción dentro de la ventana', async () => {
          const r = await app.facade.ejecutarProcesoAutomatico('promociones');
          assert.deepEqual([r.generadas, r.omitidasPorRepetidas], [0, 3]);
          assert.ok(r.mensaje);
        });

        it('con la API de redes caída usa solo los productos más solicitados; un fallo de correo no impide el resto', { timeout: 30000 }, async () => {
          app.falsos.tendencias = 'caido';
          app.falsos.correoFalla = 1;
          const r = await app.facade.ejecutarProcesoAutomatico('promociones');
          assert.deepEqual([r.apiDisponible, r.generadas], [false, 1]);
          assert.equal((await app.q("SELECT origen FROM promocion WHERE titulo = 'Promoción de Arroz'"))[0].origen, 'MAS_SOLICITADO');
          assert.ok(await app.drenado());
          assert.equal((await app.q("SELECT 1 FROM log_error WHERE modulo = 'promociones' AND nivel = 'ERROR'")).length, 1, 'la caída de la API queda en el log');
          assert.ok((await app.q("SELECT 1 FROM log_error WHERE modulo = 'notificaciones' AND nivel = 'ERROR'")).length >= 1, 'el fallo de correo queda en el log');
          const lista = await E('promociones.listar', A.comercial, {});
          const arroz = lista.promociones.find((p) => p.titulo === 'Promoción de Arroz');
          assert.deepEqual([lista.total, arroz.enviadas, arroz.fallidas], [4, 2, 0], 'ambos jefes la recibieron una sola vez');
          assert.equal(await codigoDe(() => E('promociones.listar', A.mesero, {})), 'PROHIBIDO');
        });

        it('sin tendencias ni productos relevantes no se envía nada', async () => {
          const { PromocionService } = await import('../src/domain/modules/analitica/PromocionService.js');
          const { PromocionRepository } = await import('../src/domain/modules/analitica/PromocionRepository.js');
          const { pool, withTransaction } = await import('../src/infrastructure/database/supabaseClient.js');
          const { registrarEvento } = await import('../src/infrastructure/outbox/EventOutboxPublisher.js');
          const { registrarError, registrarEjecucion } = await import('../src/infrastructure/logging/errorLogger.js');
          const { ServicioExternoError } = await import('../src/domain/services/ServicioExternoError.js');
          const servicio = new PromocionService({
            db: pool, unidadDeTrabajo: withTransaction, promociones: new PromocionRepository(), analitica: { rankingProductos: async () => [] },
            tendencias: { obtenerTendencias: async () => { throw new ServicioExternoError('redes', 'TIMEOUT', 'x'); } },
            registrarEvento, registrador: { error: registrarError, ejecucion: registrarEjecucion },
          });
          const r = await servicio.generarPromociones();
          assert.equal(r.generadas, 0);
          assert.match(r.mensaje, /No se identificaron/);
        });
      });
    });
  });

  describe('Auditoría y logs (CU-16)', () => {
    it('cada operación de escritura queda auditada con quién la hizo; las listas desplegables no', async () => {
      const filas = await app.q("SELECT correo FROM auditoria WHERE entidad = 'catalogo:categorias' AND accion = 'CREATE'");
      assert.ok(filas.length >= 2);
      assert.ok(filas.every((f) => f.correo === 'admin@kg.co'));
      assert.equal((await app.q("SELECT 1 FROM auditoria WHERE entidad LIKE 'catalogo%' AND accion = 'READ'")).length, 0);
    });

    it('el Administrador filtra por entidad y acción, ve el detalle y los filtros sin resultado informan', async () => {
      const lista = await E('auditoria.consultar', A.admin, { entidad: 'catalogo:categorias', accion: 'CREATE' });
      assert.ok(lista.total >= 2);
      const detalle = await E('auditoria.detalle', A.admin, { id: lista.registros[0].id });
      assert.equal(detalle.detalle.operacion, 'catalogos.crear');
      assert.ok(detalle.fecha);
      assert.match((await E('auditoria.consultar', A.admin, { entidad: 'no_existe' })).mensaje, /Ningún/);
    });

    it('rechaza rangos de fechas y acciones inválidos, y a quien no es Administrador', async () => {
      assert.equal(await codigoDe(() => E('auditoria.consultar', A.admin, { desde: '2026-12-01', hasta: '2026-01-01' })), 'VALIDACION');
      assert.equal(await codigoDe(() => E('auditoria.consultar', A.admin, { accion: 'INVENTADA' })), 'VALIDACION');
      assert.equal(await codigoDe(() => E('auditoria.consultar', A.compras, {})), 'PROHIBIDO');
      assert.equal(await codigoDe(() => E('logs.consultar', A.comercial, {})), 'PROHIBIDO');
    });

    it('consulta los logs de errores con su detalle', async () => {
      const logs = await E('logs.consultar', A.admin, { nivel: 'ERROR', modulo: 'promociones' });
      assert.ok(logs.total >= 1);
      assert.ok((await E('logs.detalle', A.admin, { id: logs.registros[0].id })).detalle !== undefined);
    });

    it('los registros de auditoría y de logs no se pueden modificar ni eliminar', async () => {
      await assert.rejects(app.bd.query("UPDATE auditoria SET entidad = 'x'"), /no pueden modificarse/);
      await assert.rejects(app.bd.query('DELETE FROM auditoria'), /no pueden modificarse/);
      await assert.rejects(app.bd.query("UPDATE log_error SET mensaje = 'x'"), /no pueden modificarse/);
      await assert.rejects(app.bd.query('DELETE FROM log_error'), /no pueden modificarse/);
    });
  });
});
