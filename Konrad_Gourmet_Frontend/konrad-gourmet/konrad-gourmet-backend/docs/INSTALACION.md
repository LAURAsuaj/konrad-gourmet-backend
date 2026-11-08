# Instalación

Guía para poner el proyecto a funcionar en un computador de desarrollo. Los comandos de Windows son para PowerShell.

## 1. Requisitos

| Qué | Detalle |
|---|---|
| Node.js | Versión 20 o superior (se probó con la 22). Compruebe con `node -v` |
| Git | Para clonar el repositorio. Compruebe con `git --version` |
| Supabase | Un proyecto propio. Un plan gratuito sirve para desarrollo |

## 2. Obtener el código e instalar dependencias

```bash
git clone https://github.com/LAURAsuaj/konrad-gourmet-backend.git
cd konrad-gourmet-backend
npm install
```

`npm install` también descarga una base PostgreSQL de pruebas (solo para desarrollo) de unos 100 MB.

## 3. Datos de Supabase

En su proyecto de Supabase reúna tres datos:

1. **Cadena de conexión:** botón **Connect** → método **Session pooler** (puerto 5432). Se ve así: `postgresql://postgres.PROYECTO:[YOUR-PASSWORD]@aws-0-REGION.pooler.supabase.com:5432/postgres`. Reemplace `[YOUR-PASSWORD]` por su contraseña, **sin los corchetes**.
   - **No use la conexión directa** (`db.PROYECTO.supabase.co`): solo responde por IPv6 y desde la mayoría de redes da `connection timeout`.
   - Si la contraseña tiene símbolos (`@`, `#`, `/`, `:`, `%`), cámbiela por una solo con letras y números (Project Settings → Database → Reset database password).
2. **URL del proyecto:** `https://PROYECTO.supabase.co` (Project Settings → API).
3. **Clave `service_role`:** Project Settings → API Keys. Es secreta.

## 4. Crear el archivo `.env`

**Copie** la plantilla (no la renombre: `.env.example` se conserva en el repositorio):

```bash
cp .env.example .env          # Windows: copy .env.example .env
```

Complete al menos estas variables:

```env
DATABASE_URL=postgresql://postgres.PROYECTO:SuClave@aws-0-REGION.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=la-clave-service-role
JWT_SECRET=un-secreto-largo-y-aleatorio-de-32-o-mas-caracteres
DB_SSL_REJECT_UNAUTHORIZED=false
```

Genere el `JWT_SECRET` con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`DB_SSL_REJECT_UNAUTHORIZED=false` es un atajo **solo para desarrollo**: la conexión sigue cifrada, pero no se verifica la identidad del servidor. Para verificarla, descargue el certificado en Database Settings → SSL Configuration, conviértalo a una sola línea (cada salto de línea por `\n`) y póngalo en `DB_SSL_CA`, **quitando la línea `DB_SSL_REJECT_UNAUTHORIZED=false`** (o poniéndola en `true`). También puede pegarlo en varias líneas **entre comillas dobles**; sin comillas, el `.env` solo lee la primera línea del certificado y la conexión falla. Todas las variables están descritas en [Configuración](CONFIGURACION.md).

## 5. Crear las tablas

Abra **SQL Editor** en Supabase, pegue todo el contenido de `src/infrastructure/database/schema.sql` y pulse **Run**. Debe responder `Success. No rows returned`. Se puede ejecutar varias veces sin problema. (Alternativa con `psql` instalado: `npm run db:schema`.)

## 6. Crear el primer administrador

Sin administrador nadie puede crear cuentas. La contraseña debe tener al menos 8 caracteres, con al menos una mayúscula, una minúscula y un número.

```bash
# Linux / Mac
ADMIN_NOMBRE="Su Nombre" ADMIN_CORREO=admin@empresa.com ADMIN_PASSWORD='Clave12345' npm run admin:crear
```

```powershell
# Windows (PowerShell)
$env:ADMIN_NOMBRE="Su Nombre"; $env:ADMIN_CORREO="admin@empresa.com"; $env:ADMIN_PASSWORD="Clave12345"; npm run admin:crear
```

Debe responder `Administrador creado: admin@empresa.com`. El correo es solo su nombre de usuario en este sistema: no tiene relación con su cuenta de Supabase ni de GitHub.

## 7. Arrancar

En dos terminales distintas, dentro de la carpeta del proyecto:

