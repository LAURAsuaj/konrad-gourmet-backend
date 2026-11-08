import { useState } from 'react';
import { ErrorApi, api, mensajeDeError } from '../../api/cliente.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { TextField } from '../../shared/ui/Field.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { useSesion } from './AuthProvider.jsx';
import { ReglasPassword } from './ReglasPassword.jsx';
import { passwordValida } from './validarPassword.js';
import estilos from './CambiarPasswordPage.module.css';

const VACIO = { actual: '', nueva: '', confirmacion: '' };

/** El propio usuario cambia su contraseña (POST /auth/cambiar-password). */
export function CambiarPasswordPage() {
  const { cerrarSesionLocal } = useSesion();
  const [campos, setCampos] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (campo) => (e) => setCampos((c) => ({ ...c, [campo]: e.target.value }));

  async function alEnviar(evento) {
    evento.preventDefault();
    const nuevos = {};
    if (!campos.actual) nuevos.actual = 'Escriba su contraseña actual.';
    if (!passwordValida(campos.nueva)) nuevos.nueva = 'La nueva contraseña no cumple todos los requisitos.';
    else if (campos.nueva === campos.actual) nuevos.nueva = 'La nueva contraseña debe ser distinta de la actual.';
    if (campos.confirmacion !== campos.nueva) nuevos.confirmacion = 'Las contraseñas no coinciden.';
    setErrores(nuevos);
    setResultado(null);
    if (Object.keys(nuevos).length) return;

    setEnviando(true);
    try {
      await api.post('/auth/cambiar-password', { passwordActual: campos.actual, passwordNueva: campos.nueva });
      setCampos(VACIO);
      setResultado({ tono: 'exito', texto: 'Contraseña actualizada. Úsela la próxima vez que inicie sesión.' });
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === 'CUENTA_BLOQUEADA') {
        cerrarSesionLocal('Su cuenta se bloqueó por intentos fallidos. Pida al Administrador que la desbloquee.');
        return;
      }
      if (error instanceof ErrorApi && error.codigo === 'VALIDACION' && /actual/i.test(error.message)) {
        setErrores({ actual: error.message });
      } else {
        setResultado({ tono: 'error', texto: mensajeDeError(error) });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={estilos.contenido}>
      <PageHeader titulo="Cambiar contraseña" descripcion="Por seguridad se pide la contraseña actual. Las sesiones abiertas en otros equipos siguen activas hasta que venzan." />
      <Card>
        <form className={estilos.formulario} onSubmit={alEnviar} noValidate>
          {resultado ? <Banner tono={resultado.tono}>{resultado.texto}</Banner> : null}
          <TextField etiqueta="Contraseña actual" type="password" autoComplete="current-password" value={campos.actual} onChange={cambiar('actual')} error={errores.actual} />
          <TextField
            etiqueta="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={campos.nueva}
            onChange={cambiar('nueva')}
            error={errores.nueva}
            aria-describedby="reglas-password"
          />
          <ReglasPassword password={campos.nueva} id="reglas-password" />
          <TextField
            etiqueta="Confirmar nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={campos.confirmacion}
            onChange={cambiar('confirmacion')}
            error={errores.confirmacion}
          />
          <div className={estilos.acciones}>
            <Button type="submit" cargando={enviando}>
              Cambiar contraseña
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
