// ============================================================================
// Módulo WiFi — acompanhamento dos visitantes do portal WiFi
// ============================================================================
// Abas:
//   - Pessoas   · lista (busca) → perfil 360º (histórico + vínculos)
//   - Por culto · conexões por culto + presença real × WiFi · clique vê pessoas
//   - Por semana· presença lançada (ministerial) × WiFi por semana ISO
//   - Alertas   · padrões de frequência por regras (afastando / em risco / etc)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import {
  Wifi, Search, Users, HandHeart, UsersRound, Droplet, X,
  RefreshCw, Clock, ChevronRight, CalendarDays, ShieldCheck, ShieldAlert,
  TrendingDown, AlertTriangle, RotateCcw, Sparkles, HeartHandshake, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { wifi as wifiApi } from '../../api';
import Paginacao from '../../components/Paginacao';
import { formatErro } from '../../lib/formatErro';
import { DatePicker } from '@/components/ui/date-picker';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#00B39D18',
};

const PERIODOS = [
  { label: '3 meses', meses: 3 }, { label: '6 meses', meses: 6 },
  { label: '12 meses', meses: 12 }, { label: '2 anos', meses: 24 },
];
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const ALERTA_META = {
  afastando:       { label: 'Afastando', icon: TrendingDown,   cor: '#EF4444', desc: 'Vinham com frequência e pararam de vir' },
  em_risco:        { label: 'Em risco',  icon: AlertTriangle,  cor: '#F59E0B', desc: 'Vieram algumas vezes e estão sumidos há 2+ semanas' },
  voltou:          { label: 'Voltaram',  icon: RotateCcw,      cor: '#3B82F6', desc: 'Estavam sumidos e voltaram a conectar' },
  novo_recorrente: { label: 'Novos recorrentes', icon: Sparkles, cor: '#8B5CF6', desc: 'Chegaram há pouco e já vieram 2+ vezes' },
  fiel:            { label: 'Fiéis',     icon: HeartHandshake, cor: '#10B981', desc: '4+ semanas seguidas, presentes' },
};

function pad(n) { return String(n).padStart(2, '0'); }
function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function periodoISO(meses) {
  const fim = new Date(); const ini = new Date(); ini.setMonth(ini.getMonth() - meses);
  return { inicio: toISO(ini), fim: toISO(fim) };
}
function fmtDataHora(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return s; }
}
function fmtData(s) {
  if (!s) return '—';
  try { return new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return s; }
}
function fmtCpf(c) {
  if (!c) return '—';
  const d = String(c).replace(/\D/g, '');
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : c;
}
function taxa(num, den) {
  if (!den || den <= 0) return null;
  return Math.round((num / den) * 100);
}

function Pill({ children, cor = C.primary }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
      padding: '2px 8px', borderRadius: 999, color: '#fff', background: cor,
    }}>{children}</span>
  );
}

