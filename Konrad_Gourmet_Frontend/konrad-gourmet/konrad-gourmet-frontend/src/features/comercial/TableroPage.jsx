import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { obtenerTablero } from '../../api/comercial.js';
import { mensajeDeError } from '../../api/cliente.js';
import { finDelDia, formatearNumero, formatearRelativo, inicioDelDia } from '../../shared/lib/formato.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { Tabs } from '../../shared/ui/Tabs.jsx';
import { TextField } from '../../shared/ui/Field.jsx';
import { BarraProgreso } from '../../shared/ui/BarraProgreso.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Spinner } from '../../shared/ui/Spinner.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import { estadoIndicador, filasRanking, metricaProveedor } from './tablero.js';
import estilos from './comercial.module.css';

const MODOS = [
  { valor: 'enunciado', etiqueta: 'Periodos del enunciado' },
  { valor: 'personalizado', etiqueta: 'Elegir periodo' },
];

function Ranking({ filas, sufijo }) {
  return (
    <ol className={estilos.ranking}>
      {filas.map((f) => (
        <li key={f.posicion} className={`${estilos.filaRanking} ${sufijo ? '' : estilos.filaSinCifra}`}>
          <span className={`${estilos.posicion} kg-cifras`}>{f.posicion}</span>
          <span className={estilos.nombre}>{f.nombre}</span>
          {sufijo ? (
            <>
              <BarraProgreso valor={f.valor} maximo={f.maximo} tono={f.posicion === 1 ? 'marca' : 'neutro'} etiqueta={`${f.nombre}: ${f.valor} ${sufijo}`} />
              <span className="kg-cifras">{formatearNumero(f.valor)}</span>
            </>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Indicador con sus tres estados: con datos, sin datos o con error (cada uno es independiente). */
function Indicador({ titulo, indicador, children }) {
  const estado = estadoIndicador(indicador);
  return (
    <Card titulo={titulo} className={estilos.indicador}>
      {indicador?.periodo?.descripcion ? <p className={estilos.periodoIndicador}>{indicador.periodo.descripcion}</p> : null}
      {estado.tipo === 'ok' ? children : estado.tipo === 'vacio' ? <EmptyState titulo="Sin datos en el periodo" descripcion={estado.mensaje} /> : <Banner tono="error">{estado.mensaje}</Banner>}
    </Card>
  );
}

/**
 * Tablero de control BAM (CU-14) del Director Comercial. Por la regla de confidencialidad
 * (SRS 6.5) solo muestra nombres y conteos: ningún monto ni razón de precio.
 */
export function TableroPage() {
  const [modo, setModo] = useState('enunciado');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const rangoInvalido = desde && hasta && desde > hasta;
  const filtros = modo === 'personalizado' ? { desde: inicioDelDia(desde), hasta: finDelDia(hasta) } : {};
  const sinFechas = modo === 'personalizado' && !desde && !hasta;

  const tablero = useQuery({
    queryKey: ['tablero', filtros],
    queryFn: () => obtenerTablero(filtros),
    enabled: !rangoInvalido && !sinFechas,
    refetchInterval: 5 * 60_000,
  });
  const t = tablero.data;
  const producto = t?.productoMasDemandado;
  const punto = t?.restauranteMayorDemanda;
  const proveedor = t?.mejorProveedor;
  const metrica = metricaProveedor(proveedor?.metrica);

  return (
    <>
      <PageHeader
        titulo="Tablero de control"
        descripcion={t ? `Actualizado ${formatearRelativo(t.generadoEn)}. Solo nombres y conteos: los montos son confidenciales del área de compras.` : undefined}
        acciones={
          <Button variante="secundario" icono="recargar" cargando={tablero.isFetching} onClick={() => tablero.refetch()}>
            Actualizar
          </Button>
        }
      />

      <div className={estilos.periodo}>
        <Tabs opciones={MODOS} valor={modo} alCambiar={setModo} etiquetaAccesible="Periodo del tablero" />
        {modo === 'personalizado' ? (
          <>
            <div className={estilos.campo}>
              <TextField etiqueta="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className={estilos.campo}>
              <TextField etiqueta="Hasta" type="date" value={hasta} error={rangoInvalido ? 'Debe ser posterior a “Desde”.' : undefined} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </>
        ) : null}
      </div>

      {tablero.isError ? <Banner tono="error">{mensajeDeError(tablero.error)}</Banner> : null}
      {sinFechas ? (
        <EmptyState titulo="Elija al menos una fecha" descripcion="Los tres indicadores usarán el mismo periodo." />
      ) : tablero.isPending ? (
        <Spinner etiqueta="Calculando indicadores" />
      ) : t ? (
        <div className={estilos.indicadores}>
          <Indicador titulo="Producto más demandado" indicador={producto}>
            <div className={estilos.ganador}>
              <span className={estilos.ganadorNombre}>{producto?.producto}</span>
              <span className={`${estilos.ganadorDato} kg-cifras`}>
                {formatearNumero(producto?.demanda)} {producto?.unidad} de demanda
              </span>
            </div>
            <dl className={estilos.datos}>
              <dt>Consumido en pedidos</dt>
              <dd className="kg-cifras">
                {formatearNumero(producto?.consumoPedidos)} {producto?.unidad}
              </dd>
              <dt>Pedido en solicitudes</dt>
              <dd className="kg-cifras">
                {formatearNumero(producto?.cantidadSolicitada)} {producto?.unidad}
              </dd>
            </dl>
            <h3 className={estilos.subtitulo}>Ranking</h3>
            <Ranking filas={filasRanking(producto?.ranking, { nombre: 'producto', valor: 'demanda' })} sufijo="de demanda" />
          </Indicador>

          <Indicador titulo="Punto con mayor demanda" indicador={punto}>
            <div className={estilos.ganador}>
              <span className={estilos.ganadorNombre}>{punto?.punto}</span>
              <span className={`${estilos.ganadorDato} kg-cifras`}>
                {formatearNumero(punto?.platosVendidos)} platos en {formatearNumero(punto?.pedidos)} {punto?.pedidos === 1 ? 'pedido' : 'pedidos'}
              </span>
            </div>
            <h3 className={estilos.subtitulo}>Ranking por platos vendidos</h3>
            <Ranking filas={filasRanking(punto?.ranking, { nombre: 'punto', valor: 'platosVendidos' })} sufijo="platos" />
          </Indicador>

          <Indicador titulo="Mejor proveedor" indicador={proveedor}>
            <div className={estilos.ganador}>
              <span className={estilos.ganadorNombre}>{proveedor?.proveedor}</span>
              <span className={estilos.ganadorDato}>{metrica.unidad && proveedor?.valorMetrica != null ? metrica.unidad(proveedor.valorMetrica) : metrica.texto}</span>
            </div>
            <dl className={estilos.datos}>
              <dt>Cotizaciones</dt>
              <dd className="kg-cifras">{formatearNumero(proveedor?.detalle?.cotizaciones)}</dd>
              <dt>Opcionadas</dt>
              <dd className="kg-cifras">{formatearNumero(proveedor?.detalle?.cotizacionesOpcionadas)}</dd>
              <dt>Órdenes de compra</dt>
              <dd className="kg-cifras">{formatearNumero(proveedor?.detalle?.ordenesCompra)}</dd>
            </dl>
            <h3 className={estilos.subtitulo}>Ranking: {metrica.texto.toLowerCase()}</h3>
            <Ranking filas={filasRanking(proveedor?.ranking, { nombre: 'proveedor', valor: 'valorMetrica' })} sufijo={metrica.corto} />
            {metrica.unidad ? null : <p className={estilos.nota}>Con este criterio solo se muestra el orden: las razones de precio son confidenciales.</p>}
          </Indicador>
        </div>
      ) : null}
    </>
  );
}
