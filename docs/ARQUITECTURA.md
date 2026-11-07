# Arquitectura

## Visión general

Dos procesos comparten el mismo código y la misma base de datos: la **API** (que además publica eventos) y el **cron** (procesos programados, que también publica eventos). Ambos se arman en un único lugar, `src/container.js`.

```mermaid
flowchart TB
  Cliente["Cliente (frontend, Postman)"] -->|HTTPS + JWT| Pres["Presentación\napiController · httpSecurity"]
  Pres --> Fachada["Fachada\nSistemaFacade · operaciones"]
  Cron["Cron\nworker.js · jobs"] -->|procesos como SISTEMA| Fachada
  Fachada -->|delega| Dominio["Dominio\nmódulos · fábricas · eventos"]
  Dominio --> Infra["Infraestructura\nrepositorios SQL · adaptadores"]
  Infra --> BD[("PostgreSQL\nSupabase")]
  Infra -->|TLS| Ext["Ministerio de Comercio (SOAP)\nCorreo SMTP · Redes sociales"]
  BD --> Outbox["Publicador Outbox"]
  Outbox --> Bus["Bus de eventos"]
  Bus --> Manejadores["Manejadores"]
  Manejadores --> Dominio
```

## Capas y responsabilidades

| Capa | Carpeta | Responsabilidad |
|---|---|---|
| Presentación | `src/presentation/` | Recibe HTTP y lo delega **directo** a la fachada. Cabeceras de seguridad, CORS, exigencia de TLS, límite de intentos de inicio de sesión y traducción de errores a HTTP |
| Fachada | `src/facade/` | **Único punto de entrada** para HTTP y cron. Valida token y rol, delega al módulo y registra la auditoría. El catálogo `operaciones.js` define cada operación con sus roles |
| Dominio | `src/domain/` | Lógica de negocio por módulo, eventos, fábricas y contratos de servicios externos. No importa nada de infraestructura: recibe sus dependencias por inyección |
| Infraestructura | `src/infrastructure/` | Conexión a PostgreSQL, adaptadores de servicios externos, publicador Outbox y registro de errores |
| Composición | `src/container.js` | Conecta las capas: crea adaptadores, repositorios, servicios y manejadores |

La dependencia va hacia adentro: Presentación → Fachada → Dominio, y la Infraestructura se inyecta en el Dominio, que solo conoce sus **contratos**.

## Patrones de diseño

| Patrón | Dónde | Para qué |
|---|---|---|
| **Facade** | `facade/SistemaFacade.js` | Un solo punto de acceso: seguridad y auditoría en un lugar, y los controladores sin lógica |
| **Factory Method** | `domain/factories/` (`NotificacionFactory` y tres creadores) | Construir confirmaciones de solicitud, alarmas de stock y promociones sin que quien las pide conozca su formato |
| **Adapter** | `domain/services/` (contratos) e `infrastructure/adapters/` | Aislar el Ministerio de Comercio, el correo y las redes sociales detrás de interfaces propias |
| **Outbox** | `infrastructure/outbox/EventOutboxPublisher.js` | El cambio de negocio y su evento se guardan en la misma transacción; un publicador los entrega después |
| **Arquitectura basada en eventos** | `domain/events/` | Desacoplar efectos secundarios (correos, validaciones, alarmas) de la operación que los origina |

### Cómo funciona el Outbox

1. Un módulo cambia el estado de negocio y llama a `registrarEvento(tx, tipo, payload)` con **la misma transacción**: ambos se confirman o ninguno.
2. El publicador (en la API y en el cron) reclama eventos pendientes con `FOR UPDATE SKIP LOCKED` y una reserva temporal: dos publicadores no toman el mismo evento y, si uno cae, otro lo retoma al vencer la reserva.
3. Entrega cada evento a sus manejadores. Si alguno falla, el evento se reintenta con espera creciente (hasta 6 intentos por defecto) y solo se reejecutan los manejadores que no terminaron.
4. La tabla `evento_procesado` garantiza que cada manejador procese cada evento una sola vez (entrega "al menos una vez" con idempotencia).

