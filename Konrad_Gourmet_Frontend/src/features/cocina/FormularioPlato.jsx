import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { actualizarPlato, crearPlato } from '../../api/cocina.js';
import { mensajeDeError } from '../../api/cliente.js';
import { Modal } from '../../shared/ui/Modal.jsx';
import { SelectField, TextField } from '../../shared/ui/Field.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import estilos from './FormularioPlato.module.css';

// Claves locales de fila (crypto.randomUUID no existe fuera de HTTPS o localhost)
let siguienteClave = 0;
const nuevaClave = () => `fila-${(siguienteClave += 1)}`;
const filaVacia = () => ({ clave: nuevaClave(), productoId: '', cantidadPorPorcion: '' });

function estadoInicial(plato) {
  if (!plato) return { nombre: '', categoria: '', precio: '', ingredientes: [filaVacia()] };
  return {
    nombre: plato.nombre,
    categoria: plato.categoria,
    precio: String(plato.precio),
    ingredientes: plato.ingredientes.map((i) => ({ clave: nuevaClave(), productoId: i.productoId, cantidadPorPorcion: String(i.cantidadPorPorcion) })),
  };
}

/** Valida el formulario y arma el cuerpo de la API. La unidad de cada ingrediente es la de su producto. */
export function validarPlato(campos, productos) {
  const errores = { ingredientes: campos.ingredientes.map(() => ({})) };
  if (!campos.nombre.trim()) errores.nombre = 'Escriba el nombre del plato.';
  if (!campos.categoria.trim()) errores.categoria = 'Escriba la categoría, por ejemplo Fuertes o Bebidas.';
  const precio = Number(campos.precio);
  if (!campos.precio || !Number.isFinite(precio) || precio <= 0) errores.precio = 'Escriba un precio mayor que 0.';
  if (!campos.ingredientes.length) errores.general = 'Agregue al menos un ingrediente: con ellos se descuenta el inventario.';
  const vistos = new Set();
  campos.ingredientes.forEach((ing, i) => {
    if (!ing.productoId) errores.ingredientes[i].productoId = 'Elija el producto.';
    else if (vistos.has(ing.productoId)) errores.ingredientes[i].productoId = 'Este producto ya está en otra fila.';
    vistos.add(ing.productoId);
    const cantidad = Number(ing.cantidadPorPorcion);
    if (!ing.cantidadPorPorcion || !Number.isFinite(cantidad) || cantidad <= 0) errores.ingredientes[i].cantidadPorPorcion = 'Mayor que 0.';
  });
  const valido = !errores.nombre && !errores.categoria && !errores.precio && !errores.general && errores.ingredientes.every((e) => !Object.keys(e).length);
  const cuerpo = {
    nombre: campos.nombre.trim(),
    categoria: campos.categoria.trim(),
    precio,
    ingredientes: campos.ingredientes.map((ing) => ({
      productoId: ing.productoId,
      cantidadPorPorcion: Number(ing.cantidadPorPorcion),
      unidadId: productos.get(ing.productoId)?.unidadId,
    })),
  };
  return { errores, valido, cuerpo };
}

