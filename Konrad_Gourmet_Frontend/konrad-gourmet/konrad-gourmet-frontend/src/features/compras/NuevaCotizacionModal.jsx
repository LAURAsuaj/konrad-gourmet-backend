import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { solicitarCotizacion } from '../../api/compras.js';
import { mensajeDeError } from '../../api/cliente.js';
import { fechaDeHoy } from '../../shared/lib/formato.js';
import { Modal } from '../../shared/ui/Modal.jsx';
import { SelectField, TextField } from '../../shared/ui/Field.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { plazoPorDefecto } from './valoresCotizacion.js';
import estilos from './compras.module.css';

/**
 * Solicitud de cotización a un proveedor (CU-09): el sistema genera el PDF y lo envía
 * por correo. Si el correo no sale, la API no crea la cotización (503).
 */
export function NuevaCotizacionModal({ abierto, solicitud, proveedores, alCerrar, alCrear }) {
  const queryClient = useQueryClient();
  const hoy = fechaDeHoy();
  const [proveedorId, setProveedorId] = useState('');
  const [plazo, setPlazo] = useState(plazoPorDefecto(hoy));
  const [elegidos, setElegidos] = useState([]);
  const [errores, setErrores] = useState({});

  useEffect(() => {
    if (!abierto) return;
    setProveedorId('');
    setPlazo(plazoPorDefecto(hoy));
    setElegidos(solicitud.items.map((i) => i.id));
    setErrores({});
  }, [abierto, solicitud, hoy]);

  const conCorreo = proveedores.filter((p) => p.correo);
  const crear = useMutation({
    mutationFn: () =>
      solicitarCotizacion({
        solicitudId: solicitud.id,
        proveedorId,
        plazoMaximo: plazo,
        detalleIds: elegidos.length === solicitud.items.length ? undefined : elegidos,
      }),
    onSuccess: (cotizacion) => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] });
      queryClient.invalidateQueries({ queryKey: ['solicitud', solicitud.id] });
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      alCrear(`Cotización N.º ${cotizacion.consecutivo} enviada por correo a ${cotizacion.proveedor} con ${cotizacion.alimentos} ${cotizacion.alimentos === 1 ? 'alimento' : 'alimentos'}.`);
      alCerrar();
    },
  });

  function alEnviar(e) {
    e.preventDefault();
    const nuevos = {};
    if (!proveedorId) nuevos.proveedorId = 'Elija el proveedor.';
    if (!plazo || plazo < hoy) nuevos.plazo = 'El plazo no puede ser una fecha pasada.';
    if (!elegidos.length) nuevos.alimentos = 'Elija al menos un alimento.';
    setErrores(nuevos);
    if (!Object.keys(nuevos).length) crear.mutate();
  }

  const alternar = (id) => setElegidos((actuales) => (actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id]));

  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo={`Cotizar la solicitud N.º ${solicitud.consecutivo}`}>
      <form className={estilos.formulario} onSubmit={alEnviar} noValidate>
        {crear.isError ? <Banner tono="error">{mensajeDeError(crear.error)}</Banner> : null}
        <SelectField
          etiqueta="Proveedor"
          value={proveedorId}
          error={errores.proveedorId}
          ayuda={proveedores.length > conCorreo.length ? 'Solo aparecen los proveedores con correo registrado.' : undefined}
          onChange={(e) => setProveedorId(e.target.value)}
        >
          <option value="">Elija un proveedor</option>
          {conCorreo.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} ({p.correo})
            </option>
          ))}
        </SelectField>
        <TextField etiqueta="Plazo máximo de respuesta" type="date" min={hoy} value={plazo} error={errores.plazo} onChange={(e) => setPlazo(e.target.value)} />
        <fieldset className={estilos.casillas}>
          <legend>Alimentos a cotizar</legend>
          {errores.alimentos ? <Banner tono="error">{errores.alimentos}</Banner> : null}
          {solicitud.items.map((i) => (
            <label key={i.id} className={estilos.casilla}>
              <input type="checkbox" checked={elegidos.includes(i.id)} onChange={() => alternar(i.id)} />
              {i.producto}
              {i.marca ? ` (${i.marca})` : ''}: {i.cantidad} {i.unidad}
            </label>
          ))}
        </fieldset>
        <div className={estilos.acciones}>
          <Button variante="secundario" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button type="submit" cargando={crear.isPending}>
            Enviar solicitud de cotización
          </Button>
        </div>
      </form>
    </Modal>
  );
}
