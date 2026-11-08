import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listarAuditoria, listarLogs, listarUsuarios, obtenerAuditoria, obtenerLog } from '../../api/admin.js';
import { mensajeDeError } from '../../api/cliente.js';
import { finDelDia, formatearFechaHora, inicioDelDia } from '../../shared/lib/formato.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { Tabs } from '../../shared/ui/Tabs.jsx';
import { SelectField, TextField } from '../../shared/ui/Field.jsx';
import { DataTable } from '../../shared/ui/DataTable.jsx';
import { Pagination } from '../../shared/ui/Pagination.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Modal } from '../../shared/ui/Modal.jsx';
import { Spinner } from '../../shared/ui/Spinner.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import estilos from './admin.module.css';

const LIMITE = 50;

const ACCIONES = {
  CREATE: 'Creación',
  READ: 'Consulta',
  UPDATE: 'Modificación',
  DELETE: 'Eliminación',
  LOGIN_OK: 'Inicio de sesión',
  LOGIN_FALLIDO: 'Inicio de sesión fallido',
  ACCESO_DENEGADO: 'Acceso denegado',
  EJECUCION: 'Proceso automático',
};
const TONO_ACCION = { LOGIN_FALLIDO: 'error', ACCESO_DENEGADO: 'error', DELETE: 'contorno', EJECUCION: 'marca' };
const NIVELES = [
  { valor: '', etiqueta: 'Todos' },
  { valor: 'ERROR', etiqueta: 'Errores' },
  { valor: 'WARN', etiqueta: 'Advertencias' },
  { valor: 'INFO', etiqueta: 'Información' },
];
const TONO_NIVEL = { ERROR: 'error', WARN: 'contorno', INFO: 'neutro' };

/** Detalle de un registro (auditoría o log) en un diálogo. */
function DetalleModal({ id, cargar, clave, titulo, alCerrar, campos }) {
  const detalle = useQuery({ queryKey: [clave, 'detalle', id], queryFn: () => cargar(id), enabled: Boolean(id) });
  return (
    <Modal
      abierto={Boolean(id)}
      alCerrar={alCerrar}
      titulo={titulo}
      pie={
        <Button variante="secundario" onClick={alCerrar}>
          Cerrar
        </Button>
      }
    >
      {detalle.isPending ? (
        <Spinner etiqueta="Cargando detalle" />
      ) : detalle.isError ? (
        <Banner tono="error">{mensajeDeError(detalle.error)}</Banner>
      ) : (
        <>
          <dl className={estilos.datos}>
            {campos(detalle.data).flatMap(([dt, dd]) => [<dt key={`t-${dt}`}>{dt}</dt>, <dd key={`d-${dt}`}>{dd}</dd>])}
          </dl>
          {detalle.data?.detalle ? <pre className={estilos.json}>{JSON.stringify(detalle.data.detalle, null, 2)}</pre> : null}
        </>
      )}
    </Modal>
  );
}

function useRango() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  return { desde, hasta, setDesde, setHasta, invalido: Boolean(desde && hasta && desde > hasta) };
}