function StatCard({ icon: Icon, label, valor, sub }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--panel)', WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)', border: '1px solid var(--hairline)', boxShadow: 'var(--shadow), var(--hi)', borderRadius: 16, padding: 16, flex: 1, minWidth: 150 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #00B39D22, transparent 58%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#00B39D', opacity: 0.9 }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.t2, fontSize: 12, fontWeight: 600 }}>
          <Icon size={15} /> {label}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: C.text, marginTop: 6 }}>{valor}</div>
        {sub && <div style={{ fontSize: 12, color: C.t2, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function chipStyle(ativo) {
  return {
    padding: '7px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${ativo ? C.primary : C.border}`,
    background: ativo ? C.primaryBg : C.card, color: ativo ? C.primary : C.t2,
  };
}
const selStyle = { padding: '7px 10px', borderRadius: 9, fontSize: 13, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text };

// Legenda sempre visível pra quem está analisando entender cada termo.
function Legenda({ itens, nota }) {
  return (
    <div style={{ background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 6 }}>
        <Info size={14} /> Legenda
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {itens.map(([t, d, cor]) => (
          <div key={t} style={{ fontSize: 12, color: C.t3, lineHeight: 1.45 }}>
            <strong style={{ color: cor || C.text }}>{t}:</strong> {d}
          </div>
        ))}
      </div>
      {nota && <div style={{ fontSize: 11.5, color: C.t3, marginTop: 7, fontStyle: 'italic' }}>{nota}</div>}
    </div>
  );
}

const LEGENDA_CULTO = [
  ['Presença', 'total que o ministério lançou como presente no culto (no /integração).'],
  ['Conexões', 'nº de logins no WiFi — a mesma pessoa pode logar mais de uma vez.'],
  ['Dispositivos', 'aparelhos (MACs) distintos que conectaram. É a melhor aproximação da presença real pelo WiFi.'],
  ['Captação', 'dispositivos ÷ presença = % dos presentes que entraram no WiFi (verde ≥60% · âmbar ≥35% · vermelho abaixo).'],
  ['Identificadas', 'dispositivos que o sistema conseguiu ligar a uma pessoa (CPF) já cadastrada.'],
];
const LEGENDA_SEMANA = [
  ['Semana', 'agrupamento de segunda a domingo (semana ISO), igual à lógica dos cultos do ministerial.'],
  ['Presença', 'soma da presença lançada no ministerial nos cultos da semana.'],
  ['Dispositivos', 'aparelhos (MACs) distintos que conectaram na semana — presença aproximada via WiFi.'],
  ['Captação', 'dispositivos ÷ presença = % da galera que pegou o WiFi naquela semana.'],
  ['Identificadas', 'quantas conexões da semana foram ligadas a uma pessoa cadastrada.'],
];

function PessoaRow({ p, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: 'none', cursor: 'pointer',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: '50%', background: C.primaryBg, color: C.primary,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0,
      }}>{(p.nome || '?').trim().charAt(0).toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome || 'Sem nome'}</div>
        <div style={{ fontSize: 12, color: C.t3 }}>
          {fmtCpf(p.cpf_norm)}
          {p.cultos_distintos != null && ` · ${p.cultos_distintos} culto(s)`}
          {p.ultima_conexao && ` · última ${fmtDataHora(p.ultima_conexao)}`}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {p.eh_membro && <Pill cor="#3B82F6">Membro</Pill>}
        {p.serve && <Pill cor="#F59E0B">Serve</Pill>}
        {p.em_grupo && <Pill cor="#8B5CF6">Grupo</Pill>}
        {p.dizima_oferta && <Pill cor="#10B981">Doa</Pill>}
        {p.tem_batismo && <Pill cor="#06B6D4">Batismo</Pill>}
      </div>
      <ChevronRight size={16} color={C.t3} />
    </button>
  );
}

export default function WifiModulo() {
  const [tab, setTab] = useState('pessoas');
  const [resumo, setResumo] = useState(null);
  const [servicos, setServicos] = useState([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [cpfSel, setCpfSel] = useState(null);

  const carregarResumo = useCallback(async () => {
    try { setResumo(await wifiApi.resumo()); } catch (e) { console.warn(e); }
  }, []);

  useEffect(() => { carregarResumo(); }, [carregarResumo]);
  useEffect(() => { wifiApi.servicos().then(r => setServicos(r.servicos || [])).catch(() => {}); }, []);

  async function sincronizar() {
    setSincronizando(true);
    try {
      const r = await wifiApi.sync();
      toast.success(`Sincronizado · ${r.conexoesNovas || 0} conexões · ${r.visitantesCriados || 0} novos visitantes`);
      carregarResumo();
    } catch (e) { toast.error(formatErro(e)); }
    finally { setSincronizando(false); }
  }

  const pct = (n) => resumo?.pessoas ? Math.round((n / resumo.pessoas) * 100) : 0;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 800, color: C.text }}>
            <Wifi size={26} color={C.primary} /> WiFi
          </h1>
          <p style={{ color: C.t3, fontSize: 13, marginTop: 2 }}>
            Visitantes do portal WiFi · frequência por culto e cruzamento com a membresia
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {resumo?.ultimoSync && (
            <span style={{ fontSize: 12, color: C.t3 }}>
              Último sync: {fmtDataHora(resumo.ultimoSync.iniciado_em)}
              {resumo.ultimoSync.status === 'erro' && <span style={{ color: '#EF4444' }}> · erro</span>}
            </span>
          )}
          <button onClick={sincronizar} disabled={sincronizando} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
            border: `1px solid ${C.border}`, background: C.card, color: C.text, fontWeight: 600,
            fontSize: 13, cursor: sincronizando ? 'wait' : 'pointer', opacity: sincronizando ? 0.6 : 1,
          }}>
            <RefreshCw size={15} className={sincronizando ? 'animate-spin' : ''} /> Sincronizar agora
          </button>
        </div>
      </div>

      {resumo && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <StatCard icon={Users} label="Pessoas (CPF únicos)" valor={resumo.pessoas} sub={`${resumo.conexoes_30d} conexões em 30d`} />
          <StatCard icon={ShieldCheck} label="Já são membros" valor={resumo.pessoas_membros} sub={`${pct(resumo.pessoas_membros)}% do total`} />
          <StatCard icon={Droplet} label="Dízimam / ofertam" valor={resumo.pessoas_dizimam} sub={`${pct(resumo.pessoas_dizimam)}% · últimos 90d`} />
          <StatCard icon={HandHeart} label="Servem" valor={resumo.pessoas_servem} sub={`${pct(resumo.pessoas_servem)}%`} />
          <StatCard icon={UsersRound} label="Em grupo" valor={resumo.pessoas_em_grupo} sub={`${pct(resumo.pessoas_em_grupo)}%`} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['pessoas', 'Pessoas'], ['cultos', 'Por culto'], ['semana', 'Por semana'], ['alertas', 'Alertas']].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            color: tab === k ? C.primary : C.t3, background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === k ? C.primary : 'transparent'}`,
          }}>{lbl}</button>
        ))}
      </div>

      {tab === 'pessoas' && <AbaPessoas onPick={setCpfSel} />}
      {tab === 'cultos' && <AbaCultos servicos={servicos} onPick={setCpfSel} />}
      {tab === 'semana' && <AbaSemana servicos={servicos} />}
      {tab === 'alertas' && <AbaAlertas onPick={setCpfSel} />}

      {cpfSel && <PerfilPessoa cpf={cpfSel} onClose={() => setCpfSel(null)} />}
    </div>
  );
}

// ─────────────────────────── Filtro reutilizável ───────────────────────────
function FiltroBar({ servicos, value, onChange }) {
  const dias = [...new Set((servicos || []).map(s => s.recurrence_day))].sort();
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
      {PERIODOS.map(p => (
        <button key={p.meses} onClick={() => set({ periodo: p.meses, de: '', ate: '' })} style={chipStyle(value.periodo === p.meses && !value.de && !value.ate)}>{p.label}</button>
      ))}
      <select value={value.serviceType} onChange={e => set({ serviceType: e.target.value })} style={selStyle}>
        <option value="">Todos os horários</option>
        {(servicos || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select value={value.dow} onChange={e => set({ dow: e.target.value })} style={selStyle}>
        <option value="">Todos os dias</option>
        {dias.map(d => <option key={d} value={d}>{DIAS[d]}</option>)}
      </select>
      <DatePicker value={value.de} onChange={v => set({ de: v })} style={selStyle} title="De" />
      <DatePicker value={value.ate} onChange={v => set({ ate: v })} style={selStyle} title="Até" />
    </div>
  );
}
function paramsDe(f) {
  const base = f.periodo ? periodoISO(f.periodo) : {};
  const inicio = f.de || base.inicio || null;
  const fim = f.ate || base.fim || null;
  const p = {};
  if (inicio) p.inicio = inicio;
  if (fim) p.fim = fim;
  if (f.serviceType) p.service_type = f.serviceType;
  if (f.dow !== '') p.dow = f.dow;
  return p;
}

// ─────────────────────────── Aba Pessoas ───────────────────────────
const CATS = [
  ['membro', 'Membro', '#3B82F6'], ['serve', 'Serve', '#F59E0B'],
  ['grupo', 'Em grupo', '#8B5CF6'], ['dizima', 'Dízima/oferta', '#10B981'],
  ['batismo', 'Batizado', '#06B6D4'], ['next', 'NEXT', '#0EA5E9'],
  ['decisao', 'Decisão', '#EC4899'],
];

function AbaPessoas({ onPick }) {
  const [busca, setBusca] = useState('');
  const [buscaDeb, setBuscaDeb] = useState('');
  const [cats, setCats] = useState({});
  const [data, setData] = useState({ pessoas: [], total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const limit = 50;

  useEffect(() => { const t = setTimeout(() => setBuscaDeb(busca), 350); return () => clearTimeout(t); }, [busca]);
  useEffect(() => { setPage(1); }, [buscaDeb, cats]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (buscaDeb) params.busca = buscaDeb;
      CATS.forEach(([k]) => { if (cats[k]) params[k] = 1; });
      setData(await wifiApi.pessoas(params));
    } catch (e) { toast.error(formatErro(e)); }
    finally { setLoading(false); }
  }, [page, buscaDeb, cats]);
  useEffect(() => { carregar(); }, [carregar]);

  const totalPages = Math.max(1, Math.ceil(data.total / limit));
  const algumFiltro = CATS.some(([k]) => cats[k]);
  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: C.t3 }} />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou CPF…"
          style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, fontSize: 14 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        {CATS.map(([k, lbl, cor]) => {
          const on = !!cats[k];
          return (
            <button key={k} onClick={() => setCats(c => ({ ...c, [k]: !c[k] }))} style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${cor}`, background: on ? cor : 'transparent', color: on ? '#fff' : cor,
            }}>{lbl}</button>
          );
        })}
        {algumFiltro && <button onClick={() => setCats({})} style={{ ...chipStyle(false), padding: '6px 10px', fontSize: 12.5 }}>Limpar</button>}
      </div>
      <div style={{ fontSize: 12, color: C.t3, marginBottom: 8 }}>
        {data.total} pessoa(s){algumFiltro ? ' · combinando os filtros (E)' : ''}
      </div>
      <div style={{ background: C.card, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', borderRadius: 16, overflow: 'hidden' }}>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: C.t3 }}>Carregando…</div>}
        {!loading && data.pessoas.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: C.t3 }}>Nenhuma pessoa encontrada.</div>}
        {!loading && data.pessoas.map(p => <PessoaRow key={p.cpf_norm} p={p} onClick={() => onPick(p.cpf_norm)} />)}
      </div>
      <Paginacao page={page} pageSize={limit} total={data.total} onPageChange={setPage} itemLabel="pessoas" />
    </div>
  );
}