### Ejemplo: registrar una solicitud

```mermaid
sequenceDiagram
  participant J as Jefe de Cocina
  participant API as API + Fachada
  participant BD as PostgreSQL
  participant P as Publicador Outbox
  participant M as Manejadores
  J->>API: POST /solicitudes
  API->>BD: BEGIN · solicitud + detalle + evento SolicitudRegistrada · COMMIT
  API-->>J: 201 (PENDIENTE)
  P->>BD: reclama el evento
  P->>M: SolicitudRegistrada
  M->>M: Notificaciones: correo de confirmación
  M->>M: PrecioSugerido: consulta al Ministerio
  M->>BD: precios + total + evento PrecioSugeridoActualizado
```

## Persistencia

PostgreSQL en Supabase, con SQL directo mediante `pg`. El esquema completo está en `src/infrastructure/database/schema.sql` (idempotente).

| Grupo | Tablas |
|---|---|
| Catálogos y reglas | `punto`, `mesa`, `categoria`, `marca`, `unidad_medida`, `producto`, `proveedor`, `parametro` |
| Seguridad | `usuario` |
| Cocina | `plato`, `plato_ingrediente`, `pedido`, `pedido_detalle` |
| Inventario | `inventario`, `movimiento_inventario`, `alarma` |
| Compras | `solicitud_alimentos`, `detalle_solicitud`, `cotizacion`, `cotizacion_detalle`, `orden_compra` |
| Analítica y avisos | `tendencia`, `promocion`, `notificacion` |
| Auditoría y eventos | `auditoria`, `log_error`, `outbox`, `evento_procesado` |

Garantías que da la base de datos: `auditoria` y `log_error` no admiten `UPDATE` ni `DELETE` (triggers); una sola alarma activa por producto y punto (índice único parcial); el inventario no puede quedar negativo; los consecutivos de solicitudes, cotizaciones y órdenes salen de secuencias. Todas las tablas tienen la seguridad a nivel de fila activada, sin políticas: la API se conecta con credenciales propias y la clave pública de Supabase no puede leerlas.

## Seguridad

| Medida | Dónde |
|---|---|
| TLS 1.3 hacia la base de datos, el correo y los servicios externos; HTTPS propio con TLS 1.3 o proxy TLS delante de la API | `env.js`, adaptadores, `app.js` |
| Contraseñas con bcrypt, con un tope de cálculos simultáneos (procesadores menos uno) | `PasswordHasher.js` |
| JWT firmado de vida corta, con renovación y duración máxima de sesión | `TokenService.js`, `AuthService.js` |
| Roles verificados en la fachada y otra vez en cada módulo | `operaciones.js`, módulos |
| Bloqueo de cuenta tras intentos fallidos y límite por IP en el inicio de sesión | `AuthService.js`, `httpSecurity.js` |
| Auditoría inmutable de acciones, accesos y denegaciones | `AuditoriaService`, triggers |
| Valores de cotizaciones y órdenes visibles solo para el área de compras | Roles, tablero y auditoría sin montos |
| Sin SQL construido con datos del usuario: parámetros y listas blancas | Repositorios, `CatalogosDefinicion.js` |
| Cuerpo máximo de 100 KB, CORS por lista, cabeceras con Helmet | `httpSecurity.js`, `app.js` |
| Contenedores sin root, sistema de archivos de solo lectura y sin capacidades | `Dockerfile.*`, `docker-compose.yml` |

## Decisiones de diseño

