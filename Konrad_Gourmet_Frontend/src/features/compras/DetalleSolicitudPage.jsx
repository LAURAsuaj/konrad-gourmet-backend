import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { generarOrden, listarOpcionadas, obtenerSolicitud } from '../../api/compras.js';
import { mensajeDeError } from '../../api/cliente.js';
import { useSesion } from '../auth/AuthProvider.jsx';
import { useCatalogo } from '../../shared/lib/useCatalogo.js';
import { formatearFecha, formatearFechaHora, formatearMoneda, formatearNumero } from '../../shared/lib/formato.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { DataTable } from '../../shared/ui/DataTable.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Spinner } from '../../shared/ui/Spinner.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import { Icono } from '../../shared/ui/Icono.jsx';
import { estadoCotizacion, estadoSolicitud } from './estadosCompras.js';
import { mejorOpcionada } from './valoresCotizacion.js';
import { NuevaCotizacionModal } from './NuevaCotizacionModal.jsx';
import estilos from './compras.module.css';

/**
 * Detalle de una solicitud: alimentos con precio sugerido del Ministerio y sus cotizaciones.
 * Auxiliar de compras: pide cotizaciones (CU-09). Director de compras: compara las
 * opcionadas y genera la orden de compra (CU-12, CU-13).
 */
