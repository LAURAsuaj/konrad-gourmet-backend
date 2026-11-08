import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listarOrdenes } from '../../api/compras.js';
import { mensajeDeError } from '../../api/cliente.js';
import { formatearFechaHora, formatearMoneda } from '../../shared/lib/formato.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { DataTable } from '../../shared/ui/DataTable.jsx';
import { Pagination } from '../../shared/ui/Pagination.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import estilos from './compras.module.css';

const LIMITE = 25;

/** Órdenes de compra generadas (CU-13). */
export function OrdenesPage() {
  const [offset, setOffset] = useState(0);
  const filtros = { limite: LIMITE, offset };
  const consulta = useQuery({ queryKey: ['ordenes', filtros], queryFn: () => listarOrdenes(filtros), placeholderData: keepPreviousData });

  const columnas = [
    {
      clave: 'consecutivo',
      titulo: 'N.º',
      cifras: true,
      render: (o) => (
        <Link className={estilos.enlaceFila} to={`/compras/ordenes/${o.id}`}>
          {o.consecutivo}
        </Link>
      ),
    },
    { clave: 'proveedor', titulo: 'Proveedor' },
    { clave: 'solicitud', titulo: 'Solicitud', cifras: true, render: (o) => <Link to={`/compras/solicitudes/${o.solicitudId}`}>N.º {o.solicitudConsecutivo}</Link> },
    { clave: 'cotizacion', titulo: 'Cotización', cifras: true, render: (o) => <Link to={`/compras/cotizaciones/${o.cotizacionId}`}>N.º {o.cotizacionConsecutivo}</Link> },
    { clave: 'valorTotal', titulo: 'Valor total', alinear: 'derecha', cifras: true, render: (o) => formatearMoneda(o.valorTotal) },
    { clave: 'generadaPor', titulo: 'Generada por' },
    { clave: 'generadaEn', titulo: 'Fecha', cifras: true, render: (o) => formatearFechaHora(o.generadaEn) },
  ];

  return (
    <>
      <PageHeader titulo="Órdenes de compra" descripcion="Se generan a partir de cotizaciones opcionadas; cada cotización tiene una sola orden." />
      <Card sinRelleno>
        {consulta.isError ? (
          <div className={estilos.aviso}>
            <Banner tono="error">{mensajeDeError(consulta.error)}</Banner>
          </div>
        ) : null}
        <DataTable
          titulo="Órdenes de compra"
          columnas={columnas}
          filas={consulta.data?.ordenes}
          cargando={consulta.isPending}
          vacio={<EmptyState titulo="Todavía no hay órdenes de compra" descripcion="El Director de compras las genera desde una cotización opcionada." />}
        />
        <Pagination total={consulta.data?.total ?? 0} limite={LIMITE} offset={offset} alCambiar={setOffset} />
      </Card>
    </>
  );
}
