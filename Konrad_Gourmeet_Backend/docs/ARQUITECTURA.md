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

El enunciado menciona un servicio web del Ministerio de Comercio que devuelve valores estandarizados por producto, y exige SOAP para la integración con sistemas externos. No existe un servicio público con ese nombre; se **supone** que su contrato es el del servicio SOAP 1.2 de **SIPSA (DANE)**, público y gratuito, cuyo método `promediosSipsaCiudad` devuelve el precio promedio de cada producto por ciudad y día. Se eligió porque es SOAP (cumple el requisito), es real y está documentado.

**Lo que se comprobó contra el servicio real (noviembre de 2026, con `node scripts/probarSipsa.js`):**

- Responde por HTTPS y no usa credenciales.
- La operación no recibe parámetros: no permite pedir un producto, una ciudad ni un rango de fechas.
- Entrega todo su historial (más de 20 MB), tarda unos 17 segundos en empezar a responder y ordena los registros del más reciente al más antiguo (en 76 cambios de fecha observados, ninguno iba hacia fechas más nuevas).
- Ofrece 33 productos en 20 ciudades, con datos hasta el día en curso. Son solo frutas, verduras y tubérculos: Aguacate, Ahuyama, Arracacha, Arveja verde en vaina, Banano, Cebolla cabezona blanca, Cebolla junca, Chócolo mazorca, Coco, Granadilla, Guayaba, Habichuela, Limón Común, Limón Tahití, Lulo, Mandarina, Mango tommy, Maracuyá, Mora de Castilla, Naranja, Papa criolla, Papa negra, Papaya maradol, Pepino cohombro, Pimentón, Piña, Plátano guineo, Plátano hartón verde, Remolacha, Tomate de árbol, Tomate, Yuca y Zanahoria. **No incluye granos, cereales ni carnes** (por ejemplo Arroz, Frijol, Pollo, Res), que quedan sin precio sugerido.
- Resultado de la prueba real: Papa 3.454,71, Cebolla 1.860,24 y Tomate 3.500,44 por kilogramo, con 847 KB leídos en 22 segundos.

**Cómo lo consume el sistema:** `MinisterioComercioAdapter` (implementa `IPrecioSugeridoService`) sobre un cliente SOAP 1.2 propio (`soap.js`). El dominio no cambia: depende solo del contrato.

- **Lectura en flujo con ventana:** como no se puede filtrar, la respuesta se lee por partes, cada registro se interpreta al llegar y la conexión se cierra cuando se pasa de la ventana de `MINCOMERCIO_VENTANA_DIAS` días respecto del dato más reciente. Así se leen unos pocos cientos de KB en lugar de más de 20 MB. Hay además un tope de tamaño de lectura como protección.
- **Memoria:** la tabla de la ventana se guarda en memoria (`MINCOMERCIO_CACHE_MINUTOS`); varias consultas simultáneas comparten una sola llamada, y si el servicio falla se usan los datos guardados aunque estén vencidos. La primera consulta tras arrancar tarda lo que tarde el servicio en responder, y el cálculo del precio ocurre en segundo plano (evento), sin bloquear al usuario.
- **Cómo asocia productos:** por nombre, sin distinguir tildes ni mayúsculas: coincidencia exacta; si no, nombres que empiezan por el pedido; si no, nombres que contienen todas sus palabras. Con varias variantes («Arroz de primera», «Arroz segunda») promedia el dato más reciente de cada una y de cada ciudad, o solo de `MINCOMERCIO_CIUDAD` si se configuró.
- **Unidades:** los precios son por kilogramo; se convierten a gramo y libra. Otra unidad responde `UNIDAD_NO_SOPORTADA`.
- **Alcance de los datos reales:** SIPSA publica precios mayoristas agrícolas; un producto que no exista en su tabla queda sin precio sugerido (`SIN_PRECIO`).
- **Para la demostración:** `scripts/mockServicios.js` simula el servicio con el mismo contrato (WSDL incluido, historial de 20 días ordenado como el real, y `--demora=<s>` para imitar su lentitud), de modo que el sistema funciona sin internet. Su lista de 23 productos agrega granos y proteínas (Arroz, Frijol, Pollo, Carne, Repollo...) para cubrir el menú de un restaurante y los ejemplos del enunciado. Cambiar al servicio real es cambiar `MINCOMERCIO_API_URL`; con él, una solicitud que incluya un producto sin precio queda con el valor total sugerido incompleto y sus cotizaciones no se validan automáticamente.

## API de redes sociales (supuesto documentado)

El enunciado pide identificar comportamientos de las redes sociales para ofrecer productos. Instagram, TikTok y X no ofrecen una API pública gratuita de tendencias, y la de Google Trends sigue en fase alfa con acceso limitado; por eso se **supone** una API REST de tendencias con un contrato propio (el que describe `RedesSocialesAdapter`) y la demostración usa un simulador del mismo contrato (`scripts/mockServicios.js`).

- **Contrato:** `GET /tendencias?categoria=gastronomia&pais=CO&limite=<n>` con `Authorization: Bearer`; responde términos con fuente y puntaje. El adaptador deja un solo registro por término (el de mayor puntaje) y los ordena de mayor a menor.
- **Cómo se usan:** `PromocionService` une cada tendencia con un producto cuando el nombre de uno contiene al otro: producto muy solicitado que además es tendencia genera una promoción `COMBINADA`; las tendencias sin producto generan promociones solo de tendencia (máximo 2). Si la API no está disponible se promocionan solo los productos más solicitados.
- **Datos reales posibles:** la API de YouTube Data v3 (oficial, con clave gratuita) permitiría contar qué productos aparecen en los videos de comida más vistos. No se implementó: sería un adaptador adicional con el mismo contrato `ITendenciasService`, sin cambios en el dominio.

## Limitaciones conocidas

- Cerrar sesión no invalida el token en el servidor; dura hasta su vencimiento.
- Cambiar o restablecer una contraseña no cierra las sesiones abiertas: sus tokens siguen vigentes hasta vencer.
- No hay recuperación de contraseña por correo: la restablece el Administrador.
- Las notificaciones no tienen estado de lectura (leída o no leída): eso requeriría una columna nueva en la base de datos.
- Las alarmas no se empujan: la aplicación debe consultarlas.
- El servicio de precios del DANE se comprobó en vivo (formato, orden y ausencia de parámetros), pero su comportamiento puede cambiar; `node scripts/probarSipsa.js` permite repetir la comprobación. Sus productos son solo agrícolas mayoristas.
- El adaptador de redes sociales asume un formato de respuesta (descrito en el adaptador) que debe confirmarse con la API real.
- Este repositorio es solo el backend: no incluye el frontend.
