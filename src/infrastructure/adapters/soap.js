/**
 * Cliente SOAP 1.2 mínimo (document/literal) para consumir servicios web externos.
 *
 * El enunciado del proyecto exige SOAP para la integración con sistemas externos, y el servicio
 * público del DANE (SIPSA), que se usa como referencia del servicio del Ministerio, es SOAP 1.2.
 * Envía el sobre con Content-Type application/soap+xml, interpreta la respuesta ignorando los
 * prefijos de espacio de nombres y traduce los fallos (HTTP, XML inválido, SOAP Fault) a
 * ServicioExternoError, el mismo error que usan los demás adaptadores.
 */
import { XMLParser } from 'fast-xml-parser';
import { solicitarTexto, solicitarEnFlujo } from './httpSeguro.js';
import {
  ServicioExternoError,
  CODIGOS_ERROR_SERVICIO as CODIGOS,
} from '../../domain/services/ServicioExternoError.js';

export const NAMESPACE_SOBRE_SOAP12 = 'http://www.w3.org/2003/05/soap-envelope';
// Una respuesta con miles de registros puede superar el límite de 1 MB de los servicios REST
const LIMITE_RESPUESTA_SOAP_BYTES = 20_000_000;

const analizador = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  parseTagValue: false, // los valores llegan como texto; el adaptador convierte lo que necesita
  trimValues: true,
  // <return> es el elemento repetido de las respuestas de lista: siempre se entrega como arreglo
  isArray: (nombre) => nombre === 'return',
});

