// ============================================================================
// MatrizValorArea — grid 6 areas x 5 valores no /painel
//
// Cada celula e um cliente de 1 cor (verde/amarelo/vermelho/cinza),
// representando o pior status entre os KPIs daquela intersecao.
//
// Click numa celula abre modal com KPIs detalhados (ModalCelula).
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { painel as painelApi } from '../../api';
import ModalCelula from './ModalCelula';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D',
};

// Mapa de cor por status (cores fortes para celulas — chamam atencao)
const STATUS_COR = {
  verde:    '#10B981',
  amarelo:  '#F59E0B',
  vermelho: '#EF4444',
  sem_dado: '#9CA3AF',
  na:       '#E5E7EB',
};

const STATUS_LABEL_CURTO = {
  verde:    'OK',
  amarelo:  'Atencao',
  vermelho: 'Critico',
  sem_dado: 'Sem dado',
  na:       'N/A',
};

export default function MatrizValorArea() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [celulaAberta, setCelulaAberta] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await painelApi.matriz();
      setData(r);
    } catch (e) {
      setErro(e?.message || 'Erro ao carregar matriz');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <section style={cardStyle}>
        <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>
          Carregando matriz...
        </div>
      </section>
    );
  }

  if (erro) {
    return (
      <section style={cardStyle}>
        <div style={{ padding: 30, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>
          {erro}
        </div>
      </section>
    );
  }

  if (!data) return null;

  const { areas, valores, cells } = data;

  // Calcular contagens totais (legenda no rodape)
  const totalCells = areas.length * valores.length;
  let countByStatus = { verde: 0, amarelo: 0, vermelho: 0, sem_dado: 0, na: 0 };
  Object.values(cells).forEach(c => { countByStatus[c.status] = (countByStatus[c.status] || 0) + 1; });

  return (
    <>
      <section style={cardStyle}>
        <header style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>
            Matriz Valor × Area
          </h2>
          <p style={{ fontSize: 11, color: C.t3, marginTop: 4, margin: 0 }}>
            Clique numa celula para ver os KPIs daquela intersecao. Cor = pior status entre os KPIs.
          </p>
        </header>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{
            width: '100%', borderCollapse: 'separate', borderSpacing: 4,
            tableLayout: 'fixed', minWidth: 600,
          }}>
            <thead>
              <tr>
                <th style={thArea}></th>
                {valores.map(v => (
                  <th key={v.key} style={{
                    ...thCol,
                    borderTop: `3px solid ${v.cor}`,
                    color: C.text,
                  }}>
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: v.cor, marginRight: 6 }} />
                    {v.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {areas.map(area => (
                <tr key={area.id}>
                  <td style={{
                    ...thRow,
                    background: 'var(--cbrio-input-bg)',
                    color: C.text,
                  }}>
                    <strong style={{ fontSize: 12 }}>{area.nome}</strong>
                  </td>
                  {valores.map(v => {
                    const cell = cells[`${area.id}:${v.key}`];
                    const cor = STATUS_COR[cell?.status] || STATUS_COR.na;
                    const isNA = cell?.status === 'na' || cell?.total_kpis === 0;
                    const isClickable = !isNA;
                    return (
                      <td
                        key={v.key}
                        onClick={isClickable ? () => setCelulaAberta({ area: area.id, valor: v.key, cell }) : undefined}
                        style={{
                          background: cor,
                          color: '#fff',
                          textAlign: 'center',
                          padding: 10,
                          borderRadius: 8,
                          cursor: isClickable ? 'pointer' : 'default',
                          opacity: isNA ? 0.4 : 1,
                          minHeight: 56,
                          height: 56,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: 0.3,
                          transition: 'transform 0.1s, box-shadow 0.1s',
                          userSelect: 'none',
                        }}
                        onMouseEnter={e => {
                          if (isClickable) {
                            e.currentTarget.style.transform = 'scale(1.04)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                          }
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                        title={isNA ? 'Sem KPIs nesta intersecao' : `${cell?.total_kpis} KPIs · ${STATUS_LABEL_CURTO[cell?.status]}`}
                      >
                        {isNA ? (
                          <span style={{ color: '#9CA3AF', fontWeight: 500, fontSize: 10 }}>—</span>
                        ) : (
                          <>
                            <div style={{ fontSize: 14, lineHeight: 1, marginBottom: 2 }}>
                              {cell.total_kpis}
                            </div>
                            <div style={{ fontSize: 9, fontWeight: 500, opacity: 0.92, lineHeight: 1.1 }}>
                              {STATUS_LABEL_CURTO[cell.status]}
                            </div>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legenda */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14, paddingTop: 12,
          borderTop: `1px solid ${C.border}`,
          fontSize: 10, color: C.t3,
        }}>
          <Legenda cor={STATUS_COR.verde}    label={`Em dia · ${countByStatus.verde}`} />
          <Legenda cor={STATUS_COR.amarelo}  label={`Atencao · ${countByStatus.amarelo}`} />
          <Legenda cor={STATUS_COR.vermelho} label={`Critico · ${countByStatus.vermelho}`} />
          <Legenda cor={STATUS_COR.sem_dado} label={`Sem dado · ${countByStatus.sem_dado}`} />
          <Legenda cor={STATUS_COR.na}       label={`N/A · ${countByStatus.na}`} />
          <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
            Total: {totalCells} celulas
          </span>
        </div>
      </section>

      {/* Modal de drilldown */}
      {celulaAberta && (
        <ModalCelula
          area={celulaAberta.area}
          valor={celulaAberta.valor}
          cell={celulaAberta.cell}
          onClose={() => setCelulaAberta(null)}
        />
      )}
    </>
  );
}

const cardStyle = {
  background: C.card,
  borderRadius: 16,
  border: `1px solid ${C.border}`,
  padding: '20px 24px',
};

const thArea = {
  padding: 8,
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--cbrio-text3)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  width: '15%',
  minWidth: 90,
};
const thCol = {
  padding: 8,
  textAlign: 'center',
  fontSize: 10.5,
  fontWeight: 600,
  background: 'var(--cbrio-input-bg)',
  borderRadius: 6,
  letterSpacing: 0.2,
};
const thRow = {
  padding: '8px 12px',
  textAlign: 'left',
  borderRadius: 8,
  fontSize: 12,
  whiteSpace: 'nowrap',
};

function Legenda({ cor, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: cor, display: 'inline-block' }} />
      {label}
    </span>
  );
}
