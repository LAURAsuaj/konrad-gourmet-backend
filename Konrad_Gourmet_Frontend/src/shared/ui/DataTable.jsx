import { EmptyState } from './EmptyState.jsx';
import { Spinner } from './Spinner.jsx';
import estilos from './DataTable.module.css';

/**
 * Tabla de datos con encabezado fijo y desplazamiento horizontal en pantallas pequeñas.
 * `columnas`: [{ clave, titulo, render?(fila), alinear?: 'derecha'|'centro', cifras?: boolean }]
 */
export function DataTable({ columnas, filas, claveFila = (fila) => fila.id, cargando = false, vacio, titulo }) {
  if (cargando) {
    return (
      <div className={estilos.estado}>
        <Spinner etiqueta="Cargando datos" />
      </div>
    );
  }
  if (!filas?.length) {
    return <div className={estilos.estado}>{vacio ?? <EmptyState titulo="No hay registros para mostrar" />}</div>;
  }
  return (
    <div className={estilos.contenedor} tabIndex={0} role="region" aria-label={titulo ?? 'Tabla de datos'}>
      <table className={estilos.tabla}>
        {titulo ? <caption className="kg-solo-lectores">{titulo}</caption> : null}
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.clave} scope="col" className={c.alinear ? estilos[c.alinear] : undefined}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={claveFila(fila)}>
              {columnas.map((c) => (
                <td key={c.clave} className={[c.alinear ? estilos[c.alinear] : '', c.cifras ? 'kg-cifras' : ''].join(' ')}>
                  {c.render ? c.render(fila) : fila[c.clave]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