/** Sobre SOAP 1.2 con una operación (opcionalmente con parámetros ya serializados en XML). */
export function construirSobre({ namespace, operacion, cuerpoXml = '' }) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soap:Envelope xmlns:soap="${NAMESPACE_SOBRE_SOAP12}" xmlns:ser="${namespace}">` +
    `<soap:Body><ser:${operacion}>${cuerpoXml}</ser:${operacion}></soap:Body></soap:Envelope>`
  );
}

function cuerpoDelSobre(servicio, texto) {
  let documento;
  try {
    documento = analizador.parse(texto);
  } catch {
    throw new ServicioExternoError(servicio, CODIGOS.RESPUESTA_INVALIDA, 'La respuesta no es XML válido');
  }
  const cuerpo = documento?.Envelope?.Body;
  if (cuerpo === undefined || cuerpo === null) {
    throw new ServicioExternoError(servicio, CODIGOS.RESPUESTA_INVALIDA, 'La respuesta no es un sobre SOAP válido');
  }
  return cuerpo;
}

function textoDeFalla(falla) {
  const razon = falla.Reason?.Text ?? falla.faultstring ?? falla.reason ?? null; // SOAP 1.2 | SOAP 1.1
  return (typeof razon === 'string' ? razon : JSON.stringify(razon ?? falla)).slice(0, 300);
}

/**
 * Invoca una operación y devuelve el contenido de <operacionResponse> (objeto; {} si viene vacío).
 *
 * @param {{servicio: string, url: string|URL, namespace: string, operacion: string, cuerpoXml?: string,
 *          timeoutMs: number, permitirHttp?: boolean}} opciones
 * @throws {ServicioExternoError}
 */
export async function solicitarSoap({ servicio, url, namespace, operacion, cuerpoXml = '', timeoutMs, permitirHttp = false }) {
  const { estado, texto } = await solicitarTexto({
    servicio,
    url,
    metodo: 'POST',
    cabeceras: {
      'Content-Type': 'application/soap+xml; charset=utf-8; action=""',
      Accept: 'application/soap+xml, text/xml',
    },
    cuerpo: construirSobre({ namespace, operacion, cuerpoXml }),
    timeoutMs,
    permitirHttp,
    limiteBytes: LIMITE_RESPUESTA_SOAP_BYTES,
  });

  const exitosa = estado >= 200 && estado < 300;
  let cuerpo = null;
  try {
    cuerpo = cuerpoDelSobre(servicio, texto);
  } catch (error) {
    if (exitosa) throw error; // con un error HTTP, el cuerpo puede no ser XML (por ejemplo una página HTML)
  }

  if (cuerpo?.Fault) {
    throw new ServicioExternoError(servicio, CODIGOS.HTTP, `El servicio devolvió un SOAP Fault: ${textoDeFalla(cuerpo.Fault)}`, {
      estado: exitosa ? 500 : estado,
    });
  }
  if (!exitosa) {
    throw new ServicioExternoError(servicio, CODIGOS.HTTP, `El servicio respondió HTTP ${estado}`, { estado });
  }

  const respuesta = cuerpo?.[`${operacion}Response`];
  if (respuesta === undefined) {
    throw new ServicioExternoError(
      servicio,
      CODIGOS.RESPUESTA_INVALIDA,
      `La respuesta SOAP no contiene el elemento ${operacion}Response`
    );
  }
  return respuesta === '' || respuesta === null ? {} : respuesta;
}

const ETIQUETA_ABRE = '<return>';
const ETIQUETA_CIERRA = '</return>';
const LIMITE_SIN_REGISTROS = 2_000_000; // texto acumulado sin ver ningún registro completo

/**
 * Invoca una operación cuya respuesta es una lista enorme de <return> y la entrega por LOTES de
 * registros ya interpretados, a medida que llegan, sin acumular la respuesta. `alRegistros(lote,
 * {bytes})` devuelve `false` para cortar la conexión (por ejemplo, al llegar a datos demasiado
 * antiguos). Un SOAP Fault, un error HTTP o una respuesta sin el elemento de la operación se
 * traducen igual que en solicitarSoap.
 *
 * @param {{servicio: string, url: string|URL, namespace: string, operacion: string, cuerpoXml?: string,
 *          timeoutMs: number, plazoTotalMs?: number, permitirHttp?: boolean,
 *          alRegistros: (registros: object[], info: {bytes: number}) => boolean|void}} opciones
 * @returns {Promise<{completa: boolean, bytes: number, registros: number}>}
 * @throws {ServicioExternoError}
 */
export async function solicitarSoapEnFlujo({
  servicio,
  url,
  namespace,
  operacion,
  cuerpoXml = '',
  timeoutMs,
  plazoTotalMs,
  permitirHttp = false,
  alRegistros,
}) {
  let pendiente = ''; // texto recibido y aún no interpretado
  let registros = 0;

  const resultado = await solicitarEnFlujo({
    servicio,
    url,
    metodo: 'POST',
    cabeceras: {
      'Content-Type': 'application/soap+xml; charset=utf-8; action=""',
      Accept: 'application/soap+xml, text/xml',
    },
    cuerpo: construirSobre({ namespace, operacion, cuerpoXml }),
    timeoutMs,
    plazoTotalMs,
    permitirHttp,
    alRecibir: (texto, bytes) => {
      pendiente += texto;
      const crudos = [];
      for (;;) {
        const inicio = pendiente.indexOf(ETIQUETA_ABRE);
        if (inicio === -1) break;
        const fin = pendiente.indexOf(ETIQUETA_CIERRA, inicio);
        if (fin === -1) break;
        crudos.push(pendiente.slice(inicio, fin + ETIQUETA_CIERRA.length));
        pendiente = pendiente.slice(fin + ETIQUETA_CIERRA.length);
      }
      if (crudos.length === 0) {
        if (pendiente.length > LIMITE_SIN_REGISTROS) {
          throw new ServicioExternoError(servicio, CODIGOS.RESPUESTA_INVALIDA, 'La respuesta no contiene registros reconocibles');
        }
        return true;
      }
      let lote;
      try {
        lote = analizador.parse(`<lote>${crudos.join('')}</lote>`)?.lote?.return ?? [];
      } catch {
        throw new ServicioExternoError(servicio, CODIGOS.RESPUESTA_INVALIDA, 'La respuesta contiene registros que no son XML válido');
      }
      registros += lote.length;
      return alRegistros(lote, { bytes });
    },
  });

  if (resultado.estado < 200 || resultado.estado >= 300) {
    let cuerpo = null;
    try {
      cuerpo = cuerpoDelSobre(servicio, resultado.texto);
    } catch {
      // un error HTTP puede traer HTML u otro texto: se informa el código
    }
    if (cuerpo?.Fault) {
      throw new ServicioExternoError(servicio, CODIGOS.HTTP, `El servicio devolvió un SOAP Fault: ${textoDeFalla(cuerpo.Fault)}`, {
        estado: resultado.estado,
      });
    }
    throw new ServicioExternoError(servicio, CODIGOS.HTTP, `El servicio respondió HTTP ${resultado.estado}`, { estado: resultado.estado });
  }

  if (registros === 0 && resultado.completa) {
    // respuesta sin registros: debe ser un sobre válido (posiblemente con un Fault o con la respuesta vacía)
    const cuerpo = cuerpoDelSobre(servicio, pendiente);
    if (cuerpo?.Fault) {
      throw new ServicioExternoError(servicio, CODIGOS.HTTP, `El servicio devolvió un SOAP Fault: ${textoDeFalla(cuerpo.Fault)}`, { estado: 500 });
    }
    if (cuerpo[`${operacion}Response`] === undefined) {
      throw new ServicioExternoError(servicio, CODIGOS.RESPUESTA_INVALIDA, `La respuesta SOAP no contiene el elemento ${operacion}Response`);
    }
  }
  return { completa: resultado.completa, bytes: resultado.bytes, registros };
}
