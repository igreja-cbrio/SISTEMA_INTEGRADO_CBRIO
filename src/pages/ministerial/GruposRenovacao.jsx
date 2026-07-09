// ============================================================================
// Aba Config > "Renovação" do /grupos · confirmação de permanência entre temporadas.
//
// Modelo (Marcos 2026-07-09): multi-grupo é permitido, então a duplicidade a
// evitar é ENTRE temporadas. Aqui o líder (ou coord/admin) confirma quem
// CONTINUA no grupo dele na temporada nova — cria o vínculo na nova sem fechar
// o da anterior. Ao virar a temporada, "Encerrar" fecha em bloco os vínculos
// da anterior (reversível). Roster montado "pelo líder" (via lider_id do grupo).
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import { grupos as api } from '../../api';
import { toast } from 'sonner';
import { RefreshCw, Check, Users, ArrowRight, Lock, Undo2, AlertTriangle } from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: 'rgba(0,179,157,0.10)', green: '#10b981', red: '#ef4444', amber: '#f59e0b',
};

const FUNCAO_LABEL = {
  visitante: 'Visitante', frequentador: 'Membro', lider_treinamento: 'Líder em treino',
  lider: 'Líder', co_lider: 'Co-líder', supervisor: 'Supervisor', coordenador: 'Coordenador',
};