| Decisión | Motivo |
|---|---|
| SQL directo con `pg` y no `supabase-js` | El Outbox necesita transacciones de varias sentencias, que PostgREST no ofrece |
| JWT sin estado con renovación | Cumple la expiración por inactividad sin tabla de sesiones; a cambio, cerrar sesión no invalida el token en el servidor |
| Alarmas por consulta (sondeo) y no en tiempo real | Supabase Realtime exige un JWT propio de Supabase, que este sistema no usa |
| Entrega de eventos "al menos una vez" con idempotencia por manejador | Un fallo de correo o del Ministerio se reintenta sin duplicar efectos |
| Catálogos como lista blanca (`CatalogosDefinicion.js`) | Un solo servicio genérico sin construir SQL con nombres que vengan del cliente |
| Cron en un contenedor aparte, con bloqueo asesor de PostgreSQL | Que escalar la API no duplique procesos programados, y que dos cron no ejecuten lo mismo |
| La unidad de un producto no cambia | Inventario, ingredientes y solicitudes dependen de ella |
| Errores de conexión con la base de datos como 503 con `Retry-After` | Son fallos temporales: el cliente debe reintentar, no es un error del sistema |
| Comparar la cotización con el subtotal sugerido de lo que cubre | Cotizaciones parciales se juzgan bien; coincide con el total si cubre todo |

## Pruebas y CI

`npm test` ejecuta más de 130 pruebas con su propia base PostgreSQL temporal (nunca Supabase): casos de uso, seguridad de la API (incluido TLS 1.3 real), envío real por SMTP, cron y la sincronía de esta documentación con el código. El CI de GitHub las repite contra PostgreSQL 16 y construye las dos imágenes Docker en cada cambio.


## Servicio de precios del Ministerio (supuesto documentado)

El enunciado menciona un servicio web del Ministerio de Comercio que devuelve valores estandarizados por producto, y exige SOAP para la integración con sistemas externos. No existe un servicio público con ese nombre; se **supone** que su contrato es el del servicio SOAP 1.2 de **SIPSA (DANE)**, público y gratuito, cuyo método `promediosSipsaCiudad` devuelve el precio promedio de cada producto por ciudad. Se eligió porque es SOAP (cumple el requisito), es real y está documentado.

- **Dónde:** `MinisterioComercioAdapter` (implementa `IPrecioSugeridoService`) sobre un cliente SOAP 1.2 propio (`soap.js`). El dominio no cambia: depende solo del contrato.
- **Cómo consulta:** el servicio no busca por producto, entrega la tabla completa. El adaptador la pide una vez, la guarda en memoria (`MINCOMERCIO_CACHE_MINUTOS`) y responde cada producto desde ella; si el servicio falla y hay datos guardados, los usa.
- **Cómo asocia productos:** por nombre, sin distinguir tildes ni mayúsculas: coincidencia exacta; si no, nombres que empiezan por el pedido; si no, nombres que contienen todas sus palabras. Con varias variantes («Arroz de primera», «Arroz segunda») promedia el dato más reciente de cada una y de cada ciudad, o solo de `MINCOMERCIO_CIUDAD` si se configuró.
- **Unidades:** los precios son por kilogramo; se convierten a gramo y libra. Otra unidad responde `UNIDAD_NO_SOPORTADA`.
- **Alcance de los datos reales:** SIPSA publica precios mayoristas agrícolas; un producto que no exista en su tabla queda sin precio sugerido (`SIN_PRECIO`).
- **Para la demostración:** `scripts/mockServicios.js` simula el servicio con el mismo contrato (WSDL incluido), de modo que el sistema funciona sin internet. Cambiar al servicio real es cambiar `MINCOMERCIO_API_URL`.

## Limitaciones conocidas

- Cerrar sesión no invalida el token en el servidor; dura hasta su vencimiento.
- Cambiar o restablecer una contraseña no cierra las sesiones abiertas: sus tokens siguen vigentes hasta vencer.
- No hay recuperación de contraseña por correo: la restablece el Administrador.
- Las notificaciones no tienen estado de lectura (leída o no leída): eso requeriría una columna nueva en la base de datos.
- Las alarmas no se empujan: la aplicación debe consultarlas.
- El servicio de precios del Ministerio se probó con la guía y el WSDL públicos del DANE y con un simulador del mismo contrato, **no contra el servicio en vivo**; los parámetros de entrada de `promediosSipsaCiudad` no vienen en el WSDL y se asumió que no tiene. `npm run sipsa:probar` lo comprueba contra el servicio real.
- El adaptador de redes sociales asume un formato de respuesta (descrito en el adaptador) que debe confirmarse con la API real.
- Este repositorio es solo el backend: no incluye el frontend.
