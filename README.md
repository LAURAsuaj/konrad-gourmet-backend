# Konrad Gourmet — Backend

![CI](https://github.com/LAURAsuaj/konrad-gourmet-backend/actions/workflows/ci.yml/badge.svg)

Backend del sistema **Konrad Gourmet**: gestión de cocina, inventario y compras de restaurantes. Expone una API REST (Node.js + PostgreSQL en Supabase) con una arquitectura basada en eventos, y un contenedor independiente de procesos automáticos.

## Qué hace

| Área | Funcionalidad |
|---|---|
| **Seguridad** | Inicio de sesión con roles, bloqueo de cuentas, renovación de sesión, cambio y restablecimiento de contraseña, auditoría inmutable de acciones y accesos |
| **Cocina** | Menú por punto con ingredientes, pedidos por mesa |
| **Inventario** | Descuento diario automático según lo vendido y alarmas de stock bajo (≤ 25 %) con aviso por correo y en las notificaciones del usuario |
| **Compras** | Solicitudes de alimentos, precio sugerido del Ministerio (servicio SOAP), cotizaciones a proveedores (con PDF por correo), validación automática por rangos y órdenes de compra |
| **Analítica** | Tablero de control (producto y punto más demandados, mejor proveedor) y promociones por tendencias en redes sociales |
| **Parametrización** | Catálogos y reglas del sistema editables por el Administrador sin reiniciar |

## Tecnología

Node.js 22 (mínimo 20) · Express · PostgreSQL (Supabase) · JWT + bcrypt · nodemailer · pdfkit · node-cron · Docker · GitHub Actions.

## Arquitectura en una frase

Capas **Presentación → Fachada → Dominio ← Infraestructura**, con patrones **Facade** (punto único de entrada), **Factory Method** (notificaciones), **Adapter** (servicios externos), **Outbox** (cambio de negocio y evento en la misma transacción) y **arquitectura basada en eventos**. Detalle en [Arquitectura](docs/ARQUITECTURA.md).

## Inicio rápido

Requisitos: Node.js 20 o superior, Git y un proyecto de Supabase.

```bash
npm install
cp .env.example .env        # en Windows: copy .env.example .env
# edite .env: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y JWT_SECRET
# ejecute src/infrastructure/database/schema.sql en el SQL Editor de Supabase
ADMIN_NOMBRE="Su Nombre" ADMIN_CORREO=admin@empresa.com ADMIN_PASSWORD='Clave12345' npm run admin:crear
npm start
```

Compruebe `http://localhost:3000/salud`. La guía completa, con los errores más frecuentes, está en [Instalación](docs/INSTALACION.md).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm start` | Inicia la API |
| `npm run dev` | Inicia la API reiniciándola al cambiar el código |
| `npm run start:cron` | Inicia el contenedor de procesos automáticos (descuento diario, tendencias, reintento de precios) |
| `npm run admin:crear` | Crea el primer Administrador (solo funciona si aún no existe uno) |
| `npm run db:schema` | Aplica el esquema con `psql` (alternativa al SQL Editor de Supabase) |
| `npm run sipsa:probar` | Inspecciona el servicio SOAP de precios configurado e informa qué devuelve (real o simulador); con opciones, ver [Instalación](docs/INSTALACION.md) |
| `npm test` | Ejecuta las pruebas automáticas |

## Pruebas

`npm test` ejecuta más de 130 pruebas sobre una base PostgreSQL temporal que levanta y elimina solo; no necesita instalar nada más. **Nunca** se conecta a Supabase: solo acepta una base local cuyo nombre contenga `test`. Cada cambio que se sube a GitHub las ejecuta de nuevo y construye las imágenes Docker ([CI](.github/workflows/ci.yml)).

Ejecute las pruebas en una terminal normal (PostgreSQL no arranca como administrador/root). Para correr solo un archivo: `npm test -- cron`.

## Docker

```bash
docker compose up -d --build     # API + cron (ver docs/DESPLIEGUE.md)
```

Dos contenedores independientes comparten la misma base de datos: `api` y `cron`. Pasos completos, TLS y operación en [Despliegue](docs/DESPLIEGUE.md).

## Estructura

```
src/
  config/            Configuración global (env.js)
  presentation/      Controlador HTTP y seguridad HTTP (CORS, TLS, límites, errores)
  facade/            SistemaFacade, catálogo de operaciones con sus permisos y middlewares JWT/roles
  domain/
    modules/         auth, cocina, inventario, compras, analitica, auditoria, parametrizacion, notificaciones
    events/          Bus de eventos y manejadores
    factories/       Factory Method de notificaciones
    services/        Contratos de los servicios externos (Adapter)
  infrastructure/    Adaptadores externos, base de datos (schema.sql), Outbox y registro de errores
  container.js       Composición de dependencias (compartida por la API y el cron)
  app.js             Arranque de la API
cron/                Contenedor de procesos automáticos (worker.js y jobs/)
scripts/             crearAdministrador.js, mockServicios.js (simulador de las APIs externas) y probarSipsa.js
tests/               Pruebas automáticas
docs/                Documentación
```

## Documentación

| Documento | Contenido |
|---|---|
| [Instalación](docs/INSTALACION.md) | Cómo poner el proyecto a funcionar paso a paso |
| [Configuración](docs/CONFIGURACION.md) | Variables de entorno, reglas del sistema y catálogos |
| [Referencia de la API](docs/API.md) | Las 42 rutas, sus permisos y ejemplos reales |
| [Flujos de negocio](docs/FLUJOS.md) | Cómo funcionan cocina, inventario, compras y procesos automáticos |
| [Arquitectura](docs/ARQUITECTURA.md) | Capas, patrones, eventos, modelo de datos y decisiones de diseño |
| [Despliegue y operación](docs/DESPLIEGUE.md) | Docker, TLS, lista de verificación para producción y resolución de problemas |

## Seguridad

TLS 1.3 obligatorio en producción · contraseñas con bcrypt (con límite de cálculos simultáneos) · JWT de vida corta con renovación y tope de sesión · control de acceso por rol en la fachada y en cada módulo · auditoría que ni la base de datos permite modificar · límite de intentos de inicio de sesión · valores de cotizaciones y órdenes visibles solo para el área de compras · tablas con seguridad a nivel de fila activada.

## Estado

El sistema funciona de punta a punta y está cubierto por pruebas y CI. Para salir a producción faltan datos reales que dependen de terceros (certificado CA de Supabase, SMTP real, APIs reales del Ministerio de Comercio y de redes sociales, rangos de validación del área de compras): ver la lista de verificación en [Despliegue](docs/DESPLIEGUE.md#lista-de-verificación-para-producción).
