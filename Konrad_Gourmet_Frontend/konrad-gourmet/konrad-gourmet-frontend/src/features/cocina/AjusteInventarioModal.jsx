import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ajustarInventario } from '../../api/inventario.js';
import { mensajeDeError } from '../../api/cliente.js';
import { Modal } from '../../shared/ui/Modal.jsx';
import { SelectField, TextField } from '../../shared/ui/Field.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import estilos from './AjusteInventarioModal.module.css';

export const MENSAJES_ALARMA = {
  GENERADA: 'Inventario actualizado. Quedó en stock bajo: se generó una alarma y se avisó por correo.',
  EXISTENTE: 'Inventario actualizado. El producto sigue en stock bajo.',
  RESUELTA: 'Inventario actualizado. El producto quedó reabastecido y la alarma se cerró.',
  NINGUNA: 'Inventario actualizado.',
};

/**
 * Carga o ajusta el inventario de un producto (PUT /inventario). Si `item` es nulo,
 * se elige el producto entre los que todavía no están en el inventario del punto.
 */
export function AjusteInventarioModal({ abierto, item, productosDisponibles = [], unidades, alCerrar, alGuardar }) {
  const queryClient = useQueryClient();
  const [productoId, setProductoId] = useState('');
  const [actual, setActual] = useState('');
  const [referencia, setReferencia] = useState('');
  const [errores, setErrores] = useState({});

  useEffect(() => {
    if (!abierto) return;
    setProductoId(item?.productoId ?? '');
    setActual(item ? String(item.cantidadActual) : '');
    setReferencia(item ? String(item.cantidadReferencia) : '');
    setErrores({});
  }, [abierto, item]);

  const guardar = useMutation({
    mutationFn: ajustarInventario,
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      alGuardar({ tono: resultado.alarma === 'GENERADA' || resultado.alarma === 'EXISTENTE' ? 'info' : 'exito', texto: `${resultado.producto}: ${MENSAJES_ALARMA[resultado.alarma] ?? MENSAJES_ALARMA.NINGUNA}` });
      alCerrar();
    },
  });

  const productoElegido = item ?? productosDisponibles.find((p) => p.id === productoId);
  const unidad = item?.unidad ?? unidades.get(productoElegido?.unidadId)?.abreviatura ?? '';

  function alEnviar(e) {
    e.preventDefault();
    const nuevos = {};
    if (!productoId) nuevos.productoId = 'Elija el producto.';
    const nActual = Number(actual);
    const nReferencia = Number(referencia);
    if (actual === '' || !Number.isFinite(nActual) || nActual < 0) nuevos.actual = 'Escriba 0 o una cantidad positiva.';
    if (referencia === '' || !Number.isFinite(nReferencia) || nReferencia <= 0) nuevos.referencia = 'Escriba una cantidad mayor que 0.';
    setErrores(nuevos);
    if (Object.keys(nuevos).length) return;
    guardar.mutate({ productoId, cantidadActual: nActual, cantidadReferencia: nReferencia });
  }

  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo={item ? `Ajustar inventario: ${item.producto}` : 'Agregar producto al inventario'}>
      <form className={estilos.formulario} onSubmit={alEnviar} noValidate>
        {guardar.isError ? <Banner tono="error">{mensajeDeError(guardar.error)}</Banner> : null}
        {item ? null : (
          <SelectField etiqueta="Producto" value={productoId} error={errores.productoId} onChange={(e) => setProductoId(e.target.value)}>
            <option value="">Elija un producto</option>
            {productosDisponibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </SelectField>
        )}
        <div className={estilos.dosColumnas}>
          <TextField
            etiqueta={`Cantidad actual${unidad ? ` (${unidad})` : ''}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={actual}
            error={errores.actual}
            onChange={(e) => setActual(e.target.value)}
          />
          <TextField
            etiqueta={`Cantidad de referencia${unidad ? ` (${unidad})` : ''}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={referencia}
            error={errores.referencia}
            ayuda="El nivel normal del punto; la alarma se calcula sobre ella."
            onChange={(e) => setReferencia(e.target.value)}
          />
        </div>
        <div className={estilos.acciones}>
          <Button variante="secundario" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button type="submit" cargando={guardar.isPending}>
            Guardar inventario
          </Button>
        </div>
      </form>
    </Modal>
  );
}
