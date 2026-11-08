import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { registrarSolicitud } from '../../api/solicitudes.js';
import { listarInventario } from '../../api/inventario.js';
import { mensajeDeError } from '../../api/cliente.js';
import { useCatalogo } from '../../shared/lib/useCatalogo.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { SelectField, TextField } from '../../shared/ui/Field.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Spinner } from '../../shared/ui/Spinner.jsx';
import { sugerirSolicitud, validarSolicitud } from './analisisCocina.js';
import estilos from './SolicitudPage.module.css';

let siguienteClave = 0;
const conClave = (fila) => ({ ...fila, clave: `fila-${(siguienteClave += 1)}` });
const filaVacia = () => conClave({ categoriaId: '', productoId: '', marcaId: '', cantidad: '' });

/**
 * Solicitud de alimentos por falta de stock (CU-05). Si llega con ?productos=id1,id2
 * (desde Inventario o el panel), precarga esos productos con la cantidad que falta
 * para volver a la referencia.
 */
export function SolicitudPage() {
  const [parametros] = useSearchParams();
  const categorias = useCatalogo('categorias');
  const productos = useCatalogo('productos');
  const marcas = useCatalogo('marcas');
  const unidades = useCatalogo('unidades');
  const inventario = useQuery({ queryKey: ['inventario', 'punto'], queryFn: () => listarInventario() });
  const [filas, setFilas] = useState([filaVacia()]);
  const [errores, setErrores] = useState([]);
  const [registrada, setRegistrada] = useState(null);
  const precargada = useRef(false);

  const listo = !categorias.isPending && !productos.isPending && !marcas.isPending && !unidades.isPending && !inventario.isPending;

  useEffect(() => {
    if (!listo || precargada.current) return;
    precargada.current = true;
    const ids = (parametros.get('productos') ?? '').split(',').filter(Boolean);
    const sugeridas = sugerirSolicitud(ids, { inventario: inventario.data ?? [], productos: productos.lista });
    if (sugeridas.length) setFilas(sugeridas.map(conClave));
  }, [listo, parametros, inventario.data, productos.lista]);

  const enviar = useMutation({
    mutationFn: () =>
      registrarSolicitud(
        filas.map((f) => ({
          categoriaId: f.categoriaId,
          productoId: f.productoId,
          ...(f.marcaId ? { marcaId: f.marcaId } : {}),
          cantidad: Number(f.cantidad),
          unidadId: productos.porId.get(f.productoId)?.unidadId,
        }))
      ),
    onSuccess: setRegistrada,
  });

  const cambiar = (clave, campo, valor) =>
    setFilas((actuales) =>
      actuales.map((f) => {
        if (f.clave !== clave) return f;
        if (campo === 'categoriaId') return { ...f, categoriaId: valor, productoId: '' };
        if (campo === 'productoId') return { ...f, productoId: valor, categoriaId: productos.porId.get(valor)?.categoriaId ?? f.categoriaId };
        return { ...f, [campo]: valor };
      })
    );

  function alEnviar(e) {
    e.preventDefault();
    const resultado = validarSolicitud(filas);
    setErrores(resultado.errores);
    if (resultado.valido) enviar.mutate();
  }

  if (registrada) {
    return (
      <>
        <PageHeader titulo="Solicitud registrada" />
        <Card>
          <div className={estilos.exito}>
            <p>Solicitud número</p>
            <p className={`${estilos.consecutivo} kg-cifras`}>{registrada.consecutivo}</p>
            <p>
              Quedó pendiente para el área de compras con {registrada.items} {registrada.items === 1 ? 'alimento' : 'alimentos'}. Le llegará la
              confirmación por correo y en Notificaciones.
            </p>
            <div className={estilos.botones}>
              <Button
                onClick={() => {
                  setRegistrada(null);
                  setFilas([filaVacia()]);
                  setErrores([]);
                }}
              >
                Registrar otra solicitud
              </Button>
              <Link to="/cocina/inventario">Volver al inventario</Link>
            </div>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader titulo="Solicitar alimentos" descripcion="Pida al área de compras los alimentos que faltan en su punto. La unidad es la del producto." />
      {!listo ? (
        <Spinner etiqueta="Cargando catálogos" />
      ) : (
        <Card>
          <form className={estilos.formulario} onSubmit={alEnviar} noValidate>
            {enviar.isError ? <Banner tono="error">{mensajeDeError(enviar.error)}</Banner> : null}
            <ul className={estilos.filas}>
              {filas.map((fila, i) => {
                const err = errores[i] ?? {};
                const producto = productos.porId.get(fila.productoId);
                const opcionesProducto = productos.lista.filter((p) => !fila.categoriaId || p.categoriaId === fila.categoriaId);
                return (
                  <li key={fila.clave} className={estilos.fila} aria-label={`Alimento ${i + 1}`}>
                    <SelectField etiqueta="Categoría" value={fila.categoriaId} error={err.categoriaId} onChange={(e) => cambiar(fila.clave, 'categoriaId', e.target.value)}>
                      <option value="">Elija</option>
                      {categorias.lista.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField etiqueta="Producto" value={fila.productoId} error={err.productoId} onChange={(e) => cambiar(fila.clave, 'productoId', e.target.value)}>
                      <option value="">Elija</option>
                      {opcionesProducto.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField etiqueta="Marca (opcional)" value={fila.marcaId} onChange={(e) => cambiar(fila.clave, 'marcaId', e.target.value)}>
                      <option value="">Cualquier marca</option>
                      {marcas.lista.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </SelectField>
                    <TextField
                      etiqueta={`Cantidad${producto ? ` (${unidades.porId.get(producto.unidadId)?.abreviatura ?? ''})` : ''}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={fila.cantidad}
                      error={err.cantidad}
                      onChange={(e) => cambiar(fila.clave, 'cantidad', e.target.value)}
                    />
                    <Button
                      variante="fantasma"
                      icono="cerrar"
                      etiquetaAccesible={`Quitar alimento ${i + 1}`}
                      disabled={filas.length === 1}
                      onClick={() => setFilas((f) => f.filter((x) => x.clave !== fila.clave))}
                    />
                  </li>
                );
              })}
            </ul>
            <div className={estilos.acciones}>
              <Button variante="secundario" disabled={filas.length >= 100} onClick={() => setFilas((f) => [...f, filaVacia()])}>
                Agregar alimento
              </Button>
              <Button type="submit" cargando={enviar.isPending}>
                Registrar solicitud
              </Button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
