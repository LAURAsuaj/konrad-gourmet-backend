import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CLAVE_PEDIDOS, registrarPedido } from '../../api/cocina.js';
import { mensajeDeError } from '../../api/cliente.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { SelectField } from '../../shared/ui/Field.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Spinner } from '../../shared/ui/Spinner.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import { Icono } from '../../shared/ui/Icono.jsx';
import { formatearMoneda } from '../../shared/lib/formato.js';
import { useComanda } from './ComandaProvider.jsx';
import { useDatosMesero } from './useDatosMesero.js';
import { detallarComanda, itemsParaPedido } from './comanda.js';
import { resumirMesas } from './resumenMesas.js';
import { TarjetaMesa } from './TarjetaMesa.jsx';
import { MenuRapido } from './MenuRapido.jsx';
import { Comanda } from './Comanda.jsx';
import estilos from './TomaOrdenPage.module.css';

/**
 * Toma de orden de una mesa: riel con las demás mesas (cambio rápido), menú y comanda.
 * En pantallas angostas el riel se vuelve un selector y la comanda una hoja inferior.
 */
export function TomaOrdenPage() {
  const { mesaId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mesas, menu, pedidos } = useDatosMesero();
  const { comandas, lineasDe, agregar, fijar, quitar, vaciar } = useComanda();
  const [resultado, setResultado] = useState(null);
  const [hojaAbierta, setHojaAbierta] = useState(false);

  useEffect(() => {
    setResultado(null);
    setHojaAbierta(false);
  }, [mesaId]);

  const resumenes = useMemo(() => resumirMesas(mesas.data, pedidos.data), [mesas.data, pedidos.data]);
  const mesa = resumenes.find((m) => m.id === mesaId);
  const menuPorId = useMemo(() => new Map((menu.data ?? []).map((p) => [p.id, p])), [menu.data]);
  const platosActivos = useMemo(() => (menu.data ?? []).filter((p) => p.activo), [menu.data]);
  const lineas = lineasDe(mesaId);
  const detalle = detallarComanda(lineas, menuPorId);
  const unidadesDe = (id) => (comandas[id] ?? []).reduce((t, l) => t + l.cantidad, 0);

  const envio = useMutation({
    mutationFn: () => registrarPedido({ mesaId, items: itemsParaPedido(lineas) }),
    onSuccess: (pedido) => {
      const total = pedido.items.reduce((t, i) => t + i.cantidad, 0);
      vaciar(mesaId);
      setResultado({ tono: 'exito', texto: `Pedido enviado a cocina: ${total} ${total === 1 ? 'plato' : 'platos'} para la mesa ${pedido.mesa}.` });
      queryClient.invalidateQueries({ queryKey: CLAVE_PEDIDOS });
    },
    onError: (error) => setResultado({ tono: 'error', texto: mensajeDeError(error) }),
  });

  if (mesas.isPending || menu.isPending) return <Spinner etiqueta="Cargando mesa y menú" />;
  if (mesas.error || menu.error) return <Banner tono="error">{mensajeDeError(mesas.error ?? menu.error)}</Banner>;
  if (!mesa) {
    return (
      <EmptyState
        titulo="Esta mesa no existe en su punto o fue desactivada"
        accion={
          <Link to="/mesero/mesas" className={estilos.volver}>
            Volver al plano de mesas
          </Link>
        }
      />
    );
  }

  const acciones = {
    alFijar: (platoId, n) => {
      setResultado(null);
      fijar(mesaId, platoId, n);
    },
    alAgregar: (platoId) => {
      setResultado(null);
      agregar(mesaId, platoId);
    },
  };

  return (
    <>
      <Link to="/mesero/mesas" className={estilos.volver}>
        <Icono nombre="izquierda" tamano={16} /> Plano de mesas
      </Link>
      <PageHeader titulo={`Mesa ${mesa.numero}`} descripcion="Agregue los platos y envíe la comanda a cocina." />

      <div className={estilos.selectorMesa}>
        <SelectField
          etiqueta="Cambiar de mesa"
          value={mesaId}
          onChange={(e) => navigate(`/mesero/mesas/${e.target.value}`)}
          opciones={resumenes.map((m) => ({
            valor: m.id,
            etiqueta: `Mesa ${m.numero}${unidadesDe(m.id) ? ` · nueva orden (${unidadesDe(m.id)})` : ''}`,
          }))}
        />
      </div>

      <div className={estilos.distribucion}>
        <nav className={estilos.riel} aria-label="Cambiar de mesa">
          <p className={estilos.rielTitulo}>Mesas</p>
          <ul className={estilos.rielLista}>
            {resumenes.map((m) => (
              <li key={m.id}>
                <TarjetaMesa mesa={m} compacta seleccionada={m.id === mesaId} unidadesEnComanda={unidadesDe(m.id)} />
              </li>
            ))}
          </ul>
        </nav>

        <MenuRapido platos={platosActivos} lineas={lineas} alAgregar={acciones.alAgregar} alFijar={acciones.alFijar} />

        {hojaAbierta ? <button type="button" className={estilos.velo} aria-label="Cerrar comanda" onClick={() => setHojaAbierta(false)} /> : null}
        <div className={`${estilos.zonaComanda} ${hojaAbierta ? estilos.hojaAbierta : ''}`}>
          <Comanda
            id="comanda-mesa"
            mesa={mesa}
            detalle={detalle}
            enviando={envio.isPending}
            resultado={resultado}
            alFijar={acciones.alFijar}
            alQuitar={(platoId) => quitar(mesaId, platoId)}
            alVaciar={() => {
              setResultado(null);
              vaciar(mesaId);
            }}
            alEnviar={() => envio.mutate()}
            alCerrar={hojaAbierta ? () => setHojaAbierta(false) : undefined}
          />
        </div>
      </div>

      <div className={estilos.barraMovil}>
        <Button bloque aria-controls="comanda-mesa" aria-expanded={hojaAbierta} onClick={() => setHojaAbierta(true)}>
          <span>Ver comanda · {detalle.unidades} {detalle.unidades === 1 ? 'plato' : 'platos'}</span>
          <span className="kg-cifras">{formatearMoneda(detalle.totalEstimado)}</span>
        </Button>
      </div>
    </>
  );
}
