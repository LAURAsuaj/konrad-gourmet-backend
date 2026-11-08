import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { actualizarPlato, obtenerMenu } from '../../api/cocina.js';
import { mensajeDeError } from '../../api/cliente.js';
import { useCatalogo } from '../../shared/lib/useCatalogo.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { Tabs } from '../../shared/ui/Tabs.jsx';
import { TextField } from '../../shared/ui/Field.jsx';
import { DataTable } from '../../shared/ui/DataTable.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import { formatearMoneda, formatearNumero } from '../../shared/lib/formato.js';
import { FormularioPlato } from './FormularioPlato.jsx';
import estilos from './MenuPage.module.css';

const TODAS = '__todas__';

/** Menú del punto (CU-02): el Jefe de Cocina registra, edita, activa o desactiva platos. */
export function MenuPage() {
  const queryClient = useQueryClient();
  const menu = useQuery({ queryKey: ['menu', { incluirInactivos: true }], queryFn: () => obtenerMenu({ incluirInactivos: true }) });
  const productos = useCatalogo('productos');
  const unidades = useCatalogo('unidades');
  const [categoria, setCategoria] = useState(TODAS);
  const [busqueda, setBusqueda] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [formulario, setFormulario] = useState({ abierto: false, plato: null });
  const [mensaje, setMensaje] = useState(null);

  const platos = menu.data ?? [];
  const categorias = useMemo(() => [...new Set(platos.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, 'es')), [platos]);
  const texto = busqueda.trim().toLocaleLowerCase('es');
  const visibles = platos.filter(
    (p) => (verInactivos || p.activo) && (categoria === TODAS || p.categoria === categoria) && (!texto || p.nombre.toLocaleLowerCase('es').includes(texto))
  );

  const cambiarEstado = useMutation({
    mutationFn: (plato) => actualizarPlato(plato.id, { activo: !plato.activo }),
    onSuccess: (plato) => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      setMensaje({ tono: 'exito', texto: plato.activo ? `${plato.nombre} volvió al menú.` : `${plato.nombre} salió del menú: los meseros ya no lo ven.` });
    },
    onError: (error) => setMensaje({ tono: 'error', texto: mensajeDeError(error) }),
  });

  const columnas = [
    { clave: 'nombre', titulo: 'Plato', render: (p) => <span className={estilos.nombre}>{p.nombre}</span> },
    { clave: 'categoria', titulo: 'Categoría' },
    { clave: 'precio', titulo: 'Precio', alinear: 'derecha', cifras: true, render: (p) => formatearMoneda(p.precio) },
    {
      clave: 'ingredientes',
      titulo: 'Ingredientes por porción',
      render: (p) => <span className={estilos.ingredientes}>{p.ingredientes.map((i) => `${formatearNumero(i.cantidadPorPorcion)} ${i.unidad} ${i.producto}`).join(', ')}</span>,
    },
    { clave: 'activo', titulo: 'Estado', render: (p) => (p.activo ? <StatusPill tono="marca">En el menú</StatusPill> : <StatusPill tono="contorno">Fuera del menú</StatusPill>) },
    {
      clave: 'acciones',
      titulo: <span className="kg-solo-lectores">Acciones</span>,
      alinear: 'derecha',
      render: (p) => (
        <span className={estilos.acciones}>
          <Button variante="secundario" tamano="pequeno" onClick={() => setFormulario({ abierto: true, plato: p })}>
            Editar
          </Button>
          <Button
            variante="fantasma"
            tamano="pequeno"
            cargando={cambiarEstado.isPending && cambiarEstado.variables?.id === p.id}
            onClick={() => cambiarEstado.mutate(p)}
          >
            {p.activo ? 'Sacar del menú' : 'Volver al menú'}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        titulo="Menú del punto"
        descripcion="Los platos activos son los que ven los meseros al tomar la orden."
        acciones={<Button onClick={() => setFormulario({ abierto: true, plato: null })}>Nuevo plato</Button>}
      />

      {mensaje ? (
        <div className={estilos.mensaje}>
          <Banner tono={mensaje.tono}>{mensaje.texto}</Banner>
        </div>
      ) : null}

      <Card sinRelleno>
        <div className={estilos.filtros}>
          <Tabs
            opciones={[{ valor: TODAS, etiqueta: 'Todas' }, ...categorias.map((c) => ({ valor: c, etiqueta: c }))]}
            valor={categoria}
            alCambiar={setCategoria}
            etiquetaAccesible="Categorías"
          />
          <div className={estilos.derecha}>
            <label className={estilos.casilla}>
              <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
              Ver también los que están fuera del menú
            </label>
            <div className={estilos.busqueda}>
              <TextField etiqueta="Buscar plato" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
          </div>
        </div>
        {menu.isError ? (
          <div className={estilos.filtros}>
            <Banner tono="error">{mensajeDeError(menu.error)}</Banner>
          </div>
        ) : null}
        <DataTable
          titulo="Platos del menú"
          columnas={columnas}
          filas={visibles}
          cargando={menu.isPending}
          vacio={
            platos.length ? (
              <EmptyState titulo="Ningún plato coincide con el filtro" />
            ) : (
              <EmptyState
                titulo="El menú está vacío"
                descripcion="Registre el primer plato con sus ingredientes."
                accion={<Button onClick={() => setFormulario({ abierto: true, plato: null })}>Nuevo plato</Button>}
              />
            )
          }
        />
      </Card>

      <FormularioPlato
        abierto={formulario.abierto}
        plato={formulario.plato}
        categorias={categorias}
        productos={productos.porId}
        unidades={unidades.porId}
        alCerrar={() => setFormulario({ abierto: false, plato: null })}
        alGuardar={(texto) => setMensaje({ tono: 'exito', texto })}
      />
    </>
  );
}
