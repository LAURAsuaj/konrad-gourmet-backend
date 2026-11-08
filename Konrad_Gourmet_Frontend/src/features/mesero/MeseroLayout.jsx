import { Outlet } from 'react-router-dom';
import { ComandaProvider } from './ComandaProvider.jsx';

/** Envuelve las pantallas del mesero para que las comandas abiertas se compartan entre ellas. */
export function MeseroLayout() {
  return (
    <ComandaProvider>
      <Outlet />
    </ComandaProvider>
  );
}
