import { useState, useEffect, useCallback } from 'react';
import { rh } from '../../../api';
import { Button } from '../../../components/ui/button';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const CRITERIOS = [
  { key: 'nota_produtividade', label: 'Produtividade', desc: 'Entrega de resultados e cumprimento de metas' },
  { key: 'nota_qualidade', label: 'Qualidade', desc: 'Nível de excelência do trabalho entregue' },
  { key: 'nota_pontualidade', label: 'Pontualidade', desc: 'Cumprimento de prazos e horários' },
  { key: 'nota_trabalho_equipe', label: 'Trabalho em Equipe', desc: 'Colaboração e relacionamento interpessoal' },
  { key: 'nota_iniciativa', label: 'Iniciativa', desc: 'Proatividade e busca por melhorias' },
  { key: 'nota_comunicacao', label: 'Comunicação', desc: 'Clareza e eficácia na comunicação' },
];

const NOTA_COLORS = ['', C.red, C.amber, C.amber, C.green, C.primary];
const NOTA_LABELS = ['', 'Insuficiente', 'Regular', 'Bom', 'Muito Bom', 'Excelente'];

const s = {
  card: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' },
  cardHeader: { padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: 700, color: C.text },
  btn: (v = 'primary') => ({ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s', ...(v === 'primary' ? { background: C.primary, color: '#fff' } : {}), ...(v === 'ghost' ? { background: 'transparent', color: C.text2 } : {}), ...(v === 'danger' ? { background: C.red, color: '#fff' } : {}) }),
  input: { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', width: '100%', background: 'var(--cbrio-input-bg)', color: C.text },
  label: { fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 },
  empty: { textAlign: 'center', padding: 40, color: C.text3, fontSize: 14 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px 16px', fontSize: 11, fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', borderBottom: `1px solid ${C.border}`, background: 'var(--cbrio-table-header)' },
  td: { padding: '12px 16px', fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}` },
  badge: (c, bg) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: c, background: bg }),
};

function NotaStars({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onClick={() => onChange?.(n)} type="button"
          style={{ background: 'none', border: 'none', cursor: onChange ? 'pointer' : 'default', fontSize: 20, transition: 'transform 0.1s', transform: n === value ? 'scale(1.2)' : '' }}>
          <span style={{ color: n <= (value || 0) ? NOTA_COLORS[value] || C.primary : C.text3, filter: n <= (value || 0) ? '' : 'grayscale(1) opacity(0.3)' }}>★</span>
        </button>
      ))}
      {value > 0 && <span style={{ fontSize: 11, color: NOTA_COLORS[value], fontWeight: 600, marginLeft: 6, alignSelf: 'center' }}>{NOTA_LABELS[value]}</span>}
    </div>
  );
}

export default function TabAvaliacoes({ funcionarios = [] }) {
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState(null); // null | {form data}
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setAvaliacoes(await rh.avaliacoes.list()); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const [localError, setLocalError] = useState('');

  async function salvar(overrides = {}) {
    setSaving(true);
    const payload = { ...panel, ...overrides };
    try {
      if (payload.id) await rh.avaliacoes.update(payload.id, payload);
      else await rh.avaliacoes.create(payload);
      setPanel(null); load(); setLocalError('');
    } catch (e) { setLocalError(e.message); }
    setSaving(false);
  }

  async function excluir(id) {
    try { await rh.avaliacoes.remove(id); load(); } catch (e) { setLocalError(e.message); }
  }

  const upd = (k, v) => setPanel(p => ({ ...p, [k]: v }));
  const thisYear = new Date().getFullYear();
  const periodos = [`${thisYear}-Q1`, `${thisYear}-Q2`, `${thisYear}-Q3`, `${thisYear}-Q4`, `${thisYear}-S1`, `${thisYear}-S2`, `${thisYear - 1}-S2`];
  const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

  function getMediaColor(nota) {
    if (nota >= 4.5) return C.primary;
    if (nota >= 3.5) return C.green;
    if (nota >= 2.5) return C.amber;
    return C.red;
  }

  return (<>
    {localError && <div style={{ color: '#ef4444', background: '#ef444418', border: '1px solid #ef444450', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>{localError}</div>}
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ fontSize: 13, color: C.text2 }}>{avaliacoes.length} avaliação(ões) registrada(s)</div>
      <Button onClick={() => setPanel({ funcionario_id: '', periodo: `${thisYear}-Q${Math.ceil((new Date().getMonth() + 1) / 3)}`, data_avaliacao: new Date().toISOString().slice(0, 10), status: 'rascunho' })}>
        + Nova Avaliação
      </Button>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: panel ? '1fr 1fr' : '1fr', gap: 16 }}>
      {/* Lista */}
      <div style={s.card}>
        <div style={s.cardHeader}><div style={s.cardTitle}>Avaliações</div></div>
        <table style={s.table}><thead><tr>
          <th style={s.th}>Colaborador</th>
          <th style={s.th}>Período</th>
          <th style={s.th}>Nota</th>
          <th style={s.th}>Status</th>
          <th style={s.th}>Ações</th>
        </tr></thead><tbody>
          {loading ? <tr><td style={s.td} colSpan={5}>Carregando...</td></tr>
          : avaliacoes.length === 0 ? <tr><td style={s.td} colSpan={5}><div style={s.empty}>Nenhuma avaliação</div></td></tr>
          : avaliacoes.map(a => (
            <tr key={a.id}>
              <td style={s.td}>
                <div style={{ fontWeight: 600 }}>{a.rh_funcionarios?.nome}</div>
                <div style={{ fontSize: 11, color: C.text3 }}>{a.rh_funcionarios?.cargo}</div>
              </td>
              <td style={s.td}>{a.periodo}</td>
              <td style={s.td}>
                {a.nota_geral ? <span style={{ fontSize: 16, fontWeight: 800, color: getMediaColor(a.nota_geral) }}>{Number(a.nota_geral).toFixed(1)}</span> : '—'}
              </td>
              <td style={s.td}><span style={s.badge(a.status === 'finalizado' ? C.green : C.text3, a.status === 'finalizado' ? C.greenBg : '#73737318')}>{a.status === 'finalizado' ? 'Finalizado' : 'Rascunho'}</span></td>
              <td style={s.td}>
                <Button variant="ghost" size="xs" onClick={() => setPanel(a)}>Editar</Button>
                <Button variant="ghost" size="xs" className="text-red-500" onClick={() => excluir(a.id)}>Excluir</Button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </div>

      {/* Painel de edição */}
      {panel && (
        <div style={s.card}>
          <div style={{ ...s.cardHeader }}>
            <div style={s.cardTitle}>{panel.id ? 'Editar Avaliação' : 'Nova Avaliação'}</div>
            <Button variant="ghost" size="sm" onClick={() => setPanel(null)}>✕</Button>
          </div>
          <div style={{ padding: 20, maxHeight: 600, overflowY: 'auto' }}>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Colaborador *</label>
              <ShadSelect value={panel.funcionario_id || '__none__'} onValueChange={v => upd('funcionario_id', v === '__none__' ? '' : v)}>
                <SelectTrigger className="w-full h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent className="z-[1001]">
                  <SelectItem value="__none__">Selecione...</SelectItem>
                  {funcionarios.filter(f => f.status === 'ativo').map(f => <SelectItem key={f.id} value={f.id}>{f.nome} — {f.cargo}</SelectItem>)}
                </SelectContent>
              </ShadSelect>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={s.label}>Período *</label>
                <ShadSelect value={panel.periodo || periodos[0]} onValueChange={v => upd('periodo', v)}>
                  <SelectTrigger className="w-full h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[1001]">
                    {periodos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </ShadSelect>
              </div>
              </div>
              <div>
                <label style={s.label}>Data</label>
                <input type="date" style={s.input} value={panel.data_avaliacao || ''} onChange={e => upd('data_avaliacao', e.target.value)} />
              </div>
            </div>

            <div style={{ background: 'var(--cbrio-input-bg)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Critérios de Avaliação</div>
              {CRITERIOS.map(c => (
                <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: C.text3 }}>{c.desc}</div>
                  </div>
                  <NotaStars value={panel[c.key] || 0} onChange={v => upd(c.key, v)} />
                </div>
              ))}
              {/* Média */}
              {(() => {
                const notas = CRITERIOS.map(c => panel[c.key]).filter(n => n);
                const media = notas.length ? (notas.reduce((a, b) => a + b, 0) / notas.length) : 0;
                return media > 0 ? (
                  <div style={{ marginTop: 12, textAlign: 'center' }}>
                    <span style={{ fontSize: 11, color: C.text2 }}>NOTA GERAL: </span>
                    <span style={{ fontSize: 24, fontWeight: 800, color: getMediaColor(media) }}>{media.toFixed(1)}</span>
                    <span style={{ fontSize: 12, color: getMediaColor(media), marginLeft: 8 }}>{NOTA_LABELS[Math.round(media)]}</span>
                  </div>
                ) : null;
              })()}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Pontos Fortes</label>
              <textarea style={{ ...s.input, minHeight: 50, resize: 'vertical' }} value={panel.pontos_fortes || ''} onChange={e => upd('pontos_fortes', e.target.value)} placeholder="O que o colaborador faz bem..." />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Pontos a Melhorar</label>
              <textarea style={{ ...s.input, minHeight: 50, resize: 'vertical' }} value={panel.pontos_melhoria || ''} onChange={e => upd('pontos_melhoria', e.target.value)} placeholder="O que pode ser melhorado..." />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Metas para Próximo Período</label>
              <textarea style={{ ...s.input, minHeight: 50, resize: 'vertical' }} value={panel.metas || ''} onChange={e => upd('metas', e.target.value)} placeholder="Objetivos a atingir..." />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <Button variant="ghost" onClick={() => salvar({ status: 'rascunho' })} disabled={saving}>Salvar Rascunho</Button>
              <Button onClick={() => salvar({ status: 'finalizado' })} disabled={saving}>
                {saving ? 'Salvando...' : 'Finalizar Avaliação'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  </>);
}