/** Registrar o editar un plato del menú del punto (CU-02). */
export function FormularioPlato({ abierto, plato, categorias, productos, unidades, alCerrar, alGuardar }) {
  const queryClient = useQueryClient();
  const idCategorias = useId();
  const [campos, setCampos] = useState(() => estadoInicial(plato));
  const [errores, setErrores] = useState({ ingredientes: [] });

  useEffect(() => {
    if (abierto) {
      setCampos(estadoInicial(plato));
      setErrores({ ingredientes: [] });
    }
  }, [abierto, plato]);

  const guardar = useMutation({
    mutationFn: (cuerpo) => (plato ? actualizarPlato(plato.id, cuerpo) : crearPlato(cuerpo)),
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      alGuardar(plato ? `Se guardaron los cambios de ${resultado.nombre}.` : `${resultado.nombre} quedó en el menú.`);
      alCerrar();
    },
  });

  const cambiar = (campo) => (e) => setCampos((c) => ({ ...c, [campo]: e.target.value }));
  const cambiarIngrediente = (clave, campo, valor) =>
    setCampos((c) => ({ ...c, ingredientes: c.ingredientes.map((i) => (i.clave === clave ? { ...i, [campo]: valor } : i)) }));

  function alEnviar(e) {
    e.preventDefault();
    const { errores: nuevos, valido, cuerpo } = validarPlato(campos, productos);
    setErrores(nuevos);
    if (!valido) return;
    if (plato) {
      // En la edición solo se envía lo que cambió (los ingredientes reemplazan la lista completa).
      const cambios = {};
      if (cuerpo.nombre !== plato.nombre) cambios.nombre = cuerpo.nombre;
      if (cuerpo.categoria !== plato.categoria) cambios.categoria = cuerpo.categoria;
      if (cuerpo.precio !== plato.precio) cambios.precio = cuerpo.precio;
      const firma = (lista) => JSON.stringify(lista.map((i) => [i.productoId, Number(i.cantidadPorPorcion)]).sort());
      if (firma(cuerpo.ingredientes) !== firma(plato.ingredientes)) cambios.ingredientes = cuerpo.ingredientes;
      if (!Object.keys(cambios).length) {
        alCerrar();
        return;
      }
      guardar.mutate(cambios);
    } else {
      guardar.mutate(cuerpo);
    }
  }

  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo={plato ? `Editar ${plato.nombre}` : 'Nuevo plato'}>
      <form className={estilos.formulario} onSubmit={alEnviar} noValidate>
        {guardar.isError ? <Banner tono="error">{mensajeDeError(guardar.error)}</Banner> : null}
        <TextField etiqueta="Nombre del plato" value={campos.nombre} maxLength={120} error={errores.nombre} onChange={cambiar('nombre')} />
        <div className={estilos.dosColumnas}>
          <TextField etiqueta="Categoría" list={idCategorias} value={campos.categoria} maxLength={80} error={errores.categoria} onChange={cambiar('categoria')} />
          <datalist id={idCategorias}>
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <TextField etiqueta="Precio (COP)" type="number" inputMode="numeric" min="0" step="50" value={campos.precio} error={errores.precio} onChange={cambiar('precio')} />
        </div>

        <fieldset className={estilos.ingredientes}>
          <legend>Ingredientes por porción</legend>
          <p className={estilos.ayuda}>Se usan para descontar el inventario cada día. La unidad es la del producto.</p>
          {errores.general ? <Banner tono="error">{errores.general}</Banner> : null}
          {campos.ingredientes.map((ing, i) => {
            const producto = productos.get(ing.productoId);
            const unidad = unidades.get(producto?.unidadId)?.abreviatura;
            const err = errores.ingredientes[i] ?? {};
            return (
              <div key={ing.clave} className={estilos.fila}>
                <SelectField etiqueta={`Producto ${i + 1}`} value={ing.productoId} error={err.productoId} onChange={(e) => cambiarIngrediente(ing.clave, 'productoId', e.target.value)}>
                  <option value="">Elija un producto</option>
                  {[...productos.values()].map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  etiqueta={`Cantidad${unidad ? ` (${unidad})` : ''}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={ing.cantidadPorPorcion}
                  error={err.cantidadPorPorcion}
                  onChange={(e) => cambiarIngrediente(ing.clave, 'cantidadPorPorcion', e.target.value)}
                />
                <Button
                  variante="fantasma"
                  icono="cerrar"
                  etiquetaAccesible={`Quitar ingrediente ${i + 1}`}
                  disabled={campos.ingredientes.length === 1}
                  onClick={() => setCampos((c) => ({ ...c, ingredientes: c.ingredientes.filter((x) => x.clave !== ing.clave) }))}
                />
              </div>
            );
          })}
          <div>
            <Button variante="secundario" tamano="pequeno" onClick={() => setCampos((c) => ({ ...c, ingredientes: [...c.ingredientes, filaVacia()] }))}>
              Agregar ingrediente
            </Button>
          </div>
        </fieldset>

        <div className={estilos.acciones}>
          <Button variante="secundario" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button type="submit" cargando={guardar.isPending}>
            {plato ? 'Guardar cambios' : 'Agregar al menú'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