/** Auditoría de acciones (CU-16): solo lectura; la base de datos impide modificarla. */
export function AuditoriaPage() {
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: listarUsuarios });
  const rango = useRango();
  const [accion, setAccion] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [entidad, setEntidad] = useState('');
  const [offset, setOffset] = useState(0);
  const [abierto, setAbierto] = useState(null);
  const reiniciar = (fijar) => (e) => {
    fijar(e.target.value);
    setOffset(0);
  };

  const filtros = { accion: accion || undefined, usuarioId: usuarioId || undefined, entidad: entidad.trim() || undefined, desde: inicioDelDia(rango.desde), hasta: finDelDia(rango.hasta), limite: LIMITE, offset };
  const consulta = useQuery({ queryKey: ['auditoria', filtros], queryFn: () => listarAuditoria(filtros), enabled: !rango.invalido, placeholderData: keepPreviousData });

  const columnas = [
    { clave: 'fecha', titulo: 'Fecha', cifras: true, render: (r) => formatearFechaHora(r.fecha) },
    { clave: 'correo', titulo: 'Usuario' },
    { clave: 'accion', titulo: 'Acción', render: (r) => <StatusPill tono={TONO_ACCION[r.accion] ?? 'neutro'}>{ACCIONES[r.accion] ?? r.accion}</StatusPill> },
    { clave: 'entidad', titulo: 'Entidad', render: (r) => r.entidad ?? '—' },
    {
      clave: 'ver',
      titulo: <span className="kg-solo-lectores">Detalle</span>,
      alinear: 'derecha',
      render: (r) => (
        <Button variante="secundario" tamano="pequeno" onClick={() => setAbierto(r.id)}>
          Ver
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader titulo="Auditoría" descripcion="Quién hizo qué y cuándo. Los registros no se pueden modificar ni eliminar." />
      <Card sinRelleno>
        <div className={estilos.filtros}>
          <div className={estilos.grupoFiltros}>
            <div className={estilos.campo}>
              <SelectField etiqueta="Acción" value={accion} onChange={reiniciar(setAccion)}>
                <option value="">Todas</option>
                {Object.entries(ACCIONES).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className={estilos.campo}>
              <SelectField etiqueta="Usuario" value={usuarioId} onChange={reiniciar(setUsuarioId)}>
                <option value="">Todos</option>
                {(usuarios.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.correo}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className={estilos.campo}>
              <TextField etiqueta="Entidad" placeholder="por ejemplo orden_compra" value={entidad} onChange={reiniciar(setEntidad)} />
            </div>
            <div className={estilos.campo}>
              <TextField etiqueta="Desde" type="date" value={rango.desde} onChange={reiniciar(rango.setDesde)} />
            </div>
            <div className={estilos.campo}>
              <TextField etiqueta="Hasta" type="date" value={rango.hasta} error={rango.invalido ? 'Debe ser posterior a “Desde”.' : undefined} onChange={reiniciar(rango.setHasta)} />
            </div>
          </div>
        </div>
        {consulta.isError ? (
          <div className={estilos.aviso}>
            <Banner tono="error">{mensajeDeError(consulta.error)}</Banner>
          </div>
        ) : null}
        <DataTable titulo="Registros de auditoría" columnas={columnas} filas={consulta.data?.registros} cargando={consulta.isPending && !rango.invalido} vacio={<EmptyState titulo="No hay registros con estos filtros" descripcion={consulta.data?.mensaje} />} />
        <Pagination total={consulta.data?.total ?? 0} limite={LIMITE} offset={offset} alCambiar={setOffset} />
      </Card>
      <DetalleModal
        id={abierto}
        clave="auditoria"
        cargar={obtenerAuditoria}
        titulo={`Registro de auditoría ${abierto ?? ''}`}
        alCerrar={() => setAbierto(null)}
        campos={(r) => [
          ['Fecha', formatearFechaHora(r.fecha)],
          ['Usuario', r.correo],
          ['Acción', ACCIONES[r.accion] ?? r.accion],
          ['Entidad', r.entidad ?? '—'],
          ['Id de la entidad', r.entidadId ?? '—'],
        ]}
      />
    </>
  );
}

/** Log de errores y ejecuciones del sistema (CU-16). */
export function LogsPage() {
  const rango = useRango();
  const [nivel, setNivel] = useState('ERROR');
  const [modulo, setModulo] = useState('');
  const [offset, setOffset] = useState(0);
  const [abierto, setAbierto] = useState(null);
  const filtros = { nivel: nivel || undefined, modulo: modulo.trim() || undefined, desde: inicioDelDia(rango.desde), hasta: finDelDia(rango.hasta), limite: LIMITE, offset };
  const consulta = useQuery({ queryKey: ['logs', filtros], queryFn: () => listarLogs(filtros), enabled: !rango.invalido, placeholderData: keepPreviousData, refetchInterval: 60_000 });

  const columnas = [
    { clave: 'fecha', titulo: 'Fecha', cifras: true, render: (r) => formatearFechaHora(r.fecha) },
    { clave: 'nivel', titulo: 'Nivel', render: (r) => <StatusPill tono={TONO_NIVEL[r.nivel] ?? 'neutro'}>{NIVELES.find((n) => n.valor === r.nivel)?.etiqueta ?? r.nivel}</StatusPill> },
    { clave: 'modulo', titulo: 'Módulo' },
    { clave: 'mensaje', titulo: 'Mensaje' },
    {
      clave: 'ver',
      titulo: <span className="kg-solo-lectores">Detalle</span>,
      alinear: 'derecha',
      render: (r) => (
        <Button variante="secundario" tamano="pequeno" onClick={() => setAbierto(r.id)}>
          Ver
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader titulo="Log del sistema" descripcion="Errores y ejecuciones de los procesos automáticos y los servicios externos." />
      <Card sinRelleno>
        <div className={estilos.filtros}>
          <Tabs
            opciones={NIVELES}
            valor={nivel}
            alCambiar={(v) => {
              setNivel(v);
              setOffset(0);
            }}
            etiquetaAccesible="Nivel"
          />
          <div className={estilos.grupoFiltros}>
            <div className={estilos.campo}>
              <TextField
                etiqueta="Módulo"
                placeholder="por ejemplo cron"
                value={modulo}
                onChange={(e) => {
                  setModulo(e.target.value);
                  setOffset(0);
                }}
              />
            </div>
            <div className={estilos.campo}>
              <TextField etiqueta="Desde" type="date" value={rango.desde} onChange={(e) => rango.setDesde(e.target.value)} />
            </div>
            <div className={estilos.campo}>
              <TextField etiqueta="Hasta" type="date" value={rango.hasta} error={rango.invalido ? 'Debe ser posterior a “Desde”.' : undefined} onChange={(e) => rango.setHasta(e.target.value)} />
            </div>
          </div>
        </div>
        {consulta.isError ? (
          <div className={estilos.aviso}>
            <Banner tono="error">{mensajeDeError(consulta.error)}</Banner>
          </div>
        ) : null}
        <DataTable titulo="Registros del log" columnas={columnas} filas={consulta.data?.registros} cargando={consulta.isPending && !rango.invalido} vacio={<EmptyState titulo="No hay registros con estos filtros" descripcion={consulta.data?.mensaje} />} />
        <Pagination total={consulta.data?.total ?? 0} limite={LIMITE} offset={offset} alCambiar={setOffset} />
      </Card>
      <DetalleModal
        id={abierto}
        clave="logs"
        cargar={obtenerLog}
        titulo={`Registro del log ${abierto ?? ''}`}
        alCerrar={() => setAbierto(null)}
        campos={(r) => [
          ['Fecha', formatearFechaHora(r.fecha)],
          ['Nivel', r.nivel],
          ['Módulo', r.modulo],
          ['Mensaje', r.mensaje],
        ]}
      />
    </>
  );
}
