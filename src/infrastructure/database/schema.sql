-- ============================================================================
-- Konrad Gourmet - Esquema PostgreSQL (Supabase)
-- Idempotente: puede ejecutarse varias veces (npm run db:schema).
-- Cubre el modelo lógico del SRS 4.1: menús y pedidos, inventario y alarmas,
-- solicitudes, cotizaciones y órdenes de compra, y servicios transversales
-- (parametrización, notificaciones, auditoría, logs y outbox de eventos).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Catálogos parametrizables (CU-04)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS punto (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre  text NOT NULL UNIQUE,
  activo  boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS mesa (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  punto_id  uuid NOT NULL REFERENCES punto(id),
  numero    integer NOT NULL CHECK (numero > 0),
  activo    boolean NOT NULL DEFAULT true,
  UNIQUE (punto_id, numero)
);

CREATE TABLE IF NOT EXISTS categoria (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre  text NOT NULL UNIQUE,
  activo  boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS marca (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre  text NOT NULL UNIQUE,
  activo  boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS unidad_medida (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL UNIQUE,
  abreviatura  text NOT NULL,
  activo       boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS producto (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        text NOT NULL UNIQUE,
  categoria_id  uuid NOT NULL REFERENCES categoria(id),
  unidad_id     uuid NOT NULL REFERENCES unidad_medida(id),
  activo        boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS proveedor (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre  text NOT NULL UNIQUE,
  correo  text,
  activo  boolean NOT NULL DEFAULT true
);

-- Reglas del sistema: alarma_porcentaje, max_intentos_login, rangos de validación, etc.
CREATE TABLE IF NOT EXISTS parametro (
  clave           text PRIMARY KEY,
  valor           jsonb NOT NULL,
  descripcion     text,
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO parametro (clave, valor, descripcion) VALUES
  ('alarma_porcentaje', '25', 'Porcentaje de la cantidad de referencia en el que se dispara la alarma de stock bajo (CU-07)'),
  ('max_intentos_login', '3', 'Intentos fallidos de inicio de sesión antes de bloquear la cuenta (CU-01)'),
  ('hora_descuento_diario', '"02:00"', 'Hora (HH:MM, zona horaria del cron) del descuento diario de inventario (CU-06)'),
  ('rangos_validacion_cotizacion', '{"sospechosa_bajo": 0.70, "opcionada_max": 1.10, "rechazada_sobre": 1.30}',
   'Razón valor cotizado / valor sugerido. VALORES INICIALES: el área de compras debe definirlos (SRS CU-12)'),
  ('criterio_mejor_proveedor', '{"metrica": "ordenes_compra"}', 'Criterio del KPI mejor proveedor del tablero BAM (CU-14)'),
  ('reintento_precio_sugerido_minutos', '30', 'Minutos entre reintentos de consulta al Ministerio de Comercio (CU-10)')
ON CONFLICT (clave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Seguridad (CU-01)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuario (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre             text NOT NULL,
  correo             text NOT NULL,
  password_hash      text NOT NULL,
  rol                text NOT NULL CHECK (rol IN (
                       'JEFE_COCINA', 'MESERO', 'AUXILIAR_COMPRAS',
                       'DIRECTOR_COMPRAS', 'DIRECTOR_COMERCIAL', 'ADMINISTRADOR')),
  punto_id           uuid REFERENCES punto(id),
  intentos_fallidos  integer NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado          boolean NOT NULL DEFAULT false,
  activo             boolean NOT NULL DEFAULT true,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  CHECK (rol NOT IN ('JEFE_COCINA', 'MESERO') OR punto_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_correo ON usuario (lower(correo));

-- ---------------------------------------------------------------------------
-- 3. Cocina: menú y pedidos (CU-02, CU-03)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plato (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  punto_id   uuid NOT NULL REFERENCES punto(id),
  nombre     text NOT NULL,
  categoria  text NOT NULL,
  precio     numeric(12,2) NOT NULL CHECK (precio > 0),
  activo     boolean NOT NULL DEFAULT true,
  UNIQUE (punto_id, nombre)
);

-- La unidad del ingrediente debe coincidir con la unidad del producto en inventario.
CREATE TABLE IF NOT EXISTS plato_ingrediente (
  plato_id             uuid NOT NULL REFERENCES plato(id) ON DELETE CASCADE,
  producto_id          uuid NOT NULL REFERENCES producto(id),
  cantidad_por_porcion numeric(12,3) NOT NULL CHECK (cantidad_por_porcion > 0),
  unidad_id            uuid NOT NULL REFERENCES unidad_medida(id),
  PRIMARY KEY (plato_id, producto_id)
);

CREATE TABLE IF NOT EXISTS pedido (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  punto_id      uuid NOT NULL REFERENCES punto(id),
  mesa_id       uuid NOT NULL REFERENCES mesa(id),
  mesero_id     uuid NOT NULL REFERENCES usuario(id),
  fecha         timestamptz NOT NULL DEFAULT now(),
  -- Marca de idempotencia del descuento diario: un pedido se descuenta una sola vez.
  descontado_en timestamptz
);
CREATE INDEX IF NOT EXISTS ix_pedido_pendiente_descuento ON pedido (punto_id) WHERE descontado_en IS NULL;

CREATE TABLE IF NOT EXISTS pedido_detalle (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id  uuid NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
  plato_id   uuid NOT NULL REFERENCES plato(id),
  cantidad   integer NOT NULL CHECK (cantidad > 0)
);
CREATE INDEX IF NOT EXISTS ix_pedido_detalle_pedido ON pedido_detalle (pedido_id);

-- ---------------------------------------------------------------------------
-- 4. Inventario y alarmas (CU-06, CU-07)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventario (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  punto_id            uuid NOT NULL REFERENCES punto(id),
  producto_id         uuid NOT NULL REFERENCES producto(id),
  cantidad_actual     numeric(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_actual >= 0),
  cantidad_referencia numeric(14,3) NOT NULL CHECK (cantidad_referencia > 0),
  UNIQUE (punto_id, producto_id)
);

CREATE TABLE IF NOT EXISTS movimiento_inventario (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id  uuid NOT NULL REFERENCES inventario(id),
  tipo           text NOT NULL CHECK (tipo IN ('DESCUENTO_DIARIO', 'REABASTECIMIENTO', 'AJUSTE')),
  cantidad       numeric(14,3) NOT NULL,
  saldo_resultante numeric(14,3) NOT NULL,
  detalle        text,
  fecha          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_movimiento_inventario ON movimiento_inventario (inventario_id, fecha DESC);

CREATE TABLE IF NOT EXISTS alarma (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id        uuid NOT NULL REFERENCES inventario(id),
  activa               boolean NOT NULL DEFAULT true,
  cantidad_al_generar  numeric(14,3) NOT NULL,
  generada_en          timestamptz NOT NULL DEFAULT now(),
  resuelta_en          timestamptz
);
-- Evita duplicados: una sola alarma activa por producto y punto (CU-07 EXCEP-1)
CREATE UNIQUE INDEX IF NOT EXISTS ux_alarma_activa ON alarma (inventario_id) WHERE activa;

-- ---------------------------------------------------------------------------
-- 5. Compras: solicitudes, cotizaciones y órdenes (CU-05, CU-08 a CU-13)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS seq_consecutivo_solicitud;
CREATE SEQUENCE IF NOT EXISTS seq_consecutivo_cotizacion;
CREATE SEQUENCE IF NOT EXISTS seq_consecutivo_orden_compra;

CREATE TABLE IF NOT EXISTS solicitud_alimentos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consecutivo            bigint NOT NULL UNIQUE DEFAULT nextval('seq_consecutivo_solicitud'),
  punto_id               uuid NOT NULL REFERENCES punto(id),
  solicitante_id         uuid NOT NULL REFERENCES usuario(id),
  estado                 text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'EN TRÁMITE')),
  valor_total_sugerido   numeric(16,2) CHECK (valor_total_sugerido IS NULL OR valor_total_sugerido >= 0),
  fecha                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_solicitud_estado_fecha ON solicitud_alimentos (estado, fecha DESC);

CREATE TABLE IF NOT EXISTS detalle_solicitud (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id              uuid NOT NULL REFERENCES solicitud_alimentos(id) ON DELETE CASCADE,
  categoria_id              uuid NOT NULL REFERENCES categoria(id),
  producto_id               uuid NOT NULL REFERENCES producto(id),
  marca_id                  uuid REFERENCES marca(id),
  cantidad                  numeric(14,3) NOT NULL CHECK (cantidad > 0),
  unidad_id                 uuid NOT NULL REFERENCES unidad_medida(id),
  precio_sugerido_unitario  numeric(14,2) CHECK (precio_sugerido_unitario IS NULL OR precio_sugerido_unitario > 0)
);
CREATE INDEX IF NOT EXISTS ix_detalle_solicitud ON detalle_solicitud (solicitud_id);

CREATE TABLE IF NOT EXISTS cotizacion (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consecutivo           bigint NOT NULL UNIQUE DEFAULT nextval('seq_consecutivo_cotizacion'),
  solicitud_id          uuid NOT NULL REFERENCES solicitud_alimentos(id),
  proveedor_id          uuid NOT NULL REFERENCES proveedor(id),
  plazo_maximo          date NOT NULL,
  estado                text NOT NULL DEFAULT 'ENVIADA' CHECK (estado IN ('ENVIADA', 'RECHAZADA', 'SOSPECHOSA', 'OPCIONADA')),
  valor_total           numeric(16,2),
  valores_registrados_en timestamptz,
  creada_por            uuid NOT NULL REFERENCES usuario(id),
  creada_en             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_cotizacion_solicitud ON cotizacion (solicitud_id, estado);

-- valor_unitario: precio por unidad de medida cotizado por el proveedor
CREATE TABLE IF NOT EXISTS cotizacion_detalle (
  cotizacion_id          uuid NOT NULL REFERENCES cotizacion(id) ON DELETE CASCADE,
  detalle_solicitud_id   uuid NOT NULL REFERENCES detalle_solicitud(id),
  valor_unitario         numeric(14,2) CHECK (valor_unitario IS NULL OR valor_unitario > 0),
  PRIMARY KEY (cotizacion_id, detalle_solicitud_id)
);

CREATE TABLE IF NOT EXISTS orden_compra (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consecutivo   bigint NOT NULL UNIQUE DEFAULT nextval('seq_consecutivo_orden_compra'),
  cotizacion_id uuid NOT NULL UNIQUE REFERENCES cotizacion(id),
  solicitud_id  uuid NOT NULL REFERENCES solicitud_alimentos(id),
  proveedor_id  uuid NOT NULL REFERENCES proveedor(id),
  valor_total   numeric(16,2) NOT NULL CHECK (valor_total > 0),
  generada_por  uuid NOT NULL REFERENCES usuario(id),
  generada_en   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. Analítica, notificaciones y promociones (CU-14, CU-15, CU-05, CU-07)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tendencia (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  termino       text NOT NULL,
  fuente        text NOT NULL,
  puntaje       numeric(10,2) NOT NULL DEFAULT 0,
  capturada_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promocion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id  uuid REFERENCES producto(id),
  titulo       text NOT NULL,
  descripcion  text NOT NULL,
  origen       text NOT NULL CHECK (origen IN ('TENDENCIA', 'MAS_SOLICITADO', 'COMBINADA')),
  generada_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notificacion (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                 text NOT NULL CHECK (tipo IN ('CONFIRMACION_SOLICITUD', 'ALARMA_STOCK', 'PROMOCION')),
  usuario_destino_id   uuid REFERENCES usuario(id),
  correo_destino       text,
  asunto               text NOT NULL,
  cuerpo               text NOT NULL,
  referencia           jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado               text NOT NULL DEFAULT 'CREADA' CHECK (estado IN ('CREADA', 'ENVIADA', 'FALLIDA')),
  creada_en            timestamptz NOT NULL DEFAULT now(),
  enviada_en           timestamptz
);
CREATE INDEX IF NOT EXISTS ix_notificacion_destino ON notificacion (usuario_destino_id, creada_en DESC);

-- ---------------------------------------------------------------------------
-- 7. Auditoría y logs (CU-16) - registros inmutables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  uuid,
  correo      text,
  accion      text NOT NULL CHECK (accion IN (
                'CREATE', 'READ', 'UPDATE', 'DELETE',
                'LOGIN_OK', 'LOGIN_FALLIDO', 'ACCESO_DENEGADO', 'EJECUCION')),
  entidad     text NOT NULL,
  entidad_id  text,
  detalle     jsonb NOT NULL DEFAULT '{}'::jsonb,
  fecha       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_auditoria_fecha ON auditoria (fecha DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_usuario ON auditoria (usuario_id, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_entidad ON auditoria (entidad, accion);

CREATE TABLE IF NOT EXISTS log_error (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nivel    text NOT NULL DEFAULT 'ERROR' CHECK (nivel IN ('ERROR', 'WARN', 'INFO')),
  modulo   text NOT NULL,
  mensaje  text NOT NULL,
  detalle  jsonb NOT NULL DEFAULT '{}'::jsonb,
  fecha    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_log_error_fecha ON log_error (fecha DESC);
CREATE INDEX IF NOT EXISTS ix_log_error_modulo ON log_error (modulo, nivel);

CREATE OR REPLACE FUNCTION proteger_registro_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de % no pueden modificarse ni eliminarse', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auditoria_inmutable ON auditoria;
CREATE TRIGGER trg_auditoria_inmutable
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION proteger_registro_inmutable();

DROP TRIGGER IF EXISTS trg_log_error_inmutable ON log_error;
CREATE TRIGGER trg_log_error_inmutable
  BEFORE UPDATE OR DELETE ON log_error
  FOR EACH ROW EXECUTE FUNCTION proteger_registro_inmutable();

-- ---------------------------------------------------------------------------
-- 8. Outbox de eventos de dominio (EDA)
--    El cambio de negocio y su evento se insertan en la MISMA transacción.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado          text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PROCESADO', 'FALLIDO')),
  intentos        integer NOT NULL DEFAULT 0,
  ultimo_error    text,
  -- Clave opcional para que reejecutar un proceso no duplique el evento (SRS 6.2)
  clave_dedup     text UNIQUE,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  disponible_en   timestamptz NOT NULL DEFAULT now(),
  bloqueado_hasta timestamptz,
  procesado_en    timestamptz
);
CREATE INDEX IF NOT EXISTS ix_outbox_pendientes ON outbox (disponible_en, creado_en) WHERE estado = 'PENDIENTE';

-- Registro de eventos ya atendidos por cada manejador (idempotencia)
CREATE TABLE IF NOT EXISTS evento_procesado (
  evento_id     uuid NOT NULL REFERENCES outbox(id) ON DELETE CASCADE,
  manejador     text NOT NULL,
  procesado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, manejador)
);

-- ---------------------------------------------------------------------------
-- 9. Seguridad a nivel de fila
--    La API se conecta con el rol postgres (omite RLS). Activar RLS sin
--    políticas impide que la anon key de Supabase lea o escriba estas tablas
--    a través de PostgREST.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

COMMIT;
