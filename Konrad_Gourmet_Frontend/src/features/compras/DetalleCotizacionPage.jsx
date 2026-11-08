import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { generarOrden, obtenerCotizacion, registrarValores } from '../../api/compras.js';
import { mensajeDeError } from '../../api/cliente.js';
import { useSesion } from '../auth/AuthProvider.jsx';
import { formatearFecha, formatearFechaHora, formatearMoneda, formatearNumero } from '../../shared/lib/formato.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { DataTable } from '../../shared/ui/DataTable.jsx';
import { TextField } from '../../shared/ui/Field.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Spinner } from '../../shared/ui/Spinner.jsx';
import { Icono } from '../../shared/ui/Icono.jsx';
import { estadoCotizacion } from './estadosCompras.js';
import { resumirValores, validarValores } from './valoresCotizacion.js';
import estilos from './compras.module.css';

const ESPERA_VALIDACION = 20_000;

/**
 * Detalle de una cotización. El Director de compras registra los valores del proveedor
 * (CU-11); la validación automática corre después y aquí se consulta cada 2 s hasta ver
 * el resultado. Si queda OPCIONADA, genera la orden de compra (CU-13).
 */
export function DetalleCotizacionPage() {
  const { id } = useParams();
  const { usuario } = useSesion();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const esDirector = usuario?.rol === 'DIRECTOR_COMPRAS';
  const [entradas, setEntradas] = useState({});
  const [errores, setErrores] = useState({});
  const [sobrescribir, setSobrescribir] = useState(false);
  const [esperandoHasta, setEsperandoHasta] = useState(0);
  const [mensaje, setMensaje] = useState(null);

  const esperando = esperandoHasta > Date.now();
  const cotizacion = useQuery({
    queryKey: ['cotizacion', id],
    queryFn: () => obtenerCotizacion(id),
    refetchInterval: (q) => (esperandoHasta > Date.now() && q.state.data?.estado === 'ENVIADA' ? 2000 : false),
  });
  const c = cotizacion.data;

  // Precarga los valores ya registrados para poder corregirlos
  useEffect(() => {
    if (!c) return;
    setEntradas((actuales) =>
      Object.keys(actuales).length ? actuales : Object.fromEntries(c.alimentos.map((a) => [a.detalleSolicitudId, a.valorUnitario == null ? '' : String(a.valorUnitario)]))
    );
  }, [c]);

  // Termina la espera cuando la validación clasifica la cotización o se agota el tiempo
  useEffect(() => {
    if (!esperandoHasta) return undefined;
    if (c && c.estado !== 'ENVIADA') {
      setEsperandoHasta(0);
      setMensaje({ tono: c.estado === 'OPCIONADA' ? 'exito' : 'info', texto: `Validación terminada: ${estadoCotizacion(c.estado).texto.toLowerCase()}. ${estadoCotizacion(c.estado).descripcion}` });
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      return undefined;
    }
    const t = setTimeout(() => {
      setEsperandoHasta(0);
      setMensaje({ tono: 'info', texto: 'Los valores quedaron guardados. La cotización sigue enviada: se validará sola cuando llegue el precio sugerido del Ministerio.' });
    }, Math.max(0, esperandoHasta - Date.now()));
    return () => clearTimeout(t);
  }, [esperandoHasta, c, queryClient]);

  const guardar = useMutation({
    mutationFn: (valores) => registrarValores(id, { valores, confirmarSobrescritura: sobrescribir }),
    onSuccess: () => {
      setSobrescribir(false);
      setMensaje({ tono: 'info', texto: 'Valores guardados. Validando contra el precio del Ministerio…' });
      setEsperandoHasta(Date.now() + ESPERA_VALIDACION);
      queryClient.invalidateQueries({ queryKey: ['cotizacion', id] });
    },
    onError: (error) => setMensaje({ tono: 'error', texto: mensajeDeError(error) }),
  });

  const orden = useMutation({
    mutationFn: () => generarOrden(id),
    onSuccess: (o) => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      navigate(`/compras/ordenes/${o.id}`);
    },
    onError: (error) => setMensaje({ tono: 'error', texto: mensajeDeError(error) }),
  });

  if (cotizacion.isPending) return <Spinner etiqueta="Cargando cotización" />;
  if (cotizacion.isError) return <Banner tono="error">{mensajeDeError(cotizacion.error)}</Banner>;

  const estado = estadoCotizacion(c.estado);
  const editable = esDirector && c.estado === 'ENVIADA';
  const resumen = resumirValores(c.alimentos, editable ? entradas : Object.fromEntries(c.alimentos.map((a) => [a.detalleSolicitudId, a.valorUnitario])));

  function alEnviar(e) {
    e.preventDefault();
    const r = validarValores(c.alimentos, entradas);
    setErrores(r.errores);
    if (!r.valido) return;
    if (c.valoresRegistrados && !sobrescribir) {
      setMensaje({ tono: 'error', texto: 'Esta cotización ya tiene valores. Marque la casilla para confirmar que quiere reemplazarlos.' });
      return;
    }
    guardar.mutate(r.valores);
  }

  const columnas = [
    { clave: 'producto', titulo: 'Alimento', render: (a) => `${a.producto}${a.marca ? ` (${a.marca})` : ''}` },
    { clave: 'cantidad', titulo: 'Cantidad', alinear: 'derecha', cifras: true, render: (a) => `${formatearNumero(a.cantidad)} ${a.unidad}` },
    {
      clave: 'sugerido',
      titulo: 'Sugerido por unidad',
      alinear: 'derecha',
      cifras: true,
      render: (a) => (a.precioSugeridoUnitario == null ? 'Consultando' : formatearMoneda(a.precioSugeridoUnitario)),
    },
    {
      clave: 'valor',
      titulo: 'Valor cotizado por unidad',
      alinear: 'derecha',
      render: (a) =>
        editable ? (
          <div className={estilos.campoValor}>
            <TextField
              etiqueta={<span className="kg-solo-lectores">Valor unitario de {a.producto}</span>}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={entradas[a.detalleSolicitudId] ?? ''}
              error={errores[a.detalleSolicitudId]}
              onChange={(e) => setEntradas((x) => ({ ...x, [a.detalleSolicitudId]: e.target.value }))}
            />
          </div>
        ) : (
          <span className="kg-cifras">{a.valorUnitario == null ? 'Sin valor' : formatearMoneda(a.valorUnitario)}</span>
        ),
    },
    {
      clave: 'subtotal',
      titulo: 'Subtotal',
      alinear: 'derecha',
      cifras: true,
      render: (a) => {
        const linea = resumen.lineas.find((l) => l.detalleSolicitudId === a.detalleSolicitudId);
        if (linea?.subtotal == null) return '';
        return (
          <>
            {formatearMoneda(linea.subtotal)}
            {linea.porcentajeSugerido != null ? <div className={estilos.porcentaje}>{linea.porcentajeSugerido} % del sugerido</div> : null}
          </>
        );
      },
    },
  ];

  return (
    <>
      <Link to="/compras/cotizaciones" className={estilos.volver}>
        <Icono nombre="izquierda" tamano={16} /> Cotizaciones
      </Link>
      <PageHeader
        titulo={`Cotización N.º ${c.consecutivo}`}
        descripcion={`${c.proveedor} · plazo ${formatearFecha(`${c.plazoMaximo}T12:00:00`)} · creada ${formatearFechaHora(c.creadaEn)}`}
        acciones={
          esDirector && c.estado === 'OPCIONADA' ? (
            <Button cargando={orden.isPending} onClick={() => orden.mutate()}>
              Generar orden de compra
            </Button>
          ) : null
        }
      />
      {mensaje ? (
        <div className={estilos.mensaje}>
          <Banner tono={mensaje.tono}>
            {mensaje.texto}
          </Banner>
        </div>
      ) : null}

      <Card
        titulo="Alimentos cotizados"
        sinRelleno
        acciones={
          <span className={estilos.accionesTarjeta}>
            <StatusPill tono={estado.tono}>{estado.texto}</StatusPill>
            <Link to={`/compras/solicitudes/${c.solicitudId}`}>Solicitud N.º {c.solicitudConsecutivo}</Link>
          </span>
        }
      >
        <form onSubmit={alEnviar} noValidate>
          <DataTable titulo="Alimentos de la cotización" columnas={columnas} filas={c.alimentos} claveFila={(a) => a.detalleSolicitudId} />
          <div className={estilos.total}>
            <span>
              Total cotizado
              {resumen.porcentajeSugerido != null ? <span className={estilos.porcentaje}> · {resumen.porcentajeSugerido} % del valor sugerido</span> : null}
            </span>
            <span className={`${estilos.totalValor} kg-cifras`}>{resumen.total == null ? 'Incompleto' : formatearMoneda(resumen.total)}</span>
          </div>
          {editable ? (
            <div className={`${estilos.total} ${estilos.formulario}`}>
              {c.valoresRegistrados ? (
                <label className={estilos.casilla}>
                  <input type="checkbox" checked={sobrescribir} onChange={(e) => setSobrescribir(e.target.checked)} />
                  Reemplazar los valores registrados antes
                </label>
              ) : (
                <span className={estilos.secundario}>{estado.descripcion}</span>
              )}
              <Button type="submit" cargando={guardar.isPending || esperando}>
                Registrar valores
              </Button>
            </div>
          ) : (
            <div className={estilos.aviso}>
              <p className={estilos.secundario}>{esDirector ? estado.descripcion : 'Los valores los registra el Director de compras.'}</p>
            </div>
          )}
        </form>
      </Card>
    </>
  );
}
