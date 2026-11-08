import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listarPromociones } from '../../api/comercial.js';
import { mensajeDeError } from '../../api/cliente.js';
import { finDelDia, formatearFechaHora, inicioDelDia } from '../../shared/lib/formato.js';
import { PageHeader } from '../../shared/ui/PageHeader.jsx';
import { Card } from '../../shared/ui/Card.jsx';
import { TextField } from '../../shared/ui/Field.jsx';
import { StatusPill } from '../../shared/ui/StatusPill.jsx';
import { Pagination } from '../../shared/ui/Pagination.jsx';
import { Banner } from '../../shared/ui/Banner.jsx';
import { Spinner } from '../../shared/ui/Spinner.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import estilos from './comercial.module.css';

const LIMITE = 24;
const ORIGENES = {
  COMBINADA: { texto: 'Muy solicitado y en tendencia', tono: 'marca' },
  TENDENCIA: { texto: 'Tendencia en redes', tono: 'contorno' },
  MAS_SOLICITADO: { texto: 'Más solicitado', tono: 'neutro' },
};

/**
 * Promociones que el sistema generó con tendencias de redes y productos más solicitados
 * (CU-15), y cuántos correos se enviaron. Las ven Director Comercial, Jefe de Cocina y Administrador.
 */
export function PromocionesPage() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [offset, setOffset] = useState(0);
  const rangoInvalido = desde && hasta && desde > hasta;
  const filtros = { desde: inicioDelDia(desde), hasta: finDelDia(hasta), limite: LIMITE, offset };
  const consulta = useQuery({
    queryKey: ['promociones', filtros],
    queryFn: () => listarPromociones(filtros),
    enabled: !rangoInvalido,
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader titulo="Promociones" descripcion="Sugerencias que el sistema genera cada semana a partir de tendencias en redes y de lo más pedido." />
      <div className={estilos.periodo}>
        <div className={estilos.campo}>
          <TextField
            etiqueta="Desde"
            type="date"
            value={desde}
            onChange={(e) => {
              setDesde(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div className={estilos.campo}>
          <TextField
            etiqueta="Hasta"
            type="date"
            value={hasta}
            error={rangoInvalido ? 'Debe ser posterior a “Desde”.' : undefined}
            onChange={(e) => {
              setHasta(e.target.value);
              setOffset(0);
            }}
          />
        </div>
      </div>

      {consulta.isError ? <Banner tono="error">{mensajeDeError(consulta.error)}</Banner> : null}
      {consulta.isPending && !rangoInvalido ? (
        <Spinner etiqueta="Cargando promociones" />
      ) : consulta.data?.promociones?.length ? (
        <>
          <ul className={estilos.promociones}>
            {consulta.data.promociones.map((p) => {
              const origen = ORIGENES[p.origen] ?? { texto: p.origen, tono: 'neutro' };
              return (
                <li key={p.id}>
                  <Card as="article" className={estilos.promocion}>
                    <StatusPill tono={origen.tono}>{origen.texto}</StatusPill>
                    <h2 className={estilos.promocionTitulo}>{p.titulo}</h2>
                    <p className={estilos.descripcion}>{p.descripcion}</p>
                    <div className={estilos.pie}>
                      <span className="kg-cifras">{formatearFechaHora(p.generadaEn)}</span>
                      <span className="kg-cifras">
                        {p.enviadas} {p.enviadas === 1 ? 'correo enviado' : 'correos enviados'}
                        {p.fallidas ? `, ${p.fallidas} sin enviar` : ''}
                      </span>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          {consulta.data.total > LIMITE ? (
            <Card sinRelleno>
              <Pagination total={consulta.data.total} limite={LIMITE} offset={offset} alCambiar={setOffset} />
            </Card>
          ) : null}
        </>
      ) : (
        <EmptyState titulo="No hay promociones en este periodo" descripcion={consulta.data?.mensaje ?? 'El sistema las genera cada semana; también puede cambiar las fechas.'} />
      )}
    </>
  );
}
