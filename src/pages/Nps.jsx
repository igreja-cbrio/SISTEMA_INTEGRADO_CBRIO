import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { nps as api } from '../api';
import { toast } from 'sonner';
import {
  Plus, MessageSquare, Sparkles, Users, Link2, Copy, Check, Loader2,
  TrendingUp, TrendingDown, Minus, BarChart3, Search, Send, BrainCircuit,
} from 'lucide-react';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', inputBg: 'var(--cbrio-input-bg)',
  modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#e6f7f5',
  green: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6',
  cyan: '#06b6d4', cyanBg: '#cffafe',
};

const VALORES = [
  { id: 'seguir',       label: 'Seguir Jesus', color: '#8b5cf6' },
  { id: 'conectar',     label: 'Conectar',     color: '#3b82f6' },
  { id: 'investir',     label: 'Investir Tempo', color: '#10b981' },
  { id: 'servir',       label: 'Servir',       color: '#f59e0b' },
  { id: 'generosidade', label: 'Generosidade', color: '#ec4899' },
];

const CONTEXTOS_KPI = [
  { id: 'nps_geral',       label: 'NPS Geral' },
  { id: 'nps_next',        label: 'NPS NEXT' },
  { id: 'nps_lideres',     label: 'NPS Líderes' },
  { id: 'nps_voluntarios', label: 'NPS Voluntários' },
];

const STATUS_MAP = {
  rascunho:  { label: 'Rascunho',  color: '#6b7280', bg: '#6b728020' },
  ativa:     { label: 'Ativa',     color: C.green,   bg: '#10b98120' },
  encerrada: { label: 'Encerrada', color: C.amber,   bg: '#f59e0b20' },
  arquivada: { label: 'Arquivada', color: '#6b7280', bg: '#6b728020' },
};

const inp = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.inputBg,
  color: C.text, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit',
};

function Btn({ children, onClick, variant = 'primary', disabled, size = 'md', style: sx, type }) {
  const padding = size === 'sm' ? '6px 12px' : '9px 18px';
  const fontSize = size === 'sm' ? 12 : 13;
  const base = { padding, borderRadius: 8, fontSize, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', border: 'none', opacity: disabled ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 };
  const v = {
    primary: { background: C.primary, color: '#fff' },
    ghost:   { background: 'transparent', color: C.t2, border: `1px solid ${C.border}` },
    danger:  { background: C.red, color: '#fff' },
    cyan:    { background: C.cyan, color: '#fff' },
  };
  return <button type={type || 'button'} onClick={onClick} disabled={disabled} style={{ ...base, ...v[variant], ...sx }}>{children}</button>;
}

function Modal({ open, onClose, title, children, footer, width = 640 }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.overlay, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.modalBg, borderRadius: 12, width, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: C.text, fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.t3, lineHeight: 1 }}>×</button>
        </div>
        {children}
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>{footer}</div>}
      </div>
    </div>
  );
}

function valorMeta(id) { return VALORES.find(v => v.id === id) || { label: id, color: '#6b7280' }; }

function NpsBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.ativa;
  return <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: s.color, background: s.bg }}>{s.label}</span>;
}

function ScoreCard({ stats }) {
  if (!stats || !stats.total_respostas) {
    return <div style={{ color: C.t3, fontSize: 12 }}>Sem respostas</div>;
  }
  const nps = Number(stats.nps_score) || 0;
  const icon = nps >= 50 ? <TrendingUp size={14} /> : nps >= 0 ? <Minus size={14} /> : <TrendingDown size={14} />;
  const cor = nps >= 50 ? C.green : nps >= 0 ? C.amber : C.red;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: cor, fontWeight: 700, fontSize: 18 }}>
        {icon}{nps.toFixed(0)}
      </div>
      <div style={{ fontSize: 11, color: C.t3 }}>
        {stats.total_respostas} resp. · média {Number(stats.score_medio).toFixed(1)}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
