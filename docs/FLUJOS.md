# Referencia de la API

API REST de Konrad Gourmet. Esta referencia describe las **39 rutas** de `/api/v1` y la ruta de salud, con ejemplos tomados de respuestas reales del sistema.

> Los ejemplos usan datos de prueba. Los identificadores (`<id>`) son UUID que entrega la propia API. Las listas se muestran abreviadas: la respuesta real puede traer más elementos.

## Convenciones

| Tema | Detalle |
|---|---|
| URL base | `/api/v1` (la ruta de salud es `/salud`, sin prefijo) |
| Formato | JSON en ambos sentidos (`Content-Type: application/json`). Cuerpo máximo: 100 KB |
| Autenticación | Cabecera `Authorization: Bearer <token>`, obtenido en `POST /api/v1/auth/login` |
| Identificadores | UUID, salvo auditoría y logs (numéricos) |
| Fechas | ISO 8601 en UTC (`2026-11-05T05:03:02.062Z`). Los plazos de cotización usan `AAAA-MM-DD` (día en Colombia) |
| Paginación | `limite` (máximo 200, por defecto 50) y `offset`; las listas paginadas devuelven `total` |
| CORS | Solo los orígenes de `CORS_ORIGINS` |
| Transporte | TLS 1.3 obligatorio en producción |

### Respuesta exitosa

```json
{ "datos": { } }
```

### Respuesta de error

```json
{ "error": { "codigo": "VALIDACION", "mensaje": "El nombre es obligatorio" } }
```

| HTTP | `codigo` | Cuándo ocurre |
|---|---|---|
| 400 | `VALIDACION` | Datos de entrada inválidos o incompletos |
| 401 | `CREDENCIALES_INVALIDAS` | Correo o contraseña incorrectos |
| 401 | `NO_AUTENTICADO` | Falta el token, es inválido, venció o la sesión ya no es válida |
| 403 | `PROHIBIDO` | El rol del usuario no permite la operación (queda auditado como `ACCESO_DENEGADO`) |
| 404 | `NO_ENCONTRADO` | El recurso no existe |
| 409 | `CONFLICTO` | Duplicado, o estado que no admite la operación |
| 413 | `CUERPO_DEMASIADO_GRANDE` | El cuerpo supera los 100 KB |
| 423 | `CUENTA_BLOQUEADA` | La cuenta está bloqueada por intentos fallidos |
| 426 | `TLS_REQUERIDO` | En producción, petición sin TLS |
| 429 | `DEMASIADOS_INTENTOS` | Límite de intentos de inicio de sesión (cabecera `Retry-After`) |
| 500 | `ERROR_INTERNO` | Error inesperado; el detalle queda en el log, no en la respuesta |
| 503 | `SERVICIO_NO_DISPONIBLE` | Un servicio externo (por ejemplo el correo) no respondió |

Las respuestas de error ejemplo, tomadas del sistema:

`401`
```json
{
  "error": {
    "codigo": "CREDENCIALES_INVALIDAS",
    "mensaje": "Credenciales inválidas"
  }
}
```

`403`
```json
{
  "error": {
    "codigo": "PROHIBIDO",
    "mensaje": "No tiene permisos para realizar esta acción"
  }
}
```

`400`
```json
{
  "error": {
    "codigo": "VALIDACION",
    "mensaje": "El nombre es obligatorio"
  }
}
```

`409`
```json
{
  "error": {
    "codigo": "CONFLICTO",
    "mensaje": "La categoría \"granos\" ya existe en el catálogo"
  }
}
```

## Roles

| Rol | Quién es | Alcance |
|---|---|---|
| `ADMINISTRADOR` | Administrador del sistema | Usuarios, catálogos, reglas, auditoría y logs |
| `JEFE_COCINA` | Jefe de cocina de un punto | Menú, inventario, alarmas y solicitudes de alimentos de SU punto |
| `MESERO` | Mesero de un punto | Pedidos de las mesas de SU punto |
| `AUXILIAR_COMPRAS` | Área de compras | Consulta solicitudes y genera cotizaciones a proveedores |
| `DIRECTOR_COMPRAS` | Área de compras | Registra valores de cotización y genera órdenes de compra |
| `DIRECTOR_COMERCIAL` | Dirección comercial | Tablero de control y promociones |

Los valores de cotizaciones y órdenes de compra solo los ven los roles del área de compras.

## Permisos por ruta

| Ruta | `JEFE_COCINA` | `MESERO` | `AUXILIAR_COMPRAS` | `DIRECTOR_COMPRAS` | `DIRECTOR_COMERCIAL` | `ADMINISTRADOR` |
|---|---|---|---|---|---|---|
| `POST /api/v1/auth/login` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `GET /api/v1/auth/sesion` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `POST /api/v1/auth/refrescar` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `POST /api/v1/auth/logout` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `POST /api/v1/usuarios` | — | — | — | — | — | ✔ |
| `GET /api/v1/usuarios` | — | — | — | — | — | ✔ |
| `POST /api/v1/usuarios/:id/desbloquear` | — | — | — | — | — | ✔ |
| `GET /api/v1/catalogos` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `GET /api/v1/catalogos/:catalogo` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `POST /api/v1/catalogos/:catalogo` | — | — | — | — | — | ✔ |
| `PATCH /api/v1/catalogos/:catalogo/:id` | — | — | — | — | — | ✔ |
| `DELETE /api/v1/catalogos/:catalogo/:id` | — | — | — | — | — | ✔ |
| `GET /api/v1/reglas` | — | — | — | — | — | ✔ |
| `PUT /api/v1/reglas/:clave` | — | — | — | — | — | ✔ |
| `GET /api/v1/menu` | ✔ | ✔ | — | — | — | — |
| `POST /api/v1/menu/platos` | ✔ | — | — | — | — | — |
| `PATCH /api/v1/menu/platos/:id` | ✔ | — | — | — | — | — |
| `POST /api/v1/pedidos` | — | ✔ | — | — | — | — |
| `GET /api/v1/pedidos` | ✔ | ✔ | — | — | — | — |
| `PUT /api/v1/inventario` | ✔ | — | — | — | — | ✔ |
| `GET /api/v1/inventario` | ✔ | — | — | — | — | ✔ |
| `GET /api/v1/inventario/alarmas` | ✔ | — | — | — | — | — |
| `POST /api/v1/solicitudes` | ✔ | — | — | — | — | — |
| `GET /api/v1/solicitudes` | — | — | ✔ | ✔ | — | — |
| `GET /api/v1/solicitudes/:id` | — | — | ✔ | ✔ | — | — |
| `GET /api/v1/solicitudes/:id/cotizaciones-opcionadas` | — | — | — | ✔ | — | — |
| `POST /api/v1/cotizaciones` | — | — | ✔ | — | — | — |
| `GET /api/v1/cotizaciones` | — | — | ✔ | ✔ | — | — |
| `GET /api/v1/cotizaciones/:id` | — | — | ✔ | ✔ | — | — |
| `PUT /api/v1/cotizaciones/:id/valores` | — | — | — | ✔ | — | — |
| `POST /api/v1/ordenes-compra` | — | — | — | ✔ | — | — |
| `GET /api/v1/ordenes-compra` | — | — | ✔ | ✔ | — | — |
| `GET /api/v1/ordenes-compra/:id` | — | — | ✔ | ✔ | — | — |
| `GET /api/v1/tablero` | — | — | — | — | ✔ | — |
| `GET /api/v1/promociones` | ✔ | — | — | — | ✔ | ✔ |
| `GET /api/v1/auditoria` | — | — | — | — | — | ✔ |
| `GET /api/v1/auditoria/:id` | — | — | — | — | — | ✔ |
| `GET /api/v1/logs` | — | — | — | — | — | ✔ |
| `GET /api/v1/logs/:id` | — | — | — | — | — | ✔ |
| `GET /salud` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

