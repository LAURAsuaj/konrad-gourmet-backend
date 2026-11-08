import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { actualizarValorCatalogo, crearValorCatalogo, eliminarValorCatalogo } from '../../api/admin.js';
import { ErrorApi, mensajeDeError } from '../../api/cliente.js';
import { useCatalogo } from '../../shared/lib/useCatalogo.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { Tabs } from '../../shared/ui/Tabs.jsx';
import { SelectField, TextField } from '../../shared/ui/Field.jsx';
import { DataTable } from '../../shared/ui/DataTable.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Modal } from '../../shared/ui/Modal.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import { CATALOGOS, construirCuerpo, definicionDe, referenciasDe } from './catalogosDefinicion.js';
import estilos from './admin.module.css';

/** Lee los catálogos referenciados (puntos, categorías, unidades) para mostrar nombres y elegir. */
function useReferencias(definicion) {
  const puntos = useCatalogo('puntos', { incluirInactivos: 'true' }, { enabled: referenciasDe(definicion).includes('puntos') });
  const categorias = useCatalogo('categorias', { incluirInactivos: 'true' }, { enabled: referenciasDe(definicion).includes('categorias') });
  const unidades = useCatalogo('unidades', { incluirInactivos: 'true' }, { enabled: referenciasDe(definicion).includes('unidades') });
  return { puntos, categorias, unidades };
}

