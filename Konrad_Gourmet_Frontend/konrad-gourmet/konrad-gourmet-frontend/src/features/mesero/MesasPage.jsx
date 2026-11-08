import { useMemo, useState } from 'react';
import { mensajeDeError } from '../../api/cliente.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { KpiCard, KpiGrid } from '../../shared/ui/KpiCard.jsx';
import { Tabs } from '../../shared/ui/Tabs.jsx';
import { TextField } from '../../shared/ui/Field.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Spinner } from '../../shared/ui/Spinner.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import { formatearNumero } from '../../shared/lib/formato.js';
import { useComanda } from './ComandaProvider.jsx';
import { TarjetaMesa } from './TarjetaMesa.jsx';
import { useDatosMesero } from './useDatosMesero.js';
import { FILTROS_MESA, filtrarMesas, resumirMesas } from './resumenMesas.js';
import estilos from './MesasPage.module.css';

const PESTANAS = [
  { valor: FILTROS_MESA.TODAS, etiqueta: 'Todas' },
  { valor: FILTROS_MESA.LIBRES, etiqueta: 'Libres hoy' },
  { valor: FILTROS_MESA.CON_PEDIDOS, etiqueta: 'Con pedidos' },
];

/** Plano de mesas del punto del mesero. Tocar una mesa abre la toma de orden. */
export function MesasPage() {
  const { mesas, pedidos } = useDatosMesero();
  const { comandas } = useComanda();
  const [filtro, setFiltro] = useState(FILTROS_MESA.TODAS);
  const [busqueda, setBusqueda] = useState('');

  const resumenes = useMemo(() => resumirMesas(mesas.data, pedidos.data), [mesas.data, pedidos.data]);
  const visibles = filtrarMesas(resumenes, { filtro, busqueda });
  const conPedidos = resumenes.filter((m) => m.pedidosHoy > 0).length;
  const abiertas = Object.keys(comandas).length;
  const unidadesDe = (mesaId) => (comandas[mesaId] ?? []).reduce((t, l) => t + l.cantidad, 0);

  const error = mesas.error ?? pedidos.error;

  return (
    <>
      <PageHeader titulo="Mesas" descripcion="Toque una mesa para tomar su orden. El estado se actualiza solo cada 30 segundos." />

      <KpiGrid etiquetaAccesible="Resumen de mesas">
        <KpiCard etiqueta="Mesas del punto" valor={resumenes.length} />
        <KpiCard etiqueta="Con pedidos hoy" valor={conPedidos} detalle={`${resumenes.length - conPedidos} sin pedidos`} />
        <KpiCard etiqueta="Platos pedidos hoy" valor={formatearNumero(resumenes.reduce((t, m) => t + m.platosHoy, 0))} />
        <KpiCard etiqueta="Órdenes sin enviar" valor={abiertas} destacado={abiertas > 0} detalle={abiertas ? 'Revise y envíelas a cocina' : 'Todo enviado'} />
      </KpiGrid>

      {error ? <Banner tono="error">{mensajeDeError(error)}</Banner> : null}

      <div className={estilos.barra}>
        <Tabs opciones={PESTANAS} valor={filtro} alCambiar={setFiltro} etiquetaAccesible="Filtrar mesas" />
        <div className={estilos.busqueda}>
          <TextField etiqueta="Buscar mesa" type="search" inputMode="numeric" placeholder="Número" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
      </div>

      <div className={estilos.leyenda} aria-hidden="true">
        <span>
          <i className={estilos.muestra} /> Libre hoy
        </span>
        <span>
          <i className={`${estilos.muestra} ${estilos.muestraPedidos}`} /> Con pedidos hoy
        </span>
        <span>
          <i className={`${estilos.muestra} ${estilos.muestraNueva}`} /> Nueva orden sin enviar
        </span>
      </div>

      {mesas.isPending ? (
        <Spinner etiqueta="Cargando mesas" />
      ) : !resumenes.length ? (
        <EmptyState titulo="Su punto todavía no tiene mesas" descripcion="El Administrador las crea en el catálogo de mesas." />
      ) : !visibles.length ? (
        <EmptyState titulo="Ninguna mesa coincide con el filtro" descripcion="Cambie el filtro o borre la búsqueda." />
      ) : (
        <ul className={estilos.plano} aria-label="Plano de mesas">
          {visibles.map((mesa) => (
            <li key={mesa.id}>
              <TarjetaMesa mesa={mesa} unidadesEnComanda={unidadesDe(mesa.id)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
