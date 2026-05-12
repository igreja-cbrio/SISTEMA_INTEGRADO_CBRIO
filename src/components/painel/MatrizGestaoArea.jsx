// ============================================================================
// MatrizGestaoArea · grid 8 areas adm × 6 areas-cliente no /painel
//
// Cada celula = saude do servico daquela area adm para aquela area-cliente
// nos ultimos 30 dias (% concluidas no SLA + alerta de atrasados).
//
// Click numa celula abre modal com as solicitacoes daquela intersecao.
// Mesmo padrao visual da MatrizValorArea (cores fortes nas celulas).
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { painel as painelApi } from '../../api';
import { X, Clock, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { formatErro } from '../../lib/formatErro';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  inputBg: 'var(--cbrio-input-bg)',
};

const STATUS_COR = {
  verde:    '#10B981',
  amarelo:  '#F59E0B',
  vermelho: '#EF4444',
  sem_dado: '#E5E7EB',
};

const STATUS_LABEL = {
  verde:    'OK',
  amarelo:  'Atencao',
  vermelho: 'Critico',
  sem_dado: 'Sem dado',
};

export default function MatrizGestaoArea() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [celulaAberta, setCelulaAberta] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await painelApi.matrizAdm();
      setData(r);
    } catch (e) {
      setErro(formatErro(e, 'matriz administrativa'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <section style={cardStyle}>
        <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>
          Carregando matriz administrativa...
        </div>
      </section>
    );
  }
  if (erro) {
    return (
      <section style={cardStyle}>
        <div style={{ padding: 30, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>{erro}</div>
      </section>
    );
  }
  if (!data) return null;

  const { grupos_adm, areas_cliente, cells, desde } = data;

  return (
    <>
      <section style={cardStyle}>
        <header style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
            Matriz Gestão × Área
          </h3>
          <p style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
            Como cada area da gestao serve cada area de culto. % de solicitacoes
            concluidas no SLA nos ultimos 30 dias. Hospitalidade agrega Reserva + Cozinha +
            Manutencao · Logistica agrega Estoque + Compras.
          </p>
        </header>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4, minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, color: C.t3, fontWeight: 700, textTransform: 'uppercase' }}>
                  Gestão \ Cliente
                </th>
                {areas_cliente.map(c => (
                  <th key={c.id} style={{
                    padding: '6px 4px', fontSize: 10, color: C.t2, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 0.3, minWidth: 78,
                  }}>
                    {c.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos_adm.map(grupo => (
                <tr key={grupo.key}>
                  <td style={{
                    padding: '6px 8px', fontSize: 11, fontWeight: 700, color: C.text,
                    background: C.inputBg, borderRadius: 6, borderLeft: `3px solid ${grupo.cor}`,
                    whiteSpace: 'nowrap',
                  }}>
                    {grupo.label}
                    {grupo.subareas && grupo.subareas.length > 1 && (
                      <div style={{ fontSize: 9, color: C.t3, fontWeight: 500, marginTop: 2 }}>
                        {grupo.sub_labels.join(' · ')}
                      </div>
                    )}
                  </td>
                  {areas_cliente.map(cli => {
                    const cell = cells[`${grupo.key}:${cli.id}`];
                    return (
                      <td key={cli.id} style={{ padding: 0 }}>
                        <CelulaBox cell={cell} onClick={() => cell.total > 0 && setCelulaAberta(cell)} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.t2 }}>
          <Legenda cor={STATUS_COR.verde}    texto="≥ 90% no SLA" />
          <Legenda cor={STATUS_COR.amarelo}  texto="70-89%" />
          <Legenda cor={STATUS_COR.vermelho} texto="< 70% ou com atraso" />
          <Legenda cor={STATUS_COR.sem_dado} texto="Sem solicitação" />
          <span style={{ marginLeft: 'auto', fontSize: 10, color: C.t3 }}>desde {desde}</span>
        </div>
      </section>

      {celulaAberta && (
        <ModalCelulaAdm
          cell={celulaAberta}
          onClose={() => setCelulaAberta(null)}
        />
      )}
    </>
  );
}

function CelulaBox({ cell, onClick }) {
  const cor = STATUS_COR[cell.status] || STATUS_COR.sem_dado;
  const semDado = cell.status === 'sem_dado';
  return (
    <button
      onClick={onClick}
      disabled={semDado}
      style={{
        width: '100%',
        minHeight: 56,
        background: cor,
        opacity: semDado ? 0.4 : 1,
        border: 'none',
        borderRadius: 6,
        color: '#fff',
        padding: '8px 6px',
        cursor: semDado ? 'default' : 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 2,
        transition: 'transform 0.15s',
      }}
      onMouseEnter={e => !semDado && (e.currentTarget.style.transform = 'scale(1.04)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      title={semDado ? 'Sem solicitação nos últimos 30 dias' : `${cell.no_prazo}/${cell.concluidos} no SLA · ${cell.atrasados} atrasados · ${cell.em_andamento} em andamento`}
    >
      {cell.percentual != null ? (
        <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{cell.percentual}%</span>
      ) : (
        <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1, color: 'rgba(255,255,255,0.5)' }}>—</span>
      )}
      <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.9 }}>
        {cell.total} {cell.total === 1 ? 'sol.' : 'sol.'}
      </span>
    </button>
  );
}

function Legenda({ cor, texto }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: 12, background: cor, borderRadius: 3 }} />
      <span>{texto}</span>
    </span>
  );
}

function ModalCelulaAdm({ cell, onClose }) {
  const [solicitacoes, setSolicitacoes] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    painelApi.celulaAdm(cell.grupo_adm, cell.area_cliente)
      .then(r => setSolicitacoes(r.solicitacoes || []))
      .catch(() => setSolicitacoes([]))
      .finally(() => setLoading(false));
  }, [cell.grupo_adm, cell.area_cliente]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: C.overlay,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.modalBg, borderRadius: 12,
        maxWidth: 720, width: '100%', maxHeight: '85vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <header style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {cell.grupo_label} × {cell.area_cliente_nome}
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '2px 0 0' }}>
              {cell.percentual != null ? `${cell.percentual}% no SLA` : 'Sem dados'}
            </h3>
            <p style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
              {cell.total} solicitações · {cell.no_prazo} no prazo · {cell.atrasados} atrasadas · {cell.em_andamento} em andamento
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </header>

        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 12 }}>Carregando...</div>
          ) : !solicitacoes?.length ? (
            <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 12 }}>Sem solicitações no período.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {solicitacoes.map(s => <LinhaSolicitacao key={s.id} sol={s} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LinhaSolicitacao({ sol }) {
  const status = sol.sla_resolucao_status;
  const Icon = status === 'concluiu_no_prazo' ? CheckCircle2
             : status === 'atrasado' ? AlertCircle
             : status === 'concluiu_atrasado' ? Clock
             : Clock;
  const cor = status === 'concluiu_no_prazo' ? '#10B981'
            : status === 'atrasado' || status === 'concluiu_atrasado' ? '#EF4444'
            : '#9CA3AF';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', background: C.inputBg, borderRadius: 6, fontSize: 12,
    }}>
      <Icon size={14} style={{ color: cor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontWeight: 500 }}>{sol.titulo}</div>
        <div style={{ fontSize: 10, color: C.t3 }}>
          {sol.area_responsavel && <strong style={{ textTransform: 'capitalize' }}>{sol.area_responsavel.replace('_', ' ')}</strong>}
          {sol.area_responsavel && ' · '}
          {new Date(sol.created_at).toLocaleDateString('pt-BR')}
          {sol.concluido_em && ` · concluído em ${new Date(sol.concluido_em).toLocaleDateString('pt-BR')}`}
          {sol.horas_total != null && ` · ${Math.round(sol.horas_total)}h`}
        </div>
      </div>
      {sol.eh_urgente && (
        <span title="Urgente" style={{ color: '#F59E0B' }}><Zap size={12} /></span>
      )}
      <span style={{
        fontSize: 9, padding: '2px 6px', borderRadius: 99,
        background: cor + '20', color: cor, fontWeight: 700, textTransform: 'uppercase',
      }}>
        {sol.status}
      </span>
    </div>
  );
}

const cardStyle = {
  background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
  padding: 18,
};