`POST /api/v1/auth/login` y `GET /salud` no requieren token. La matriz sale del catálogo de operaciones del código (`src/facade/operaciones.js`).

## Salud

### GET /salud

Verifica que la API responde y que la base de datos está disponible. Es pública, no requiere token y la usan los `HEALTHCHECK` de Docker.

**Respuesta 200**
```json
{
  "datos": {
    "estado": "ok"
  }
}
```

Responde 503 si la base de datos no está disponible.

## Sesión (CU-01)

### POST /api/v1/auth/login

Inicia sesión y entrega un token JWT con el rol del usuario.

**Roles:** Público

**Cuerpo**
```json
{
  "correo": "admin@konrad.com",
  "password": "Clave12345"
}
```

**Respuesta 200**
```json
{
  "datos": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
    "usuario": {
      "id": "696e8b40-4fb6-4384-b835-e1b4969aac41",
      "nombre": "Admin",
      "correo": "admin@kg.co",
      "rol": "ADMINISTRADOR",
      "puntoId": null
    }
  }
}
```

- Es la única ruta pública (junto a `GET /salud`).
- El token se envía después en la cabecera `Authorization: Bearer <token>`.
- Un usuario inexistente y una contraseña incorrecta dan exactamente la misma respuesta.
- Tras 3 intentos fallidos (regla `max_intentos_login`) la cuenta se bloquea hasta que un Administrador la habilite.
- Se limita a 10 intentos fallidos por IP cada 15 minutos (`LOGIN_RATE_LIMIT_*`); después responde 429 con `Retry-After`.

**Errores frecuentes:** 401 `CREDENCIALES_INVALIDAS`, 423 `CUENTA_BLOQUEADA`, 429 `DEMASIADOS_INTENTOS`

### GET /api/v1/auth/sesion

Devuelve los datos de la sesión vigente, sin consultar la base de datos.

**Roles:** Cualquier usuario autenticado

**Respuesta 200**
```json
{
  "datos": {
    "usuario": {
      "id": "696e8b40-4fb6-4384-b835-e1b4969aac41",
      "nombre": "Admin",
      "correo": "admin@kg.co",
      "rol": "ADMINISTRADOR",
      "puntoId": null,
      "expira": 1793856780
    }
  }
}
```

- `expira` es la fecha de vencimiento del token en segundos Unix.

**Errores frecuentes:** 401 `NO_AUTENTICADO`

### POST /api/v1/auth/refrescar

Renueva el token mientras el usuario esté activo (expiración por inactividad).

**Roles:** Cualquier usuario autenticado

**Respuesta 200**
```json
{
  "datos": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
    "usuario": {
      "id": "696e8b40-4fb6-4384-b835-e1b4969aac41",
      "nombre": "Admin",
      "correo": "admin@kg.co",
      "rol": "ADMINISTRADOR",
      "puntoId": null
    }
  }
}
```

- Llámela periódicamente mientras haya actividad (por ejemplo cada 10 minutos con tokens de 30).
- Si el usuario queda inactivo más que la vida del token, este vence y hay que iniciar sesión de nuevo.
- Revalida la cuenta: el token nuevo trae el rol y el punto vigentes; si la cuenta se bloqueó o inactivó, se rechaza.
- Una sesión no se puede renovar indefinidamente: a las 12 horas de iniciada hay que volver a entrar.

**Errores frecuentes:** 401 `NO_AUTENTICADO` (token vencido, cuenta ya no válida o sesión de duración máxima)

### POST /api/v1/auth/logout

Cierra la sesión y deja constancia en la auditoría.

**Roles:** Cualquier usuario autenticado

**Respuesta 200**
```json
{
  "datos": {
    "cerrada": true,
    "usuarioId": "696e8b40-4fb6-4384-b835-e1b4969aac41"
  }
}
```

- El token **no se invalida en el servidor**: el cliente debe descartarlo. El anterior sigue aceptándose hasta vencer (30 minutos por defecto).

**Errores frecuentes:** 401 `NO_AUTENTICADO`

## Usuarios (CU-01)

### POST /api/v1/usuarios

Crea un usuario y le asigna un rol.

**Roles:** `ADMINISTRADOR`

**Cuerpo**
```json
{
  "nombre": "Laura Mesera",
  "correo": "laura@konrad.com",
  "password": "Clave1234",
  "rol": "MESERO",
  "puntoId": "<id del punto>"
}
```

**Respuesta 201**
```json
{
  "datos": {
    "id": "0d60b08e-bf6f-4fbc-b78b-2eb832ec98a0",
    "nombre": "Laura Mesera",
    "correo": "laura@konrad.com",
    "rol": "MESERO",
    "puntoId": "cfa93703-d3dc-416b-9186-b66fde64d3bb",
    "bloqueado": false,
    "activo": true,
    "creadoEn": "2026-11-05T05:03:01.440Z"
  }
}
```

- Los roles `JEFE_COCINA` y `MESERO` requieren `puntoId`; los demás no deben llevarlo.
- La contraseña debe tener al menos 8 caracteres, combinar letras y números y no superar 72 bytes.
- El correo es único sin distinguir mayúsculas y se guarda en minúsculas.
- La respuesta nunca incluye la contraseña ni su hash.

