import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { consultaPedidosDelDia } from '../../api/cocina.js';
import { mensajeDeError } from '../../api/cliente.js';
import { useSesion } from '../auth/AuthProvider.jsx';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { KpiCard, KpiGrid } from '../../shared/ui/KpiCard.jsx';
import { TextField } from '../../shared/ui/Field.jsx';
import { DataTable } from '../../shared/ui/DataTable.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import { fechaDeHoy, finDelDia, formatearHora, formatearNumero, inicioDelDia } from '../../shared/lib/formato.js';
import estilos from './PedidosPage.module.css';

/**
 * Pedidos del punto en un día (GET /pedidos). La usan el Mesero y el Jefe de Cocina.
 * "Inventario" indica si el descuento diario automático ya procesó el pedido.
 */
export function PedidosPage() {
  const { usuario } = useSesion();
  const hoy = fechaDeHoy();
  const [fecha, setFecha] = useState(hoy);
  const [mesa, setMesa] = useState('');

  const consulta = useQuery(consultaPedidosDelDia(fecha, { desde: inicioDelDia(fecha), hasta: finDelDia(fecha) }));
  const pedidos = consulta.data ?? [];
  const visibles = mesa.trim() ? pedidos.filter((p) => String(p.mesa) === mesa.trim()) : pedidos;
  const platos = pedidos.reduce((t, p) => t + p.items.reduce((s, i) => s + i.cantidad, 0), 0);
  const pendientes = pedidos.filter((p) => !p.descontado).length;

  const columnas = [
    { clave: 'fecha', titulo: 'Hora', cifras: true, render: (p) => formatearHora(p.fecha) },
    { clave: 'mesa', titulo: 'Mesa', cifras: true, render: (p) => `Mesa ${p.mesa}` },
    {
      clave: 'items',
      titulo: 'Platos',
      render: (p) => (
        <ul className={estilos.platos}>
          {p.items.map((i) => (
            <li key={i.platoId}>
              <span className="kg-cifras">{i.cantidad} ×</span> {i.plato}
            </li>
          ))}
        </ul>
      ),
    },
    { clave: 'mesero', titulo: 'Mesero' },
    {
      clave: 'descontado',
      titulo: 'Inventario',
      render: (p) => (p.descontado ? <StatusPill tono="neutro">Descontado</StatusPill> : <StatusPill tono="contorno">Por descontar</StatusPill>),
    },
  ];

  return (
    <>
      <PageHeader
        titulo="Pedidos"
        descripcion={
          usuario?.rol === 'JEFE_COCINA'
            ? 'Pedidos de las mesas de su punto. El inventario se descuenta en el proceso diario automático.'
            : 'Pedidos registrados en las mesas de su punto.'
        }
      />

      <KpiGrid etiquetaAccesible="Resumen del día">
        <KpiCard etiqueta="Pedidos" valor={formatearNumero(pedidos.length)} detalle={fecha === hoy ? 'Hoy' : fecha} />
        <KpiCard etiqueta="Platos" valor={formatearNumero(platos)} />
        <KpiCard etiqueta="Por descontar del inventario" valor={formatearNumero(pendientes)} />
      </KpiGrid>

      <Card sinRelleno>
        <div className={estilos.filtros}>
          <div className={estilos.campoDia}>
            <TextField etiqueta="Día" type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value || hoy)} />
          </div>
          <div className={estilos.campoMesa}>
            <TextField etiqueta="Mesa" type="search" inputMode="numeric" placeholder="Número" value={mesa} onChange={(e) => setMesa(e.target.value)} />
          </div>
        </div>
        {consulta.isError ? (
          <div className={estilos.aviso}>
            <Banner tono="error">{mensajeDeError(consulta.error)}</Banner>
          </div>
        ) : null}
        <DataTable
          titulo="Pedidos del día"
          columnas={columnas}
          filas={visibles}
          cargando={consulta.isPending}
          vacio={<EmptyState titulo="No hay pedidos para este día" descripcion={mesa ? 'Ninguno coincide con la mesa indicada.' : 'Elija otro día para consultar.'} />}
        />
        {pedidos.length >= 200 ? (
          <div className={estilos.aviso}>
            <Banner tono="info">Se muestran los 200 pedidos más recientes del día, el máximo que entrega la API por consulta.</Banner>
          </div>
        ) : null}
      </Card>
    </>
  );
}
