import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, mensajeDeError } from '../../api/cliente.js';
import { finDelDia, formatearFechaHora, inicioDelDia } from '../../shared/lib/formato.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { Tabs } from '../../shared/ui/Tabs.jsx';
import { TextField } from '../../shared/ui/Field.jsx';
import { DataTable } from '../../shared/ui/DataTable.jsx';
import { Pagination } from '../../shared/ui/Pagination.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Modal } from '../../shared/ui/Modal.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import { TIPOS_NOTIFICACION } from './construirAlertas.js';
import estilos from './NotificacionesPage.module.css';

const LIMITE = 20;

const PESTANAS = [
  { valor: '', etiqueta: 'Todas' },
  ...Object.entries(TIPOS_NOTIFICACION).map(([valor, t]) => ({ valor, etiqueta: t.etiqueta })),
];

const ESTADOS_ENVIO = {
  ENVIADA: { tono: 'neutro', texto: 'Correo enviado' },
  CREADA: { tono: 'contorno', texto: 'En proceso' },
  FALLIDA: { tono: 'error', texto: 'Correo no enviado' },
};

/**
 * Notificaciones del usuario (GET /notificaciones): confirmaciones de solicitud,
 * alarmas de stock y promociones que el sistema le envió por correo.
 */
export function NotificacionesPage() {
  const [parametros, setParametros] = useSearchParams();
  const tipo = TIPOS_NOTIFICACION[parametros.get('tipo')] ? parametros.get('tipo') : '';
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [offset, setOffset] = useState(0);
  const [abierta, setAbierta] = useState(null);

  const rangoInvalido = desde && hasta && desde > hasta;

  const consulta = useQuery({
    queryKey: ['notificaciones', 'lista', { tipo, desde, hasta, offset }],
    queryFn: () =>
      api.get('/notificaciones', {
        consulta: { tipo: tipo || undefined, desde: inicioDelDia(desde), hasta: finDelDia(hasta), limite: LIMITE, offset },
      }),
    enabled: !rangoInvalido,
    placeholderData: keepPreviousData,
  });

  const cambiarTipo = (valor) => {
    setOffset(0);
    setParametros(valor ? { tipo: valor } : {}, { replace: true });
  };

  const columnas = [
    { clave: 'creadaEn', titulo: 'Fecha', cifras: true, render: (n) => formatearFechaHora(n.creadaEn) },
    {
      clave: 'tipo',
      titulo: 'Tipo',
      render: (n) => <StatusPill tono={n.tipo === 'ALARMA_STOCK' ? 'marca' : 'neutro'}>{TIPOS_NOTIFICACION[n.tipo]?.etiqueta ?? n.tipo}</StatusPill>,
    },
    { clave: 'asunto', titulo: 'Asunto', render: (n) => <span className={estilos.asunto}>{n.asunto}</span> },
    {
      clave: 'estado',
      titulo: 'Envío por correo',
      render: (n) => {
        const e = ESTADOS_ENVIO[n.estado] ?? { tono: 'neutro', texto: n.estado };
        return <StatusPill tono={e.tono}>{e.texto}</StatusPill>;
      },
    },
    {
      clave: 'acciones',
      titulo: <span className="kg-solo-lectores">Acciones</span>,
      alinear: 'derecha',
      render: (n) => (
        <Button variante="secundario" tamano="pequeno" onClick={() => setAbierta(n)}>
          Leer
        </Button>
      ),
    },
  ];

  const datos = consulta.data;

  return (
    <>
      <PageHeader
        titulo="Notificaciones"
        descripcion="Los avisos que el sistema le envió por correo. Se revisan solos cada minuto."
        acciones={
          <Button variante="secundario" icono="recargar" cargando={consulta.isFetching} onClick={() => consulta.refetch()}>
            Actualizar
          </Button>
        }
      />

      <Card sinRelleno>
        <div className={estilos.filtros}>
          <Tabs opciones={PESTANAS} valor={tipo} alCambiar={cambiarTipo} etiquetaAccesible="Tipo de notificación" />
          <div className={estilos.fechas}>
            <TextField
              etiqueta="Desde"
              type="date"
              value={desde}
              onChange={(e) => {
                setDesde(e.target.value);
                setOffset(0);
              }}
            />
            <TextField
              etiqueta="Hasta"
              type="date"
              value={hasta}
              error={rangoInvalido ? 'Debe ser posterior a “Desde”.' : undefined}
              onChange={(e) => {
                setHasta(e.target.value);
                setOffset(0);
              }}
            />
          </div>
        </div>

        {consulta.isError ? (
          <div className={estilos.aviso}>
            <Banner tono="error">{mensajeDeError(consulta.error)}</Banner>
          </div>
        ) : null}

        <DataTable
          titulo="Notificaciones"
          columnas={columnas}
          filas={datos?.notificaciones}
          cargando={consulta.isPending && !rangoInvalido}
          vacio={
            <EmptyState
              titulo="No hay notificaciones con estos filtros"
              descripcion={datos?.mensaje ?? 'Cambie el tipo o el rango de fechas para ver otras.'}
            />
          }
        />
        <Pagination total={datos?.total ?? 0} limite={LIMITE} offset={offset} alCambiar={setOffset} />
      </Card>

      <Modal
        abierto={Boolean(abierta)}
        alCerrar={() => setAbierta(null)}
        titulo={abierta?.asunto ?? ''}
        pie={
          <Button variante="secundario" onClick={() => setAbierta(null)}>
            Cerrar
          </Button>
        }
      >
        {abierta ? (
          <>
            <dl className={estilos.datos}>
              <dt>Tipo</dt>
              <dd>{TIPOS_NOTIFICACION[abierta.tipo]?.etiqueta ?? abierta.tipo}</dd>
              <dt>Creada</dt>
              <dd className="kg-cifras">{formatearFechaHora(abierta.creadaEn)}</dd>
              <dt>Enviada</dt>
              <dd className="kg-cifras">{abierta.enviadaEn ? formatearFechaHora(abierta.enviadaEn) : 'Todavía no'}</dd>
            </dl>
            <p className={estilos.mensaje}>{abierta.mensaje}</p>
          </>
        ) : null}
      </Modal>
    </>
  );
}
