import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { obtenerOrden } from '../../api/compras.js';
import { mensajeDeError } from '../../api/cliente.js';
import { useTema } from '../../theme/TemaProvider.jsx';
import { formatearFechaHora, formatearMoneda, formatearNumero } from '../../shared/lib/formato.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { DataTable } from '../../shared/ui/DataTable.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Spinner } from '../../shared/ui/Spinner.jsx';
import { Icono } from '../../shared/ui/Icono.jsx';
import estilos from './compras.module.css';

/** Orden de compra lista para imprimir o guardar en PDF desde el navegador. */
export function DetalleOrdenPage() {
  const { id } = useParams();
  const { apariencia } = useTema();
  const consulta = useQuery({ queryKey: ['orden', id], queryFn: () => obtenerOrden(id) });

  if (consulta.isPending) return <Spinner etiqueta="Cargando orden de compra" />;
  if (consulta.isError) return <Banner tono="error">{mensajeDeError(consulta.error)}</Banner>;
  const o = consulta.data;

  const columnas = [
    { clave: 'producto', titulo: 'Alimento', render: (a) => `${a.producto}${a.marca ? ` (${a.marca})` : ''}` },
    { clave: 'cantidad', titulo: 'Cantidad', alinear: 'derecha', cifras: true, render: (a) => `${formatearNumero(a.cantidad)} ${a.unidad}` },
    { clave: 'valorUnitario', titulo: 'Valor unitario', alinear: 'derecha', cifras: true, render: (a) => formatearMoneda(a.valorUnitario) },
    { clave: 'subtotal', titulo: 'Subtotal', alinear: 'derecha', cifras: true, render: (a) => formatearMoneda(a.subtotal) },
  ];

  return (
    <>
      <div className={estilos.noImprimir}>
        <Link to="/compras/ordenes" className={estilos.volver}>
          <Icono nombre="izquierda" tamano={16} /> Órdenes de compra
        </Link>
      </div>
      <div className={estilos.noImprimir}>
        <PageHeader titulo={`Orden de compra N.º ${o.consecutivo}`} acciones={<Button onClick={() => window.print()}>Imprimir o guardar PDF</Button>} />
      </div>
      <Card className={estilos.documento} titulo={`${apariencia.nombreComercial} · Orden de compra N.º ${o.consecutivo}`} sinRelleno>
        <div className={estilos.aviso}>
          <dl className={estilos.datos}>
            <dt>Proveedor</dt>
            <dd>{o.proveedor}</dd>
            <dt>Solicitud</dt>
            <dd className="kg-cifras">N.º {o.solicitudConsecutivo}</dd>
            <dt>Cotización</dt>
            <dd className="kg-cifras">N.º {o.cotizacionConsecutivo}</dd>
            <dt>Generada por</dt>
            <dd>{o.generadaPor}</dd>
            <dt>Fecha</dt>
            <dd className="kg-cifras">{formatearFechaHora(o.generadaEn)}</dd>
          </dl>
        </div>
        <DataTable titulo="Alimentos de la orden" columnas={columnas} filas={o.alimentos} claveFila={(a) => `${a.producto}-${a.marca ?? ''}`} />
        <div className={estilos.total}>
          <span>Valor total</span>
          <span className={`${estilos.totalValor} kg-cifras`}>{formatearMoneda(o.valorTotal)}</span>
        </div>
      </Card>
    </>
  );
}
