# Konrad Gourmet

Proyecto completo en dos carpetas:

| Carpeta | Contenido | Guía |
|---|---|---|
| `konrad-gourmet-backend/` | API REST (Node.js + PostgreSQL en Supabase), procesos automáticos (cron), Docker | `konrad-gourmet-backend/README.md` |
| `konrad-gourmet-frontend/` | Interfaz web React para los 6 roles | `konrad-gourmet-frontend/README.md` |

Orden para arrancar en local:

1. Backend: `npm install`, configurar `.env`, aplicar `schema.sql`, crear el primer Administrador y `npm start` (puerto 3000).
2. Frontend: `npm install`, copiar `.env.example` a `.env` y `npm run dev` (puerto 5173).
3. Entrar en `http://localhost:5173` con la cuenta de Administrador y crear puntos, mesas, productos, proveedores y usuarios desde la aplicación.
