import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listarCotizaciones } from '../../api/compras.js';
import { mensajeDeError } from '../../api/cliente.js';
import { formatearFecha, formatearMoneda } from '../../shared/lib/formato.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { Tabs } from '../../shared/ui/Tabs.jsx';
import { DataTable } from '../../shared/ui/DataTable.jsx';
import { Pagination } from '../../shared/ui/Pagination.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import { estadoCotizacion } from './estadosCompras.js';
import estilos from './compras.module.css';

const LIMITE = 25;
const PESTANAS = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'sin-valores', etiqueta: 'Sin valores' },
  { valor: 'OPCIONADA', etiqueta: 'Opcionadas' },
  { valor: 'SOSPECHOSA', etiqueta: 'Sospechosas' },
  { valor: 'RECHAZADA', etiqueta: 'Rechazadas' },
  { valor: 'ENVIADA', etiqueta: 'Enviadas' },
];

const filtroDe = (vista) => {
  if (vista === 'sin-valores') return { pendientesDeValor: 'true' };
  if (vista === 'todas') return {};
  return { estado: vista };
};

/** Cotizaciones a proveedores (CU-11) con su estado de validación automática. */
export function CotizacionesPage() {
  const [parametros, setParametros] = useSearchParams();
  const vista = PESTANAS.some((p) => p.valor === parametros.get('vista')) ? parametros.get('vista') : 'todas';
  const [offset, setOffset] = useState(0);
  const filtros = { ...filtroDe(vista), limite: LIMITE, offset };
  const consulta = useQuery({ queryKey: ['cotizaciones', filtros], queryFn: () => listarCotizaciones(filtros), placeholderData: keepPreviousData, refetchInterval: 30_000 });

  const columnas = [
    {
      clave: 'consecutivo',
      titulo: 'N.º',
      cifras: true,
      render: (c) => (
        <Link className={estilos.enlaceFila} to={`/compras/cotizaciones/${c.id}`}>
          {c.consecutivo}
        </Link>
      ),
    },
    {
      clave: 'solicitud',
      titulo: 'Solicitud',
      cifras: true,
      render: (c) => <Link to={`/compras/solicitudes/${c.solicitudId}`}>N.º {c.solicitudConsecutivo}</Link>,
    },
    { clave: 'proveedor', titulo: 'Proveedor' },
    { clave: 'plazoMaximo', titulo: 'Plazo', cifras: true, render: (c) => formatearFecha(`${c.plazoMaximo}T12:00:00`) },
    { clave: 'valorTotal', titulo: 'Valor cotizado', alinear: 'derecha', cifras: true, render: (c) => (c.valorTotal == null ? 'Sin valores' : formatearMoneda(c.valorTotal)) },
    { clave: 'estado', titulo: 'Estado', render: (c) => <StatusPill tono={estadoCotizacion(c.estado).tono}>{estadoCotizacion(c.estado).texto}</StatusPill> },
  ];

  return (
    <>
      <PageHeader titulo="Cotizaciones" descripcion="Al registrar los valores, el sistema compara con el precio del Ministerio y clasifica cada cotización." />
      <Card sinRelleno>
        <div className={estilos.filtros}>
          <Tabs
            opciones={PESTANAS}
            valor={vista}
            alCambiar={(v) => {
              setOffset(0);
              setParametros(v === 'todas' ? {} : { vista: v }, { replace: true });
            }}
            etiquetaAccesible="Estado de la cotización"
          />
        </div>
        {consulta.isError ? (
          <div className={estilos.aviso}>
            <Banner tono="error">{mensajeDeError(consulta.error)}</Banner>
          </div>
        ) : null}
        <DataTable
          titulo="Cotizaciones"
          columnas={columnas}
          filas={consulta.data?.cotizaciones}
          cargando={consulta.isPending}
          vacio={<EmptyState titulo="No hay cotizaciones en esta vista" descripcion={consulta.data?.mensaje} />}
        />
        <Pagination total={consulta.data?.total ?? 0} limite={LIMITE} offset={offset} alCambiar={setOffset} />
      </Card>
    </>
  );
}
