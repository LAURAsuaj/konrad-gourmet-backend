import { Button } from './Button.jsx';
import estilos from './Pagination.module.css';

/** Paginación con `limite` y `offset`, como las listas de la API. */
export function Pagination({ total, limite, offset, alCambiar }) {
  if (!total || total <= limite) return null;
  const pagina = Math.floor(offset / limite) + 1;
  const paginas = Math.ceil(total / limite);
  const desde = offset + 1;
  const hasta = Math.min(offset + limite, total);
  return (
    <nav className={estilos.paginacion} aria-label="Paginación">
      <span className="kg-cifras">
        {desde}–{hasta} de {total}
      </span>
      <div className={estilos.controles}>
        <Button variante="secundario" tamano="pequeno" icono="izquierda" etiquetaAccesible="Página anterior" disabled={pagina <= 1} onClick={() => alCambiar(offset - limite)} />
        <span className="kg-cifras" aria-live="polite">
          Página {pagina} de {paginas}
        </span>
        <Button variante="secundario" tamano="pequeno" icono="derecha" etiquetaAccesible="Página siguiente" disabled={pagina >= paginas} onClick={() => alCambiar(offset + limite)} />
      </div>
    </nav>
  );
}
