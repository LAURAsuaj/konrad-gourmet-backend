# Despliegue y operación

## Cómo se despliega

El sistema son **dos contenedores independientes** que comparten una misma base de datos externa (Supabase):

| Servicio | Imagen | Qué hace |
|---|---|---|
| `api` | `Dockerfile.api` | La API HTTP y el publicador de eventos |
| `cron` | `Dockerfile.cron` | Los procesos automáticos y el publicador de eventos. **Ejecute una sola instancia por entorno** |

Ambas imágenes parten de `node:22-alpine`, instalan solo las dependencias de producción, corren sin privilegios de root y traen un `HEALTHCHECK`. El `docker-compose.yml` las ejecuta además con el sistema de archivos en solo lectura, sin capacidades de Linux y con `no-new-privileges`.

> Las imágenes se construyen y verifican en cada cambio mediante el CI (que comprueba, entre otras cosas, que `bcrypt` carga dentro de Alpine). Arrancarlas con `docker compose` y datos reales es algo que debe validarse en el primer despliegue.

## Paso a paso con Docker Compose

Requisitos del servidor: Docker Engine con Compose v2, acceso a Internet hacia Supabase y los servicios externos, y un certificado TLS.

1. **Obtenga el código** en el servidor: `git clone` del repositorio.
2. **Configure `.env`** a partir de `.env.example` ([Configuración](CONFIGURACION.md)). Use los valores de producción de la lista de verificación de más abajo.
3. **Aplique el esquema** una sola vez: pegue `src/infrastructure/database/schema.sql` en el SQL Editor de Supabase.
4. **Coloque el certificado TLS** en `./certs/fullchain.pem` y `./certs/privkey.pem` (o cambie la ruta con `CERTS_DIR`). Para una prueba en staging puede crear uno autofirmado:
   ```bash
   openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/privkey.pem -out certs/fullchain.pem -days 30 -subj "/CN=localhost"
   ```
   Si un proxy o balanceador termina TLS 1.3 delante de la API, quite `HTTPS_CERT_PATH`, `HTTPS_KEY_PATH` y el volumen de certificados del `docker-compose.yml`, y defina `TRUST_PROXY=true`.
5. **Levante los servicios:**
   ```bash
   docker compose up -d --build
   ```
6. **Verifique que quedaron sanos:**
   ```bash
   docker compose ps          # ambos deben aparecer como "healthy"
   docker compose logs -f
   ```
7. **Cree el primer administrador** (una sola vez):
   ```bash
   docker compose run --rm -e ADMIN_NOMBRE="Nombre" -e ADMIN_CORREO=admin@empresa.com -e ADMIN_PASSWORD='Clave12345' api npm run admin:crear
   ```
8. **Pruebe** `https://SU-DOMINIO:8443/salud` (el puerto público se cambia con `API_PUBLIC_PORT`).

## TLS

En producción la API **no arranca** sin una de estas dos opciones:

| Opción | Configuración |
|---|---|
| La API termina TLS | `HTTPS_CERT_PATH` y `HTTPS_KEY_PATH`. Acepta solo TLS 1.3 |
| Un proxy termina TLS | `TRUST_PROXY=true`. La API rechaza (426) las peticiones que no lleguen por TLS; `/salud` queda exenta para las sondas internas |

Hacia la base de datos, el correo y los servicios externos se exige TLS 1.3 (`TLS_MIN_VERSION`), y no se envían credenciales por conexiones sin cifrar.

## Operación diaria

| Tarea | Cómo |
|---|---|
| Ver el estado | `docker compose ps` y `GET /salud` |
| Ver los logs de los contenedores | `docker compose logs -f api` o `cron` |
| Ver errores del sistema | `GET /api/v1/logs?nivel=ERROR` (Administrador) |
| Ver quién hizo qué | `GET /api/v1/auditoria` (Administrador) |
| Reiniciar | `docker compose restart api cron` (necesario tras cambiar el `.env`) |
| Actualizar a una versión nueva | `git pull` y `docker compose up -d --build` |
| Ejecutar un proceso programado a mano | `docker compose exec cron node cron/worker.js --ejecutar=descuento_diario` (o `consultar_tendencias`, `reintentar_precios`) |
| Cambiar la hora del descuento o los rangos de validación | `PUT /api/v1/reglas/:clave`; no requiere reiniciar |

### Eventos atascados

Si el correo o un servicio externo estuvo caído mucho tiempo, un evento puede agotar sus reintentos y quedar `FALLIDO`. Para verlos, en el SQL Editor de Supabase:

```sql
SELECT id, tipo, intentos, ultimo_error, creado_en FROM outbox WHERE estado = 'FALLIDO' ORDER BY creado_en;
```

Cuando el servicio ya funcione, se reintentan con:

```sql
UPDATE outbox SET estado = 'PENDIENTE', intentos = 0, disponible_en = now(), bloqueado_hasta = NULL WHERE estado = 'FALLIDO';
```