**Errores frecuentes:** 400 `VALIDACION`, 409 `CONFLICTO` (correo repetido)

### GET /api/v1/usuarios

Lista todos los usuarios.

**Roles:** `ADMINISTRADOR`

**Respuesta 200**
```json
{
  "datos": [
    {
      "id": "696e8b40-4fb6-4384-b835-e1b4969aac41",
      "nombre": "Admin",
      "correo": "admin@kg.co",
      "rol": "ADMINISTRADOR",
      "puntoId": null,
      "bloqueado": false,
      "activo": true,
      "creadoEn": "2026-11-05T05:02:59.647Z"
    },
    {
      "id": "e609f68a-bc93-4478-a25e-0af10e6bf4c7",
      "nombre": "Auxiliar",
      "correo": "aux@kg.co",
      "rol": "AUXILIAR_COMPRAS",
      "puntoId": null,
      "bloqueado": false,
      "activo": true,
      "creadoEn": "2026-11-05T05:03:00.043Z"
    }
  ]
}
```

- No incluye contraseñas.

**Errores frecuentes:** 403 `PROHIBIDO`

### POST /api/v1/usuarios/:id/desbloquear

Habilita una cuenta bloqueada por intentos fallidos y reinicia su contador.

**Roles:** `ADMINISTRADOR`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `id` | ruta | Id del usuario |

**Respuesta 200**
```json
{
  "datos": {
    "id": "0d60b08e-bf6f-4fbc-b78b-2eb832ec98a0",
    "nombre": "Laura Mesera",
    "correo": "laura@konrad.com",
    "rol": "MESERO",
    "puntoId": "cfa93703-d3dc-416b-9186-b66fde64d3bb",
    "bloqueado": false,
    "activo": true,
    "creadoEn": "2026-11-05T05:03:01.440Z"
  }
}
```

**Errores frecuentes:** 404 `NO_ENCONTRADO`

## Parametrización (CU-04)

### GET /api/v1/catalogos

Lista los nombres de los catálogos disponibles.

**Roles:** Cualquier usuario autenticado

**Respuesta 200**
```json
{
  "datos": [
    "puntos",
    "mesas"
  ]
}
```