// ─────────────────────────── Aba Por culto ───────────────────────────
function AbaCultos({ servicos, onPick }) {
  const [filtros, setFiltros] = useState({ periodo: 3, serviceType: '', dow: '', de: '', ate: '' });
  const [cultos, setCultos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cultoSel, setCultoSel] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try { const r = await wifiApi.cultos(paramsDe(filtros)); setCultos(r.cultos || []); }
    catch (e) { toast.error(formatErro(e)); }
    finally { setLoading(false); }
  }, [filtros]);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div>
      <FiltroBar servicos={servicos} value={filtros} onChange={setFiltros} />
      <Legenda itens={LEGENDA_CULTO} nota="Clique num culto para ver as pessoas que se conectaram nele. A presença aparece “—” enquanto não for lançada no ministerial." />
      <div style={{ background: C.card, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px 90px 90px', padding: '10px 16px', fontSize: 12, fontWeight: 700, color: C.t3, borderBottom: `1px solid ${C.border}`, background: C.inputBg }}>
          <span>Culto</span>
          <span style={{ textAlign: 'right' }}>Presença</span>
          <span style={{ textAlign: 'right' }}>Conexões</span>
          <span style={{ textAlign: 'right' }}>Dispositivos</span>
          <span style={{ textAlign: 'right' }}>Captação</span>
          <span style={{ textAlign: 'right' }}>Identif.</span>
        </div>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: C.t3 }}>Carregando…</div>}
        {!loading && cultos.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: C.t3 }}>Nenhuma conexão no período.</div>}
        {!loading && cultos.map(c => {
          const tx = taxa(c.dispositivos, c.presencial);
          return (
            <button key={c.id} onClick={() => setCultoSel(c)} style={{
              width: '100%', textAlign: 'left', display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px 90px 90px',
              padding: '11px 16px', fontSize: 13, borderBottom: `1px solid ${C.border}`, alignItems: 'center', background: 'none', cursor: 'pointer',
            }}>
              <span style={{ color: C.text }}>
                <CalendarDays size={13} style={{ display: 'inline', marginRight: 6, color: C.t3 }} />
                {c.servico} <span style={{ color: C.t3 }}>· {fmtData(c.data)}</span>
              </span>
              <span style={{ textAlign: 'right', color: c.presencial > 0 ? C.text : C.t3 }}>{c.presencial > 0 ? c.presencial : '—'}</span>
              <span style={{ textAlign: 'right', color: C.t2 }}>{c.logins}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, color: C.text }}>{c.dispositivos}</span>
              <span style={{ textAlign: 'right', color: tx == null ? C.t3 : (tx >= 60 ? '#10B981' : tx >= 35 ? '#F59E0B' : '#EF4444'), fontWeight: 600 }}>{tx == null ? '—' : tx + '%'}</span>
              <span style={{ textAlign: 'right', color: C.primary, fontWeight: 600 }}>{c.pessoas_identificadas}</span>
            </button>
          );
        })}
      </div>
      {cultoSel && <PessoasDoCulto culto={cultoSel} onPick={onPick} onClose={() => setCultoSel(null)} />}
    </div>
  );
}

