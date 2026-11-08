import { Link } from 'react-router-dom';
import { AlertCard } from '../../shared/ui/AlertCard.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { formatearRelativo } from '../../shared/lib/formato.js';
import { useAlertas } from './AlertasProvider.jsx';
import estilos from './AlertStack.module.css';

const VISIBLES = 3;

/** Alertas flotantes en la esquina superior derecha: máximo 3 a la vez. */
export function AlertStack() {
  const { alertas, descartar, descartarTodas } = useAlertas();
  if (!alertas.length) return null;
  const visibles = alertas.slice(0, VISIBLES);
  const restantes = alertas.length - visibles.length;

  return (
    <section className={estilos.pila} aria-label="Alertas">
      <ul className={estilos.lista} aria-live="polite" aria-relevant="additions">
        {visibles.map((a) => (
          <li key={a.id}>
            <AlertCard
              categoria={a.categoria}
              titulo={a.titulo}
              detalle={a.detalle}
              icono={a.icono}
              momento={formatearRelativo(a.fecha)}
              destino={a.destino}
              textoDestino={a.textoDestino}
              alDescartar={() => descartar(a.id)}
            />
          </li>
        ))}
      </ul>
      {alertas.length > 1 ? (
        <div className={estilos.resumen}>
          {restantes > 0 ? <Link to="/notificaciones">Ver {restantes} más</Link> : <span />}
          <Button variante="fantasma" tamano="pequeno" onClick={descartarTodas}>
            Descartar todas
          </Button>
        </div>
      ) : null}
    </section>
  );
}
