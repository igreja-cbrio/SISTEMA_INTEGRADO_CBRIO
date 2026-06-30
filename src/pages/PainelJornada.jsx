// ============================================================================
// /jornada — Jornada da Igreja (Inteligência · Fase 2 · 2026-06-20)
//
// A 2ª estrela do cockpit (a 1ª é o NSM). NSM = ATIVAÇÃO dos recém-convertidos
// (±60d da decisão · pouca gente). Jornada = PROFUNDIDADE da igreja toda (todos
// os membros ativos · "Membro Modelo" = vive >=2 dos 5 valores).
//
// Motor único parametrizado por JANELA (services/jornadaEngajamento · espelhado
// no /api/jornada/visao): seguir/conectar/servir = estado atual; investir e
// generosidade = atividade dentro da janela escolhida. 'Atual' = sem corte.
//
// Funil cumulativo (igual à página do NSM): clica num valor → estreita a coorte
// → os %s recalculam. A população é PEQUENA (membros ativos) · 1 fetch por
// janela e todo o resto deriva client-side (instantâneo).
//
// Navegação fiel NSM⇄Jornada: carrega o valor selecionado, deixa explícito que
// a POPULAÇÃO trocou (recém-convertidos ↔ todos os membros) · a janela NÃO
// carrega (são réguas de tempo diferentes por natureza).
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { jornada as jornadaApi } from '../api';
import { ArrowLeft, Phone, Mail, Users, Check, Filter, X, Sparkles, ChevronRight } from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', primary: '#00B39D', primaryDark: '#00897B',
};

const VALOR_CORES = {
  seguir: '#8B5CF6', conectar: '#3B82F6', investir: '#F59E0B', servir: '#10B981', generosidade: '#EC4899',
};
const VALOR_LABELS = {
  seguir: 'Seguir a Jesus', conectar: 'Conectar com Pessoas', investir: 'Investir Tempo com Deus',
  servir: 'Servir em Comunidade', generosidade: 'Viver Generosamente',
};
const VALOR_ORDER = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'];
// Quais valores são cortados pela janela (atividade recorrente) vs estado atual.
const VALOR_JANELA = { investir: true, generosidade: true };
const VALOR_HINT = {
  seguir: 'Convertido / batizado (estado · qualquer época).',
  conectar: 'Em grupo ativo agora (estado).',
  investir: 'Devocional feito dentro da janela escolhida.',
  servir: 'Voluntário ativo agora (estado).',
  generosidade: 'Dízimo ou oferta dentro da janela escolhida.',
};

// 'atual' = estado atual (sem corte de tempo nas atividades). Padrão = 3 meses.
const JANELAS = [
  { id: 'mes', label: 'Este mês' },
  { id: '3m', label: '3 meses' },
  { id: '6m', label: '6 meses' },
  { id: '12m', label: '12 meses' },
  { id: 'atual', label: 'Atual' },
];
const JANELA_VALIDA = new Set(JANELAS.map((j) => j.id));

const STATUS_OPCOES = [
  { id: 'todos', label: 'Todos' },
  { id: 'modelo', label: 'Membro Modelo (2+)' },
  { id: 'formacao', label: 'Em formação' },
];

const fmtPct = (n) => (n === null || n === undefined ? '—' : `${n}%`);

