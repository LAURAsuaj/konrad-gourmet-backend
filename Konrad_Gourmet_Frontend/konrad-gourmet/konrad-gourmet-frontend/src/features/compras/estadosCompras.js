/** Nombres y tonos de los estados de compras, con los valores exactos del backend (estados.js). */
export const ESTADOS_SOLICITUD = Object.freeze({
  PENDIENTE: { texto: 'Pendiente', tono: 'marca' },
  'EN TRÁMITE': { texto: 'En trámite', tono: 'contorno' },
});

export const ESTADOS_COTIZACION = Object.freeze({
  ENVIADA: { texto: 'Enviada', tono: 'contorno', descripcion: 'Esperando los valores del proveedor.' },
  OPCIONADA: { texto: 'Opcionada', tono: 'marca', descripcion: 'Precio razonable frente al Ministerio: puede generar orden de compra.' },
  SOSPECHOSA: { texto: 'Sospechosa', tono: 'error', descripcion: 'Precio fuera del rango esperado: revísela antes de seguir.' },
  RECHAZADA: { texto: 'Rechazada', tono: 'neutro', descripcion: 'Precio muy por encima del valor del Ministerio.' },
});

export const estadoSolicitud = (estado) => ESTADOS_SOLICITUD[estado] ?? { texto: estado, tono: 'neutro' };
export const estadoCotizacion = (estado) => ESTADOS_COTIZACION[estado] ?? { texto: estado, tono: 'neutro', descripcion: '' };
