import { Button } from '../../shared/ui/Button.jsx';
import { QuantityStepper } from '../../shared/ui/QuantityStepper.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import { formatearHora, formatearMoneda } from '../../shared/lib/formato.js';
import { MAXIMO_POR_PLATO } from './comanda.js';
import { describirPlatos } from './resumenMesas.js';
import estilos from './Comanda.module.css';

/**
 * Comanda lateral de la mesa: platos con − / +, total estimado y envío a cocina.
 * El total es una estimación con los precios actuales del menú (los pedidos no guardan precio).
 */
export function Comanda({ mesa, detalle, enviando, resultado, alFijar, alQuitar, alVaciar, alEnviar, alCerrar, id }) {
  const vacia = detalle.lineas.length === 0;
  return (
    <section id={id} className={estilos.comanda} aria-label={`Comanda de la mesa ${mesa.numero}`}>
      <header className={estilos.cabecera}>
        <div>
          <h2 className={estilos.titulo}>Comanda · Mesa {mesa.numero}</h2>
          <p className={`${estilos.subtitulo} kg-cifras`}>
            {vacia ? 'Sin platos' : `${detalle.unidades} ${detalle.unidades === 1 ? 'plato' : 'platos'}`}
          </p>
        </div>
        {alCerrar ? <Button variante="fantasma" icono="cerrar" etiquetaAccesible="Cerrar comanda" onClick={alCerrar} /> : null}
      </header>

      <div className={estilos.cuerpo}>
        {resultado ? <Banner tono={resultado.tono}>{resultado.texto}</Banner> : null}

        {vacia ? (
          <EmptyState titulo="La comanda está vacía" descripcion="Agregue platos desde el menú; se guardan aquí hasta que los envíe a cocina." />
        ) : (
          <ul className={estilos.lineas}>
            {detalle.lineas.map((linea) => (
              <li key={linea.platoId} className={`${estilos.linea} ${linea.disponible ? '' : estilos.noDisponible}`}>
                <div>
                  <p className={estilos.nombre}>{linea.nombre}</p>
                  <p className={`${estilos.unitario} kg-cifras`}>{linea.disponible ? `${formatearMoneda(linea.precio)} c/u` : ''}</p>
                </div>
                <p className={`${estilos.subtotal} kg-cifras`}>{linea.disponible ? formatearMoneda(linea.subtotal) : ''}</p>
                <div className={estilos.controles}>
                  {linea.disponible ? (
                    <QuantityStepper valor={linea.cantidad} min={1} max={MAXIMO_POR_PLATO} etiqueta={linea.nombre} compacto alCambiar={(n) => alFijar(linea.platoId, n)} />
                  ) : (
                    <StatusPill tono="error">Ya no está en el menú</StatusPill>
                  )}
                  <Button variante="fantasma" tamano="pequeno" onClick={() => alQuitar(linea.platoId)}>
                    Quitar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {mesa.pedidos.length ? (
          <div className={estilos.historial}>
            <h3 className={estilos.historialTitulo}>Enviado hoy a cocina</h3>
            <ul className={estilos.historialLista}>
              {mesa.pedidos.map((p) => (
                <li key={p.id}>
                  <span className={`${estilos.historialHora} kg-cifras`}>{formatearHora(p.fecha)}</span>
                  {describirPlatos(p.items, 4)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <footer className={estilos.pie}>
        <div className={estilos.total}>
          <span>Total estimado</span>
          <span className={`${estilos.totalValor} kg-cifras`}>{formatearMoneda(detalle.totalEstimado)}</span>
        </div>
        <p className={estilos.nota}>Con los precios actuales del menú.</p>
        {detalle.noDisponibles ? <Banner tono="error">Quite los platos que ya no están en el menú para poder enviar.</Banner> : null}
        <Button bloque cargando={enviando} disabled={vacia || detalle.noDisponibles > 0} onClick={alEnviar}>
          Enviar a cocina
        </Button>
        {!vacia ? (
          <Button variante="fantasma" bloque onClick={alVaciar}>
            Vaciar comanda
          </Button>
        ) : null}
      </footer>
    </section>
  );
}