export default function GruposRenovacao() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState({});        // liderKey -> Set(membro_id)
  const [alvo, setAlvo] = useState({});      // liderKey -> grupo_para_id
  const [busy, setBusy] = useState({});      // liderKey -> bool
  const [encerrando, setEncerrando] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await api.renovacao.listar();
      setData(d);
      // seleção default: todos os pendentes (não renovados) marcados
      const s = {}, a = {};
      (d.blocos || []).forEach(b => {
        const key = b.lider.id || '(sem_lider)';
        const set = new Set();
        b.grupos_de.forEach(g => g.membros.forEach(m => { if (!m.ja_renovado) set.add(m.membro_id); }));
        s[key] = set;
        a[key] = b.grupos_para[0]?.id || '';
      });
      setSel(s); setAlvo(a);
    } catch (e) { toast.error(e.message || 'Erro ao carregar renovação'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const toggle = (key, membroId) => setSel(prev => {
    const set = new Set(prev[key] || []);
    set.has(membroId) ? set.delete(membroId) : set.add(membroId);
    return { ...prev, [key]: set };
  });

  const setAll = (key, bloco, marcar) => setSel(prev => {
    const set = new Set();
    if (marcar) bloco.grupos_de.forEach(g => g.membros.forEach(m => { if (!m.ja_renovado) set.add(m.membro_id); }));
    return { ...prev, [key]: set };
  });

  async function confirmar(bloco) {
    const key = bloco.lider.id || '(sem_lider)';
    const destino = alvo[key];
    if (!destino) { toast.error('Escolha o grupo de destino na temporada nova.'); return; }
    const selecionados = sel[key] || new Set();
    // itens: membros selecionados (não renovados) com a função da temporada anterior
    const itens = [];
    bloco.grupos_de.forEach(g => g.membros.forEach(m => {
      if (!m.ja_renovado && selecionados.has(m.membro_id)) itens.push({ membro_id: m.membro_id, funcao: m.funcao });
    }));
    if (!itens.length) { toast.error('Selecione ao menos uma pessoa.'); return; }
    setBusy(b => ({ ...b, [key]: true }));
    try {
      const r = await api.renovacao.confirmar(destino, itens);
      toast.success(`${r.criados} confirmado(s) na temporada nova.`);
      load();
    } catch (e) { toast.error(e.message || 'Erro ao confirmar'); }
    finally { setBusy(b => ({ ...b, [key]: false })); }
  }

  async function encerrarTemporada() {
    if (!data?.de?.id) return;
    if (!confirm(
      `Encerrar todos os vínculos da temporada "${data.de.label}"?\n\n` +
      `Isso marca a saída de todas as participações dessa temporada de uma vez ` +
      `(quem já foi renovado continua ativo na temporada nova). É reversível.`
    )) return;
    setEncerrando(true);
    try {
      const r = await api.renovacao.encerrar(data.de.id);
      toast.success(`${r.fechados} vínculo(s) encerrado(s).`);
      load();
    } catch (e) { toast.error(e.message || 'Erro ao encerrar'); }
    finally { setEncerrando(false); }
  }

  async function reabrirTemporada() {
    if (!data?.de?.id) return;
    if (!confirm(`Reabrir os vínculos encerrados da temporada "${data.de.label}"? Desfaz o último encerramento.`)) return;
    setEncerrando(true);
    try {
      const r = await api.renovacao.reabrir(data.de.id);
      toast.success(`${r.reabertos} vínculo(s) reaberto(s).`);
      load();
    } catch (e) { toast.error(e.message || 'Erro ao reabrir'); }
    finally { setEncerrando(false); }
  }

  const resumo = data?.resumo;

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando...</div>;
  if (!data?.de) return (
    <div style={{ padding: 32, textAlign: 'center', color: C.t3 }}>
      Nenhuma temporada ativa encontrada.
    </div>
  );

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Cabeçalho de → para */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <RefreshCw size={18} style={{ color: C.primary }} /> Renovação de temporada
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.t2 }}>
          <span style={{ fontWeight: 600 }}>{data.de.label}</span>
          <ArrowRight size={14} style={{ color: C.t3 }} />
          <span style={{ fontWeight: 600, color: data.para ? C.primary : C.red }}>{data.para?.label || 'sem temporada nova'}</span>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: C.t3, margin: '0 0 16px', lineHeight: 1.5 }}>
        Para cada líder, marque quem <strong>continua</strong> no grupo dele na temporada nova. Ao final, use
        <strong> "Encerrar temporada anterior"</strong> para fechar em bloco os vínculos que sobraram — quem foi
        renovado segue ativo na temporada nova; o resto sai (pode se reinscrever). Tudo é reversível.
      </p>

      {/* Resumo */}
      {resumo && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          <Chip label="Pessoas na temporada atual" value={resumo.membros_de} />
          <Chip label="Já renovadas" value={resumo.ja_renovados} color={C.green} />
          <Chip label="A confirmar" value={resumo.pendentes} color={C.amber} />
          {resumo.lideres_sem_grupo_para > 0 && (
            <Chip label="Líderes sem grupo na nova" value={resumo.lideres_sem_grupo_para} color={C.red} />
          )}
        </div>
      )}

      {!data.para && (
        <div style={{ padding: 14, marginBottom: 16, background: C.red + '12', border: `1px solid ${C.red}`, borderRadius: 10, color: C.red, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={16} /> Ainda não há uma temporada nova cadastrada depois de "{data.de.label}". Crie/ative a próxima temporada e os grupos dela antes de renovar.
        </div>
      )}

      {/* Blocos por líder */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {(data.blocos || []).map(bloco => {
          const key = bloco.lider.id || '(sem_lider)';
          const selSet = sel[key] || new Set();
          const totalPend = bloco.grupos_de.reduce((n, g) => n + g.membros.filter(m => !m.ja_renovado).length, 0);
          const semAlvo = bloco.grupos_para.length === 0;
          return (
            <div key={key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <Users size={16} style={{ color: C.primary }} />
                <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{bloco.lider.nome}</span>
                <span style={{ fontSize: 11.5, color: C.t3 }}>
                  {bloco.grupos_de.length} grupo(s) · {totalPend} a confirmar
                </span>
              </div>

              {semAlvo ? (
                <div style={{ padding: 10, background: C.amber + '12', border: `1px solid ${C.amber}`, borderRadius: 8, color: C.amber, fontSize: 12.5 }}>
                  Este líder ainda não tem grupo na temporada nova. Crie o grupo dele em {data.para?.label || 'temporada nova'} para poder renovar.
                </div>
              ) : (
                <>
                  {/* alvo + ações */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                    <label style={{ fontSize: 12, color: C.t3 }}>Grupo na temporada nova:</label>
                    <select
                      value={alvo[key] || ''}
                      onChange={e => setAlvo(a => ({ ...a, [key]: e.target.value }))}
                      style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12.5, maxWidth: 360 }}
                    >
                      {bloco.grupos_para.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                    </select>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => setAll(key, bloco, true)} style={linkBtn}>Marcar todos</button>
                    <button onClick={() => setAll(key, bloco, false)} style={linkBtn}>Limpar</button>
                    <button
                      onClick={() => confirmar(bloco)}
                      disabled={busy[key] || selSet.size === 0}
                      style={{ ...primaryBtn, opacity: busy[key] || selSet.size === 0 ? 0.5 : 1 }}
                    >
                      {busy[key] ? 'Confirmando...' : `Confirmar ${selSet.size}`}
                    </button>
                  </div>

                  {/* membros agrupados por grupo de origem */}
                  {bloco.grupos_de.map(g => (
                    <div key={g.id} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11.5, color: C.t3, fontWeight: 600, margin: '6px 0 4px' }}>{g.nome} <span style={{ fontWeight: 400 }}>({g.membros.length})</span></div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                        {g.membros.map(m => (
                          <label key={m.membro_id} title={FUNCAO_LABEL[m.funcao] || m.funcao} style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 7, fontSize: 12.5,
                            background: m.ja_renovado ? C.green + '12' : (selSet.has(m.membro_id) ? C.primaryBg : 'transparent'),
                            color: m.ja_renovado ? C.green : C.text, cursor: m.ja_renovado ? 'default' : 'pointer',
                            border: `1px solid ${m.ja_renovado ? C.green + '40' : C.border}`,
                          }}>
                            {m.ja_renovado ? (
                              <Check size={14} style={{ color: C.green, flexShrink: 0 }} />
                            ) : (
                              <input type="checkbox" checked={selSet.has(m.membro_id)} onChange={() => toggle(key, m.membro_id)} style={{ accentColor: C.primary }} />
                            )}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</span>
                            {(m.funcao && m.funcao !== 'frequentador' && m.funcao !== 'visitante') && (
                              <span style={{ marginLeft: 'auto', fontSize: 9.5, padding: '1px 5px', borderRadius: 99, background: C.primary + '18', color: C.primary, whiteSpace: 'nowrap' }}>{FUNCAO_LABEL[m.funcao]}</span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Encerramento em bloco */}
      <div style={{ marginTop: 24, padding: 16, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Lock size={15} style={{ color: C.red }} />
          <strong style={{ color: C.text, fontSize: 14 }}>Virar a temporada</strong>
        </div>
        <p style={{ fontSize: 12, color: C.t3, margin: '0 0 12px', lineHeight: 1.5 }}>
          Depois de renovar quem continua, encerre os vínculos da temporada anterior. Isso zera as
          duplicidades entre temporadas: quem foi renovado segue ativo na temporada nova, o resto sai.
          Se errar, "Reabrir" desfaz.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={encerrarTemporada} disabled={encerrando} style={{ ...primaryBtn, background: C.red, opacity: encerrando ? 0.6 : 1 }}>
            <Lock size={13} /> Encerrar temporada anterior
          </button>
          <button onClick={reabrirTemporada} disabled={encerrando} style={{ ...linkBtn, border: `1px solid ${C.border}`, padding: '8px 14px', borderRadius: 8 }}>
            <Undo2 size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Reabrir (desfazer)
          </button>
        </div>
      </div>
    </div>
  );
}

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
  background: '#00B39D', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
};
const linkBtn = {
  background: 'none', border: 'none', color: '#00B39D', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 6px',
};

function Chip({ label, value, color }) {
  return (
    <div style={{ padding: '8px 14px', borderRadius: 10, background: C.card, border: `1px solid ${C.border}`, minWidth: 120 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || C.text, lineHeight: 1 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>{label}</div>
    </div>
  );
}
