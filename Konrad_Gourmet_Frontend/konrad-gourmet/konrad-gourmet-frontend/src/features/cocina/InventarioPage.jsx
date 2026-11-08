import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listarInventario } from '../../api/inventario.js';
import { mensajeDeError } from '../../api/cliente.js';
import { useCatalogo } from '../../shared/lib/useCatalogo.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { KpiCard, KpiGrid } from '../../shared/ui/KpiCard.jsx';
import { Tabs } from '../../shared/ui/Tabs.jsx';
import { TextField } from '../../shared/ui/Field.jsx';
import { DataTable } from '../../shared/ui/DataTable.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { BarraProgreso } from '../../shared/ui/BarraProgreso.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import { formatearNumero } from '../../shared/lib/formato.js';
import { ESTADOS_STOCK, estadoStock } from './analisisCocina.js';
import { AjusteInventarioModal } from './AjusteInventarioModal.jsx';
import estilos from './InventarioPage.module.css';

const FILTROS = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'ALARMA', etiqueta: 'Stock bajo' },
  { valor: 'AGOTADO', etiqueta: 'Agotados' },
];

/** Inventario del punto (CU-06) con su nivel frente a la referencia y las alarmas (CU-07). */
export function InventarioPage() {
  const navigate = useNavigate();
  const inventario = useQuery({ queryKey: ['inventario', 'punto'], queryFn: () => listarInventario(), refetchInterval: 60_000 });
  const productos = useCatalogo('productos');
  const unidades = useCatalogo('unidades');
  const [filtro, setFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [edicion, setEdicion] = useState({ abierto: false, item: null });
  const [mensaje, setMensaje] = useState(null);

  const items = useMemo(() => (inventario.data ?? []).map((i) => ({ ...i, estado: estadoStock(i) })), [inventario.data]);
  const enAlarma = items.filter((i) => i.estado !== 'NORMAL');
  const texto = busqueda.trim().toLocaleLowerCase('es');
  const visibles = items
    .filter((i) => (filtro === 'todos' || i.estado === filtro) && (!texto || i.producto.toLocaleLowerCase('es').includes(texto)))
    .sort((a, b) => a.porcentaje - b.porcentaje);
  const yaCargados = new Set(items.map((i) => i.productoId));
  const disponibles = productos.lista.filter((p) => !yaCargados.has(p.id));

  const solicitar = (ids) => navigate(`/cocina/solicitudes/nueva${ids.length ? `?productos=${ids.join(',')}` : ''}`);

  const columnas = [
    { clave: 'producto', titulo: 'Producto', render: (i) => <span className={estilos.producto}>{i.producto}</span> },
    { clave: 'cantidadActual', titulo: 'Actual', alinear: 'derecha', cifras: true, render: (i) => `${formatearNumero(i.cantidadActual)} ${i.unidad}` },
    { clave: 'cantidadReferencia', titulo: 'Referencia', alinear: 'derecha', cifras: true, render: (i) => `${formatearNumero(i.cantidadReferencia)} ${i.unidad}` },
    {
      clave: 'porcentaje',
      titulo: 'Nivel',
      render: (i) => (
        <div className={estilos.nivel}>
          <BarraProgreso valor={i.porcentaje} maximo={100} tono={ESTADOS_STOCK[i.estado].barra} etiqueta={`${i.producto}: ${i.porcentaje} % de la referencia`} />
          <span className="kg-cifras">{formatearNumero(i.porcentaje)} %</span>
        </div>
      ),
    },
    { clave: 'estado', titulo: 'Estado', render: (i) => <StatusPill tono={ESTADOS_STOCK[i.estado].tono}>{ESTADOS_STOCK[i.estado].texto}</StatusPill> },
    {
      clave: 'acciones',
      titulo: <span className="kg-solo-lectores">Acciones</span>,
      alinear: 'derecha',
      render: (i) => (
        <Button variante="secundario" tamano="pequeno" onClick={() => setEdicion({ abierto: true, item: i })}>
          Ajustar
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        titulo="Inventario"
        descripcion="Existencias de su punto. Los pedidos se descuentan solos cada día; aquí registra cargas y ajustes."
        acciones={
          <>
            <Button variante="secundario" onClick={() => setEdicion({ abierto: true, item: null })} disabled={!disponibles.length}>
              Agregar producto
            </Button>
            <Button onClick={() => solicitar(enAlarma.map((i) => i.productoId))}>
              {enAlarma.length ? `Solicitar ${enAlarma.length} en stock bajo` : 'Solicitar alimentos'}
            </Button>
          </>
        }
      />

      <KpiGrid etiquetaAccesible="Resumen del inventario">
        <KpiCard etiqueta="Productos en inventario" valor={items.length} />
        <KpiCard etiqueta="Stock bajo" valor={items.filter((i) => i.estado === 'ALARMA').length} destacado={enAlarma.length > 0} detalle="Con alarma activa" />
        <KpiCard etiqueta="Agotados" valor={items.filter((i) => i.estado === 'AGOTADO').length} />
        <KpiCard etiqueta="En nivel normal" valor={items.filter((i) => i.estado === 'NORMAL').length} />
      </KpiGrid>

      {mensaje ? (
        <div className={estilos.mensaje}>
          <Banner tono={mensaje.tono}>{mensaje.texto}</Banner>
        </div>
      ) : null}

      <Card sinRelleno>
        <div className={estilos.filtros}>
          <Tabs opciones={FILTROS} valor={filtro} alCambiar={setFiltro} etiquetaAccesible="Filtrar por estado" />
          <div className={estilos.busqueda}>
            <TextField etiqueta="Buscar producto" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
        </div>
        {inventario.isError ? (
          <div className={estilos.filtros}>
            <Banner tono="error">{mensajeDeError(inventario.error)}</Banner>
          </div>
        ) : null}
        <DataTable
          titulo="Inventario del punto"
          columnas={columnas}
          filas={visibles}
          cargando={inventario.isPending}
          vacio={
            items.length ? (
              <EmptyState titulo="Ningún producto coincide con el filtro" />
            ) : (
              <EmptyState
                titulo="El inventario del punto está vacío"
                descripcion="Cargue los productos con su cantidad actual y su cantidad de referencia."
                accion={
                  <Button onClick={() => setEdicion({ abierto: true, item: null })} disabled={!disponibles.length}>
                    Agregar producto
                  </Button>
                }
              />
            )
          }
        />
      </Card>

      <AjusteInventarioModal
        abierto={edicion.abierto}
        item={edicion.item}
        productosDisponibles={disponibles}
        unidades={unidades.porId}
        alCerrar={() => setEdicion({ abierto: false, item: null })}
        alGuardar={setMensaje}
      />
    </>
  );
}