function PessoasDoCulto({ culto, onPick, onClose }) {
  const [pessoas, setPessoas] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let vivo = true;
    wifiApi.pessoas({ culto_id: culto.id, limit: 200 })
      .then(r => { if (vivo) setPessoas(r.pessoas || []); })
      .catch(e => { toast.error(formatErro(e)); onClose(); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [culto.id]); // eslint-disable-line
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: C.overlay, zIndex: 999, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(540px,100%)', height: '100%', background: 'var(--panel)', WebkitBackdropFilter: 'blur(18px) saturate(140%)', backdropFilter: 'blur(18px) saturate(140%)', borderLeft: '1px solid var(--hairline)', overflowY: 'auto', boxShadow: 'var(--shadow-hover), var(--hi)' }}>
        <div style={{ position: 'sticky', top: 0, background: 'var(--cbrio-card)', borderBottom: `1px solid var(--hairline)`, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{culto.servico}</h2>
            <div style={{ fontSize: 12, color: C.t3 }}>{fmtData(culto.data)} · {culto.pessoas_identificadas} pessoa(s) identificada(s)</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3 }}><X size={20} /></button>
        </div>
        {loading && <div style={{ padding: 32, textAlign: 'center', color: C.t3 }}>Carregando…</div>}
        {!loading && pessoas.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: C.t3 }}>Nenhuma pessoa identificada (só dispositivos sem cadastro).</div>}
        {!loading && pessoas.map(p => <PessoaRow key={p.cpf_norm} p={p} onClick={() => onPick(p.cpf_norm)} />)}
      </div>
    </div>
  );
}