export function DetalleSolicitudPage() {
  const { id } = useParams();
  const { usuario } = useSesion();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const esAuxiliar = usuario?.rol === 'AUXILIAR_COMPRAS';
  const esDirector = usuario?.rol === 'DIRECTOR_COMPRAS';
  const [modal, setModal] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const solicitud = useQuery({ queryKey: ['solicitud', id], queryFn: () => obtenerSolicitud(id), refetchInterval: 30_000 });
  const opcionadas = useQuery({ queryKey: ['solicitud', id, 'opcionadas'], queryFn: () => listarOpcionadas(id), enabled: esDirector });
  const proveedores = useCatalogo('proveedores', undefined, { enabled: esAuxiliar });

  const orden = useMutation({
    mutationFn: generarOrden,
    onSuccess: (o) => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      navigate(`/compras/ordenes/${o.id}`);
    },
    onError: (error) => setMensaje({ tono: 'error', texto: mensajeDeError(error) }),
  });

  if (solicitud.isPending) return <Spinner etiqueta="Cargando solicitud" />;
  if (solicitud.isError) return <Banner tono="error">{mensajeDeError(solicitud.error)}</Banner>;

  const s = solicitud.data;
  const estado = estadoSolicitud(s.estado);
  const mejor = mejorOpcionada(opcionadas.data?.cotizaciones, s.items.length);

  const columnas = [
    { clave: 'producto', titulo: 'Alimento', render: (i) => `${i.producto}${i.marca ? ` (${i.marca})` : ''}` },
    { clave: 'categoria', titulo: 'Categoría' },
    { clave: 'cantidad', titulo: 'Cantidad', alinear: 'derecha', cifras: true, render: (i) => `${formatearNumero(i.cantidad)} ${i.unidad}` },
    {
      clave: 'precio',
      titulo: 'Precio sugerido',
      alinear: 'derecha',
      cifras: true,
      render: (i) => (i.precioSugeridoUnitario == null ? 'Consultando' : `${formatearMoneda(i.precioSugeridoUnitario)} / ${i.unidad}`),
    },
    {
      clave: 'subtotal',
      titulo: 'Subtotal sugerido',
      alinear: 'derecha',
      cifras: true,
      render: (i) => (i.precioSugeridoUnitario == null ? '' : formatearMoneda(i.precioSugeridoUnitario * i.cantidad)),
    },
  ];

  return (
    <>
      <Link to="/compras/solicitudes" className={estilos.volver}>
        <Icono nombre="izquierda" tamano={16} /> Solicitudes
      </Link>
      <PageHeader
        titulo={`Solicitud N.º ${s.consecutivo}`}
        descripcion={`${s.punto} · ${s.solicitante} · ${formatearFechaHora(s.fecha)}`}
        acciones={esAuxiliar ? <Button onClick={() => setModal(true)}>Solicitar cotización</Button> : null}
      />
      {mensaje ? (
        <div className={estilos.mensaje}>
          <Banner tono={mensaje.tono}>{mensaje.texto}</Banner>
        </div>
      ) : null}

      <div className={estilos.columnas}>
        <Card titulo="Alimentos solicitados" sinRelleno acciones={<StatusPill tono={estado.tono}>{estado.texto}</StatusPill>}>
          <DataTable titulo="Alimentos" columnas={columnas} filas={s.items} />
          <div className={estilos.total}>
            <span>Valor total sugerido (Ministerio de Comercio)</span>
            <span className={`${estilos.totalValor} kg-cifras`}>{s.valorTotalSugerido == null ? 'Consultando' : formatearMoneda(s.valorTotalSugerido)}</span>
          </div>
        </Card>

        <div className={estilos.pila}>
          {esDirector ? (
            <Card titulo="Opcionadas para orden de compra">
              {opcionadas.isError ? <Banner tono="error">{mensajeDeError(opcionadas.error)}</Banner> : null}
              {opcionadas.data?.cotizaciones?.length ? (
                <ul className={estilos.lista}>
                  {opcionadas.data.cotizaciones.map((c) => (
                    <li key={c.id} className={`${estilos.itemLista} ${c.id === mejor ? estilos.itemDestacado : ''}`}>
                      <div>
                        <Link to={`/compras/cotizaciones/${c.id}`} className={estilos.enlaceFila}>
                          N.º {c.consecutivo} · {c.proveedor}
                        </Link>
                        <p className={estilos.secundario}>
                          {c.alimentos} de {s.items.length} alimentos · plazo {formatearFecha(`${c.plazoMaximo}T12:00:00`)}
                        </p>
                        {c.id === mejor ? <StatusPill tono="marca">Menor valor</StatusPill> : null}
                      </div>
                      <div>
                        <p className={`${estilos.enlaceFila} kg-cifras`}>{formatearMoneda(c.valorTotal)}</p>
                        <Button tamano="pequeno" variante={c.id === mejor ? 'primario' : 'secundario'} cargando={orden.isPending && orden.variables === c.id} onClick={() => orden.mutate(c.id)}>
                          Generar orden
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState titulo="Todavía no hay cotizaciones opcionadas" descripcion={opcionadas.data?.mensaje ?? 'Registre los valores de las cotizaciones enviadas.'} />
              )}
            </Card>
          ) : null}

          <Card titulo="Cotizaciones de esta solicitud">
            {s.cotizaciones.length ? (
              <ul className={estilos.lista}>
                {s.cotizaciones.map((c) => {
                  const e = estadoCotizacion(c.estado);
                  return (
                    <li key={c.id} className={estilos.itemLista}>
                      <div>
                        <Link to={`/compras/cotizaciones/${c.id}`} className={estilos.enlaceFila}>
                          N.º {c.consecutivo} · {c.proveedor}
                        </Link>
                        <p className={estilos.secundario}>Plazo {formatearFecha(`${c.plazoMaximo}T12:00:00`)}</p>
                      </div>
                      <div>
                        <StatusPill tono={e.tono}>{e.texto}</StatusPill>
                        <p className={`${estilos.secundario} kg-cifras`}>{c.valorTotal == null ? 'Sin valores' : formatearMoneda(c.valorTotal)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                titulo="Sin cotizaciones"
                descripcion={esAuxiliar ? 'Pida la primera cotización a un proveedor.' : 'El auxiliar de compras todavía no pidió cotizaciones.'}
              />
            )}
          </Card>
        </div>
      </div>

      {esAuxiliar ? (
        <NuevaCotizacionModal
          abierto={modal}
          solicitud={s}
          proveedores={proveedores.lista}
          alCerrar={() => setModal(false)}
          alCrear={(texto) => setMensaje({ tono: 'exito', texto })}
        />
      ) : null}
    </>
  );
}
