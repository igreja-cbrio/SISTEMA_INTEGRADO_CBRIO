// ============================================================================
// OKRs de ciclo + Índice da Base — fase 2A (2026-08-21)
//
// Montado dentro da Estrutura OKR (/gestao). Duas peças do desenho novo
// ("O Motor e os Anéis", 19/08), que substituem a camada dos 637 KRs:
//
//   1. ÍNDICE DA BASE  · agregação DERIVADA (só leitura · nunca cadastro)
//   2. OKRs DE CICLO   · trimestral, com dono, delta pactuado, morre no fim
//
// ⚠️ O Índice é a LENTE VIVA (base ~1,7 mil membros ativos). A fatia da
// presidência usa base FIXA de 3.000 com numeradores próprios — os dois números
// NUNCA vão no mesmo documento (lei de 18/08).
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { estrategia as estrategiaApi, users as usersApi } from '../../api';
import {
  Plus, Pencil, Trash2, X, Save, Gauge, Repeat, CheckCircle2,
  AlertTriangle, Info,
} from 'lucide-react';
import { toast } from 'sonner';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)',
  t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)', inputBg: 'var(--cbrio-input-bg)',
  modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#00B39D18',
};

const VALOR_META = {
  seguir:       { label: 'Seguir Jesus',   cor: '#8B5CF6' },
  conectar:     { label: 'Conectar',       cor: '#3B82F6' },
  investir:     { label: 'Investir Tempo', cor: '#F59E0B' },
  servir:       { label: 'Servir',         cor: '#10B981' },
  generosidade: { label: 'Generosidade',   cor: '#EC4899' },
};

const FAROL_CORES = {
  verde:    { bg: '#10B98118', fg: '#10B981', label: 'No alvo' },
  amarelo:  { bg: '#F59E0B18', fg: '#F59E0B', label: 'Atenção' },
  vermelho: { bg: '#EF444418', fg: '#EF4444', label: 'Fora do alvo' },
  sem_dado: { bg: 'var(--cbrio-input-bg)', fg: 'var(--cbrio-text3)', label: 'Sem medição' },
};

const STATUS_KR = {
  ativo:      { label: 'Ativo',      cor: '#00B39D' },
  concluido:  { label: 'Concluído',  cor: '#10B981' },
  abandonado: { label: 'Abandonado', cor: 'var(--cbrio-text3)' },
};

const fmtPct = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const fmtNum = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
// Datas de coluna DATE parseadas como LOCAL — `new Date('2026-08-01')` é meia-noite
// UTC, ou seja 31/07 no Rio, e o rótulo do trimestre sairia um dia atrás.
const fmtData = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '—');