### Rotación de secretos

- Cambiar `JWT_SECRET` invalida todas las sesiones abiertas: los usuarios deben iniciar sesión de nuevo.
- Las contraseñas de los usuarios no dependen de `JWT_SECRET`. **Hoy no existe una ruta para cambiar la contraseña de un usuario** (el SRS no la contempla): por eso conviene crear el Administrador inicial y los usuarios con contraseñas robustas desde el principio.
- Tras rotar la clave `service_role`, la contraseña de la base de datos o las credenciales SMTP, actualice el `.env` y reinicie.

### Respaldo y recuperación

Los datos viven en Supabase. Compruebe qué respaldo incluye su plan (los automáticos y la recuperación a un punto en el tiempo dependen del plan contratado) y pruebe restaurar uno antes de necesitarlo. La auditoría y el log de errores forman parte de esos datos.

## Integración continua

El archivo `.github/workflows/ci.yml` se ejecuta en cada subida a `main`, en cada Pull Request y a mano desde la pestaña Actions de GitHub:

1. **Pruebas automáticas:** instala dependencias, levanta PostgreSQL 16 y ejecuta `npm test`.
2. **Imágenes Docker:** valida `docker-compose.yml`, construye las dos imágenes y comprueba que sus módulos nativos cargan.

El CI no despliega: publicar las imágenes y desplegarlas automáticamente depende de dónde se aloje el sistema y queda como siguiente paso.

## Lista de verificación para producción

Marque cada punto antes de salir:

**Configuración**

- [ ] `NODE_ENV=production`.
- [ ] `DB_SSL=true` y `DB_SSL_REJECT_UNAUTHORIZED=true`, con el certificado CA de Supabase en `DB_SSL_CA`.
- [ ] `TLS_MIN_VERSION=TLSv1.3`.
- [ ] `JWT_SECRET` nuevo, aleatorio y de al menos 32 caracteres (no el de desarrollo).
- [ ] TLS de la API: `HTTPS_CERT_PATH`/`HTTPS_KEY_PATH` con un certificado real, o `TRUST_PROXY=true` detrás de un proxy TLS 1.3.
- [ ] `CORS_ORIGINS` con el dominio real del frontend y nada más.
- [ ] `DB_POOL_MAX` coherente con el límite de conexiones del pooler de Supabase (la API y el cron cuentan por separado).

**Servicios externos**

- [ ] SMTP real (`SMTP_*`) y remitente (`CORREO_REMITENTE`); probado el envío de una cotización.
- [ ] APIs reales del Ministerio de Comercio y de redes sociales, con su credencial. **Confirmar que su formato de respuesta coincide con el que asumen los adaptadores** (está descrito al inicio de `MinisterioComercioAdapter.js` y `RedesSocialesAdapter.js`).
- [ ] Sin las variables del simulador (`http://127.0.0.1:4010`); `scripts/mockServicios.js` no se usa en producción.

**Negocio**

- [ ] Rangos de `rangos_validacion_cotizacion` confirmados con el área de compras (los iniciales son una propuesta).
- [ ] Catálogos, usuarios y reglas cargados. El Administrador y los usuarios se crean con contraseñas robustas propias (no las de los ejemplos de esta documentación).
- [ ] Decidido si se admite cotizar solicitudes `EN TRÁMITE` (`estados.js`).

**Operación**

- [ ] Una sola instancia del contenedor `cron`.
- [ ] Respaldo de Supabase verificado según el plan contratado.
- [ ] `docker compose ps` con ambos servicios `healthy`.
- [ ] Alguien responsable de revisar los logs de errores y los eventos `FALLIDO`.

## Problemas frecuentes en el despliegue

| Síntoma | Causa probable |
|---|---|
| La API no arranca en producción y menciona `HTTPS_CERT_PATH` | Falta TLS: configure el certificado o `TRUST_PROXY=true` |
| La API no arranca y menciona `DB_SSL` o `TLS_MIN_VERSION` | En producción deben ser `true` y `TLSv1.3` |
| `docker compose` dice que falta `.env` | Cree el archivo a partir de `.env.example` |
| `self-signed certificate in certificate chain` | Falta `DB_SSL_CA` con el certificado de Supabase |
| Errores de `connection timeout` a la base de datos | Se usa la conexión directa de Supabase (IPv6) en lugar del Session pooler, o se superó el límite de conexiones |
| Las cotizaciones responden 503 | El correo no puede enviarse: revise `SMTP_*` y el log de errores |
| `valorTotalSugerido` queda vacío | El servicio del Ministerio no responde o no devuelve el precio de algún producto: revise el log de errores |
| El cron no ejecuta el descuento | Revise `docker compose logs cron`; el `HEALTHCHECK` marca el contenedor no saludable si el proceso dejó de latir |