// ─────────────────────────── Aba Por semana ───────────────────────────
function AbaSemana({ servicos }) {
  const [filtros, setFiltros] = useState({ periodo: 6, serviceType: '', dow: '', de: '', ate: '' });
  const [semanas, setSemanas] = useState([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try { const r = await wifiApi.semanas(paramsDe(filtros)); setSemanas(r.semanas || []); }
    catch (e) { toast.error(formatErro(e)); }
    finally { setLoading(false); }
  }, [filtros]);
  useEffect(() => { carregar(); }, [carregar]);

  function semanaLabel(s) {
    const ini = new Date(s + 'T00:00:00'); const fim = new Date(ini); fim.setDate(fim.getDate() + 6);
    return `${pad(ini.getDate())}/${pad(ini.getMonth() + 1)} – ${pad(fim.getDate())}/${pad(fim.getMonth() + 1)}`;
  }

  return (
    <div>
      <FiltroBar servicos={servicos} value={filtros} onChange={setFiltros} />
      <Legenda itens={LEGENDA_SEMANA} nota="Permite “bater” as semanas: comparar a presença real lançada com quantos foram captados pelo WiFi." />
      <div style={{ background: C.card, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 100px 90px 90px', padding: '10px 16px', fontSize: 12, fontWeight: 700, color: C.t3, borderBottom: `1px solid ${C.border}`, background: C.inputBg }}>
          <span>Semana</span>
          <span style={{ textAlign: 'right' }}>Cultos</span>
          <span style={{ textAlign: 'right' }}>Presença</span>
          <span style={{ textAlign: 'right' }}>Dispositivos</span>
          <span style={{ textAlign: 'right' }}>Captação</span>
          <span style={{ textAlign: 'right' }}>Identif.</span>
        </div>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: C.t3 }}>Carregando…</div>}
        {!loading && semanas.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: C.t3 }}>Sem dados no período.</div>}
        {!loading && semanas.map(s => {
          const tx = taxa(s.dispositivos, s.presencial);
          return (
            <div key={s.semana} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 100px 90px 90px', padding: '11px 16px', fontSize: 13, borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
              <span style={{ color: C.text }}>{semanaLabel(s.semana)} <span style={{ color: C.t3, fontSize: 11 }}>· {new Date(s.semana + 'T00:00:00').getFullYear()}</span></span>
              <span style={{ textAlign: 'right', color: C.t3 }}>{s.cultos}</span>
              <span style={{ textAlign: 'right', color: s.presencial > 0 ? C.text : C.t3, fontWeight: 700 }}>{s.presencial > 0 ? s.presencial : '—'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, color: C.text }}>{s.dispositivos}</span>
              <span style={{ textAlign: 'right', color: tx == null ? C.t3 : (tx >= 60 ? '#10B981' : tx >= 35 ? '#F59E0B' : '#EF4444'), fontWeight: 600 }}>{tx == null ? '—' : tx + '%'}</span>
              <span style={{ textAlign: 'right', color: C.primary, fontWeight: 600 }}>{s.identificadas}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────── Aba Alertas ───────────────────────────
function AbaAlertas({ onPick }) {
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todos');

  useEffect(() => {
    setLoading(true);
    wifiApi.alertas().then(r => setAlertas(r.alertas || [])).catch(e => toast.error(formatErro(e))).finally(() => setLoading(false));
  }, []);

  const cats = Object.keys(ALERTA_META);
  const contagem = (cat) => alertas.filter(a => a.categoria === cat).length;
  const lista = filtro === 'todos' ? alertas : alertas.filter(a => a.categoria === filtro);

  return (
    <div>
      <Legenda
        itens={Object.values(ALERTA_META).map(m => [m.label, m.desc + '.', m.cor])}
        nota="Padrões calculados automaticamente pelas conexões em cultos. “Semanas seguidas” = semanas (seg–dom) consecutivas com presença. Clique numa pessoa pro perfil completo."
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => setFiltro('todos')} style={chipStyle(filtro === 'todos')}>Todos ({alertas.length})</button>
        {cats.map(cat => {
          const m = ALERTA_META[cat]; const n = contagem(cat); const Icon = m.icon;
          return (
            <button key={cat} onClick={() => setFiltro(cat)} style={{ ...chipStyle(filtro === cat), display: 'flex', alignItems: 'center', gap: 6, color: filtro === cat ? '#fff' : m.cor, background: filtro === cat ? m.cor : C.card, borderColor: m.cor }}>
              <Icon size={14} /> {m.label} ({n})
            </button>
          );
        })}
      </div>
      {filtro !== 'todos' && <div style={{ fontSize: 13, color: C.t3, marginBottom: 10 }}>{ALERTA_META[filtro].desc}.</div>}
      <div style={{ background: C.card, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', borderRadius: 16, overflow: 'hidden' }}>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: C.t3 }}>Carregando…</div>}
        {!loading && lista.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: C.t3 }}>Ninguém nesta categoria.</div>}
        {!loading && lista.map(a => {
          const m = ALERTA_META[a.categoria] || {};
          return (
            <button key={a.cpf_norm} onClick={() => onPick(a.cpf_norm)} style={{
              width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: 'none', cursor: 'pointer',
            }}>
              <div style={{ width: 8, height: 38, borderRadius: 4, background: m.cor || C.border, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: C.text }}>{a.nome || 'Sem nome'} {a.eh_membro && <span style={{ fontSize: 11, color: '#3B82F6' }}>· membro</span>}</div>
                <div style={{ fontSize: 12, color: C.t3 }}>
                  {filtro === 'todos' && <span style={{ color: m.cor, fontWeight: 600 }}>{m.label} · </span>}
                  {a.total_visitas} visita(s) · {a.streak_atual} sem. seguidas · {a.dias_desde_ultima}d desde a última
                </div>
              </div>
              <span style={{ fontSize: 11, color: C.t3, textAlign: 'right' }}>últ. {fmtData(a.ultima)}</span>
              <ChevronRight size={16} color={C.t3} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────── Perfil 360º ───────────────────────────
function PerfilPessoa({ cpf, onClose }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoading(true);
      try { const r = await wifiApi.pessoa(cpf); if (vivo) setD(r); }
      catch (e) { toast.error(formatErro(e)); onClose(); }
      finally { if (vivo) setLoading(false); }
    })();
    return () => { vivo = false; };
  }, [cpf]); // eslint-disable-line

  const cz = d?.cruzamento || {};
  const p = d?.pessoa;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: C.overlay, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px,100%)', height: '100%', background: 'var(--panel)', WebkitBackdropFilter: 'blur(18px) saturate(140%)', backdropFilter: 'blur(18px) saturate(140%)', borderLeft: '1px solid var(--hairline)', overflowY: 'auto', boxShadow: 'var(--shadow-hover), var(--hi)' }}>
        <div style={{ position: 'sticky', top: 0, background: 'var(--cbrio-card)', borderBottom: `1px solid var(--hairline)`, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{p?.nome || 'Perfil'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3 }}><X size={20} /></button>
        </div>
        {loading && <div style={{ padding: 32, textAlign: 'center', color: C.t3 }}>Carregando…</div>}
        {!loading && p && (
          <div style={{ padding: 20 }}>
            <Bloco titulo="Identificação">
              <Linha k="CPF" v={fmtCpf(p.cpf_norm)} />
              <Linha k="Telefone" v={p.telefone || '—'} />
              <Linha k="E-mail" v={p.email || '—'} />
              <Linha k="Consentimento LGPD" v={p.aceite_lgpd
                ? <span style={{ color: '#10B981', display: 'inline-flex', gap: 4, alignItems: 'center' }}><ShieldCheck size={14} /> aceito</span>
                : <span style={{ color: '#F59E0B', display: 'inline-flex', gap: 4, alignItems: 'center' }}><ShieldAlert size={14} /> não consta</span>} />
              <Linha k="Vínculo com membresia" v={p.eh_membro
                ? <span style={{ color: '#3B82F6' }}>Membro · {p.membro_status || '—'}</span>
                : <span style={{ color: C.t3 }}>Sem cadastro de membro</span>} />
            </Bloco>

            <Bloco titulo={`Frequência no WiFi · ${p.total_logins} conexões · ${p.cultos_distintos} cultos`}>
              {(d.freqServico || []).length === 0 && <div style={{ color: C.t3, fontSize: 13 }}>Sem conexões registradas.</div>}
              {(d.freqServico || []).map(f => (
                <div key={f.servico} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                  <span style={{ color: C.text }}>{f.servico}</span>
                  <span style={{ color: C.t3 }}>{f.logins} conexões · {f.dias} dia(s)</span>
                </div>
              ))}
            </Bloco>

            {p.eh_membro && (
              <Bloco titulo="Engajamento (membresia)">
                <Linha k="Grupos" v={(cz.grupos || []).length ? cz.grupos.map(g => g.nome).join(', ') : '—'} />
                <Linha k="Voluntariado" v={(cz.voluntariado || []).length ? cz.voluntariado.map(v => v.ministerio || v.papel || 'serve').join(', ') : '—'} />
                <Linha k="Contribuições (12m)" v={(cz.contribuicoes || []).length
                  ? cz.contribuicoes.map(c => `${c.tipo} (${c.qtd}x · última ${fmtData(c.ultima)})`).join(' · ') : '—'} />
                <Linha k="Trilha" v={(cz.trilha || []).filter(t => t.concluida).map(t => t.etapa).join(', ') || '—'} />
              </Bloco>
            )}

            <Bloco titulo="Batismo">
              {(cz.batismos || []).length === 0 ? <div style={{ color: C.t3, fontSize: 13 }}>Sem inscrição de batismo.</div>
                : cz.batismos.map(b => <Linha key={b.id} k={b.status} v={b.data_batismo ? fmtData(b.data_batismo) : 'sem data'} />)}
            </Bloco>
            <Bloco titulo="Decisões">
              {(cz.decisoes || []).length === 0 ? <div style={{ color: C.t3, fontSize: 13 }}>Sem decisões registradas.</div>
                : cz.decisoes.map(dec => <Linha key={dec.id} k={dec.culto_nome || dec.tipo_decisao} v={fmtDataHora(dec.registrado_em)} />)}
            </Bloco>
            <Bloco titulo="NEXT">
              {(cz.next || []).length === 0 ? <div style={{ color: C.t3, fontSize: 13 }}>Sem inscrição no NEXT.</div>
                : cz.next.map(n => <Linha key={n.id} k="Inscrição" v={n.check_in_at ? `check-in ${fmtDataHora(n.check_in_at)}` : fmtDataHora(n.created_at)} />)}
            </Bloco>

            <Bloco titulo="Histórico de conexões">
              {(d.conexoes || []).slice(0, 50).map(cx => (
                <div key={cx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.text }}>{cx.servico || (cx.culto_data ? 'culto' : 'fora de culto')}</span>
                  <span style={{ color: C.t3, display: 'inline-flex', gap: 6, alignItems: 'center' }}><Clock size={12} /> {fmtDataHora(cx.timestamp_evento)}</span>
                </div>
              ))}
              {(d.conexoes || []).length === 0 && <div style={{ color: C.t3, fontSize: 13 }}>Sem conexões.</div>}
            </Bloco>
          </div>
        )}
      </div>
    </div>
  );
}

function Bloco({ titulo, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>{titulo}</div>
      <div style={{ background: C.card, border: '1px solid var(--hairline)', borderRadius: 16, padding: '10px 14px' }}>{children}</div>
    </div>
  );
}
function Linha({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: C.t3 }}>{k}</span>
      <span style={{ color: C.text, textAlign: 'right' }}>{v}</span>
    </div>
  );
}
