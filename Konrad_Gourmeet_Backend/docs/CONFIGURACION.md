# Configuración

Toda la configuración del sistema sale de **variables de entorno**, leídas una sola vez al arrancar desde `src/config/env.js`, y de **reglas** que el Administrador cambia por la API sin reiniciar.

## Variables de entorno

Copie `.env.example` a `.env` y complete los valores. **No renombre** `.env.example`: la plantilla se conserva en el repositorio y `.env` (con secretos) nunca se sube. Los cambios en `.env` se aplican al reiniciar la API y el cron.

El sistema lee **41 variables**; solo 4 son obligatorias.

### Servidor y red

| Variable | Obligatoria | Valor por defecto | Descripción |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Entorno de ejecución: `development`, `test` o `production`. En `production` se exigen TLS 1.3 y base de datos con SSL. |
| `PORT` | No | `3000` | Puerto en el que escucha la API. |
| `CORS_ORIGINS` | No | (vacío) | Orígenes (separados por coma) que pueden llamar a la API desde un navegador. Vacío = ninguno. |
| `HTTPS_CERT_PATH` | No | — | Ruta del certificado TLS si la API termina TLS por sí misma. Se configura junto con `HTTPS_KEY_PATH`. |
| `HTTPS_KEY_PATH` | No | — | Ruta de la llave privada del certificado. |
| `TRUST_PROXY` | No | `false` | `true` si un proxy o balanceador termina TLS delante de la API. En producción hay que configurar esta o el par `HTTPS_CERT_PATH`/`HTTPS_KEY_PATH`. |
| `TLS_MIN_VERSION` | No | `TLSv1.3` | Versión mínima de TLS hacia la base de datos, el correo y los servicios externos: `TLSv1.3` (obligatoria en producción) o `TLSv1.2` (solo desarrollo). |

### Base de datos (Supabase / PostgreSQL)

