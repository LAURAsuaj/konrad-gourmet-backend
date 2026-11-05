/** Estados de solicitudes y cotizaciones (SRS 3.9 a 3.13). */
export const ESTADOS_SOLICITUD = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  EN_TRAMITE: 'EN TRÁMITE',
});

export const ESTADOS_COTIZACION = Object.freeze({
  ENVIADA: 'ENVIADA',
  RECHAZADA: 'RECHAZADA',
  SOSPECHOSA: 'SOSPECHOSA',
  OPCIONADA: 'OPCIONADA',
});

/**
 * Estados de la solicitud en los que se pueden pedir cotizaciones.
 * El SRS (CU-09 PRE-2) exige PENDIENTE; ampliar esta lista permitiría seguir
 * cotizando con otros proveedores una vez la solicitud pasó a EN TRÁMITE.
 */
export const ESTADOS_SOLICITUD_COTIZABLES = Object.freeze([ESTADOS_SOLICITUD.PENDIENTE, ESTADOS_SOLICITUD.EN_TRAMITE]);