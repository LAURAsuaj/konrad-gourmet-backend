import { useEffect, useId, useRef } from 'react';
import { Button } from './Button.jsx';
import estilos from './Modal.module.css';

/**
 * Diálogo modal sobre <dialog> nativo: atrapa el foco, se cierra con Escape y
 * devuelve el foco al elemento que lo abrió.
 */
export function Modal({ abierto, alCerrar, titulo, pie, children }) {
  const ref = useRef(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      className={estilos.dialogo}
      aria-labelledby={idTitulo}
      onClose={alCerrar}
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
    >
      {abierto ? (
        <>
          <div className={estilos.cabecera}>
            <h2 id={idTitulo} className={estilos.titulo}>
              {titulo}
            </h2>
            <Button variante="fantasma" icono="cerrar" etiquetaAccesible="Cerrar" onClick={alCerrar} />
          </div>
          <div className={estilos.cuerpo}>{children}</div>
          {pie ? <div className={estilos.pie}>{pie}</div> : null}
        </>
      ) : null}
    </dialog>
  );
}
