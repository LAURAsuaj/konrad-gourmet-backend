import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { definirRegla } from '../../api/admin.js';
import { mensajeDeError } from '../../api/cliente.js';
import { useTema } from '../../theme/TemaProvider.jsx';
import { APARIENCIA_POR_DEFECTO } from '../../theme/apariencia.js';
import { contraste, esHexValido } from '../../theme/color.js';
import { derivarTema } from '../../theme/derivarTema.js';
import { TIPOGRAFIAS } from '../../theme/fuentes.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { SelectField, TextField } from '../../shared/ui/Field.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { CONTRASTE_MINIMO, TIPOS_LOGO, leerLogo, normalizarApariencia, validarApariencia } from './imagenCorporativa.js';
import { VistaPreviaTema } from './VistaPreviaTema.jsx';
import estilos from './admin.module.css';

const ETIQUETAS_TIPOGRAFIA = { sistema: 'Institucional (Plus Jakarta Sans)', serif: 'Serif', redondeada: 'Redondeada', monoespaciada: 'Monoespaciada' };
const COLORES = [
  ['colorPrimario', 'Color primario', 'Acciones, selección y alertas'],
  ['colorSecundario', 'Color secundario', 'Panel de inicio de sesión'],
  ['colorFondo', 'Color de fondo', 'Fondo de las pantallas'],
  ['colorTexto', 'Color del texto', 'Textos y bordes'],
];

function CampoColor({ campo, etiqueta, ayuda, valor, error, alCambiar }) {
  return (
    <div className={estilos.color}>
      <input
        type="color"
        className={estilos.selectorColor}
        aria-label={`${etiqueta}: selector`}
        value={esHexValido(valor) ? valor.toLowerCase() : '#000000'}
        onChange={(e) => alCambiar(campo, e.target.value.toUpperCase())}
      />
      <TextField etiqueta={etiqueta} value={valor} maxLength={7} error={error} ayuda={ayuda} onChange={(e) => alCambiar(campo, e.target.value.trim())} />
    </div>
  );
}

/**
 * Imagen corporativa parametrizable (requisito del enunciado): el Administrador cambia
 * nombre, colores, tipografía, logo y textos sin código ni diseñador. Se ve en vivo en
 * la vista previa y se aplica a todo el sistema al guardar.
 */
