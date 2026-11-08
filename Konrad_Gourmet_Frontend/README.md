# Konrad Gourmet — Frontend

Interfaz web responsive del sistema **Konrad Gourmet** para los 6 roles: Administrador, Jefe de Cocina, Mesero, Auxiliar de Compras, Director de Compras y Director Comercial. Consume la API del repositorio `konrad-gourmet-backend`.

## Qué hace cada rol

| Rol | Pantallas |
|---|---|
| **Mesero** | Plano de mesas modular y toma de orden: riel de mesas, menú rápido con botones − / + y comanda lateral que se envía a cocina. Pedidos del día |
| **Jefe de Cocina** | Panel del día (pedidos, platos más pedidos, alarmas, stock más bajo), menú con ingredientes, inventario con ajustes, solicitud de alimentos precargada con lo que falta, pedidos y promociones |
| **Auxiliar de Compras** | Solicitudes de todos los puntos y solicitud de cotizaciones a proveedores (el sistema envía el PDF por correo) |
| **Director de Compras** | Registro de valores cotizados con comparación frente al precio del Ministerio, resultado de la validación automática, comparación de opcionadas y orden de compra imprimible |
| **Director Comercial** | Tablero de control (producto y punto más demandados, mejor proveedor) y promociones |
| **Administrador** | Usuarios, catálogos, reglas del sistema, imagen corporativa con vista previa, auditoría y log del sistema |

Todos los roles tienen Notificaciones, cambio de contraseña y alertas flotantes.

## Tecnología

React 18 · Vite 5 · React Router 6 · TanStack Query 5 · CSS Modules con variables CSS · Vitest. JavaScript (módulos ES), igual que el backend. Fuentes Plus Jakarta Sans e Inter empaquetadas en la aplicación (funciona sin internet).

## Inicio rápido

Requisitos: Node.js 20 o superior y el backend corriendo (por defecto en `http://localhost:3000`).

```bash
npm install
cp .env.example .env        # en Windows: copy .env.example .env
npm run dev                 # http://localhost:5173
```

El puerto 5173 ya está en `CORS_ORIGINS` del `.env.example` del backend. Si la API corre en otra dirección, cámbiela en `VITE_API_URL`.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga automática |
| `npm run build` | Compila para producción en `dist/` |
| `npm run preview` | Sirve la versión compilada en `http://localhost:4173` (agregue ese origen a `CORS_ORIGINS` del backend) |
| `npm test` | Pruebas unitarias (Vitest) |

### Probar todos los flujos en local

Para que funcionen las cotizaciones (correo) y el precio sugerido (Ministerio), el backend necesita un SMTP y el servicio de precios. En local use el simulador del backend (`node scripts/mockServicios.js`) y un buzón de pruebas como Ethereal; la configuración está en `docs/CONFIGURACION.md` del backend.

## Estructura

```
src/
├── main.jsx                 Punto de entrada: fuentes, estilos y aplicación
├── app/                     Composición, rutas y guardas por rol
├── api/                     Cliente HTTP único y un módulo por área de la API
├── theme/                   Imagen corporativa: lectura, colores derivados y contraste WCAG
├── styles/                  Tokens de diseño y estilos globales
├── shared/
│   ├── layout/              Estructura de pantallas, menú lateral por rol, barra superior
│   ├── ui/                  Componentes reutilizables (botones, tablas, tarjetas, alertas…)
│   └── lib/                 Formatos de Colombia y lectura de catálogos
└── features/                Un módulo por área: auth, alertas, mesero, cocina,
                             compras, comercial, admin
```

Cada módulo de `features/` tiene sus pantallas, su lógica en archivos `.js` sin React (con pruebas `*.test.js` al lado) y sus estilos `.module.css`.

## Decisiones de diseño

**Identidad Konrad Lorenz parametrizable.** Los colores no están fijos en el código: la aplicación lee la imagen corporativa vigente (`GET /api/v1/apariencia`, pública) y la aplica como variables CSS, también en el inicio de sesión. El turquesa institucional `#00A3B4` (provisional, a confirmar con el manual de marca) y el antracita `#1A202C` son los valores por defecto del backend. El Administrador los cambia desde la aplicación, con vista previa, sin recompilar.

**Accesibilidad WCAG 2.1 AA.** A partir de los 4 colores elegidos se calculan las variantes que garantizan contraste 4,5:1: el texto sobre botones turquesa es antracita (el blanco no alcanza), y los enlaces usan un turquesa oscurecido. Etiquetas visibles en todos los campos, errores asociados a su campo, foco visible, navegación por teclado en pestañas, diálogos nativos, enlace "Saltar al contenido", estados que nunca dependen solo del color y movimiento reducido si el sistema lo pide.

**Estados de mesa honestos.** La base de datos guarda de una mesa solo punto, número y si está activa, y los pedidos no tienen estado. Por eso el plano muestra lo que el sistema sabe: *Libre hoy* o *Con pedidos hoy*, más dos estados de la interfaz: *Seleccionada* y *Nueva orden* (comanda sin enviar), ambos en turquesa. "Esperando cuenta" y "Plato listo" no existen porque el SRS no incluye pagos ni flujo de cocina.

**Comanda local.** La API registra el pedido completo de una vez, así que la comanda de cada mesa vive en el dispositivo del mesero (se conserva al cambiar de mesa y al recargar) hasta que se envía a cocina. El total es una estimación con los precios actuales del menú.

**Alertas por consulta periódica.** Las alarmas de stock y las notificaciones se consultan cada minuto (la API no las empuja en tiempo real). Se muestran como tarjetas flotantes con indicador turquesa de 4 px, abajo a la derecha para no tapar las acciones de cada pantalla.

**Confidencialidad (SRS 6.5).** Los valores de cotizaciones y órdenes solo aparecen en las pantallas de compras. El tablero del Director Comercial muestra nombres y conteos.

**Sesión (CU-01).** El token se renueva cada 10 minutos solo si hubo actividad; tras 30 minutos sin actividad la sesión se cierra con un aviso. Se guarda en `sessionStorage`: se borra al cerrar la pestaña.

## Verificación

- 58 pruebas unitarias de la lógica: colores y contraste, reglas de contraseña, cliente de la API, alertas, mesas y comanda, cocina, cotizaciones, tablero, catálogos, reglas e imagen corporativa.
- Verificación de punta a punta con navegador contra la API real (PostgreSQL, SMTP de pruebas y simulador de servicios externos): administración completa, toma de orden y envío a cocina, menú, inventario y solicitud, cotización por correo, validación automática (opcionada y sospechosa), orden de compra, tablero y control de acceso por rol.