function ValorModal({ abierto, definicion, original, referencias, alCerrar, alGuardar }) {
  const queryClient = useQueryClient();
  const [entradas, setEntradas] = useState({});
  const [errores, setErrores] = useState({});
  useEffect(() => {
    if (!abierto) return;
    setEntradas(Object.fromEntries(definicion.campos.map((c) => [c.campo, original?.[c.campo] == null ? '' : String(original[c.campo])])));
    setErrores({});
  }, [abierto, definicion, original]);

  const guardar = useMutation({
    mutationFn: (cuerpo) => (original ? actualizarValorCatalogo(definicion.clave, original.id, cuerpo) : crearValorCatalogo(definicion.clave, cuerpo)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogo', definicion.clave] });
      alGuardar(original ? `Se guardaron los cambios del ${definicion.singular}.` : `Se creó el ${definicion.singular}.`);
      alCerrar();
    },
  });

  function alEnviar(e) {
    e.preventDefault();
    const r = construirCuerpo(definicion, entradas, original);
    setErrores(r.errores);
    if (!r.valido) return;
    if (original && !Object.keys(r.cuerpo).length) {
      alCerrar();
      return;
    }
    guardar.mutate(r.cuerpo);
  }

  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo={original ? `Editar ${definicion.singular}` : `Nuevo: ${definicion.singular}`}>
      <form className={estilos.formulario} onSubmit={alEnviar} noValidate>
        {guardar.isError ? <Banner tono="error">{mensajeDeError(guardar.error)}</Banner> : null}
        {definicion.campos.map((c) => {
          const bloqueado = Boolean(original && c.inmutable);
          const comunes = {
            etiqueta: c.obligatorio ? c.etiqueta : `${c.etiqueta} (opcional)`,
            value: entradas[c.campo] ?? '',
            error: errores[c.campo],
            disabled: bloqueado,
            ayuda: bloqueado ? 'No se puede cambiar una vez creado.' : undefined,
            onChange: (e) => setEntradas((x) => ({ ...x, [c.campo]: e.target.value })),
          };
          if (c.tipo === 'referencia') {
            return (
              <SelectField key={c.campo} {...comunes}>
                <option value="">Elija</option>
                {referencias[c.catalogo].lista.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                    {v.activo ? '' : ' (inactivo)'}
                  </option>
                ))}
              </SelectField>
            );
          }
          return (
            <TextField
              key={c.campo}
              {...comunes}
              type={c.tipo === 'entero' ? 'number' : c.tipo === 'correo' ? 'email' : 'text'}
              inputMode={c.tipo === 'entero' ? 'numeric' : undefined}
              maxLength={c.tipo === 'entero' ? undefined : c.max}
            />
          );
        })}
        <div className={estilos.acciones}>
          <Button variante="secundario" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button type="submit" cargando={guardar.isPending}>
            {original ? 'Guardar cambios' : 'Crear'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Catálogos parametrizables (CU-04). Un valor en uso no se elimina: se inactiva, y deja
 * de aparecer en las listas de los demás roles.
 */
export function CatalogosPage() {
  const queryClient = useQueryClient();
  const [parametros, setParametros] = useSearchParams();
  const definicion = definicionDe(parametros.get('catalogo')) ?? CATALOGOS[0];
  const valores = useCatalogo(definicion.clave, { incluirInactivos: 'true' }, { staleTime: 0 });
  const referencias = useReferencias(definicion);
  const [busqueda, setBusqueda] = useState('');
  const [edicion, setEdicion] = useState({ abierto: false, original: null });
  const [eliminar, setEliminar] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    setBusqueda('');
    setMensaje(null);
  }, [definicion.clave]);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['catalogo', definicion.clave] });
  const cambiarEstado = useMutation({
    mutationFn: (v) => actualizarValorCatalogo(definicion.clave, v.id, { activo: !v.activo }),
    onSuccess: (v) => {
      invalidar();
      setMensaje({ tono: 'exito', texto: v.activo ? 'Valor activado: vuelve a aparecer en las listas.' : 'Valor inactivado: ya no aparece en las listas de los demás roles.' });
    },
    onError: (e) => setMensaje({ tono: 'error', texto: mensajeDeError(e) }),
  });
  const borrar = useMutation({
    mutationFn: (v) => eliminarValorCatalogo(definicion.clave, v.id),
    onSuccess: () => {
      invalidar();
      setMensaje({ tono: 'exito', texto: `Se eliminó el ${definicion.singular}.` });
      setEliminar(null);
    },
    onError: (e) => {
      setEliminar(null);
      setMensaje({
        tono: 'error',
        texto: e instanceof ErrorApi && e.codigo === 'CONFLICTO' ? `${e.message} Puede inactivarlo para que deje de usarse.` : mensajeDeError(e),
      });
    },
  });

  const nombreDe = (catalogo, id) => referencias[catalogo]?.porId.get(id)?.nombre ?? '—';
  const texto = busqueda.trim().toLocaleLowerCase('es');
  const filas = valores.lista.filter((v) => !texto || definicion.campos.some((c) => String(c.tipo === 'referencia' ? nombreDe(c.catalogo, v[c.campo]) : v[c.campo] ?? '').toLocaleLowerCase('es').includes(texto)));

  const columnas = [
    ...definicion.campos.map((c) => ({
      clave: c.campo,
      titulo: c.etiqueta,
      cifras: c.tipo === 'entero',
      render: (v) => (c.tipo === 'referencia' ? nombreDe(c.catalogo, v[c.campo]) : v[c.campo] ?? '—'),
    })),
    { clave: 'activo', titulo: 'Estado', render: (v) => (v.activo ? <StatusPill tono="neutro">Activo</StatusPill> : <StatusPill tono="contorno">Inactivo</StatusPill>) },
    {
      clave: 'acciones',
      titulo: <span className="kg-solo-lectores">Acciones</span>,
      alinear: 'derecha',
      render: (v) => (
        <span className={estilos.accionesFila}>
          <Button variante="secundario" tamano="pequeno" onClick={() => setEdicion({ abierto: true, original: v })}>
            Editar
          </Button>
          <Button variante="fantasma" tamano="pequeno" cargando={cambiarEstado.isPending && cambiarEstado.variables?.id === v.id} onClick={() => cambiarEstado.mutate(v)}>
            {v.activo ? 'Inactivar' : 'Activar'}
          </Button>
          <Button variante="peligro" tamano="pequeno" onClick={() => setEliminar(v)}>
            Eliminar
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        titulo="Catálogos"
        descripcion="Las listas que usan los demás roles. Los nombres no se repiten."
        acciones={<Button onClick={() => setEdicion({ abierto: true, original: null })}>Nuevo: {definicion.singular}</Button>}
      />
      {mensaje ? (
        <div className={estilos.mensaje}>
          <Banner tono={mensaje.tono}>{mensaje.texto}</Banner>
        </div>
      ) : null}
      <Card sinRelleno>
        <div className={estilos.filtros}>
          <Tabs
            opciones={CATALOGOS.map((c) => ({ valor: c.clave, etiqueta: c.titulo }))}
            valor={definicion.clave}
            alCambiar={(v) => setParametros({ catalogo: v }, { replace: true })}
            etiquetaAccesible="Catálogo"
          />
          <div className={estilos.campo}>
            <TextField etiqueta="Buscar" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
        </div>
        {valores.isError ? (
          <div className={estilos.aviso}>
            <Banner tono="error">{mensajeDeError(valores.error)}</Banner>
          </div>
        ) : null}
        <DataTable
          titulo={definicion.titulo}
          columnas={columnas}
          filas={filas}
          cargando={valores.isPending}
          vacio={<EmptyState titulo={valores.lista.length ? 'Ningún valor coincide con la búsqueda' : `No hay ${definicion.titulo.toLowerCase()} todavía`} />}
        />
      </Card>

      <ValorModal
        abierto={edicion.abierto}
        definicion={definicion}
        original={edicion.original}
        referencias={referencias}
        alCerrar={() => setEdicion({ abierto: false, original: null })}
        alGuardar={(t) => setMensaje({ tono: 'exito', texto: t })}
      />
      <Modal
        abierto={Boolean(eliminar)}
        alCerrar={() => setEliminar(null)}
        titulo={`¿Eliminar este ${definicion.singular}?`}
        pie={
          <>
            <Button variante="secundario" onClick={() => setEliminar(null)}>
              Cancelar
            </Button>
            <Button variante="peligro" cargando={borrar.isPending} onClick={() => borrar.mutate(eliminar)}>
              Eliminar
            </Button>
          </>
        }
      >
        <p>
          Se eliminará <strong>{eliminar?.nombre ?? (eliminar?.numero ? `la mesa ${eliminar.numero}` : '')}</strong>. Si otros registros lo usan, el sistema no lo eliminará y podrá inactivarlo.
        </p>
      </Modal>
    </>
  );
}
