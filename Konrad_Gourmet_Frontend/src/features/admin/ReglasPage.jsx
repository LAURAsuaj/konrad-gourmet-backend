import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { definirRegla, listarReglas } from '../../api/admin.js';
import { mensajeDeError } from '../../api/cliente.js';
import { formatearFechaHora } from '../../shared/lib/formato.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { SelectField, TextField } from '../../shared/ui/Field.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Spinner } from '../../shared/ui/Spinner.jsx';
import { estadoCotizacion } from '../compras/estadosCompras.js';
import { METRICAS, REGLAS, franjasDeRangos } from './reglasDefinicion.js';
import estilos from './admin.module.css';

/** Tarjeta de una regla con su editor y su propio botón de guardar. */
function TarjetaRegla({ regla }) {
  const queryClient = useQueryClient();
  const definicion = REGLAS[regla.clave];
  const [valor, setValor] = useState(regla.valor);
  const [error, setError] = useState(null);
  const [guardado, setGuardado] = useState(false);
  useEffect(() => setValor(regla.valor), [regla.valor]);

  const guardar = useMutation({
    mutationFn: (v) => definirRegla(regla.clave, v),
    onSuccess: () => {
      setGuardado(true);
      queryClient.invalidateQueries({ queryKey: ['reglas'] });
    },
    onError: (e) => setError(mensajeDeError(e)),
  });

  const cambiar = (nuevo) => {
    setValor(nuevo);
    setError(null);
    setGuardado(false);
  };
  const cambiado = JSON.stringify(valor) !== JSON.stringify(regla.valor);

  function alEnviar(e) {
    e.preventDefault();
    const r = definicion.validar(valor);
    if (r.error) setError(r.error);
    else guardar.mutate(r.valor);
  }

  let editor;
  if (definicion.tipo === 'metrica') {
    editor = (
      <SelectField etiqueta="Criterio" value={valor?.metrica ?? ''} error={error} onChange={(e) => cambiar({ metrica: e.target.value })} opciones={METRICAS} />
    );
  } else if (definicion.tipo === 'rangos') {
    const campo = (clave, etiqueta) => (
      <TextField etiqueta={etiqueta} type="number" inputMode="decimal" step="0.01" min="0" value={valor?.[clave] ?? ''} onChange={(e) => cambiar({ ...valor, [clave]: e.target.value })} />
    );
    const valido = definicion.validar(valor);
    editor = (
      <>
        <div className={estilos.tresColumnas}>
          {campo('sospechosa_bajo', 'Sospechosa por debajo de')}
          {campo('opcionada_max', 'Opcionada hasta')}
          {campo('rechazada_sobre', 'Rechazada por encima de')}
        </div>
        {error ? <Banner tono="error">{error}</Banner> : null}
        {valido.valor ? (
          <ul className={estilos.franjas} aria-label="Cómo se clasificarán las cotizaciones">
            {franjasDeRangos(valido.valor).map((f) => (
              <li key={f.texto}>
                <span>{f.texto}</span>
                <StatusPill tono={estadoCotizacion(f.estado).tono}>{estadoCotizacion(f.estado).texto}</StatusPill>
              </li>
            ))}
          </ul>
        ) : null}
      </>
    );
  } else {
    editor = (
      <TextField
        etiqueta={definicion.sufijo ? `Valor (${definicion.sufijo})` : 'Valor'}
        type={definicion.tipo === 'hora' ? 'time' : 'number'}
        inputMode={definicion.tipo === 'hora' ? undefined : 'decimal'}
        value={valor ?? ''}
        error={error}
        onChange={(e) => cambiar(e.target.value)}
      />
    );
  }

  return (
    <Card as="article" titulo={definicion.titulo} className={estilos.regla}>
      <form className={estilos.formulario} onSubmit={alEnviar} noValidate>
        <p className={estilos.secundario}>{definicion.ayuda}</p>
        {editor}
        <div className={estilos.reglaPie}>
          <span className={estilos.secundario}>{guardado ? 'Guardada. Se aplica de inmediato.' : regla.actualizadoEn ? `Cambiada ${formatearFechaHora(regla.actualizadoEn)}` : 'Valor inicial'}</span>
          <Button type="submit" tamano="pequeno" disabled={!cambiado} cargando={guardar.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Reglas del sistema (CU-04). Los cambios se aplican sin reiniciar, también al cron. */
export function ReglasPage() {
  const reglas = useQuery({ queryKey: ['reglas'], queryFn: listarReglas });
  return (
    <>
      <PageHeader
        titulo="Reglas del sistema"
        descripcion="Valores que gobiernan alarmas, seguridad, procesos automáticos y compras."
        acciones={
          <Link to="/admin/imagen">Imagen corporativa</Link>
        }
      />
      {reglas.isError ? <Banner tono="error">{mensajeDeError(reglas.error)}</Banner> : null}
      {reglas.isPending ? (
        <Spinner etiqueta="Cargando reglas" />
      ) : (
        <div className={estilos.reglas}>
          {(reglas.data ?? [])
            .filter((r) => REGLAS[r.clave])
            .map((r) => (
              <TarjetaRegla key={r.clave} regla={r} />
            ))}
        </div>
      )}
    </>
  );
}