export default function Nps() {
  const { isAdmin, isDiretor } = useAuth();
  const canWrite = isAdmin || isDiretor;
  const navigate = useNavigate();

  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ativas');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detalheId, setDetalheId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.list();
      setLista(data || []);
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar');
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtradas = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (lista || []).filter(p => {
      if (tab === 'ativas' && p.status !== 'ativa') return false;
      if (tab === 'encerradas' && !['encerrada', 'arquivada'].includes(p.status)) return false;
      if (term && !`${p.titulo} ${p.objetivo}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [lista, tab, search]);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 10 }}>
            <MessageSquare size={26} style={{ color: C.cyan }} />
            NPS — Pesquisas com IA
          </h1>
          <p style={{ fontSize: 13, color: C.t2, margin: '4px 0 0', maxWidth: 720 }}>
            Crie pesquisas para os 5 valores · IA gera as perguntas a partir do que você quer medir · respostas analisadas automaticamente e ligadas aos KPIs.
          </p>
        </div>
        {canWrite && (
          <Btn onClick={() => setShowCreate(true)} variant="cyan"><Plus size={16} />Nova NPS</Btn>
        )}
      </div>

      {/* Tabs + busca */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, padding: 4, background: C.card, borderRadius: 10, border: `1px solid ${C.border}` }}>
          {['ativas', 'encerradas', 'todas'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: tab === t ? C.cyan : 'transparent', color: tab === t ? '#fff' : C.t2, textTransform: 'capitalize' }}>
              {t}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.t3 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar pesquisa..."
            style={{ ...inp, paddingLeft: 36 }} />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.t3 }}>
          <Loader2 size={28} className="animate-spin" style={{ display: 'inline-block' }} />
        </div>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.t3, background: C.card, borderRadius: 12, border: `1px dashed ${C.border}` }}>
          <MessageSquare size={36} style={{ opacity: 0.4, marginBottom: 12 }} />
          <p style={{ margin: 0, fontSize: 14 }}>Nenhuma pesquisa encontrada</p>
          {canWrite && tab !== 'encerradas' && (
            <Btn variant="ghost" onClick={() => setShowCreate(true)} style={{ marginTop: 12 }}><Plus size={14} />Criar primeira NPS</Btn>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {filtradas.map(p => {
            const v = valorMeta(p.valor);
            return (
              <div key={p.id} onClick={() => setDetalheId(p.id)}
                style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, cursor: 'pointer', transition: 'transform .12s', borderLeft: `4px solid ${v.color}` }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: v.color, padding: '2px 8px', borderRadius: 10, background: `${v.color}15` }}>{v.label}</span>
                  <NpsBadge status={p.status} />
                </div>
                <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{p.titulo}</h3>
                <p style={{ margin: '0 0 14px', fontSize: 12, color: C.t2, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.objetivo}</p>
                <ScoreCard stats={p.stats} />
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}

      {detalheId && (
        <DetalheModal
          id={detalheId}
          onClose={() => setDetalheId(null)}
          onChanged={load}
          canWrite={canWrite}
          onResponder={(id) => navigate(`/nps/${id}/responder`)}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Modal de criação (com geração IA)
// ════════════════════════════════════════════════════════════════════
function CreateModal({ onClose, onCreated }) {
  const [step, setStep] = useState(1); // 1: definir · 2: revisar perguntas
  const [valor, setValor] = useState('servir');
  const [objetivo, setObjetivo] = useState('');
  const [contextoKpi, setContextoKpi] = useState('nps_geral');
  const [area, setArea] = useState('geral');
  const [permitePublico, setPermitePublico] = useState(true);
  const [dataFim, setDataFim] = useState('');

  const [gerando, setGerando] = useState(false);
  const [perguntas, setPerguntas] = useState(null);
  const [titulo, setTitulo] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function gerar() {
    if (objetivo.trim().length < 5) {
      toast.error('Descreva melhor o que quer medir (mínimo 5 caracteres).');
      return;
    }
    setGerando(true);
    try {
      const result = await api.gerarPerguntas({ valor, objetivo, contexto_kpi: contextoKpi });
      setPerguntas(result);
      setTitulo(result.titulo_sugerido || `NPS — ${valor}`);
      setStep(2);
    } catch (e) {
      toast.error(e.message || 'Erro ao gerar perguntas');
    }
    setGerando(false);
  }

  async function salvar() {
    if (!titulo.trim()) return toast.error('Defina um título');
    setSalvando(true);
    try {
      await api.create({
        titulo: titulo.trim(),
        valor,
        objetivo: objetivo.trim(),
        contexto_kpi: contextoKpi,
        area,
        permite_publico: permitePublico,
        data_fim: dataFim || null,
        perguntas,
        ia_prompt: perguntas?._ia_prompt || null,
      });
      toast.success('Pesquisa criada e notificada para os colaboradores');
      onCreated();
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar');
    }
    setSalvando(false);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={step === 1 ? 'Nova pesquisa NPS' : 'Revisar perguntas geradas pela IA'}
      width={680}
      footer={step === 1 ? (
        <>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={gerar} disabled={gerando} variant="cyan">
            {gerando ? <><Loader2 size={14} className="animate-spin" />Gerando...</> : <><Sparkles size={14} />Gerar perguntas com IA</>}
          </Btn>
        </>
      ) : (
        <>
          <Btn variant="ghost" onClick={() => setStep(1)}>Voltar</Btn>
          <Btn onClick={salvar} disabled={salvando} variant="cyan">
            {salvando ? <><Loader2 size={14} className="animate-spin" />Salvando...</> : <><Send size={14} />Publicar e notificar</>}
          </Btn>
        </>
      )}
    >
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 6 }}>Valor da CBRio</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {VALORES.map(v => (
                <button key={v.id} type="button" onClick={() => setValor(v.id)}
                  style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${valor === v.id ? v.color : C.border}`, background: valor === v.id ? `${v.color}15` : 'transparent', color: valor === v.id ? v.color : C.t2 }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 6 }}>O que você quer medir? *</label>
            <textarea value={objetivo} onChange={e => setObjetivo(e.target.value)}
              rows={4} placeholder="Ex: A clareza do treinamento de novos voluntários no último ciclo — sentem que estão preparados para servir?"
              style={{ ...inp, resize: 'vertical', minHeight: 90 }} />
            <p style={{ fontSize: 11, color: C.t3, margin: '4px 0 0' }}>A IA usa essa descrição para criar as perguntas certas.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 6 }}>Contexto / KPI</label>
              <select value={contextoKpi} onChange={e => setContextoKpi(e.target.value)} style={inp}>
                {CONTEXTOS_KPI.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 6 }}>Área (KPI)</label>
              <input value={area} onChange={e => setArea(e.target.value)} placeholder="geral, voluntariado, integracao..." style={inp} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 6 }}>Encerramento (opcional)</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={inp} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, cursor: 'pointer' }}>
              <input type="checkbox" checked={permitePublico} onChange={e => setPermitePublico(e.target.checked)} />
              <span style={{ fontSize: 13, color: C.text }}>Gerar link público</span>
            </label>
          </div>
        </div>
      )}

      {step === 2 && perguntas && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 6 }}>Título da pesquisa</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} style={inp} />
          </div>

          <div style={{ padding: 14, background: C.cyanBg, borderRadius: 10, border: `1px solid ${C.cyan}30` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: C.cyan, marginBottom: 8 }}>
              <Sparkles size={12} /> GERADO PELA IA
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#0e7490', lineHeight: 1.5 }}>{perguntas.descricao_curta}</p>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 6 }}>PERGUNTA PRINCIPAL (NPS)</div>
            <div style={{ padding: 12, background: C.inputBg, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, color: C.text }}>
              {perguntas.pergunta_nps?.texto}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 6 }}>PERGUNTAS QUALITATIVAS ({perguntas.perguntas_extras?.length || 0})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(perguntas.perguntas_extras || []).map((p, i) => (
                <div key={p.id || i} style={{ padding: 12, background: C.inputBg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, marginBottom: 4, textTransform: 'uppercase' }}>{p.tipo}</div>
                  <div style={{ fontSize: 13, color: C.text }}>{p.texto}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════
// Modal de detalhe
// ════════════════════════════════════════════════════════════════════
function DetalheModal({ id, onClose, onChanged, canWrite, onResponder }) {
  const [pesquisa, setPesquisa] = useState(null);
  const [respostas, setRespostas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('respostas');
  const [analisando, setAnalisando] = useState(false);
  const [notificando, setNotificando] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const p = await api.get(id);
      setPesquisa(p);
      if (canWrite || p.criado_por) {
        try {
          const r = await api.respostas(id);
          setRespostas(r || []);
        } catch { /* sem permissao */ }
      }
    } catch (e) {
      toast.error(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  const linkPublico = useMemo(() => {
    if (!pesquisa?.link_publico_token) return null;
    if (typeof window === 'undefined') return null;
    return `${window.location.origin}/nps/publica/${pesquisa.link_publico_token}`;
  }, [pesquisa]);

  async function copiarLink() {
    if (!linkPublico) return;
    try {
      await navigator.clipboard.writeText(linkPublico);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Não foi possível copiar');
    }
  }

  async function analisar() {
    setAnalisando(true);
    try {
      const a = await api.analisar(id);
      toast.success('Análise atualizada');
      setPesquisa(prev => ({ ...prev, analise_ia: a, analise_atualizada_em: a.gerado_em }));
      setTab('analise');
    } catch (e) {
      toast.error(e.message);
    }
    setAnalisando(false);
  }

  async function reNotificar() {
    setNotificando(true);
    try {
      const r = await api.notificar(id);
      toast.success(`Lembrete enviado para ${r.enviadas || 0} pessoa(s)`);
    } catch (e) {
      toast.error(e.message);
    }
    setNotificando(false);
  }

  async function encerrar() {
    if (!confirm('Encerrar a pesquisa? Ninguém mais poderá responder.')) return;
    try {
      await api.update(id, { status: 'encerrada' });
      toast.success('Pesquisa encerrada');
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e.message);
    }
  }

  if (loading || !pesquisa) {
    return (
      <Modal open onClose={onClose} title="Carregando..." width={760}>
        <div style={{ textAlign: 'center', padding: 40, color: C.t3 }}>
          <Loader2 size={28} className="animate-spin" style={{ display: 'inline-block' }} />
        </div>
      </Modal>
    );
  }

  const v = valorMeta(pesquisa.valor);
  const stats = pesquisa.stats || { total_respostas: 0, score_medio: 0, nps_score: 0, promoters: 0, passives: 0, detractors: 0 };

  return (
    <Modal open onClose={onClose} title={pesquisa.titulo} width={820}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: v.color, padding: '2px 10px', borderRadius: 10, background: `${v.color}15` }}>{v.label}</span>
        <NpsBadge status={pesquisa.status} />
        <span style={{ fontSize: 11, color: C.t3 }}>Início: {new Date(pesquisa.data_inicio).toLocaleDateString('pt-BR')}</span>
        {pesquisa.data_fim && <span style={{ fontSize: 11, color: C.t3 }}>Fim: {new Date(pesquisa.data_fim).toLocaleDateString('pt-BR')}</span>}
      </div>

      <p style={{ fontSize: 13, color: C.t2, margin: '0 0 16px', lineHeight: 1.5 }}>{pesquisa.objetivo}</p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatBox label="NPS" value={Number(stats.nps_score).toFixed(0)} color={stats.nps_score >= 50 ? C.green : stats.nps_score >= 0 ? C.amber : C.red} />
        <StatBox label="Respostas" value={stats.total_respostas} color={C.cyan} />
        <StatBox label="Média" value={Number(stats.score_medio).toFixed(1)} color={C.blue} />
        <StatBox label="Promoters" value={`${stats.promoters} (${stats.detractors} det.)`} color={C.green} />
      </div>

      {/* Ações */}
      {canWrite && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {linkPublico && pesquisa.permite_publico && (
            <Btn variant="ghost" size="sm" onClick={copiarLink}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copiado!' : 'Copiar link público'}
            </Btn>
          )}
          {pesquisa.status === 'ativa' && (
            <>
              <Btn variant="ghost" size="sm" onClick={reNotificar} disabled={notificando}>
                {notificando ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Reenviar lembrete
              </Btn>
              <Btn variant="cyan" size="sm" onClick={() => onResponder(id)}>
                <MessageSquare size={12} />Responder agora
              </Btn>
            </>
          )}
          <Btn variant="ghost" size="sm" onClick={analisar} disabled={analisando || stats.total_respostas === 0}>
            {analisando ? <Loader2 size={12} className="animate-spin" /> : <BrainCircuit size={12} />}
            Analisar com IA
          </Btn>
          {pesquisa.status === 'ativa' && (
            <Btn variant="danger" size="sm" onClick={encerrar}>Encerrar</Btn>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        {['respostas', 'perguntas', 'analise'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t ? C.cyan : 'transparent'}`, color: tab === t ? C.cyan : C.t2, textTransform: 'capitalize' }}>
            {t === 'analise' ? 'Análise IA' : t}
          </button>
        ))}
      </div>

      {tab === 'respostas' && (
        respostas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: C.t3, fontSize: 13 }}>Nenhuma resposta ainda</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
            {respostas.map(r => {
              const cor = r.score >= 9 ? C.green : r.score >= 7 ? C.amber : C.red;
              return (
                <div key={r.id} style={{ padding: 12, background: C.inputBg, borderRadius: 8, border: `1px solid ${C.border}`, borderLeft: `4px solid ${cor}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, color: cor, fontSize: 18 }}>{r.score}</span>
                      <span style={{ fontSize: 11, color: C.t3 }}>
                        {r.origem === 'publico' ? `${r.nome_publico} · público` : 'Colaborador'}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, color: C.t3 }}>{new Date(r.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                  {r.comentario && <p style={{ margin: '4px 0 0', fontSize: 12, color: C.t2, lineHeight: 1.4 }}>{r.comentario}</p>}
                  {r.respostas && Object.keys(r.respostas).length > 0 && (
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px dashed ${C.border}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {Object.entries(r.respostas).map(([k, val]) => val ? (
                        <div key={k} style={{ fontSize: 11, color: C.t2 }}>
                          <span style={{ color: C.t3 }}>{k}:</span> {String(val)}
                        </div>
                      ) : null)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'perguntas' && pesquisa.perguntas && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ padding: 12, background: C.inputBg, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.cyan, marginBottom: 4 }}>NPS (0-10)</div>
            <div style={{ fontSize: 13, color: C.text }}>{pesquisa.perguntas.pergunta_nps?.texto}</div>
          </div>
          {(pesquisa.perguntas.perguntas_extras || []).map((p, i) => (
            <div key={p.id || i} style={{ padding: 12, background: C.inputBg, borderRadius: 8, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, marginBottom: 4, textTransform: 'uppercase' }}>{p.tipo}</div>
              <div style={{ fontSize: 13, color: C.text }}>{p.texto}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'analise' && (
        !pesquisa.analise_ia ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.t3 }}>
            <BrainCircuit size={32} style={{ opacity: 0.4, marginBottom: 10 }} />
            <p style={{ margin: 0, fontSize: 13 }}>Sem análise gerada ainda.</p>
            {canWrite && stats.total_respostas > 0 && (
              <Btn variant="cyan" size="sm" onClick={analisar} disabled={analisando} style={{ marginTop: 12 }}>
                {analisando ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}Gerar análise
              </Btn>
            )}
          </div>
        ) : (
          <AnaliseView analise={pesquisa.analise_ia} />
        )
      )}
    </Modal>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ padding: 12, background: C.inputBg, borderRadius: 8, border: `1px solid ${C.border}`, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: C.t3, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function AnaliseView({ analise }) {
  const sentMap = {
    positivo: { color: C.green, bg: '#10b98115', label: 'Positivo' },
    misto:    { color: C.amber, bg: '#f59e0b15', label: 'Misto' },
    negativo: { color: C.red,   bg: '#ef444415', label: 'Negativo' },
    neutro:   { color: C.t2,    bg: C.border,    label: 'Neutro' },
  };
  const s = sentMap[analise.sentimento] || sentMap.neutro;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: C.t3 }}>
          Gerado em {new Date(analise.gerado_em).toLocaleString('pt-BR')} · {analise.total_analisado} respostas
        </span>
        <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: s.color, background: s.bg }}>
          {s.label}
        </span>
      </div>

      <div style={{ padding: 14, background: C.cyanBg, borderRadius: 10, border: `1px solid ${C.cyan}30` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.cyan, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <BrainCircuit size={12} /> RESUMO
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#0e7490', lineHeight: 1.6 }}>{analise.resumo}</p>
      </div>

      {analise.temas?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, marginBottom: 8 }}>TEMAS RECORRENTES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {analise.temas.map((t, i) => (
              <div key={i} style={{ padding: 12, background: C.inputBg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t.tema}</span>
                  <span style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase' }}>{t.frequencia}</span>
                </div>
                {t.exemplos?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                    {t.exemplos.slice(0, 3).map((ex, ei) => (
                      <div key={ei} style={{ fontSize: 11, color: C.t2, fontStyle: 'italic', paddingLeft: 8, borderLeft: `2px solid ${C.border}` }}>"{ex}"</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {analise.acoes_sugeridas?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, marginBottom: 8 }}>AÇÕES SUGERIDAS</div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {analise.acoes_sugeridas.map((a, i) => (
              <li key={i} style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
