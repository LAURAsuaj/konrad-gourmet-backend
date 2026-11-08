import { useMemo, useState } from 'react';
import { Tabs } from '../../shared/ui/Tabs.jsx';
import { TextField } from '../../shared/ui/Field.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { QuantityStepper } from '../../shared/ui/QuantityStepper.jsx';
import { EmptyState } from '../../shared/ui/EmptyState.jsx';
import { formatearMoneda } from '../../shared/lib/formato.js';
import { MAXIMO_POR_PLATO } from './comanda.js';
import estilos from './MenuRapido.module.css';

const TODAS = '__todas__';

/** Menú del punto para tomar la orden: filtro por categoría, búsqueda y botones − / +. */
export function MenuRapido({ platos = [], lineas = [], alAgregar, alFijar }) {
  const [categoria, setCategoria] = useState(TODAS);
  const [busqueda, setBusqueda] = useState('');

  const categorias = useMemo(() => [...new Set(platos.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, 'es')), [platos]);
  const cantidades = useMemo(() => new Map(lineas.map((l) => [l.platoId, l.cantidad])), [lineas]);

  const texto = busqueda.trim().toLocaleLowerCase('es');
  const visibles = platos.filter(
    (p) => (categoria === TODAS || p.categoria === categoria) && (!texto || p.nombre.toLocaleLowerCase('es').includes(texto))
  );

  return (
    <section className={estilos.menu} aria-label="Menú del punto">
      <div className={estilos.filtros}>
        <TextField etiqueta="Buscar plato" type="search" placeholder="Nombre del plato" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        {categorias.length > 1 ? (
          <Tabs
            opciones={[{ valor: TODAS, etiqueta: 'Todas' }, ...categorias.map((c) => ({ valor: c, etiqueta: c }))]}
            valor={categoria}
            alCambiar={setCategoria}
            etiquetaAccesible="Categorías del menú"
          />
        ) : null}
      </div>

      {!platos.length ? (
        <EmptyState titulo="El menú del punto está vacío" descripcion="El Jefe de Cocina registra los platos en la sección Menú." />
      ) : !visibles.length ? (
        <EmptyState titulo="Ningún plato coincide" descripcion="Cambie la categoría o la búsqueda." />
      ) : (
        <ul className={estilos.productos}>
          {visibles.map((plato) => {
            const cantidad = cantidades.get(plato.id) ?? 0;
            return (
              <li key={plato.id}>
                <article className={`${estilos.producto} ${cantidad ? estilos.enComanda : ''}`}>
                  <div>
                    <p className={estilos.categoria}>{plato.categoria}</p>
                    <h3 className={estilos.nombre}>{plato.nombre}</h3>
                    <p className={`${estilos.precio} kg-cifras`}>{formatearMoneda(plato.precio)}</p>
                  </div>
                  <div className={estilos.acciones}>
                    {cantidad ? (
                      <QuantityStepper valor={cantidad} max={MAXIMO_POR_PLATO} etiqueta={plato.nombre} compacto alCambiar={(n) => alFijar(plato.id, n)} />
                    ) : (
                      <Button variante="secundario" tamano="pequeno" bloque onClick={() => alAgregar(plato.id)}>
                        Agregar
                      </Button>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