- Catálogos: `puntos`, `mesas`, `categorias`, `marcas`, `unidades`, `productos`, `proveedores`.
- Los campos de cada uno están en [Configuración](CONFIGURACION.md#catálogos).

### GET /api/v1/catalogos/:catalogo

Lista los valores de un catálogo (para llenar listas desplegables).

**Roles:** Cualquier usuario autenticado

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `catalogo` | ruta | Nombre del catálogo |
| `incluirInactivos` | consulta | `true` para ver también los inactivos (solo Administrador) |
| `puntoId` | consulta | Filtro de `mesas` |
| `categoriaId` | consulta | Filtro de `productos` |

**Respuesta 200**
```json
{
  "datos": [
    {
      "id": "81868d61-987a-4459-8b1d-f7315d9e2a5e",
      "nombre": "Arroz",
      "categoriaId": "d4b3edb3-aaba-4171-9abb-1b3d9f526361",
      "unidadId": "29923160-bda2-4b07-b5e9-a6565af6c713",
      "activo": true
    }
  ]
}
```

- Por defecto solo devuelve valores activos.
- Esta ruta no se registra en la auditoría (se consulta en cada formulario).

**Errores frecuentes:** 400 `VALIDACION` (catálogo inexistente)

### POST /api/v1/catalogos/:catalogo

Crea un valor en un catálogo.

**Roles:** `ADMINISTRADOR`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `catalogo` | ruta | Nombre del catálogo |

**Cuerpo**
```json
{
  "nombre": "Diana"
}
```

**Respuesta 201**
```json
{
  "datos": {
    "id": "d941f7ac-fe27-43d0-8bbe-3284077d6de1",
    "nombre": "Diana",
    "activo": true
  }
}
```

- Los campos del cuerpo dependen del catálogo.
- Los nombres no se repiten, sin distinguir mayúsculas.

**Errores frecuentes:** 400 `VALIDACION`, 409 `CONFLICTO`

### PATCH /api/v1/catalogos/:catalogo/:id

Modifica un valor o lo activa/inactiva con `activo`.

**Roles:** `ADMINISTRADOR`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `catalogo` | ruta | Nombre del catálogo |
| `id` | ruta | Id del valor |

**Cuerpo**
```json
{
  "nombre": "Diana Premium"
}
```

**Respuesta 200**
```json
{
  "datos": {
    "id": "d941f7ac-fe27-43d0-8bbe-3284077d6de1",
    "nombre": "Diana Premium",
    "activo": true
  }
}
```

- La unidad de un producto y el punto de una mesa no se pueden modificar.

**Errores frecuentes:** 400 `VALIDACION`, 404 `NO_ENCONTRADO`, 409 `CONFLICTO`

### DELETE /api/v1/catalogos/:catalogo/:id

Elimina un valor sin uso.

**Roles:** `ADMINISTRADOR`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `catalogo` | ruta | Nombre del catálogo |
| `id` | ruta | Id del valor |

**Respuesta 200**
```json
{
  "datos": {
    "id": "380df61c-9b6e-4e3e-ba20-6f473c2ba1be",
    "eliminado": true
  }
}
```

- Si otros registros lo usan, no se elimina: responde 409 y solo puede inactivarse con `PATCH` y `{"activo": false}`.

**Errores frecuentes:** 404 `NO_ENCONTRADO`, 409 `CONFLICTO` (en uso)

### GET /api/v1/reglas

Lista las reglas parametrizables del sistema con su valor actual.

**Roles:** `ADMINISTRADOR`

**Respuesta 200**
```json
{
  "datos": [
    {
      "clave": "alarma_porcentaje",
      "valor": 25,
      "descripcion": "Porcentaje de la cantidad de referencia en el que se dispara la alarma de stock bajo (CU-07)",
      "actualizadoEn": "2026-11-05T05:02:58.454Z"
    },
    {
      "clave": "criterio_mejor_proveedor",
      "valor": {
        "metrica": "ordenes_compra"
      },
      "descripcion": "Criterio del KPI mejor proveedor del tablero BAM (CU-14)",
      "actualizadoEn": "2026-11-05T05:02:58.454Z"
    }
  ]
}
```

- Reglas y valores válidos: [Configuración](CONFIGURACION.md#reglas-del-sistema).

### PUT /api/v1/reglas/:clave

Cambia el valor de una regla.

**Roles:** `ADMINISTRADOR`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `clave` | ruta | Clave de la regla |

**Cuerpo**
```json
{
  "valor": 25
}
```

**Respuesta 200**
```json
{
  "datos": {
    "clave": "alarma_porcentaje",
    "valor": 25,
    "descripcion": "Porcentaje de la cantidad de referencia en el que se dispara la alarma de stock bajo (CU-07)",
    "actualizadoEn": "2026-11-05T05:03:01.502Z"
  }
}
```

- El valor se valida y normaliza según la regla; una clave inventada se rechaza.
- El cambio se aplica a los demás módulos y al cron sin reiniciar.

**Errores frecuentes:** 400 `VALIDACION`

## Cocina: menú y pedidos (CU-02, CU-03)

### GET /api/v1/menu

Menú del punto del usuario.

**Roles:** `JEFE_COCINA`, `MESERO`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `incluirInactivos` | consulta | `true` para ver también los platos inactivos (solo Jefe de Cocina) |

**Respuesta 200**
```json
{
  "datos": [
    {
      "id": "5dd3c4ac-21df-4a61-b6cd-f6a07b0fbd6c",
      "puntoId": "cfa93703-d3dc-416b-9186-b66fde64d3bb",
      "nombre": "Pollo con arroz",
      "categoria": "Fuertes",
      "precio": 25000,
      "activo": true,
      "ingredientes": [
        {
          "productoId": "81868d61-987a-4459-8b1d-f7315d9e2a5e",
          "producto": "Arroz",
          "cantidadPorPorcion": 0.2,
          "unidadId": "29923160-bda2-4b07-b5e9-a6565af6c713",
          "unidad": "kg"
        },
        {
          "productoId": "d531fcd8-f334-4cf0-a6e4-2e5e963467a2",
          "producto": "Pollo",
          "cantidadPorPorcion": 0.3,
          "unidadId": "29923160-bda2-4b07-b5e9-a6565af6c713",
          "unidad": "kg"
        }
      ]
    }
  ]
}
```

- Esta ruta no se registra en la auditoría.

### POST /api/v1/menu/platos

Registra un plato en el punto del Jefe de Cocina, con sus ingredientes.

**Roles:** `JEFE_COCINA`

**Cuerpo**
```json
{
  "nombre": "Pollo con arroz",
  "categoria": "Fuertes",
  "precio": 25000,
  "ingredientes": [
    {
      "productoId": "<id>",
      "cantidadPorPorcion": 0.3,
      "unidadId": "<id>"
    },
    {
      "productoId": "<id>",
      "cantidadPorPorcion": 0.2,
      "unidadId": "<id>"
    }
  ]
}
```

**Respuesta 201**
```json
{
  "datos": {
    "id": "5dd3c4ac-21df-4a61-b6cd-f6a07b0fbd6c",
    "puntoId": "cfa93703-d3dc-416b-9186-b66fde64d3bb",
    "nombre": "Pollo con arroz",
    "categoria": "Fuertes",
    "precio": 25000,
    "activo": true,
    "ingredientes": [
      {
        "productoId": "81868d61-987a-4459-8b1d-f7315d9e2a5e",
        "producto": "Arroz",
        "cantidadPorPorcion": 0.2,
        "unidadId": "29923160-bda2-4b07-b5e9-a6565af6c713",
        "unidad": "kg"
      },
      {
        "productoId": "d531fcd8-f334-4cf0-a6e4-2e5e963467a2",
        "producto": "Pollo",
        "cantidadPorPorcion": 0.3,
        "unidadId": "29923160-bda2-4b07-b5e9-a6565af6c713",
        "unidad": "kg"
      }
    ]
  }
}
```

- Exige al menos un ingrediente: de ahí se calcula lo que se descuenta del inventario.
- La unidad de cada ingrediente debe ser la unidad del producto.
- El nombre no se repite dentro del punto.

**Errores frecuentes:** 400 `VALIDACION`, 409 `CONFLICTO`

### PATCH /api/v1/menu/platos/:id

Modifica o inactiva un plato del punto.

**Roles:** `JEFE_COCINA`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `id` | ruta | Id del plato |

**Cuerpo**
```json
{
  "precio": 27000
}
```

**Respuesta 200**
```json
{
  "datos": {
    "id": "5dd3c4ac-21df-4a61-b6cd-f6a07b0fbd6c",
    "puntoId": "cfa93703-d3dc-416b-9186-b66fde64d3bb",
    "nombre": "Pollo con arroz",
    "categoria": "Fuertes",
    "precio": 27000,
    "activo": true,
    "ingredientes": [
      {
        "productoId": "81868d61-987a-4459-8b1d-f7315d9e2a5e",
        "producto": "Arroz",
        "cantidadPorPorcion": 0.2,
        "unidadId": "29923160-bda2-4b07-b5e9-a6565af6c713",
        "unidad": "kg"
      },
      {
        "productoId": "d531fcd8-f334-4cf0-a6e4-2e5e963467a2",
        "producto": "Pollo",
        "cantidadPorPorcion": 0.3,
        "unidadId": "29923160-bda2-4b07-b5e9-a6565af6c713",
        "unidad": "kg"
      }
    ]
  }
}
```

- Acepta `nombre`, `categoria`, `precio`, `activo` e `ingredientes` (reemplaza la lista completa).

**Errores frecuentes:** 404 `NO_ENCONTRADO` (plato de otro punto)

### POST /api/v1/pedidos

Registra el pedido de una mesa del punto del Mesero.

**Roles:** `MESERO`

**Cuerpo**
```json
{
  "mesaId": "<id de la mesa>",
  "items": [
    {
      "platoId": "<id>",
      "cantidad": 60
    }
  ]
}
```

**Respuesta 201**
```json
{
  "datos": {
    "id": "4ea4b687-cac9-4064-969e-6d58e9a4b506",
    "fecha": "2026-11-05T05:03:01.527Z",
    "puntoId": "cfa93703-d3dc-416b-9186-b66fde64d3bb",
    "mesa": 1,
    "items": [
      {
        "platoId": "5dd3c4ac-21df-4a61-b6cd-f6a07b0fbd6c",
        "cantidad": 60,
        "plato": "Pollo con arroz"
      }
    ]
  }
}
```

- Las líneas repetidas del mismo plato se acumulan.
- El pedido queda disponible para la cocina y se descuenta del inventario en el siguiente descuento diario.

**Errores frecuentes:** 400 `VALIDACION` (mesa de otro punto, plato inactivo, cantidad inválida)

### GET /api/v1/pedidos

Pedidos del punto del usuario (por defecto, de las últimas 24 horas).

**Roles:** `JEFE_COCINA`, `MESERO`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `desde` | consulta | Fecha inicial (ISO 8601) |
| `hasta` | consulta | Fecha final (ISO 8601) |
| `limite` | consulta | Máximo 200, por defecto 50 |

**Respuesta 200**
```json
{
  "datos": [
    {
      "id": "4ea4b687-cac9-4064-969e-6d58e9a4b506",
      "fecha": "2026-11-05T05:03:01.527Z",
      "mesa": 1,
      "mesero": "Mesero",
      "descontado": false,
      "items": [
        {
          "platoId": "5dd3c4ac-21df-4a61-b6cd-f6a07b0fbd6c",
          "plato": "Pollo con arroz",
          "cantidad": 60
        }
      ]
    }
  ]
}
```

- `descontado` indica si el descuento diario ya lo procesó.

**Errores frecuentes:** 400 `VALIDACION` (rango de fechas inválido)

## Inventario y alarmas (CU-06, CU-07)

### PUT /api/v1/inventario

Carga o ajusta el inventario de un producto y evalúa la alarma de stock.

**Roles:** `JEFE_COCINA`, `ADMINISTRADOR`

**Cuerpo**
```json
{
  "productoId": "<id>",
  "cantidadActual": 20,
  "cantidadReferencia": 20
}
```

**Respuesta 200**
```json
{
  "datos": {
    "id": "a8ec0279-f1a0-4379-b405-a69c553983db",
    "puntoId": "cfa93703-d3dc-416b-9186-b66fde64d3bb",
    "productoId": "d531fcd8-f334-4cf0-a6e4-2e5e963467a2",
    "producto": "Pollo",
    "unidad": "kg",
    "cantidadActual": 20,
    "cantidadReferencia": 20,
    "alarma": "NINGUNA"
  }
}
```

- El Jefe de Cocina opera sobre su punto; el Administrador debe indicar además `puntoId`.
- `alarma` puede ser `NINGUNA`, `GENERADA`, `EXISTENTE` o `RESUELTA` (al reabastecer se cierra la alarma activa).

**Errores frecuentes:** 400 `VALIDACION`

### GET /api/v1/inventario

Inventario del punto con el porcentaje respecto a la cantidad de referencia.

**Roles:** `JEFE_COCINA`, `ADMINISTRADOR`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `puntoId` | consulta | Obligatorio solo para el Administrador |

**Respuesta 200**
```json
{
  "datos": [
    {
      "id": "c5807e11-768f-4ea5-a59e-562037a83e57",
      "productoId": "81868d61-987a-4459-8b1d-f7315d9e2a5e",
      "producto": "Arroz",
      "unidad": "kg",
      "cantidadActual": 200,
      "cantidadReferencia": 100,
      "porcentaje": 200,
      "enAlarma": false
    },
    {
      "id": "a8ec0279-f1a0-4379-b405-a69c553983db",
      "productoId": "d531fcd8-f334-4cf0-a6e4-2e5e963467a2",
      "producto": "Pollo",
      "unidad": "kg",
      "cantidadActual": 20,
      "cantidadReferencia": 20,
      "porcentaje": 100,
      "enAlarma": false
    }
  ]
}
```

### GET /api/v1/inventario/alarmas

Alarmas de stock bajo activas del punto del Jefe de Cocina.

**Roles:** `JEFE_COCINA`

**Respuesta 200**
```json
{
  "datos": [
    {
      "id": "e79fba63-5171-42e5-9469-9c30d4c40e87",
      "generadaEn": "2026-11-05T05:03:01.733Z",
      "producto": "Pollo",
      "unidad": "kg",
      "cantidadActual": 2,
      "cantidadReferencia": 20
    }
  ]
}
```

- Las alarmas **no se empujan en tiempo real**: la aplicación debe consultar esta ruta periódicamente.
- Una alarma se genera cuando la cantidad baja al 25 % o menos de la de referencia (regla `alarma_porcentaje`) y no se repite mientras siga activa.

## Solicitudes de alimentos (CU-05, CU-08)

### POST /api/v1/solicitudes

Registra una solicitud de alimentos por falta de stock.

**Roles:** `JEFE_COCINA`

**Cuerpo**
```json
{
  "items": [
    {
      "categoriaId": "<id>",
      "productoId": "<id>",
      "cantidad": 100,
      "unidadId": "<id>"
    },
    {
      "categoriaId": "<id>",
      "productoId": "<id>",
      "marcaId": "<id, opcional>",
      "cantidad": 50,
      "unidadId": "<id>"
    }
  ]
}
```

**Respuesta 201**
```json
{
  "datos": {
    "id": "72fb750c-b69c-483a-9a8d-821ce70d84d0",
    "consecutivo": 1,
    "estado": "PENDIENTE",
    "fecha": "2026-11-05T05:03:02.062Z",
    "puntoId": "cfa93703-d3dc-416b-9186-b66fde64d3bb",
    "items": 2
  }
}
```

- Queda en estado `PENDIENTE` con un consecutivo automático.
- El producto debe pertenecer a la categoría indicada y la unidad debe ser la del producto; no se repite el mismo producto con la misma marca.
- Después de responder, de forma asíncrona: se envía la confirmación por correo al solicitante y se consulta el precio sugerido al Ministerio de Comercio (`valorTotalSugerido` se llena cuando llega).

**Errores frecuentes:** 400 `VALIDACION`

### GET /api/v1/solicitudes

Lista las solicitudes de todos los puntos con filtros.

**Roles:** `AUXILIAR_COMPRAS`, `DIRECTOR_COMPRAS`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `desde` | consulta | Fecha inicial |
| `hasta` | consulta | Fecha final |
| `estado` | consulta | `PENDIENTE` o `EN TRÁMITE` |
| `puntoId` | consulta | Punto |
| `productoId` | consulta | Solicitudes que incluyen el producto |
| `marcaId` | consulta | Solicitudes que incluyen la marca |
| `limite` | consulta | Máximo 200, por defecto 50 |
| `offset` | consulta | Desplazamiento |

**Respuesta 200**
```json
{
  "datos": {
    "total": 1,
    "solicitudes": [
      {
        "id": "72fb750c-b69c-483a-9a8d-821ce70d84d0",
        "consecutivo": 1,
        "estado": "PENDIENTE",
        "fecha": "2026-11-05T05:03:02.062Z",
        "punto": "Chapinero",
        "solicitante": "Jefe",
        "items": 2,
        "valorTotalSugerido": 1050000
      }
    ]
  }
}
```

- Sin resultados devuelve `total: 0` y un `mensaje` informativo.

**Errores frecuentes:** 400 `VALIDACION`

### GET /api/v1/solicitudes/:id

Detalle de una solicitud: alimentos, valor sugerido y cotizaciones asociadas.

**Roles:** `AUXILIAR_COMPRAS`, `DIRECTOR_COMPRAS`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `id` | ruta | Id de la solicitud |

**Respuesta 200**
```json
{
  "datos": {
    "id": "72fb750c-b69c-483a-9a8d-821ce70d84d0",
    "consecutivo": 1,
    "estado": "PENDIENTE",
    "fecha": "2026-11-05T05:03:02.062Z",
    "punto": "Chapinero",
    "solicitante": "Jefe",
    "valorTotalSugerido": 1050000,
    "items": [
      {
        "id": "98e40043-fe1c-4963-b5b8-98776fc912c1",
        "categoria": "Granos",
        "producto": "Arroz",
        "marca": null,
        "cantidad": 100,
        "unidad": "kg",
        "precioSugeridoUnitario": 4500
      },
      {
        "id": "db1ba76f-b3e9-4de0-9c2a-184ea82e5393",
        "categoria": "Proteínas",
        "producto": "Pollo",
        "marca": null,
        "cantidad": 50,
        "unidad": "kg",
        "precioSugeridoUnitario": 12000
      }
    ],
    "cotizaciones": []
  }
}
```

**Errores frecuentes:** 404 `NO_ENCONTRADO`

### GET /api/v1/solicitudes/:id/cotizaciones-opcionadas

Cotizaciones OPCIONADAS de una solicitud, para elegir la mejor.

**Roles:** `DIRECTOR_COMPRAS`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `id` | ruta | Id de la solicitud |

**Respuesta 200**
```json
{
  "datos": {
    "cotizaciones": [
      {
        "id": "3ae41173-fc65-49a9-b152-84a5eb4943f3",
        "consecutivo": 1,
        "proveedor": "Proveedor A",
        "valorTotal": 1035000,
        "plazoMaximo": "2026-11-08",
        "alimentos": 2
      }
    ]
  }
}
```

- Si no hay ninguna devuelve una lista vacía y un `mensaje`.

## Cotizaciones (CU-09, CU-11, CU-12)

### POST /api/v1/cotizaciones

Genera la solicitud de cotización: crea el PDF, lo envía por correo al proveedor y registra la cotización.

**Roles:** `AUXILIAR_COMPRAS`

**Cuerpo**
```json
{
  "solicitudId": "<id>",
  "proveedorId": "<id>",
  "plazoMaximo": "2026-11-08",
  "detalleIds": [
    "<id de un alimento, opcional>"
  ]
}
```

**Respuesta 201**
```json
{
  "datos": {
    "id": "3ae41173-fc65-49a9-b152-84a5eb4943f3",
    "consecutivo": 1,
    "solicitudId": "72fb750c-b69c-483a-9a8d-821ce70d84d0",
    "proveedor": "Proveedor A",
    "plazoMaximo": "2026-11-08",
    "estado": "ENVIADA",
    "alimentos": 2
  }
}
```

- `plazoMaximo` tiene el formato `AAAA-MM-DD` y no puede ser una fecha pasada.
- Si se omite `detalleIds` se cotizan todos los alimentos de la solicitud.
- La solicitud debe estar `PENDIENTE` o `EN TRÁMITE` (ver `estados.js`); el proveedor debe tener un correo válido.
- **Si el correo no puede enviarse no se crea la cotización** y responde 503.
- Cuando todos los alimentos de la solicitud tienen cotización, la solicitud pasa a `EN TRÁMITE`.

**Errores frecuentes:** 400 `VALIDACION`, 409 `CONFLICTO` (el proveedor ya cotiza ese alimento), 503 `SERVICIO_NO_DISPONIBLE`

### GET /api/v1/cotizaciones

Lista cotizaciones con filtros.

**Roles:** `AUXILIAR_COMPRAS`, `DIRECTOR_COMPRAS`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `estado` | consulta | `ENVIADA`, `OPCIONADA`, `SOSPECHOSA` o `RECHAZADA` |
| `solicitudId` | consulta | Solicitud |
| `proveedorId` | consulta | Proveedor |
| `pendientesDeValor` | consulta | `true` para las ENVIADAS aún sin valores |
| `limite` | consulta | Máximo 200, por defecto 50 |
| `offset` | consulta | Desplazamiento |

**Respuesta 200**
```json
{
  "datos": {
    "total": 1,
    "cotizaciones": [
      {
        "id": "3ae41173-fc65-49a9-b152-84a5eb4943f3",
        "consecutivo": 1,
        "solicitudId": "72fb750c-b69c-483a-9a8d-821ce70d84d0",
        "solicitudConsecutivo": 1,
        "proveedor": "Proveedor A",
        "estado": "ENVIADA",
        "plazoMaximo": "2026-11-08",
        "valorTotal": null,
        "valoresRegistrados": false,
        "creadaEn": "2026-11-05T05:03:02.472Z"
      }
    ]
  }
}
```

### GET /api/v1/cotizaciones/:id

Detalle de una cotización con sus alimentos, valores y precio sugerido.

**Roles:** `AUXILIAR_COMPRAS`, `DIRECTOR_COMPRAS`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `id` | ruta | Id de la cotización |

**Respuesta 200**
```json
{
  "datos": {
    "id": "3ae41173-fc65-49a9-b152-84a5eb4943f3",
    "consecutivo": 1,
    "solicitudId": "72fb750c-b69c-483a-9a8d-821ce70d84d0",
    "solicitudConsecutivo": 1,
    "proveedor": "Proveedor A",
    "estado": "ENVIADA",
    "plazoMaximo": "2026-11-08",
    "valorTotal": null,
    "valoresRegistrados": false,
    "creadaEn": "2026-11-05T05:03:02.472Z",
    "alimentos": [
      {
        "detalleSolicitudId": "98e40043-fe1c-4963-b5b8-98776fc912c1",
        "producto": "Arroz",
        "marca": null,
        "cantidad": 100,
        "unidad": "kg",
        "valorUnitario": null,
        "precioSugeridoUnitario": 4500
      },
      {
        "detalleSolicitudId": "db1ba76f-b3e9-4de0-9c2a-184ea82e5393",
        "producto": "Pollo",
        "marca": null,
        "cantidad": 50,
        "unidad": "kg",
        "valorUnitario": null,
        "precioSugeridoUnitario": 12000
      }
    ]
  }
}
```

**Errores frecuentes:** 404 `NO_ENCONTRADO`

### PUT /api/v1/cotizaciones/:id/valores

Registra el valor unitario que cotizó el proveedor para cada alimento.

**Roles:** `DIRECTOR_COMPRAS`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `id` | ruta | Id de la cotización |

**Cuerpo**
```json
{
  "valores": [
    {
      "detalleSolicitudId": "<id del alimento>",
      "valorUnitario": 4400
    }
  ],
  "confirmarSobrescritura": false
}
```

**Respuesta 200**
```json
{
  "datos": {
    "id": "3ae41173-fc65-49a9-b152-84a5eb4943f3",
    "valorTotal": 1035000,
    "estado": "ENVIADA",
    "pendienteValidacion": true
  }
}
```

- Debe traer un valor para **todos** los alimentos de la cotización, sin repetir ni agregar otros.
- Solo se aceptan en cotizaciones `ENVIADA`. Si ya tenía valores, exige `confirmarSobrescritura: true`.
- La validación automática ocurre **después**, de forma asíncrona: consulte la cotización unos segundos más tarde para ver si quedó `OPCIONADA`, `SOSPECHOSA` o `RECHAZADA` (reglas en [Flujos](FLUJOS.md#validación-automática-de-cotizaciones)).

**Errores frecuentes:** 400 `VALIDACION`, 404 `NO_ENCONTRADO`, 409 `CONFLICTO`

## Órdenes de compra (CU-13)

### POST /api/v1/ordenes-compra

Genera la orden de compra de una cotización OPCIONADA.

**Roles:** `DIRECTOR_COMPRAS`

**Cuerpo**
```json
{
  "cotizacionId": "<id>"
}
```

**Respuesta 201**
```json
{
  "datos": {
    "id": "d77895aa-4a5b-48f2-808c-ed7f37f62d3e",
    "consecutivo": 1,
    "proveedor": "Proveedor A",
    "valorTotal": 1035000,
    "solicitudId": "72fb750c-b69c-483a-9a8d-821ce70d84d0",
    "solicitudConsecutivo": 1,
    "cotizacionId": "3ae41173-fc65-49a9-b152-84a5eb4943f3",
    "cotizacionConsecutivo": 1,
    "generadaPor": "Compras",
    "generadaEn": "2026-11-05T05:03:02.822Z",
    "alimentos": [
      {
        "producto": "Arroz",
        "marca": null,
        "cantidad": 100,
        "unidad": "kg",
        "valorUnitario": 4400,
        "subtotal": 440000
      },
      {
        "producto": "Pollo",
        "marca": null,
        "cantidad": 50,
        "unidad": "kg",
        "valorUnitario": 11900,
        "subtotal": 595000
      }
    ]
  }
}
```

- Solo cotizaciones `OPCIONADA`; cada cotización genera una única orden.

**Errores frecuentes:** 400 `VALIDACION`, 409 `CONFLICTO` (ya tiene orden)

### GET /api/v1/ordenes-compra

Lista las órdenes de compra.

**Roles:** `AUXILIAR_COMPRAS`, `DIRECTOR_COMPRAS`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `solicitudId` | consulta | Filtra por solicitud |
| `limite` | consulta | Máximo 200, por defecto 50 |
| `offset` | consulta | Desplazamiento |

**Respuesta 200**
```json
{
  "datos": {
    "total": 1,
    "ordenes": [
      {
        "id": "d77895aa-4a5b-48f2-808c-ed7f37f62d3e",
        "consecutivo": 1,
        "proveedor": "Proveedor A",
        "valorTotal": 1035000,
        "solicitudId": "72fb750c-b69c-483a-9a8d-821ce70d84d0",
        "solicitudConsecutivo": 1,
        "cotizacionId": "3ae41173-fc65-49a9-b152-84a5eb4943f3",
        "cotizacionConsecutivo": 1,
        "generadaPor": "Compras",
        "generadaEn": "2026-11-05T05:03:02.822Z"
      }
    ]
  }
}
```

### GET /api/v1/ordenes-compra/:id

Detalle de una orden: proveedor, alimentos, cantidades y valores.

**Roles:** `AUXILIAR_COMPRAS`, `DIRECTOR_COMPRAS`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `id` | ruta | Id de la orden |

**Respuesta 200**
```json
{
  "datos": {
    "id": "d77895aa-4a5b-48f2-808c-ed7f37f62d3e",
    "consecutivo": 1,
    "proveedor": "Proveedor A",
    "valorTotal": 1035000,
    "solicitudId": "72fb750c-b69c-483a-9a8d-821ce70d84d0",
    "solicitudConsecutivo": 1,
    "cotizacionId": "3ae41173-fc65-49a9-b152-84a5eb4943f3",
    "cotizacionConsecutivo": 1,
    "generadaPor": "Compras",
    "generadaEn": "2026-11-05T05:03:02.822Z",
    "alimentos": [
      {
        "producto": "Arroz",
        "marca": null,
        "cantidad": 100,
        "unidad": "kg",
        "valorUnitario": 4400,
        "subtotal": 440000
      },
      {
        "producto": "Pollo",
        "marca": null,
        "cantidad": 50,
        "unidad": "kg",
        "valorUnitario": 11900,
        "subtotal": 595000
      }
    ]
  }
}
```

**Errores frecuentes:** 404 `NO_ENCONTRADO`

## Analítica (CU-14, CU-15)

### GET /api/v1/tablero

Tablero de control (BAM): producto más demandado, punto con mayor demanda y mejor proveedor.

**Roles:** `DIRECTOR_COMERCIAL`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `desde` | consulta | Inicio del periodo (opcional) |
| `hasta` | consulta | Fin del periodo (opcional) |

**Respuesta 200**
```json
{
  "datos": {
    "generadoEn": "2026-11-05T05:03:02.861Z",
    "periodo": {
      "desde": null,
      "hasta": null
    },
    "productoMasDemandado": {
      "disponible": true,
      "producto": "Arroz",
      "unidad": "kg",
      "demanda": 112,
      "consumoPedidos": 12,
      "cantidadSolicitada": 100,
      "ranking": [
        {
          "producto": "Arroz",
          "unidad": "kg",
          "demanda": 112,
          "consumoPedidos": 12,
          "cantidadSolicitada": 100
        },
        {
          "producto": "Pollo",
          "unidad": "kg",
          "demanda": 68,
          "consumoPedidos": 18,
          "cantidadSolicitada": 50
        }
      ]
    },
    "restauranteMayorDemanda": {
      "disponible": true,
      "punto": "Chapinero",
      "platosVendidos": 60,
      "pedidos": 1,
      "ranking": [
        {
          "punto": "Chapinero",
          "platosVendidos": 60,
          "pedidos": 1
        }
      ]
    },
    "mejorProveedor": {
      "disponible": true,
      "metrica": "ordenes_compra",
      "proveedor": "Proveedor A",
      "valorMetrica": 1,
      "detalle": {
        "cotizaciones": 1,
        "cotizacionesOpcionadas": 1,
        "ordenesCompra": 1
      },
      "ranking": [
        {
          "proveedor": "Proveedor A",
          "valorMetrica": 1
        }
      ]
    }
  }
}
```

- Cada indicador se calcula por separado: si no hay datos trae `disponible: false` y un `mensaje`; si falla su cálculo, un `error`, sin tumbar los otros.
- Por la regla de confidencialidad (SRS 6.5) **no incluye montos ni razones de precio**: solo nombres y conteos.

**Errores frecuentes:** 400 `VALIDACION`

### GET /api/v1/promociones

Promociones generadas y el resultado de su envío.

**Roles:** `DIRECTOR_COMERCIAL`, `ADMINISTRADOR`, `JEFE_COCINA`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `desde` | consulta | Fecha inicial |
| `hasta` | consulta | Fecha final |
| `limite` | consulta | Máximo 200, por defecto 50 |
| `offset` | consulta | Desplazamiento |

**Respuesta 200**
```json
{
  "datos": {
    "total": 3,
    "promociones": [
      {
        "id": "0994d2c7-2e00-47b7-ba59-f28b88d8b366",
        "titulo": "Tendencia: Brownie",
        "descripcion": "\"Brownie\" es tendencia en instagram. Evalúe incluirlo en una promoción del menú.",
        "origen": "TENDENCIA",
        "producto": null,
        "generadaEn": "2026-11-05T05:03:02.873Z",
        "enviadas": 2,
        "fallidas": 0
      },
      {
        "id": "41c2e755-3f9f-4f73-a35f-379fc3158498",
        "titulo": "Tendencia: ceviche",
        "descripcion": "\"ceviche\" es tendencia en instagram. Evalúe incluirlo en una promoción del menú.",
        "origen": "TENDENCIA",
        "producto": null,
        "generadaEn": "2026-11-05T05:03:02.871Z",
        "enviadas": 2,
        "fallidas": 0
      }
    ]
  }
}
```

- `origen`: `COMBINADA` (producto muy solicitado y en tendencia), `TENDENCIA` o `MAS_SOLICITADO`.

## Auditoría y logs (CU-16)

### GET /api/v1/auditoria

Consulta la auditoría de acciones.

**Roles:** `ADMINISTRADOR`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `usuarioId` | consulta | Usuario |
| `accion` | consulta | `CREATE`, `READ`, `UPDATE`, `DELETE`, `LOGIN_OK`, `LOGIN_FALLIDO`, `ACCESO_DENEGADO` o `EJECUCION` |
| `entidad` | consulta | Entidad, por ejemplo `orden_compra` |
| `desde` | consulta | Fecha inicial |
| `hasta` | consulta | Fecha final |
| `limite` | consulta | Máximo 200, por defecto 50 |
| `offset` | consulta | Desplazamiento |

**Respuesta 200**
```json
{
  "datos": {
    "total": 70,
    "registros": [
      {
        "id": "70",
        "usuarioId": "5a5d3cea-d852-45f1-8678-6e495165e24a",
        "correo": "comercial@kg.co",
        "accion": "READ",
        "entidad": "promocion",
        "entidadId": null,
        "fecha": "2026-11-05T05:03:02.981Z"
      },
      {
        "id": "69",
        "usuarioId": null,
        "correo": "sistema",
        "accion": "EJECUCION",
        "entidad": "promocion",
        "entidadId": null,
        "fecha": "2026-11-05T05:03:02.875Z"
      }
    ]
  }
}
```

- Los registros no se pueden modificar ni eliminar (lo impide la base de datos).
- No contienen contraseñas ni montos de cotizaciones u órdenes.

**Errores frecuentes:** 400 `VALIDACION`

### GET /api/v1/auditoria/:id

Detalle de un registro de auditoría.

**Roles:** `ADMINISTRADOR`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `id` | ruta | Id numérico del registro |

**Respuesta 200**
```json
{
  "datos": {
    "id": "70",
    "usuarioId": "5a5d3cea-d852-45f1-8678-6e495165e24a",
    "correo": "comercial@kg.co",
    "accion": "READ",
    "entidad": "promocion",
    "entidadId": null,
    "detalle": {
      "ip": "127.0.0.1",
      "operacion": "promociones.listar"
    },
    "fecha": "2026-11-05T05:03:02.981Z"
  }
}
```

**Errores frecuentes:** 404 `NO_ENCONTRADO`

### GET /api/v1/logs

Consulta el log de errores y ejecuciones del sistema.

**Roles:** `ADMINISTRADOR`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `nivel` | consulta | `ERROR`, `WARN` o `INFO` |
| `modulo` | consulta | Módulo, por ejemplo `cron` o `notificaciones` |
| `desde` | consulta | Fecha inicial |
| `hasta` | consulta | Fecha final |
| `limite` | consulta | Máximo 200, por defecto 50 |
| `offset` | consulta | Desplazamiento |

**Respuesta 200**
```json
{
  "datos": {
    "total": 3,
    "registros": [
      {
        "id": "3",
        "nivel": "INFO",
        "modulo": "promociones",
        "mensaje": "Generación de promociones finalizada",
        "fecha": "2026-11-05T05:03:02.874Z"
      },
      {
        "id": "2",
        "nivel": "INFO",
        "modulo": "precio_sugerido",
        "mensaje": "Consulta al servicio del Ministerio de Comercio",
        "fecha": "2026-11-05T05:03:02.112Z"
      }
    ]
  }
}
```

**Errores frecuentes:** 400 `VALIDACION`

### GET /api/v1/logs/:id

Detalle de un registro del log.

**Roles:** `ADMINISTRADOR`

**Parámetros**

| Nombre | Dónde | Descripción |
|---|---|---|
| `id` | ruta | Id numérico del registro |

**Respuesta 200**
```json
{
  "datos": {
    "id": "3",
    "nivel": "INFO",
    "modulo": "promociones",
    "mensaje": "Generación de promociones finalizada",
    "detalle": {
      "generadas": 3,
      "tendencias": 3,
      "apiDisponible": true,
      "productosAnalizados": 2,
      "omitidasPorRepetidas": 0
    },
    "fecha": "2026-11-05T05:03:02.874Z"
  }
}
```

**Errores frecuentes:** 404 `NO_ENCONTRADO`