export function ImagenCorporativaPage() {
  const queryClient = useQueryClient();
  const { apariencia: vigente } = useTema();
  const [campos, setCampos] = useState(vigente);
  const [errores, setErrores] = useState({});
  const [errorLogo, setErrorLogo] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const tocado = useRef(false);
  const refArchivo = useRef(null);

  useEffect(() => {
    if (!tocado.current) setCampos(vigente);
  }, [vigente]);

  const cambiar = (campo, valor) => {
    tocado.current = true;
    setCampos((c) => ({ ...c, [campo]: valor }));
    setMensaje(null);
  };

  const guardar = useMutation({
    mutationFn: () => definirRegla('imagen_corporativa', normalizarApariencia(campos)),
    onSuccess: (r) => {
      queryClient.setQueryData(['apariencia'], { ...APARIENCIA_POR_DEFECTO, ...r.valor });
      queryClient.invalidateQueries({ queryKey: ['apariencia'] });
      queryClient.invalidateQueries({ queryKey: ['reglas'] });
      tocado.current = false;
      setMensaje({ tono: 'exito', texto: 'Imagen corporativa aplicada. Las demás sesiones la verán en menos de un minuto.' });
    },
    onError: (e) => setMensaje({ tono: 'error', texto: mensajeDeError(e) }),
  });

  const variables = useMemo(() => (esHexValido(campos.colorTexto) && esHexValido(campos.colorFondo) ? derivarTema(campos) : null), [campos]);
  const pruebas = variables
    ? [
        ['Texto sobre fondo', contraste(campos.colorTexto, campos.colorFondo)],
        ['Texto sobre botones', contraste(variables['--kg-sobre-primario'], variables['--kg-primario'])],
        ['Enlaces sobre tarjetas', contraste(variables['--kg-primario-fuerte'], variables['--kg-superficie'])],
        ['Texto del panel secundario', contraste(variables['--kg-sobre-secundario'], variables['--kg-secundario'])],
      ]
    : [];

  async function alElegirLogo(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setErrorLogo(null);
    try {
      cambiar('logo', await leerLogo(archivo));
    } catch (error) {
      setErrorLogo(error.message);
    }
  }

  function alEnviar(e) {
    e.preventDefault();
    const r = validarApariencia(campos);
    setErrores(r.errores);
    if (r.valido) guardar.mutate();
    else setMensaje({ tono: 'error', texto: 'Revise los campos marcados antes de guardar.' });
  }

  return (
    <>
      <PageHeader
        titulo="Imagen corporativa"
        descripcion="Nombre, colores, tipografía, logo y textos de toda la aplicación, incluida la pantalla de inicio de sesión."
      />
      {mensaje ? (
        <div className={estilos.mensaje}>
          <Banner tono={mensaje.tono}>{mensaje.texto}</Banner>
        </div>
      ) : null}
      <div className={estilos.imagen}>
        <Card>
          <form className={estilos.formulario} onSubmit={alEnviar} noValidate>
            <TextField etiqueta="Nombre comercial" value={campos.nombreComercial} maxLength={60} error={errores.nombreComercial} onChange={(e) => cambiar('nombreComercial', e.target.value)} />
            <TextField etiqueta="Eslogan (opcional)" value={campos.eslogan} maxLength={120} error={errores.eslogan} onChange={(e) => cambiar('eslogan', e.target.value)} />

            <div className={estilos.colores}>
              {COLORES.map(([campo, etiqueta, ayuda]) => (
                <CampoColor key={campo} campo={campo} etiqueta={etiqueta} ayuda={ayuda} valor={campos[campo]} error={errores[campo]} alCambiar={cambiar} />
              ))}
            </div>

            <SelectField
              etiqueta="Tipografía"
              value={campos.tipografia}
              error={errores.tipografia}
              onChange={(e) => cambiar('tipografia', e.target.value)}
              opciones={TIPOGRAFIAS.map((t) => ({ valor: t, etiqueta: ETIQUETAS_TIPOGRAFIA[t] ?? t }))}
            />

            <div className={estilos.formulario}>
              <div className={estilos.logo}>
                {campos.logo ? <img className={estilos.logoMuestra} src={campos.logo} alt="Logo actual" /> : <span className={estilos.secundario}>Sin logo: se muestra la inicial del nombre.</span>}
                <input ref={refArchivo} type="file" accept={TIPOS_LOGO.join(',')} hidden onChange={alElegirLogo} />
                <Button variante="secundario" tamano="pequeno" onClick={() => refArchivo.current?.click()}>
                  Subir imagen
                </Button>
                {campos.logo ? (
                  <Button variante="fantasma" tamano="pequeno" onClick={() => cambiar('logo', null)}>
                    Quitar logo
                  </Button>
                ) : null}
              </div>
              <TextField
                etiqueta="O pegue la URL del logo (https)"
                value={campos.logo && !campos.logo.startsWith('data:') ? campos.logo : ''}
                placeholder="https://"
                error={errorLogo ?? errores.logo}
                ayuda="png, jpeg, webp o gif de máximo unos 60 KB. No se admite svg por seguridad."
                onChange={(e) => cambiar('logo', e.target.value || null)}
              />
            </div>

            <TextField etiqueta="Texto de bienvenida (opcional)" value={campos.textoBienvenida} maxLength={200} error={errores.textoBienvenida} onChange={(e) => cambiar('textoBienvenida', e.target.value)} />
            <TextField etiqueta="Texto del pie de página (opcional)" value={campos.textoPiePagina} maxLength={200} error={errores.textoPiePagina} onChange={(e) => cambiar('textoPiePagina', e.target.value)} />

            <div className={estilos.acciones}>
              <Button
                variante="fantasma"
                onClick={() => {
                  setCampos(APARIENCIA_POR_DEFECTO);
                  tocado.current = true;
                  setErrores({});
                }}
              >
                Volver a los valores iniciales
              </Button>
              <Button type="submit" cargando={guardar.isPending}>
                Aplicar a todo el sistema
              </Button>
            </div>
          </form>
        </Card>

        <div className={estilos.vistaPrevia}>
          <VistaPreviaTema apariencia={{ ...APARIENCIA_POR_DEFECTO, ...campos, ...(variables ? {} : { colorTexto: vigente.colorTexto, colorFondo: vigente.colorFondo }) }} />
          <Card titulo="Accesibilidad (WCAG 2.1 AA)">
            <ul className={estilos.contrastes}>
              {pruebas.map(([nombre, valor]) => (
                <li key={nombre}>
                  <span>{nombre}</span>
                  <StatusPill tono={valor >= CONTRASTE_MINIMO ? 'neutro' : 'error'}>
                    {valor.toFixed(1)}:1 {valor >= CONTRASTE_MINIMO ? 'cumple' : 'no cumple'}
                  </StatusPill>
                </li>
              ))}
            </ul>
            <p className={estilos.secundario}>
              El texto sobre el fondo lo exige el sistema. Botones, enlaces y panel se ajustan solos para cumplir.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
