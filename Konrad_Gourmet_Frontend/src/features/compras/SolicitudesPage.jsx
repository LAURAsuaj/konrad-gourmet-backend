import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listarSolicitudes } from '../../api/compras.js';
import { mensajeDeError } from '../../api/cliente.js';
import { useCatalogo } from '../../shared/lib/useCatalogo.js';
import { finDelDia, formatearFecha, formatearMoneda, inicioDelDia } from '../../shared/lib/formato.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { Tabs } from '../../shared/ui/Tabs.jsx';
import { SelectField, TextField } from '../../shared/ui/Field.jsx';
import { DataTable } from '../../shared/ui/DataTable.jsx';
import { Pagination } from '../../shared/ui/Pagination.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import { estadoSolicitud } from './estadosCompras.js';
import estilos from './compras.module.css';

const LIMITE = 25;
const PESTANAS = [
  { valor: '', etiqueta: 'Todas' },
  { valor: 'PENDIENTE', etiqueta: 'Pendientes' },
  { valor: 'EN TRÁMITE', etiqueta: 'En trámite' },
];

/** Solicitudes de alimentos de todos los puntos (CU-08), con filtros. */
export function SolicitudesPage() {
  const puntos = useCatalogo('puntos');
  const [estado, setEstado] = useState('PENDIENTE');
  const [puntoId, setPuntoId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [offset, setOffset] = useState(0);
  const rangoInvalido = desde && hasta && desde > hasta;

  const filtros = { estado: estado || undefined, puntoId: puntoId || undefined, desde: inicioDelDia(desde), hasta: finDelDia(hasta), limite: LIMITE, offset };
  const consulta = useQuery({
    queryKey: ['solicitudes', filtros],
    queryFn: () => listarSolicitudes(filtros),
    enabled: !rangoInvalido,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const reiniciar = (fijar) => (valor) => {
    fijar(valor);
    setOffset(0);
  };

  const columnas = [
    {
      clave: 'consecutivo',
      titulo: 'N.º',
      cifras: true,
      render: (s) => (
        <Link className={estilos.enlaceFila} to={`/compras/solicitudes/${s.id}`}>
          {s.consecutivo}
        </Link>
      ),
    },
    { clave: 'fecha', titulo: 'Fecha', cifras: true, render: (s) => formatearFecha(s.fecha) },
    { clave: 'punto', titulo: 'Punto' },
    { clave: 'solicitante', titulo: 'Solicitante' },
    {
      clave: 'alimentos',
      titulo: 'Alimentos',
      render: (s) => <span className={estilos.alimentos}>{s.alimentos.map((a) => `${a.producto}${a.marca ? ` (${a.marca})` : ''}: ${a.cantidad} ${a.unidad}`).join(' · ')}</span>,
    },
    {
      clave: 'valorTotalSugerido',
      titulo: 'Valor sugerido',
      alinear: 'derecha',
      cifras: true,
      render: (s) => (s.valorTotalSugerido == null ? 'Consultando' : formatearMoneda(s.valorTotalSugerido)),
    },
    { clave: 'estado', titulo: 'Estado', render: (s) => <StatusPill tono={estadoSolicitud(s.estado).tono}>{estadoSolicitud(s.estado).texto}</StatusPill> },
  ];

  return (
    <>
      <PageHeader titulo="Solicitudes de alimentos" descripcion="Lo que piden los puntos. Abra una solicitud para cotizarla con los proveedores." />
      <Card sinRelleno>
        <div className={estilos.filtros}>
          <Tabs opciones={PESTANAS} valor={estado} alCambiar={reiniciar(setEstado)} etiquetaAccesible="Estado de la solicitud" />
          <div className={estilos.grupoFiltros}>
            <div className={estilos.campo}>
              <SelectField etiqueta="Punto" value={puntoId} onChange={(e) => reiniciar(setPuntoId)(e.target.value)}>
                <option value="">Todos los puntos</option>
                {puntos.lista.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className={estilos.campo}>
              <TextField etiqueta="Desde" type="date" value={desde} onChange={(e) => reiniciar(setDesde)(e.target.value)} />
            </div>
            <div className={estilos.campo}>
              <TextField etiqueta="Hasta" type="date" value={hasta} error={rangoInvalido ? 'Debe ser posterior a “Desde”.' : undefined} onChange={(e) => reiniciar(setHasta)(e.target.value)} />
            </div>
          </div>
        </div>
        {consulta.isError ? (
          <div className={estilos.aviso}>
            <Banner tono="error">{mensajeDeError(consulta.error)}</Banner>
          </div>
        ) : null}
        <DataTable
          titulo="Solicitudes"
          columnas={columnas}
          filas={consulta.data?.solicitudes}
          cargando={consulta.isPending && !rangoInvalido}
          vacio={<EmptyState titulo="No hay solicitudes con estos filtros" descripcion={consulta.data?.mensaje} />}
        />
        <Pagination total={consulta.data?.total ?? 0} limite={LIMITE} offset={offset} alCambiar={setOffset} />
      </Card>
    </>
  );
}