```bash
npm start              # la API
npm run start:cron     # los procesos automáticos (puede dejarlo apagado en la primera prueba)
```

La API debe mostrar `Konrad Gourmet escuchando en el puerto 3000`. Compruebe `http://localhost:3000/salud`: debe responder `{"datos":{"estado":"ok"}}`.

## 8. Probar la API desde PowerShell

Pegue estas dos funciones (en una terminal nueva, mientras la API corre):

```powershell
function Entrar($correo, $clave) {
  $r = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/v1/auth/login -ContentType 'application/json' -Body (@{correo=$correo; password=$clave} | ConvertTo-Json)
  @{ Authorization = "Bearer $($r.datos.token)" }
}
function Api($metodo, $ruta, $cuerpo) {
  $p = @{ Method=$metodo; Uri="http://localhost:3000/api/v1/$ruta"; Headers=$h; ContentType='application/json' }
  if ($cuerpo) { $p.Body = ($cuerpo | ConvertTo-Json -Depth 6) }
  try { (Invoke-RestMethod @p).datos } catch { Write-Host $_.ErrorDetails.Message -ForegroundColor Red }
}
```

Cargue datos básicos como Administrador (la sesión dura 30 minutos; si expira, repita la primera línea):

```powershell
$h = Entrar 'admin@empresa.com' 'Clave12345'
$punto = Api Post 'catalogos/puntos' @{ nombre='Chapinero' }
$kg    = Api Post 'catalogos/unidades' @{ nombre='kilogramo'; abreviatura='kg' }
$cat   = Api Post 'catalogos/categorias' @{ nombre='Granos' }
$arroz = Api Post 'catalogos/productos' @{ nombre='Arroz'; categoriaId=$cat.id; unidadId=$kg.id }
$prov  = Api Post 'catalogos/proveedores' @{ nombre='Proveedor A'; correo='proveedor@correo.com' }
$mesa  = Api Post 'catalogos/mesas' @{ puntoId=$punto.id; numero=1 }
$jefe  = Api Post 'usuarios' @{ nombre='Jefe Cocina'; correo='jefe@empresa.com'; password='Clave1234'; rol='JEFE_COCINA'; puntoId=$punto.id }
```

Cada comando imprime lo que creó, con su `id`. El resto de las rutas está en la [Referencia de la API](API.md) y los pasos de negocio en [Flujos](FLUJOS.md).

## 9. Servicios externos en desarrollo

Parte del flujo depende de servicios externos. Sin ellos funciona el login, los catálogos, el menú, los pedidos, el inventario y las alarmas (el aviso por correo fallará y se reintentará), pero **no** se pueden generar cotizaciones (exigen enviar el correo) ni clasificarlas (exigen el precio sugerido).

**Precio sugerido (SOAP) y tendencias: simulador local.** En una terminal aparte:

```bash
node scripts/mockServicios.js
```

y agregue al `.env` (use `127.0.0.1`, no `localhost`), reiniciando la API después:

```env
MINCOMERCIO_API_URL=http://127.0.0.1:4010/sipsaWS/SrvSipsaUpraBeanService
REDES_API_URL=http://127.0.0.1:4010
REDES_API_TOKEN=token-de-prueba
```

El simulador imita al servicio SOAP de SIPSA (DANE): publica su WSDL en la misma dirección con `?WSDL` y responde la operación `promediosSipsaCiudad` con 23 productos de nombres al estilo SIPSA en 4 ciudades y un historial de 20 días. Pedir `Arroz` devuelve 4.500 (promedio de «Arroz de primera» y «Arroz segunda»), `Pollo` 12.000, `Papa` 3.200 y `Carne` 28.000, por kilogramo. Un producto que no esté en su lista (por ejemplo `Chocolate`) no tiene precio, como pasaría con el servicio real. Solo sirve para desarrollo.

El mismo simulador entrega las **tendencias de redes sociales** (`GET /tendencias`, con `Authorization: Bearer`): 28 términos de gastronomía en 4 fuentes (Instagram, TikTok, YouTube y X) con puntaje, variación frente al día anterior y número de menciones. Los puntajes cambian cada día y son iguales durante todo el día, de modo que la demostración es repetible. Algunos términos contienen productos del menú («Arroz con coco», «Pollo al curry», «Papas rústicas») y generan promociones combinadas con los más solicitados; otros no («Brownie vegano») y generan promociones solo de tendencia. Para mostrar qué pasa cuando la API de redes no está disponible, inícielo con `node scripts/mockServicios.js --redes-caidas`: las tendencias responden 503 y el sistema promociona solo los productos más solicitados (el servicio de precios sigue funcionando). Con `--demora=17` imita la lentitud del servicio de precios real.