| Variable | Obligatoria | Valor por defecto | Descripción |
|---|---|---|---|
| `DATABASE_URL` | Sí | — | Cadena de conexión. Use el **Session pooler** de Supabase (puerto 5432), no la conexión directa (solo IPv6). |
| `DB_POOL_MAX` | No | `10` | Conexiones máximas por proceso. La API y el cron cuentan por separado; no supere el límite del pooler. |
| `DB_SSL` | No | `true` | Conexión a la base de datos con TLS. Solo `false` en desarrollo con un Postgres local sin TLS; en producción debe ser `true`. |
| `DB_SSL_REJECT_UNAUTHORIZED` | No | `true` | Verifica el certificado del servidor de base de datos. `false` solo en desarrollo; en producción déjelo en `true` y entregue `DB_SSL_CA`. |
| `DB_SSL_CA` | No | — | Certificado CA de Supabase. Formato recomendado: una sola línea con `\n` en lugar de cada salto de línea. También sirve en varias líneas **entre comillas dobles**; sin comillas el `.env` solo lee la primera línea y la conexión falla. Con `docker compose` use la forma de una sola línea. Los parámetros `sslmode` de `DATABASE_URL` se ignoran: la configuración TLS sale solo de estas variables. |
| `SUPABASE_URL` | Sí | — | URL del proyecto: `https://PROYECTO.supabase.co` (debe empezar por `https://`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | — | Clave `service_role` de Supabase. **Secreta**: nunca en el repositorio. |

### Autenticación y seguridad

| Variable | Obligatoria | Valor por defecto | Descripción |
|---|---|---|---|
| `JWT_SECRET` | Sí | — | Secreto con el que se firman los tokens. Mínimo 32 caracteres y aleatorio. **Secreto.** |
| `JWT_EXPIRES_IN` | No | `30m` | Vida de cada token (`30m`, `1h`). Con la renovación, una sesión inactiva más de este tiempo expira. |
| `JWT_ISSUER` | No | `konrad-gourmet` | Emisor que se escribe y valida en los tokens. |
| `BCRYPT_ROUNDS` | No | `12` | Costo de bcrypt (10 a 15). Con 12, cada contraseña tarda unos 270 ms de un procesador. |
| `LOGIN_RATE_LIMIT_MAX` | No | `10` | Intentos de inicio de sesión fallidos permitidos **para una misma cuenta desde un mismo equipo** (IP + correo) dentro de la ventana; después responde 429 solo para esa cuenta. Los demás usuarios de la misma red no se afectan. |
| `LOGIN_RATE_LIMIT_MAX_IP` | No | `100` | Intentos fallidos permitidos **en total desde un mismo equipo** (IP), sumando todas las cuentas; frena que se prueben muchas cuentas. Después responde 429 a cualquier cuenta desde ese equipo. |
| `LOGIN_RATE_LIMIT_WINDOW_MIN` | No | `15` | Ventana, en minutos, de los dos límites anteriores. Los contadores viven en memoria: reiniciar la API los borra. |

### Eventos (Outbox)

| Variable | Obligatoria | Valor por defecto | Descripción |
|---|---|---|---|
| `OUTBOX_POLL_MS` | No | `2000` | Cada cuántos milisegundos el publicador revisa los eventos pendientes. |
| `OUTBOX_BATCH_SIZE` | No | `25` | Eventos que reclama en cada ciclo. |
| `OUTBOX_MAX_ATTEMPTS` | No | `6` | Intentos de entrega antes de marcar un evento como `FALLIDO`. |
| `OUTBOX_RETRY_BASE_SECONDS` | No | `15` | Espera base entre reintentos; se duplica en cada intento, con un tope de una hora. |
| `OUTBOX_LEASE_SECONDS` | No | `60` | Tiempo que un publicador "reserva" un evento; si el proceso cae, otro lo retoma al vencer. |

### Procesos automáticos (cron)

| Variable | Obligatoria | Valor por defecto | Descripción |
|---|---|---|---|
| `CRON_TIMEZONE` | No | `America/Bogota` | Zona horaria de los procesos programados. |
| `CRON_DESCUENTO_FALLBACK` | No | `0 2 * * *` | Expresión cron del descuento diario si no se puede leer la regla `hora_descuento_diario`. |
| `CRON_TENDENCIAS` | No | `0 8 * * 1` | Expresión cron de la consulta de tendencias y envío de promociones (por defecto, los lunes a las 8:00). |
| `CRON_REINTENTO_PRECIOS` | No | `*/30 * * * *` | Expresión cron de respaldo del reintento del precio sugerido; la regla `reintento_precio_sugerido_minutos` tiene prioridad. |

### Ministerio de Comercio: servicio SOAP de precios (precio sugerido)

El servicio se consume por **SOAP 1.2** con el contrato de SIPSA (DANE); ver [Arquitectura](ARQUITECTURA.md#servicio-de-precios-del-ministerio-supuesto-documentado). No usa credenciales.

| Variable | Obligatoria | Valor por defecto | Descripción |
|---|---|---|---|
| `MINCOMERCIO_API_URL` | No | — | Dirección del servicio SOAP (el `soap12:address` de su WSDL). Debe ser HTTPS; solo se admite HTTP hacia localhost fuera de producción, o con `MINCOMERCIO_PERMITIR_HTTP`. |
| `MINCOMERCIO_TIMEOUT_MS` | No | `60000` | Tiempo máximo, en milisegundos, sin recibir datos del servicio. El servicio real del DANE tarda unos 17 segundos en empezar a responder; el tiempo total de la consulta tiene un tope de tres veces este valor. |
| `MINCOMERCIO_VENTANA_DIAS` | No | `14` | Días de precios que se guardan, contados desde el dato más reciente. El servicio entrega todo su historial (más de 20 MB) del más nuevo al más antiguo, y el sistema corta la lectura al salir de esta ventana. |
| `MINCOMERCIO_CIUDAD` | No | — (todas) | Ciudad de la que se toma el precio (por ejemplo `Bogotá`; sin distinguir tildes ni mayúsculas). Vacío: promedio de todas las ciudades. |
| `MINCOMERCIO_PERMITIR_HTTP` | No | `false` | `true` autoriza consumir el servicio por `http://` sin cifrar. Es una excepción al requisito de HTTPS: úsela solo si el servicio real no responde por HTTPS (son datos públicos, sin credenciales) y déjelo documentado. |
| `MINCOMERCIO_CACHE_MINUTOS` | No | `360` | Minutos que se conserva en memoria la tabla de precios de la ventana antes de pedirla de nuevo. |

### Correo electrónico (SMTP)

| Variable | Obligatoria | Valor por defecto | Descripción |
|---|---|---|---|
| `SMTP_HOST` | No | — | Servidor SMTP. Sin él no se pueden enviar correos (ni cotizaciones a proveedores). |
| `SMTP_PORT` | No | `587` | Puerto SMTP (587 con STARTTLS, 465 con TLS directo). |
| `SMTP_SECURE` | No | `false` | `true` para TLS directo (puerto 465); `false` para STARTTLS, que se exige siempre. |
| `SMTP_USER` | No | — | Usuario SMTP. |
| `SMTP_PASS` | No | — | Contraseña SMTP. **Secreta.** |
| `CORREO_REMITENTE` | No | `Konrad Gourmet <no-reply@konradgourmet.com>` | Remitente de los correos del sistema. |

### Redes sociales (tendencias)

| Variable | Obligatoria | Valor por defecto | Descripción |
|---|---|---|---|
| `REDES_API_URL` | No | — | URL base de la API de tendencias. Debe ser HTTPS. |
| `REDES_API_TOKEN` | No | — | Credencial enviada como `Authorization: Bearer`. **Secreta.** |
| `REDES_TIMEOUT_MS` | No | `8000` | Tiempo máximo de espera, en milisegundos. |

En producción, `NODE_ENV=production` activa estas validaciones al arrancar: `TLS_MIN_VERSION` debe ser `TLSv1.3` y `DB_SSL` debe ser `true`; además, la API exige `HTTPS_CERT_PATH`/`HTTPS_KEY_PATH` o `TRUST_PROXY=true`.

## Perfiles recomendados

| Variable | Desarrollo local | Producción |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| `DATABASE_URL` | Session pooler de Supabase | Session pooler de Supabase |
| `DB_SSL_REJECT_UNAUTHORIZED` | `false` (atajo para la primera prueba) | `true`, con `DB_SSL_CA` |
| `TLS_MIN_VERSION` | `TLSv1.3` (o `TLSv1.2` si un servicio local no lo soporta) | `TLSv1.3` |
| `JWT_SECRET` | Un valor propio, aunque sea de prueba | Aleatorio, largo y distinto al de desarrollo |
| `SMTP_*` | Ethereal u otro buzón de pruebas | Servidor SMTP real |
| `MINCOMERCIO_*` / `REDES_*` | `scripts/mockServicios.js` en `http://127.0.0.1:4010` | Servicios reales |
| `CORS_ORIGINS` | `http://localhost:5173` | Dominio real del frontend |
| `HTTPS_*` / `TRUST_PROXY` | No hacen falta | Una de las dos opciones es obligatoria |

## Reglas del sistema

Se consultan con `GET /api/v1/reglas` y se cambian con `PUT /api/v1/reglas/:clave` (solo el Administrador). El valor se valida antes de guardarse y se aplica de inmediato; el cron relee la programación cada minuto.

| Clave | Valor inicial | Valores válidos | Descripción |
|---|---|---|---|
| `alarma_porcentaje` | `25` | Número mayor que 0 y máximo 100 | Porcentaje de la cantidad de referencia en el que se dispara la alarma de stock bajo (CU-07) |
| `max_intentos_login` | `3` | Entero de 1 a 10 | Intentos fallidos de inicio de sesión antes de bloquear la cuenta (CU-01) |
| `hora_descuento_diario` | `"02:00"` | Texto `HH:MM` en formato de 24 horas | Hora (HH:MM) del descuento diario de inventario (CU-06) |
| `rangos_validacion_cotizacion` | `{"sospechosa_bajo": 0.50, "opcionada_max": 1.25, "rechazada_sobre": 1.25}` | Tres números mayores que 0 con `sospechosa_bajo` ≤ `opcionada_max` ≤ `rechazada_sobre` | Razón valor cotizado / valor sugerido que define RECHAZADA, SOSPECHOSA y OPCIONADA (CU-12). Los valores iniciales son los del enunciado |
| `criterio_mejor_proveedor` | `{"metrica": "menor_razon_precio"}` | `metrica`: `ordenes_compra`, `cotizaciones_opcionadas` o `menor_razon_precio` | Criterio del KPI mejor proveedor del tablero BAM (CU-14); por defecto, el proveedor con los mejores precios |
| `reintento_precio_sugerido_minutos` | `30` | Entero de 1 a 1440 | Minutos entre reintentos de consulta al Ministerio de Comercio (CU-10) |
| `imagen_corporativa` | ver [Imagen corporativa](#imagen-corporativa) | Objeto con los campos de la imagen corporativa; los que no se indican conservan su valor | Imagen corporativa de la interfaz: nombre, colores, tipografía, logo y textos (requisito de interfaz gráfica) |

> **Rangos de validación:** los valores iniciales de `rangos_validacion_cotizacion` son las reglas del enunciado: una cotización más de 25 % por encima del valor del Ministerio es `RECHAZADA`; más de 50 % por debajo, `SOSPECHOSA`; y las demás, `OPCIONADA`. Como `opcionada_max` y `rechazada_sobre` valen lo mismo, no existe una franja «sospechosa por cara»; si el área de compras la quisiera, bastaría con bajar `opcionada_max`. Al aplicar el esquema en una base que ya tenía los valores iniciales anteriores (0,70 / 1,10 / 1,30), `npm run db:schema` los actualiza; si el Administrador ya los había cambiado, no se tocan.

### Imagen corporativa

La interfaz puede cambiar su imagen sin tocar código ni contratar a un diseñador: el Administrador define la regla `imagen_corporativa` (`PUT /api/v1/reglas/imagen_corporativa`) y la interfaz la lee en la ruta pública `GET /api/v1/apariencia`, incluso antes de iniciar sesión. Los campos que no se indican conservan su valor por defecto.

| Campo | Valor por defecto | Valores válidos |
|---|---|---|
| `nombreComercial` | `Konrad Gourmet` | Texto de 1 a 60 caracteres |
| `eslogan` | vacío | Texto de hasta 120 caracteres |
| `colorPrimario` | `#00A3B4` (turquesa institucional Konrad Lorenz, provisional) | Color `#RRGGBB` |
| `colorSecundario` | `#1A202C` | Color `#RRGGBB` |
| `colorFondo` | `#F8F9FA` | Color `#RRGGBB` |
| `colorTexto` | `#1A202C` | Color `#RRGGBB`; con el color de fondo debe tener un contraste de al menos 4,5:1 (accesibilidad WCAG 2.1 AA) |
| `tipografia` | `sistema` | `sistema`, `serif`, `redondeada` o `monoespaciada` |
| `logo` | ninguno (`null`) | URL `https` o imagen incrustada `data:image/png`, `jpeg`, `webp` o `gif` en base64 (máximo unos 60 KB; no se admite SVG por seguridad); `null` lo quita |
| `textoBienvenida` | `Bienvenido al sistema de abastecimiento` | Texto de hasta 200 caracteres |
| `textoPiePagina` | vacío | Texto de hasta 200 caracteres |

Los textos no admiten `<` ni `>`. La auditoría guarda solo el tamaño de un logo incrustado, no la imagen.

## Catálogos

Listas parametrizables que el Administrador mantiene con `/api/v1/catalogos/:catalogo`. Un valor que ya está en uso no se elimina: se inactiva con `{"activo": false}`. Los nombres no se repiten, sin distinguir mayúsculas.

| Catálogo | Campos del cuerpo | Notas |
|---|---|---|
| `puntos` | `nombre` | Sucursales o restaurantes |
| `mesas` | `puntoId`, `numero` | No se repite el número dentro del punto; el punto no se puede cambiar |
| `categorias` | `nombre` |  |
| `marcas` | `nombre` |  |
| `unidades` | `nombre`, `abreviatura` | La abreviatura es lo que se muestra (por ejemplo `kg`) |
| `productos` | `nombre`, `categoriaId`, `unidadId` | La unidad no se puede cambiar una vez creado el producto |
| `proveedores` | `nombre`, `correo` (opcional) | Sin correo no se le pueden enviar cotizaciones |

Tipos: `nombre`, `abreviatura` y `correo` son texto (el correo se valida y se guarda en minúsculas); `puntoId`, `categoriaId` y `unidadId` son ids de otros catálogos; `numero` es un entero positivo.

