import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ErrorApi, mensajeDeError } from '../../api/cliente.js';
import { useTema } from '../../theme/TemaProvider.jsx';
import { Marca } from '../../shared/layout/Marca.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { TextField } from '../../shared/ui/Field.jsx';
import { useSesion } from './AuthProvider.jsx';
import estilos from './LoginPage.module.css';

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mensajeDeLogin(error) {
  if (!(error instanceof ErrorApi)) return mensajeDeError(error);
  switch (error.codigo) {
    case 'CREDENCIALES_INVALIDAS':
      return 'Correo o contraseña incorrectos. Revise los datos e intente de nuevo.';
    case 'CUENTA_BLOQUEADA':
      return 'Su cuenta está bloqueada por intentos fallidos. Pida al Administrador que la desbloquee.';
    case 'DEMASIADOS_INTENTOS': {
      const minutos = error.reintentarEnSegundos ? Math.ceil(error.reintentarEnSegundos / 60) : 15;
      return `Hubo demasiados intentos desde este equipo. Intente de nuevo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`;
    }
    default:
      return error.message;
  }
}

/** Inicio de sesión (CU-01), pintado con la imagen corporativa vigente. */
export function LoginPage() {
  const { sesion, iniciarSesion, aviso, limpiarAviso } = useSesion();
  const { apariencia } = useTema();
  const navigate = useNavigate();
  const location = useLocation();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const refCorreo = useRef(null);

  useEffect(() => {
    refCorreo.current?.focus();
  }, []);

  if (sesion) return <Navigate to={location.state?.desde ?? '/'} replace />;

  async function alEnviar(evento) {
    evento.preventDefault();
    const nuevos = {};
    if (!correo.trim()) nuevos.correo = 'Escriba su correo.';
    else if (!REGEX_CORREO.test(correo.trim())) nuevos.correo = 'Escriba un correo válido, por ejemplo nombre@empresa.com.';
    if (!password) nuevos.password = 'Escriba su contraseña.';
    setErrores(nuevos);
    setErrorGeneral(null);
    if (Object.keys(nuevos).length) return;

    setEnviando(true);
    try {
      await iniciarSesion(correo.trim(), password);
      navigate(location.state?.desde ?? '/', { replace: true });
    } catch (error) {
      setErrorGeneral(mensajeDeLogin(error));
      setPassword('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={estilos.pagina}>
      <aside className={estilos.panel}>
        <Marca tamano={44} mostrarNombre={false} className={estilos.marcaPanel} />
        <div className={estilos.mensaje}>
          <p className={estilos.nombre}>{apariencia.nombreComercial}</p>
          {apariencia.eslogan ? <p className={estilos.eslogan}>{apariencia.eslogan}</p> : null}
        </div>
        {apariencia.textoBienvenida ? <p className={estilos.bienvenida}>{apariencia.textoBienvenida}</p> : <span />}
      </aside>

      <main className={estilos.zonaFormulario}>
        <form className={estilos.formulario} onSubmit={alEnviar} noValidate>
          <div>
            <h1 className={estilos.titulo}>Iniciar sesión</h1>
            <p className={estilos.subtitulo}>Entre con el correo y la contraseña que le asignó el Administrador.</p>
          </div>

          {aviso ? (
            <Banner tono="info">
              {aviso}
            </Banner>
          ) : null}
          {errorGeneral ? <Banner tono="error">{errorGeneral}</Banner> : null}

          <TextField
            ref={refCorreo}
            etiqueta="Correo"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={correo}
            error={errores.correo}
            onChange={(e) => {
              setCorreo(e.target.value);
              if (aviso) limpiarAviso();
            }}
          />
          <TextField
            etiqueta="Contraseña"
            type={verPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            error={errores.password}
            onChange={(e) => setPassword(e.target.value)}
            accion={
              <Button
                variante="fantasma"
                tamano="pequeno"
                icono={verPassword ? 'ojoTachado' : 'ojo'}
                etiquetaAccesible={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={verPassword}
                onClick={() => setVerPassword((v) => !v)}
              />
            }
          />

          <Button type="submit" bloque cargando={enviando}>
            Iniciar sesión
          </Button>

          {apariencia.textoPiePagina ? <p className={estilos.pie}>{apariencia.textoPiePagina}</p> : null}
        </form>
      </main>
    </div>
  );
}
