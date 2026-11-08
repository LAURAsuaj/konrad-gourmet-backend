import { Link } from 'react-router-dom';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { formatearHora } from '../../shared/lib/formato.js';
import { SiluetaMesa } from './SiluetaMesa.jsx';
import { describirPlatos } from './resumenMesas.js';
import estilos from './TarjetaMesa.module.css';

/**
 * Tarjeta modular de una mesa del plano.
 * Estados: Libre (blanca), Con pedidos hoy (gris), Seleccionada (turquesa) y
 * Nueva orden (comanda sin enviar, distintivo turquesa con el número de platos).
 */
export function TarjetaMesa({ mesa, unidadesEnComanda = 0, seleccionada = false, compacta = false }) {
  const conPedidos = mesa.pedidosHoy > 0;
  const resaltada = seleccionada || unidadesEnComanda > 0;
  const estado = conPedidos ? `${mesa.pedidosHoy} ${mesa.pedidosHoy === 1 ? 'pedido' : 'pedidos'} hoy` : 'Libre hoy';
  const etiquetaAccesible = [
    `Mesa ${mesa.numero}`,
    estado,
    unidadesEnComanda ? `nueva orden con ${unidadesEnComanda} ${unidadesEnComanda === 1 ? 'plato' : 'platos'} sin enviar` : null,
    seleccionada ? 'seleccionada' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const clases = [estilos.tarjeta, conPedidos ? estilos.conPedidos : '', resaltada ? estilos.seleccionada : '', compacta ? estilos.compacta : ''].join(' ');
  const nueva = unidadesEnComanda ? <span className={`${estilos.nueva} kg-cifras`}>Nueva orden · {unidadesEnComanda}</span> : null;

  if (compacta) {
    return (
      <Link to={`/mesero/mesas/${mesa.id}`} className={clases} aria-label={etiquetaAccesible} aria-current={seleccionada ? 'page' : undefined}>
        <span className={estilos.plano}>
          <SiluetaMesa className={estilos.silueta} />
        </span>
        <span className={estilos.textoCompacto}>
          <span className={estilos.numero}>Mesa {mesa.numero}</span>
          <span>{estado}</span>
        </span>
        {nueva}
      </Link>
    );
  }

  return (
    <Link to={`/mesero/mesas/${mesa.id}`} className={clases} aria-label={etiquetaAccesible}>
      {nueva}
      <div className={estilos.cabecera}>
        <span className={`${estilos.numero} kg-cifras`}>Mesa {mesa.numero}</span>
        <StatusPill tono={resaltada ? 'marca' : conPedidos ? 'contorno' : 'neutro'}>{conPedidos ? 'Con pedidos' : 'Libre'}</StatusPill>
      </div>
      <div className={estilos.plano}>
        <SiluetaMesa className={estilos.silueta} />
      </div>
      <div className={estilos.detalle}>
        {conPedidos ? (
          <>
            <span className="kg-cifras">
              {estado} · último {formatearHora(mesa.ultimoPedido)}
            </span>
            <span className={estilos.platos}>{describirPlatos(mesa.ultimosPlatos, 2)}</span>
          </>
        ) : (
          <span>Sin pedidos registrados hoy</span>
        )}
      </div>
    </Link>
  );
}
