import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { ErrorApi } from '../api/cliente.js';
import { TemaProvider } from '../theme/TemaProvider.jsx';
import { AuthProvider } from '../features/auth/AuthProvider.jsx';
import { router } from './router.jsx';

// Reintenta solo errores de red o del servidor; un 4xx (validación, permisos) no cambia al reintentar.
const reintentar = (intentos, error) => {
  if (error instanceof ErrorApi && error.estado >= 400 && error.estado < 500) return false;
  return intentos < 2;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: reintentar, refetchOnWindowFocus: false, staleTime: 15_000 },
    mutations: { retry: false },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TemaProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </TemaProvider>
    </QueryClientProvider>
  );
}