export default function OkrCiclo() {
  const [indice, setIndice] = useState(null);
  const [indiceErro, setIndiceErro] = useState(null);
  const [ciclo, setCiclo] = useState(null);
  const [krs, setKrs] = useState([]);
  const [kpis, setKpis] = useState([]);
  const [pessoas, setPessoas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editKr, setEditKr] = useState(null);
  const [novoCiclo, setNovoCiclo] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    // ⚠️ allSettled: o Índice e os OKRs de ciclo falham SOZINHOS. Uma consulta
    // que quebra não pode apagar a outra peça da tela.
    const [rIdx, rVig, rKpis, rPessoas] = await Promise.allSettled([
      estrategiaApi.indiceBase(),
      estrategiaApi.ciclos.vigente(),
      estrategiaApi.linhagem.resumo(),
      usersApi.list(),
    ]);

    if (rIdx.status === 'fulfilled') { setIndice(rIdx.value); setIndiceErro(null); }
    else { setIndice(null); setIndiceErro(rIdx.reason?.message || 'Erro ao calcular o índice'); }

    if (rVig.status === 'fulfilled') {
      setCiclo(rVig.value?.ciclo || null);
      setKrs(rVig.value?.krs || []);
    } else {
      toast.error(rVig.reason?.message || 'Erro ao carregar o ciclo');
    }

    if (rKpis.status === 'fulfilled') setKpis(rKpis.value?.kpis || []);
    if (rPessoas.status === 'fulfilled') setPessoas(rPessoas.value || []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarKr = async (form) => {
    try {
      if (form.id) await estrategiaApi.ciclos.krs.update(form.id, form);
      else await estrategiaApi.ciclos.krs.create(ciclo.id, form);
      toast.success('Resultado-chave salvo');
      setEditKr(null);
      carregar();
    } catch (e) { toast.error(e?.message || 'Erro ao salvar'); }
  };

  const abandonarKr = async (kr) => {
    if (!window.confirm(`Marcar "${kr.objetivo_texto}" como abandonado? O registro fica no ciclo com o aprendizado.`)) return;
    try {
      await estrategiaApi.ciclos.krs.update(kr.id, { status: 'abandonado' });
      toast.success('Marcado como abandonado');
      carregar();
    } catch (e) { toast.error(e?.message); }
  };

  const criarCiclo = async (form) => {
    try {
      const r = await estrategiaApi.ciclos.create(form);
      // O servidor devolve o que fechou — abrir um ciclo ENCERRA o anterior, e
      // quem clicou precisa saber sem ir conferir.
      if (r?.fechados?.length) {
        toast.success(`Ciclo aberto · "${r.fechados[0].nome}" foi encerrado`);
      } else {
        toast.success('Ciclo aberto');
      }
      setNovoCiclo(null);
      carregar();
    } catch (e) { toast.error(e?.message || 'Erro ao abrir o ciclo'); }
  };

  const ativos = useMemo(() => krs.filter(k => k.status === 'ativo'), [krs]);
  const encerrados = useMemo(() => krs.filter(k => k.status !== 'ativo'), [krs]);

  return (
    <>
      <IndiceCard indice={indice} erro={indiceErro} loading={loading} />

      <section style={cardStyle}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <h2 style={{ ...h2Style, marginBottom: 4 }}>
              <Repeat size={15} style={{ color: C.primary }} /> OKRs do ciclo
            </h2>
            <p style={{ fontSize: 11.5, color: C.t3, margin: 0, maxWidth: 560, lineHeight: 1.5 }}>
              Cada resultado-chave é um <strong>delta pactuado</strong> sobre um indicador vivo
              (de X para Y), com dono e prazo — e morre no fim do ciclo. Padrão permanente
              (“manter na faixa”) é meta do KPI, não KR.
            </p>
          </div>
          {ciclo ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{ciclo.nome}</div>
              <div style={{ fontSize: 11, color: C.t3 }}>{fmtData(ciclo.inicio)} → {fmtData(ciclo.fim)}</div>
            </div>
          ) : null}
        </header>

        {loading ? (
          <p style={{ fontSize: 12, color: C.t3 }}>Carregando…</p>
        ) : !ciclo ? (
          <div style={{ padding: '20px 16px', textAlign: 'center', border: `1px dashed ${C.border}`, borderRadius: 10 }}>
            <p style={{ fontSize: 13, color: C.t2, margin: '0 0 4px' }}>Nenhum ciclo aberto.</p>
            <p style={{ fontSize: 11.5, color: C.t3, margin: '0 0 14px' }}>
              Entre trimestres isso é normal — os ciclos anteriores ficam no histórico.
            </p>
            <button onClick={() => setNovoCiclo({})} style={btnPrimary}>
              <Plus size={14} /> Abrir ciclo
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setEditKr({ ciclo_id: ciclo.id, direcao: 'maior_melhor' })} style={btnPrimary}>
                <Plus size={14} /> Novo resultado-chave
              </button>
              <button onClick={() => setNovoCiclo({})} style={btnGhost}>
                <Repeat size={13} /> Abrir novo ciclo
              </button>
            </div>

            {ativos.length === 0 && encerrados.length === 0 ? (
              <p style={{ fontSize: 12, color: C.t3, padding: '10px 0' }}>
                Ciclo sem resultados-chave ainda. O cânon é <strong>2 a 4 por unidade</strong> —
                a matriz de KPIs cobre tudo; o OKR escolhe pouco.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {ativos.map(kr => (
                  <KrLinha key={kr.id} kr={kr} onEdit={() => setEditKr(kr)} onAbandonar={() => abandonarKr(kr)} />
                ))}
                {encerrados.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ fontSize: 11.5, color: C.t3, cursor: 'pointer' }}>
                      {encerrados.length} encerrado(s) neste ciclo
                    </summary>
                    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                      {encerrados.map(kr => (
                        <KrLinha key={kr.id} kr={kr} onEdit={() => setEditKr(kr)} />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {editKr && (
        <KrModal
          kr={editKr}
          kpis={kpis}
          pessoas={pessoas}
          onClose={() => setEditKr(null)}
          onSave={salvarKr}
        />
      )}
      {novoCiclo && (
        <CicloModal
          cicloAberto={ciclo}
          onClose={() => setNovoCiclo(null)}
          onSave={criarCiclo}
        />
      )}
    </>
  );
}

// ============================================================================
// Índice da Base
// ============================================================================
function IndiceCard({ indice, erro, loading }) {
  const [mostrar5, setMostrar5] = useState(false);

  if (loading) {
    return (
      <section style={cardStyle}>
        <h2 style={h2Style}><Gauge size={15} style={{ color: C.primary }} /> Índice da Base</h2>
        <p style={{ fontSize: 12, color: C.t3 }}>Calculando…</p>
      </section>
    );
  }

  // ⚠️ Erro NÃO vira índice zerado: "a base não está engajada" e "a consulta
  // falhou" levam a decisões opostas.
  if (erro || !indice) {
    return (
      <section style={{ ...cardStyle, borderColor: '#F59E0B55' }}>
        <h2 style={h2Style}><Gauge size={15} style={{ color: '#F59E0B' }} /> Índice da Base</h2>
        <p style={{ fontSize: 12, color: '#F59E0B', margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Não foi possível calcular agora. {erro ? `(${erro})` : ''} O número não é zero — é desconhecido.</span>
        </p>
      </section>
    );
  }

  const media = mostrar5 ? indice.media_5 : indice.media_3;
  const pv = indice.por_valor || {};
  const doMedia = new Set(media?.valores || []);

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ ...h2Style, marginBottom: 4 }}>
            <Gauge size={15} style={{ color: C.primary }} /> Índice da Base
          </h2>
          <p style={{ fontSize: 11.5, color: C.t3, margin: 0 }}>
            % da membresia com sinal real em cada valor · alvo ≥ 50%
          </p>
        </div>
        {/* media_3 × media_5 é decisão do Pr. Juninho — a tela mostra as duas em
            vez de escolher por ele, e diz o que cada uma contém. */}
        <div style={{ display: 'flex', gap: 4, background: C.inputBg, padding: 3, borderRadius: 8 }}>
          {[{ k: false, l: '3 valores' }, { k: true, l: '5 valores' }].map(op => (
            <button key={op.l} onClick={() => setMostrar5(op.k)} style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6,
              cursor: 'pointer', background: mostrar5 === op.k ? C.card : 'transparent',
              color: mostrar5 === op.k ? C.text : C.t3,
            }}>{op.l}</button>
          ))}
        </div>
      </header>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: (media?.pct ?? 0) >= 50 ? '#10B981' : C.text, lineHeight: 1 }}>
          {fmtPct(media?.pct)}
        </span>
        <span style={{ fontSize: 12, color: C.t3 }}>
          engajamento médio · base de {fmtNum(indice.base)} membros ativos
        </span>
      </div>
      <p style={{ fontSize: 11, color: C.t3, margin: '0 0 14px' }}>{media?.nota}</p>

      <div style={{ display: 'grid', gap: 6 }}>
        {Object.entries(VALOR_META).map(([key, meta]) => {
          const v = pv[key];
          const pct = v?.pct ?? null;
          const naMedia = doMedia.has(key);
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: naMedia ? 1 : 0.45 }}>
              <span style={{ width: 108, fontSize: 11.5, color: C.t2, flexShrink: 0 }}>{meta.label}</span>
              <div style={{ flex: 1, height: 8, background: C.inputBg, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, pct ?? 0)}%`, height: '100%', background: meta.cor, borderRadius: 4 }} />
              </div>
              <span style={{ width: 92, fontSize: 11.5, color: C.text, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {fmtPct(pct)} <span style={{ color: C.t3 }}>({fmtNum(v?.n)})</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Investir em 0% é FATO medido, não bug — e sem esta nota o número
          pareceria defeito da tela. */}
      {pv.investir?.n === 0 && (
        <p style={{ fontSize: 10.5, color: C.t3, marginTop: 10, display: 'flex', gap: 5, alignItems: 'flex-start' }}>
          <Info size={11} style={{ flexShrink: 0, marginTop: 1.5 }} />
          <span>
            Investir em 0% é o dado real: o devocional do app é a única fonte desse valor
            e o uso ainda é quase zero. Não é falha de cálculo.
          </span>
        </p>
      )}

      <p style={{ fontSize: 10.5, color: C.t3, marginTop: 8, display: 'flex', gap: 5, alignItems: 'flex-start' }}>
        <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1.5, color: '#F59E0B' }} />
        <span>
          Lente do sistema (base viva de {fmtNum(indice.base)}). A planilha da presidência
          divide por 3.000 e usa numeradores próprios — os dois números não vão no mesmo
          documento.
        </span>
      </p>
    </section>
  );
}

// ============================================================================
// Linha do KR de ciclo
// ============================================================================
function KrLinha({ kr, onEdit, onAbandonar }) {
  const farol = FAROL_CORES[kr.farol] || FAROL_CORES.sem_dado;
  const st = STATUS_KR[kr.status] || STATUS_KR.ativo;
  const un = kr.unidade || '';

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px',
      background: C.inputBg, opacity: kr.status === 'abandonado' ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 3 }}>
            {kr.objetivo_texto}
          </div>
          <div style={{ fontSize: 11, color: C.t3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span>
              de <strong style={{ color: C.t2 }}>{fmtNum(kr.baseline)}{un}</strong>
              {' '}para <strong style={{ color: C.t2 }}>{fmtNum(kr.alvo)}{un}</strong>
            </span>
            {kr.dono_nome && <span>· {kr.dono_nome}</span>}
            {kr.kpi_id && <span>· {kr.kpi_id}</span>}
            {kr.status !== 'ativo' && <span style={{ color: st.cor }}>· {st.label}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {onEdit && <button onClick={onEdit} style={iconBtn} title="Editar"><Pencil size={13} /></button>}
          {onAbandonar && <button onClick={onAbandonar} style={iconBtn} title="Marcar como abandonado"><Trash2 size={13} /></button>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <div style={{ flex: 1, height: 6, background: C.card, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(100, kr.progresso_pct ?? 0)}%`, height: '100%',
            background: farol.fg, borderRadius: 3,
          }} />
        </div>
        <span style={{
          fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
          background: farol.bg, color: farol.fg, flexShrink: 0,
        }}>
          {kr.progresso_pct == null ? farol.label : `${fmtPct(kr.progresso_pct)} do caminho`}
        </span>
      </div>

      {/* Realizado sempre COM o período: número sem a janela ao lado é número
          que se lê errado (lei da casa). */}
      <div style={{ fontSize: 10.5, color: C.t3, marginTop: 5 }}>
        {kr.realizado != null
          ? <>Hoje: <strong style={{ color: C.t2 }}>{fmtNum(kr.realizado)}{un}</strong>{kr.realizado_periodo ? ` · ${kr.realizado_periodo}` : ''}</>
          : 'Sem medição no indicador ainda.'}
        {kr.nota_final != null && <> · nota final <strong style={{ color: C.t2 }}>{Number(kr.nota_final).toFixed(1)}</strong></>}
      </div>
      {kr.aprendizado && (
        <p style={{ fontSize: 11, color: C.t2, margin: '6px 0 0', paddingLeft: 8, borderLeft: `2px solid ${C.border}` }}>
          {kr.aprendizado}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Modal · KR de ciclo
// ============================================================================
function KrModal({ kr, kpis, pessoas, onClose, onSave }) {
  const [form, setForm] = useState({
    id: kr.id || null,
    objetivo_texto: kr.objetivo_texto || '',
    kpi_id: kr.kpi_id || '',
    dono_id: kr.dono_id || '',
    baseline: kr.baseline ?? '',
    alvo: kr.alvo ?? '',
    unidade: kr.unidade || '',
    direcao: kr.direcao || 'maior_melhor',
    status: kr.status || 'ativo',
    nota_final: kr.nota_final ?? '',
    aprendizado: kr.aprendizado || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Ao escolher o KPI, herda a unidade dele quando o campo está vazio — evita o
  // KR nascer sem unidade e a tela mostrar "de 40 para 50" sem dizer de quê.
  const escolherKpi = (e) => {
    const id = e.target.value;
    const k = kpis.find(x => x.id === id);
    setForm(f => ({ ...f, kpi_id: id, unidade: f.unidade || (k?.unidade || '') }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  const kpisOrdenados = useMemo(
    () => [...kpis].sort((a, b) => (a.id || '').localeCompare(b.id || '')),
    [kpis],
  );

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={modalStyle}>
        <header style={modalHeader}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
            {form.id ? 'Editar resultado-chave' : 'Novo resultado-chave'}
          </h3>
          <button type="button" onClick={onClose} style={iconBtn}><X size={16} /></button>
        </header>

        <div style={{ display: 'grid', gap: 12 }}>
          <Campo label="O que muda neste ciclo *" hint="Escreva o resultado, não a tarefa. Se a frase continuar fazendo sentido em 31/dez, não é um KR — é meta de KPI.">
            <input value={form.objetivo_texto} onChange={set('objetivo_texto')} required
              placeholder="Ex.: elevar o 1º contato em ≤3 dias de 41% para 70%" style={inputStyle} />
          </Campo>

          <Campo label="Indicador que mede *" hint="Sem fonte, ninguém consegue dizer se foi atingido — e era isso que deixava 303 dos 316 KRs antigos sem número.">
            <select value={form.kpi_id} onChange={escolherKpi} required style={inputStyle}>
              <option value="">Escolha o KPI…</option>
              {kpisOrdenados.map(k => (
                <option key={k.id} value={k.id}>{k.id} · {k.indicador}</option>
              ))}
            </select>
          </Campo>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: 8 }}>
            <Campo label="Hoje (baseline) *">
              <input type="number" step="any" value={form.baseline} onChange={set('baseline')} required style={inputStyle} />
            </Campo>
            <Campo label="Alvo do ciclo *">
              <input type="number" step="any" value={form.alvo} onChange={set('alvo')} required style={inputStyle} />
            </Campo>
            <Campo label="Unidade">
              <input value={form.unidade} onChange={set('unidade')} placeholder="%" style={inputStyle} />
            </Campo>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Campo label="Dono *" hint="Quem pactuou o número.">
              <select value={form.dono_id} onChange={set('dono_id')} required style={inputStyle}>
                <option value="">Escolha…</option>
                {pessoas.map(p => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
              </select>
            </Campo>
            <Campo label="Direção" hint="Menor-é-melhor existe (prazo, churn, rotatividade).">
              <select value={form.direcao} onChange={set('direcao')} style={inputStyle}>
                <option value="maior_melhor">Maior é melhor</option>
                <option value="menor_melhor">Menor é melhor</option>
              </select>
            </Campo>
          </div>

          {form.id && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Campo label="Status">
                  <select value={form.status} onChange={set('status')} style={inputStyle}>
                    <option value="ativo">Ativo</option>
                    <option value="concluido">Concluído</option>
                    <option value="abandonado">Abandonado</option>
                  </select>
                </Campo>
                <Campo label="Nota final (0 a 1)" hint="Fechamento do ciclo, no padrão OKR.">
                  <input type="number" step="0.1" min="0" max="1" value={form.nota_final} onChange={set('nota_final')} style={inputStyle} />
                </Campo>
              </div>
              <Campo label="Aprendizado" hint="O que o ciclo ensinou. É a parte que sobrevive ao ciclo.">
                <textarea value={form.aprendizado} onChange={set('aprendizado')} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </Campo>
            </>
          )}
        </div>

        <footer style={modalFooter}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancelar</button>
          <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
            <Save size={14} /> {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </footer>
      </form>
    </div>
  );
}

// ============================================================================
// Modal · abrir ciclo
// ============================================================================
function CicloModal({ cicloAberto, onClose, onSave }) {
  const [form, setForm] = useState({ nome: '', inicio: '', fim: '', observacoes: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={modalStyle}>
        <header style={modalHeader}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Abrir ciclo de OKR</h3>
          <button type="button" onClick={onClose} style={iconBtn}><X size={16} /></button>
        </header>

        {/* Só existe UM ciclo aberto por vez — a tela AVISA antes, em vez de a
            pessoa descobrir que encerrou o trimestre em curso depois de salvar. */}
        {cicloAberto && (
          <div style={{
            display: 'flex', gap: 7, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 8,
            background: '#F59E0B14', border: '1px solid #F59E0B44', marginBottom: 14,
          }}>
            <AlertTriangle size={14} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11.5, color: C.t2, margin: 0, lineHeight: 1.5 }}>
              Abrir este ciclo <strong>encerra “{cicloAberto.nome}”</strong>. Os resultados-chave
              dele ficam no histórico com a nota e o aprendizado — nada é apagado.
            </p>
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          <Campo label="Nome *">
            <input value={form.nome} onChange={set('nome')} required placeholder="3º trimestre 2026" style={inputStyle} />
          </Campo>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Campo label="Início *">
              <input type="date" value={form.inicio} onChange={set('inicio')} required style={inputStyle} />
            </Campo>
            <Campo label="Fim *">
              <input type="date" value={form.fim} onChange={set('fim')} required style={inputStyle} />
            </Campo>
          </div>
          <Campo label="Observações">
            <textarea value={form.observacoes} onChange={set('observacoes')} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </Campo>
        </div>

        <footer style={modalFooter}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancelar</button>
          <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
            <CheckCircle2 size={14} /> {saving ? 'Abrindo…' : 'Abrir ciclo'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Campo({ label, hint, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: C.t2, marginBottom: 4 }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 10.5, color: C.t3, marginTop: 4, lineHeight: 1.45 }}>{hint}</span>}
    </label>
  );
}

// ── estilos ──
const cardStyle = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
  padding: 16, marginBottom: 16,
};
const h2Style = {
  fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 10px',
  display: 'flex', alignItems: 'center', gap: 7,
};
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px',
  background: C.primary, color: '#fff', border: 'none', borderRadius: 8,
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};
const btnGhost = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px',
  background: 'transparent', color: C.t2, border: `1px solid ${C.border}`,
  borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};
const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, background: 'transparent', color: C.t3,
  border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer',
};
const inputStyle = {
  width: '100%', padding: '7px 10px', background: C.inputBg, color: C.text,
  border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, boxSizing: 'border-box',
};
const overlayStyle = {
  position: 'fixed', inset: 0, background: C.overlay, zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
// Modal alto: container é flex-col SEM overflow, e o corpo rola com min-height 0.
// `overflow-y` no container corta em vez de rolar (padrão registrado da casa).
const modalStyle = {
  background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 14,
  padding: 18, width: '100%', maxWidth: 560, maxHeight: '90vh',
  display: 'flex', flexDirection: 'column', overflowY: 'auto',
};
const modalHeader = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  gap: 10, marginBottom: 14,
};
const modalFooter = {
  display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18,
};