export default function PainelJornada() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const veioDoNsm = (searchParams.get('from') || '') === 'nsm';

  const [janela, setJanela] = useState(() => {
    const j = (searchParams.get('janela') || '').toLowerCase();
    return JANELA_VALIDA.has(j) ? j : '3m';
  });
  const [statusF, setStatusF] = useState('todos');
  const [busca, setBusca] = useState('');
  const [valoresSel, setValoresSel] = useState(() => {
    const v = (searchParams.get('valor') || '').toLowerCase();
    return VALOR_ORDER.includes(v) ? new Set([v]) : new Set();
  });
  const [visivel, setVisivel] = useState(50); // paginação client-side ("carregar mais")

  // 1 fetch por janela · todo o resto deriva client-side (base pequena).
  const [universo, setUniverso] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    setLoading(true); setErro(null); setUniverso(null);
    jornadaApi.visao({ janela })
      .then((d) => { if (vivo) setUniverso(d); })
      .catch((e) => { if (vivo) setErro(e?.message || 'Erro ao carregar'); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [janela]);

  // Reseta a paginação quando o recorte muda.
  useEffect(() => { setVisivel(50); }, [janela, statusF, busca, valoresSel]);

  const valoresFiltro = useMemo(() => [...valoresSel], [valoresSel]);

  // Lista filtrada: coorte = membros que têm TODOS os valores marcados (AND
  // cumulativo, igual ao funil do NSM) + status (Membro Modelo / em formação) + busca.
  const lista = useMemo(() => {
    if (!universo?.membros) return null;
    const q = busca.trim().toLowerCase();
    let out = universo.membros;
    if (valoresFiltro.length) out = out.filter((m) => valoresFiltro.every((v) => m.valores[v]));
    if (statusF === 'modelo') out = out.filter((m) => m.total_valores >= 2);
    else if (statusF === 'formacao') out = out.filter((m) => m.total_valores < 2);
    if (q) out = out.filter((m) => (m.nome || '').toLowerCase().includes(q));
    return [...out].sort((a, b) => (b.total_valores - a.total_valores) || (a.nome || '').localeCompare(b.nome || ''));
  }, [universo, valoresFiltro, statusF, busca]);

  // Funil: % da coorte filtrada em cada valor (cumulativo · os marcados dão 100%).
  const funil = useMemo(() => {
    const fb = lista || [];
    const tot = fb.length || 1;
    const valor = {};
    for (const v of VALOR_ORDER) {
      valor[v] = Math.round(fb.filter((m) => m.valores[v]).length / tot * 100);
    }
    return { valor, total: fb.length };
  }, [lista]);

  const stats = useMemo(() => {
    if (!lista) return null;
    const modelo = lista.filter((m) => m.total_valores >= 2).length;
    return {
      total: lista.length, modelo, formacao: lista.length - modelo,
      pct: lista.length > 0 ? Math.round((modelo / lista.length) * 100) : 0,
    };
  }, [lista]);

  const temFiltro = valoresSel.size > 0;
  const filtraDentro = temFiltro || statusF !== 'todos' || busca.trim() !== '';

  const toggleValor = (v) => {
    setValoresSel((prev) => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  };
  const limparFiltros = () => { setValoresSel(new Set()); setStatusF('todos'); setBusca(''); };

  const janelaLabel = JANELAS.find((j) => j.id === janela)?.label || janela;
  // Ao ir pro NSM, leva o 1º valor marcado (a área não se aplica à igreja toda).
  const irParaNsm = () => {
    const v = valoresFiltro[0];
    navigate(`/painel/nsm/pessoas?segmento=central${v ? `&valores=${v}` : ''}`);
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <button onClick={() => navigate('/painel')} style={btnVoltar}>
        <ArrowLeft size={14} /> Voltar ao painel
      </button>

      <div style={{ marginTop: 16, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={22} style={{ color: C.primary }} />
            Jornada da Igreja
          </h1>
          <p style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>
            Profundidade da igreja toda · todos os membros ativos · "Membro Modelo" vive ≥2 dos 5 valores · janela: {janelaLabel}
          </p>
        </div>
        <button onClick={irParaNsm} style={{ ...btnVoltar, color: C.primaryDark, borderColor: `${C.primary}40` }}>
          Ver recém-convertidos (NSM) <ChevronRight size={13} />
        </button>
      </div>

      {/* Banner de troca de população (vindo do NSM) */}
      {veioDoNsm && (
        <div style={{
          background: `${C.primary}0d`, border: `1px solid ${C.primary}33`, borderLeft: `3px solid ${C.primary}`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: C.t2, lineHeight: 1.6,
        }}>
          Você veio do <strong style={{ color: C.text }}>NSM</strong> (recém-convertidos, ±60 dias da decisão).
          Aqui é a <strong style={{ color: C.text }}>igreja toda</strong> — todos os membros ativos.
          A população é diferente, então os números não se comparam diretamente; a janela de tempo também não foi transferida.
        </div>
      )}

      {/* Estrela: Membro Modelo no recorte atual */}
      <MembroModeloCard
        loading={loading}
        pct={stats?.pct}
        modelo={stats?.modelo}
        total={stats?.total}
        totalBase={universo?.total_base}
        filtraDentro={filtraDentro}
      />

      {/* Controles de tempo */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '16px 0', alignItems: 'flex-end' }}>
        <Campo label="Janela de tempo">
          <Segmented value={janela} onChange={setJanela} options={JANELAS} />
        </Campo>
        <Campo label="Filtrar por">
          <Segmented value={statusF} onChange={setStatusF} options={STATUS_OPCOES} />
        </Campo>
        <Campo label="Buscar membro">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="nome..."
            style={{ ...selectStyle, minWidth: 180, fontWeight: 500, cursor: 'text' }}
          />
        </Campo>
      </div>

      {/* Funil por valor */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Filter size={12} /> Funil por valor · clique pra refinar (cumulativo)
          </span>
          {temFiltro && (
            <button onClick={limparFiltros} style={{ ...btnVoltar, padding: '4px 10px', fontSize: 11 }}>
              <X size={12} /> Limpar
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {VALOR_ORDER.map((v) => (
            <ValorCard
              key={v}
              vkey={v}
              label={VALOR_LABELS[v]}
              cor={VALOR_CORES[v]}
              ativo={valoresSel.has(v)}
              pct={loading ? null : funil.valor[v]}
              hint={VALOR_HINT[v]}
              naJanela={!!VALOR_JANELA[v]}
              onToggle={toggleValor}
            />
          ))}
        </div>
        {temFiltro && (
          <p style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>
            Mostrando membros que vivem <strong>todos</strong> os valores marcados.
          </p>
        )}
      </div>

      {/* Stats do recorte */}
      {stats && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Stat label={filtraDentro ? 'Membros no filtro' : 'Membros ativos'} value={stats.total} cor={C.t2} />
            <Stat label="Membro Modelo (2+)" value={stats.modelo} cor="#10B981" />
            <Stat label="Em formação (<2)" value={stats.formacao} cor="#F59E0B" />
            <Stat label="% Membro Modelo" value={fmtPct(stats.pct)} cor={C.primary} />
          </div>
          {filtraDentro && universo && (
            <p style={{ fontSize: 11, color: C.t3, margin: '8px 0 0' }}>
              Números do filtro atual · a base completa tem <strong>{universo.total_base}</strong> membros ativos
              {universo.membro_modelo ? <> ({universo.membro_modelo.total} Membro Modelo, {universo.membro_modelo.pct}%)</> : null}.
            </p>
          )}
        </div>
      )}

      {/* Lista de membros */}
      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: C.t3, fontSize: 13 }}>Carregando...</div>
      ) : erro ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>{erro}</div>
      ) : !lista?.length ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13, background: C.card, borderRadius: 10, border: `1px dashed ${C.border}` }}>
          {filtraDentro ? 'Nenhum membro corresponde a esse filtro.' : 'Sem membros ativos.'}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lista.slice(0, visivel).map((m) => <MembroCard key={m.id} membro={m} />)}
          </div>
          {lista.length > visivel && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button onClick={() => setVisivel((n) => n + 50)} style={{ ...btnVoltar, padding: '8px 16px' }}>
                Carregar mais ({lista.length - visivel} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
function MembroModeloCard({ loading, pct, modelo, total, totalBase, filtraDentro }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.primary}10 0%, ${C.primary}05 100%)`,
      border: `1px solid ${C.primary}30`, borderRadius: 16, padding: 24,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.primaryDark, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>
        Membro Modelo {filtraDentro ? '· no filtro atual' : '· igreja toda'}
      </div>
      <div style={{ fontSize: 13, color: C.t2, marginBottom: 10, maxWidth: 620, lineHeight: 1.5 }}>
        Membros ativos vivendo pelo menos 2 dos 5 valores da CBRio
      </div>
      {loading ? (
        <div style={{ fontSize: 40, fontWeight: 800, color: C.t3, lineHeight: 1 }}>…</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 48, fontWeight: 800, color: C.text, lineHeight: 1 }}>{fmtPct(pct)}</span>
          <span style={{ fontSize: 14, color: C.t3 }}>
            <strong style={{ color: C.text }}>{modelo ?? 0}</strong> de {total ?? 0}
            {filtraDentro && totalBase ? <> no filtro · {totalBase} ativos no total</> : ' membros'}
          </span>
        </div>
      )}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.t3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

const selectStyle = {
  padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
  border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, cursor: 'pointer',
};

function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 4, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const ativo = String(o.id) === String(value);
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: ativo ? C.primary + '18' : 'transparent', color: ativo ? C.primary : C.t2,
          }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ValorCard({ vkey, label, cor, ativo, pct, hint, naJanela, onToggle }) {
  return (
    <div style={{ background: C.card, border: `1.5px solid ${ativo ? cor : C.border}`, borderRadius: 12, padding: 12, transition: 'border-color .15s' }}>
      <button onClick={() => onToggle(vkey)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: cor, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, flex: 1, textAlign: 'left' }}>{label}</span>
        {pct != null && <span style={{ fontSize: 13, fontWeight: 800, color: cor, marginRight: 8 }}>{pct}%</span>}
        <span style={{
          width: 18, height: 18, borderRadius: 6, flexShrink: 0,
          border: `1.5px solid ${ativo ? cor : C.border}`, background: ativo ? cor : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {ativo && <Check size={12} color="#fff" strokeWidth={3} />}
        </span>
      </button>
      {pct != null && (
        <div style={{ height: 5, background: C.border, borderRadius: 3, marginTop: 9, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: cor, transition: 'width .2s' }} />
        </div>
      )}
      <p style={{ fontSize: 10, color: C.t3, margin: '8px 0 0', lineHeight: 1.4 }}>
        {hint}{naJanela && <span style={{ color: cor, fontWeight: 600 }}> · na janela</span>}
      </p>
    </div>
  );
}

function Stat({ label, value, cor }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.t3, marginTop: 4, letterSpacing: 0.3 }}>{label}</div>
    </div>
  );
}

function MembroCard({ membro }) {
  const modelo = membro.total_valores >= 2;
  const cor = modelo ? '#10B981' : membro.total_valores === 1 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${cor}`,
      borderRadius: 10, padding: 12, display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: cor + '20', color: cor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
        {(membro.nome || '?').charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13, color: C.text }}>{membro.nome || 'Sem nome'}</strong>
          <span style={{
            fontSize: 9, padding: '1px 7px', borderRadius: 99, fontWeight: 700,
            background: cor + '20', color: cor,
          }}>
            {membro.total_valores}/5 valores{modelo ? ' · Modelo' : ''}
          </span>
        </div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {membro.telefone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Phone size={11} /> {membro.telefone}</span>}
          {membro.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Mail size={11} /> {membro.email}</span>}
        </div>
      </div>
      <div style={{ minWidth: 160, maxWidth: 360, textAlign: 'right' }}>
        {membro.total_valores > 0 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {VALOR_ORDER.filter((v) => membro.valores[v]).map((v) => (
              <span key={v} style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600,
                background: VALOR_CORES[v] + '18', color: VALOR_CORES[v], border: `1px solid ${VALOR_CORES[v]}40`,
              }}>
                {VALOR_LABELS[v]}
              </span>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>Nenhum valor ainda</span>
        )}
      </div>
    </div>
  );
}

const btnVoltar = {
  background: 'transparent', border: `1px solid ${C.border}`,
  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  color: C.t2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
};
