import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { consultaPedidosDelDia, obtenerMenu } from '../../api/cocina.js';
import { listarAlarmas, listarInventario } from '../../api/inventario.js';
import { mensajeDeError } from '../../api/cliente.js';
import { useSesion } from '../auth/AuthProvider.jsx';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { KpiCard, KpiGrid } from '../../shared/ui/KpiCard.jsx';
import { AlertCard } from '../../shared/ui/AlertCard.jsx';
import { BarraProgreso } from '../../shared/ui/BarraProgreso.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import { fechaDeHoy, finDelDia, formatearHora, formatearNumero, formatearRelativo, inicioDelDia } from '../../shared/lib/formato.js';
import { describirPlatos } from '../mesero/resumenMesas.js';
import { ESTADOS_STOCK, estadoStock, inventarioMasBajo, rankingPlatos } from './analisisCocina.js';
import estilos from './PanelCocinaPage.module.css';

/** Pantalla principal del Jefe de Cocina: pedidos de hoy, alarmas e inventario del punto. */
export function PanelCocinaPage() {
  const { usuario } = useSesion();
  const navigate = useNavigate();
  const hoy = fechaDeHoy();
  const pedidos = useQuery(consultaPedidosDelDia(hoy, { desde: inicioDelDia(hoy), hasta: finDelDia(hoy) }));
  const menu = useQuery({ queryKey: ['menu', { incluirInactivos: false }], queryFn: () => obtenerMenu() });
  const inventario = useQuery({ queryKey: ['inventario', 'punto'], queryFn: () => listarInventario(), refetchInterval: 60_000 });
  const alarmas = useQuery({ queryKey: ['inventario', 'alarmas'], queryFn: listarAlarmas, refetchInterval: 60_000 });

  const listaPedidos = pedidos.data ?? [];
  const platosHoy = listaPedidos.reduce((t, p) => t + p.items.reduce((s, i) => s + i.cantidad, 0), 0);
  const ranking = rankingPlatos(listaPedidos);
  const maximo = ranking[0]?.cantidad ?? 0;
  const items = inventario.data ?? [];
  const idsEnAlarma = items.filter((i) => estadoStock(i) !== 'NORMAL').map((i) => i.productoId);
  const error = pedidos.error ?? menu.error ?? inventario.error ?? alarmas.error;

  return (
    <>
      <PageHeader titulo={`Hola, ${usuario?.nombre?.split(' ')[0] ?? ''}`} descripcion="Así va la cocina de su punto hoy." />

      {error ? <Banner tono="error">{mensajeDeError(error)}</Banner> : null}

      <KpiGrid etiquetaAccesible="Resumen de hoy">
        <KpiCard etiqueta="Pedidos hoy" valor={formatearNumero(listaPedidos.length)} />
        <KpiCard etiqueta="Platos servidos hoy" valor={formatearNumero(platosHoy)} />
        <KpiCard etiqueta="Platos en el menú" valor={formatearNumero(menu.data?.length ?? 0)} />
        <KpiCard etiqueta="Alarmas de stock" valor={formatearNumero(alarmas.data?.length ?? 0)} destacado={(alarmas.data?.length ?? 0) > 0} detalle={alarmas.data?.length ? 'Requieren reabastecimiento' : 'Sin alarmas activas'} />
      </KpiGrid>

      <div className={estilos.columnas}>
        <Card
          titulo="Alarmas de stock"
          acciones={
            idsEnAlarma.length ? (
              <Button tamano="pequeno" onClick={() => navigate(`/cocina/solicitudes/nueva?productos=${idsEnAlarma.join(',')}`)}>
                Solicitar alimentos
              </Button>
            ) : null
          }
        >
          {alarmas.data?.length ? (
            <ul className={estilos.lista}>
              {alarmas.data.map((a) => (
                <li key={a.id}>
                  <AlertCard
                    flotante={false}
                    categoria="Stock bajo"
                    titulo={`${a.producto}: quedan ${formatearNumero(a.cantidadActual)} ${a.unidad}`}
                    detalle={`Referencia: ${formatearNumero(a.cantidadReferencia)} ${a.unidad}`}
                    momento={formatearRelativo(a.generadaEn)}
                    destino="/cocina/inventario"
                    textoDestino="Ver inventario"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState titulo="No hay alarmas activas" descripcion="Todos los productos están por encima del nivel de alarma." />
          )}
        </Card>

        <Card titulo="Platos más pedidos hoy">
          {ranking.length ? (
            <ol className={estilos.lista}>
              {ranking.map((r, i) => (
                <li key={r.platoId} className={estilos.ranking}>
                  <span className={`${estilos.posicion} kg-cifras`}>{i + 1}</span>
                  <span className={estilos.nombre}>{r.plato}</span>
                  <BarraProgreso valor={r.cantidad} maximo={maximo} tono={i === 0 ? 'marca' : 'neutro'} etiqueta={`${r.plato}: ${r.cantidad} porciones`} gruesa />
                  <span className={`${estilos.cifra} kg-cifras`}>{formatearNumero(r.cantidad)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState titulo="Todavía no hay pedidos hoy" />
          )}
        </Card>
      </div>

      <div className={estilos.columnas}>
        <Card titulo="Inventario más bajo" acciones={<Link className={estilos.enlace} to="/cocina/inventario">Ver inventario</Link>}>
          {items.length ? (
            <ul className={estilos.lista}>
              {inventarioMasBajo(items).map((i) => {
                const estado = ESTADOS_STOCK[estadoStock(i)];
                return (
                  <li key={i.id} className={estilos.stock}>
                    <div className={estilos.stockFila}>
                      <span className={estilos.nombre}>{i.producto}</span>
                      <span className="kg-cifras">
                        {formatearNumero(i.cantidadActual)} / {formatearNumero(i.cantidadReferencia)} {i.unidad}
                      </span>
                    </div>
                    <BarraProgreso valor={i.porcentaje} tono={estado.barra} etiqueta={`${i.producto}: ${i.porcentaje} % de la referencia, ${estado.texto}`} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState titulo="El inventario está vacío" accion={<Link to="/cocina/inventario">Cargar inventario</Link>} />
          )}
        </Card>

        <Card titulo="Últimos pedidos" acciones={<Link className={estilos.enlace} to="/pedidos">Ver todos</Link>}>
          {listaPedidos.length ? (
            <ul className={estilos.lista}>
              {listaPedidos.slice(0, 6).map((p) => (
                <li key={p.id} className={estilos.pedido}>
                  <span className={`${estilos.hora} kg-cifras`}>{formatearHora(p.fecha)}</span>
                  <span className="kg-cifras">Mesa {p.mesa}</span>
                  <span>{describirPlatos(p.items, 3)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState titulo="Todavía no hay pedidos hoy" />
          )}
        </Card>
      </div>
    </>
  );
}
