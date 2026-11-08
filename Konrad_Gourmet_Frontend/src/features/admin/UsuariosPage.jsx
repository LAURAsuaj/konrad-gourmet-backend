import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crearUsuario, desbloquearUsuario, listarUsuarios, restablecerPassword } from '../../api/admin.js';
import { mensajeDeError } from '../../api/cliente.js';
import { useSesion } from '../auth/AuthProvider.jsx';
import { ETIQUETAS_ROL, ROLES, ROLES_CON_PUNTO } from '../auth/roles.js';
import { ReglasPassword } from '../auth/ReglasPassword.jsx';
import { passwordValida } from '../auth/validarPassword.js';
import { useCatalogo } from '../../shared/lib/useCatalogo.js';
import { formatearFecha } from '../../shared/lib/formato.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { KpiCard, KpiGrid } from '../../shared/ui/KpiCard.jsx';
import { SelectField, TextField } from '../../shared/ui/Field.jsx';
import { DataTable } from '../../shared/ui/DataTable.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Modal } from '../../shared/ui/Modal.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import estilos from './admin.module.css';

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VACIO = { nombre: '', correo: '', rol: '', puntoId: '', password: '' };

function NuevoUsuarioModal({ abierto, puntos, alCerrar, alCrear }) {
  const queryClient = useQueryClient();
  const [campos, setCampos] = useState(VACIO);
  const [errores, setErrores] = useState({});
  useEffect(() => {
    if (abierto) {
      setCampos(VACIO);
      setErrores({});
    }
  }, [abierto]);

  const conPunto = ROLES_CON_PUNTO.includes(campos.rol);
  const crear = useMutation({
    mutationFn: () =>
      crearUsuario({
        nombre: campos.nombre.trim(),
        correo: campos.correo.trim(),
        rol: campos.rol,
        password: campos.password,
        ...(conPunto ? { puntoId: campos.puntoId } : {}),
      }),
    onSuccess: (u) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      alCrear(`Se creó la cuenta de ${u.nombre} (${ETIQUETAS_ROL[u.rol]}). Entréguele su correo y la contraseña inicial.`);
      alCerrar();
    },
  });
  const cambiar = (campo) => (e) => setCampos((c) => ({ ...c, [campo]: e.target.value }));

  function alEnviar(e) {
    e.preventDefault();
    const n = {};
    if (!campos.nombre.trim()) n.nombre = 'Escriba el nombre.';
    if (!REGEX_CORREO.test(campos.correo.trim())) n.correo = 'Escriba un correo válido.';
    if (!campos.rol) n.rol = 'Elija el rol.';
    if (conPunto && !campos.puntoId) n.puntoId = 'Este rol trabaja en un punto: elíjalo.';
    if (!passwordValida(campos.password)) n.password = 'La contraseña no cumple todos los requisitos.';
    setErrores(n);
    if (!Object.keys(n).length) crear.mutate();
  }

  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo="Nuevo usuario">
      <form className={estilos.formulario} onSubmit={alEnviar} noValidate>
        {crear.isError ? <Banner tono="error">{mensajeDeError(crear.error)}</Banner> : null}
        <TextField etiqueta="Nombre completo" value={campos.nombre} maxLength={120} error={errores.nombre} onChange={cambiar('nombre')} />
        <TextField etiqueta="Correo" type="email" autoComplete="off" value={campos.correo} error={errores.correo} onChange={cambiar('correo')} />
        <SelectField etiqueta="Rol" value={campos.rol} error={errores.rol} onChange={cambiar('rol')}>
          <option value="">Elija el rol</option>
          {Object.values(ROLES).map((r) => (
            <option key={r} value={r}>
              {ETIQUETAS_ROL[r]}
            </option>
          ))}
        </SelectField>
        {conPunto ? (
          <SelectField etiqueta="Punto" value={campos.puntoId} error={errores.puntoId} onChange={cambiar('puntoId')}>
            <option value="">Elija el punto</option>
            {puntos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </SelectField>
        ) : null}
        <TextField
          etiqueta="Contraseña inicial"
          type="text"
          autoComplete="new-password"
          value={campos.password}
          error={errores.password}
          aria-describedby="reglas-nuevo-usuario"
          onChange={cambiar('password')}
        />
        <ReglasPassword password={campos.password} id="reglas-nuevo-usuario" />
        <div className={estilos.acciones}>
          <Button variante="secundario" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button type="submit" cargando={crear.isPending}>
            Crear usuario
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RestablecerModal({ usuario, alCerrar, alListo }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => {
    setPassword('');
    setError(null);
  }, [usuario]);
  const restablecer = useMutation({
    mutationFn: () => restablecerPassword(usuario.id, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      alListo(`Contraseña de ${usuario.nombre} restablecida y cuenta habilitada. Pídale que la cambie al entrar.`);
      alCerrar();
    },
  });
  return (
    <Modal abierto={Boolean(usuario)} alCerrar={alCerrar} titulo={`Restablecer contraseña de ${usuario?.nombre ?? ''}`}>
      <form
        className={estilos.formulario}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!passwordValida(password)) setError('La contraseña no cumple todos los requisitos.');
          else restablecer.mutate();
        }}
      >
        {restablecer.isError ? <Banner tono="error">{mensajeDeError(restablecer.error)}</Banner> : null}
        <p className={estilos.secundario}>También desbloquea la cuenta. Las sesiones abiertas siguen activas hasta que venzan.</p>
        <TextField etiqueta="Contraseña nueva" type="text" autoComplete="new-password" value={password} error={error} aria-describedby="reglas-restablecer" onChange={(e) => setPassword(e.target.value)} />
        <ReglasPassword password={password} id="reglas-restablecer" />
        <div className={estilos.acciones}>
          <Button variante="secundario" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button type="submit" cargando={restablecer.isPending}>
            Restablecer contraseña
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Cuentas de usuario y roles (CU-01): alta, desbloqueo y restablecimiento de contraseña. */
export function UsuariosPage() {
  const queryClient = useQueryClient();
  const { usuario: yo } = useSesion();
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: listarUsuarios });
  const puntos = useCatalogo('puntos');
  const [rol, setRol] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [restablecer, setRestablecer] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const lista = usuarios.data ?? [];
  const texto = busqueda.trim().toLocaleLowerCase('es');
  const visibles = useMemo(
    () => lista.filter((u) => (!rol || u.rol === rol) && (!texto || `${u.nombre} ${u.correo}`.toLocaleLowerCase('es').includes(texto))),
    [lista, rol, texto]
  );

  const desbloquear = useMutation({
    mutationFn: (u) => desbloquearUsuario(u.id),
    onSuccess: (u) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setMensaje({ tono: 'exito', texto: `La cuenta de ${u.nombre} quedó habilitada.` });
    },
    onError: (e) => setMensaje({ tono: 'error', texto: mensajeDeError(e) }),
  });

  const columnas = [
    {
      clave: 'nombre',
      titulo: 'Usuario',
      render: (u) => (
        <>
          <div className={estilos.nombre}>
            {u.nombre}
            {u.id === yo?.id ? ' (usted)' : ''}
          </div>
          <div className={estilos.secundario}>{u.correo}</div>
        </>
      ),
    },
    { clave: 'rol', titulo: 'Rol', render: (u) => ETIQUETAS_ROL[u.rol] ?? u.rol },
    { clave: 'punto', titulo: 'Punto', render: (u) => (u.puntoId ? puntos.porId.get(u.puntoId)?.nombre ?? '—' : '—') },
    {
      clave: 'estado',
      titulo: 'Estado',
      render: (u) =>
        !u.activo ? <StatusPill tono="contorno">Inactiva</StatusPill> : u.bloqueado ? <StatusPill tono="error">Bloqueada</StatusPill> : <StatusPill tono="neutro">Activa</StatusPill>,
    },
    { clave: 'creadoEn', titulo: 'Creada', cifras: true, render: (u) => formatearFecha(u.creadoEn) },
    {
      clave: 'acciones',
      titulo: <span className="kg-solo-lectores">Acciones</span>,
      alinear: 'derecha',
      render: (u) => (
        <span className={estilos.accionesFila}>
          {u.bloqueado ? (
            <Button tamano="pequeno" cargando={desbloquear.isPending && desbloquear.variables?.id === u.id} onClick={() => desbloquear.mutate(u)}>
              Desbloquear
            </Button>
          ) : null}
          {u.id !== yo?.id ? (
            <Button variante="secundario" tamano="pequeno" onClick={() => setRestablecer(u)}>
              Restablecer contraseña
            </Button>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader titulo="Usuarios" descripcion="Cuentas del sistema y su rol. Las cuentas se bloquean solas tras varios intentos fallidos." acciones={<Button onClick={() => setNuevo(true)}>Nuevo usuario</Button>} />
      <KpiGrid etiquetaAccesible="Resumen de cuentas">
        <KpiCard etiqueta="Cuentas" valor={lista.length} />
        <KpiCard etiqueta="Bloqueadas" valor={lista.filter((u) => u.bloqueado).length} destacado={lista.some((u) => u.bloqueado)} detalle="Requieren desbloqueo" />
        <KpiCard etiqueta="Roles en uso" valor={new Set(lista.map((u) => u.rol)).size} detalle="de 6" />
      </KpiGrid>
      {mensaje ? (
        <div className={estilos.mensaje}>
          <Banner tono={mensaje.tono}>{mensaje.texto}</Banner>
        </div>
      ) : null}
      <Card sinRelleno>
        <div className={estilos.filtros}>
          <div className={estilos.grupoFiltros}>
            <div className={estilos.campo}>
              <SelectField etiqueta="Rol" value={rol} onChange={(e) => setRol(e.target.value)}>
                <option value="">Todos los roles</option>
                {Object.values(ROLES).map((r) => (
                  <option key={r} value={r}>
                    {ETIQUETAS_ROL[r]}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className={estilos.campo}>
              <TextField etiqueta="Buscar" type="search" placeholder="Nombre o correo" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
          </div>
        </div>
        {usuarios.isError ? (
          <div className={estilos.aviso}>
            <Banner tono="error">{mensajeDeError(usuarios.error)}</Banner>
          </div>
        ) : null}
        <DataTable titulo="Usuarios" columnas={columnas} filas={visibles} cargando={usuarios.isPending} vacio={<EmptyState titulo="Ninguna cuenta coincide con el filtro" />} />
      </Card>
      <NuevoUsuarioModal abierto={nuevo} puntos={puntos.lista} alCerrar={() => setNuevo(false)} alCrear={(texto) => setMensaje({ tono: 'exito', texto })} />
      <RestablecerModal usuario={restablecer} alCerrar={() => setRestablecer(null)} alListo={(texto) => setMensaje({ tono: 'exito', texto })} />
    </>
  );
}