**Comprobar el servicio de precios.** Con la URL configurada, este comando lee la definición del servicio (muestra sus parámetros de entrada) y consulta el precio de algunos productos con las mismas clases del sistema. Informa cuántos bytes leyó, cuántos registros guardó, de qué fechas, cuántos productos y ciudades ofrece y cómo se llaman los productos:

```bash
node scripts/probarSipsa.js
node scripts/probarSipsa.js Arroz Pollo Yuca
node scripts/probarSipsa.js --inspeccion
node scripts/probarSipsa.js --crudo
```

`--inspeccion` analiza además el orden y el contenido del principio de la respuesta; `--crudo` incluye ese análisis y muestra el principio de la respuesta SOAP sin interpretar; `--operacion=<nombre>` inspecciona otra operación del servicio. Ejecute el script directamente con `node`: en PowerShell, `npm run sipsa:probar -- --crudo` pierde las opciones. Con el servicio real la prueba tarda cerca de 20 segundos porque el servicio tarda en empezar a responder.

**Servicio real del DANE (opcional).** Su WSDL está en `http://appweb.dane.gov.co/sipsaWS/SrvSipsaUpraBeanService?WSDL`, pero el servicio también responde por HTTPS, que es lo que debe usar: `MINCOMERCIO_API_URL=https://appweb.dane.gov.co/sipsaWS/SrvSipsaUpraBeanService` (`MINCOMERCIO_PERMITIR_HTTP` queda en `false`). Sus precios son mayoristas agrícolas por kilogramo y no incluyen todos los productos de un restaurante: los que no existan quedan sin precio sugerido. Ejecute `node scripts/probarSipsa.js` para ver la lista de productos que ofrece.

**Correo: buzón de pruebas.** Cree una cuenta gratuita en <https://ethereal.email> (recibe los correos y no los entrega a nadie) y complete:

```env
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=el-usuario-de-ethereal
SMTP_PASS=la-contraseña-de-ethereal
```

## 10. Ejecutar las pruebas

```bash
npm test
```

Tarda unos 2 minutos. Use una terminal normal (no de administrador).

## Problemas frecuentes

| Mensaje | Causa y solución |
|---|---|
| `Faltan variables de entorno obligatorias` | Falta alguna de `DATABASE_URL`, `JWT_SECRET`, `SUPABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY` en el `.env` |
| `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL` | `SUPABASE_URL` no empieza por `https://` |
| `password authentication failed for user "postgres"` | Con el pooler el usuario es `postgres.PROYECTO`, no `postgres`; o la contraseña no coincide. Compruebe también que `DATABASE_URL` aparece una sola vez en el `.env` |
| `Connection terminated due to connection timeout`, `ENETUNREACH` o `ENOTFOUND` | Está usando la conexión directa (solo IPv6). Cambie a la cadena del Session pooler |
| `self-signed certificate in certificate chain` | Falta el certificado en `DB_SSL_CA`, o está mal pegado (en varias líneas **sin comillas**), o no es el de su proyecto. En desarrollo puede usar `DB_SSL_REJECT_UNAUTHORIZED=false` |
| `tlsv1 alert protocol version` | Un servicio local no admite TLS 1.3: ponga `TLS_MIN_VERSION=TLSv1.2` solo en desarrollo |
| `relation "usuario" does not exist` | No se ejecutó `schema.sql` (paso 5) |
| `Ya existe un Administrador` | Ya lo creó; continúe con el paso 7 |
| `Falta SMTP_HOST en la configuración` | No hay correo configurado: las alarmas lo registran y reintentan; las cotizaciones no se pueden generar |
| `NO_AUTENTICADO`, "La sesión expiró" | El token venció (30 minutos): inicie sesión de nuevo |
| 429 `DEMASIADOS_INTENTOS` | Demasiados inicios de sesión fallidos desde la misma IP: espere 15 minutos |
| `npm test` no arranca la base | Ejecute en una terminal normal, no como administrador |
