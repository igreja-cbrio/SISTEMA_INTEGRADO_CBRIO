// ============================================================================
// Módulo WiFi — acompanhamento dos visitantes do portal WiFi
// ============================================================================
// Lê das tabelas espelho (wifi_visitantes / wifi_conexoes) sincronizadas do
// projeto Supabase "CBRio Wifi". Cruza por CPF/telefone/MAC com membresia,
// voluntariado, grupos, contribuições, batismo, decisões e NEXT.
//
// Abas:
//   - Pessoas  · lista (busca) → clicar abre perfil 360º (histórico + vínculos)
//   - Por culto · conexões por faixa de culto (Domingo/Quarta/Bridge/AMI)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import {
  Wifi, Search, Users, Heart, HandHeart, UsersRound, Droplet, X,
  RefreshCw, Clock, ChevronRight, CalendarDays, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { wifi as wifiApi } from '../../api';
import { formatErro } from '../../lib/formatErro';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#00B39D18',
};

const PERIODOS = [
  { label: '3 meses', meses: 3 },
  { label: '6 meses', meses: 6 },
  { label: '12 meses', meses: 12 },
  { label: '2 anos', meses: 24 },
];

function pad(n) { return String(n).padStart(2, '0'); }
function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function periodoISO(meses) {
  const fim = new Date();
  const ini = new Date(); ini.setMonth(ini.getMonth() - meses);
  return { inicio: toISO(ini), fim: toISO(fim) };
}
function fmtDataHora(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}
function fmtData(s) {
  if (!s) return '—';
  try { return new Date(s + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return s; }
}
function fmtCpf(c) {
  if (!c) return '—';
  const d = c.replace(/\D/g, '');
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : c;
}

function Pill({ children, ativo, cor = C.primary }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
      padding: '2px 8px', borderRadius: 999,
      color: ativo ? '#fff' : C.t3,
      background: ativo ? cor : 'transparent',
      border: `1px solid ${ativo ? cor : C.border}`,
    }}>{children}</span>
  );
}

function StatCard({ icon: Icon, label, valor, sub }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, flex: 1, minWidth: 150 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.t3, fontSize: 12, fontWeight: 600 }}>
        <Icon size={15} /> {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: C.text, marginTop: 6 }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function WifiModulo() {
  const [tab, setTab] = useState('pessoas');
  const [resumo, setResumo] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);

  const carregarResumo = useCallback(async () => {
    try { setResumo(await wifiApi.resumo()); }
    catch (e) { console.warn(e); }
  }, []);

  useEffect(() => { carregarResumo(); }, [carregarResumo]);

  async function sincronizar() {
    setSincronizando(true);
    try {
      const r = await wifiApi.sync();
      toast.success(`Sincronizado · ${r.conexoesNovas || 0} conexões · ${r.visitantesCriados || 0} novos visitantes`);
      carregarResumo();
    } catch (e) {
      toast.error(formatErro(e));
    } finally { setSincronizando(false); }
  }

  const pct = (n) => resumo?.pessoas ? Math.round((n / resumo.pessoas) * 100) : 0;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
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

      {/* KPIs */}
      {resumo && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <StatCard icon={Users} label="Pessoas (CPF únicos)" valor={resumo.pessoas} sub={`${resumo.conexoes_30d} conexões em 30d`} />
          <StatCard icon={ShieldCheck} label="Já são membros" valor={resumo.pessoas_membros} sub={`${pct(resumo.pessoas_membros)}% do total`} />
          <StatCard icon={Droplet} label="Dízimam / ofertam" valor={resumo.pessoas_dizimam} sub={`${pct(resumo.pessoas_dizimam)}% · últimos 90d`} />
          <StatCard icon={HandHeart} label="Servem" valor={resumo.pessoas_servem} sub={`${pct(resumo.pessoas_servem)}%`} />
          <StatCard icon={UsersRound} label="Em grupo" valor={resumo.pessoas_em_grupo} sub={`${pct(resumo.pessoas_em_grupo)}%`} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
        {[['pessoas', 'Pessoas'], ['cultos', 'Por culto']].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            color: tab === k ? C.primary : C.t3, background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === k ? C.primary : 'transparent'}`,
          }}>{lbl}</button>
        ))}
      </div>

      {tab === 'pessoas' && <AbaPessoas />}
      {tab === 'cultos' && <AbaCultos />}
    </div>
  );
}

// ─────────────────────────── Aba Pessoas ───────────────────────────
function AbaPessoas() {
  const [busca, setBusca] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState('');
  const [periodo, setPeriodo] = useState(0); // 0 = todos
  const [data, setData] = useState({ pessoas: [], total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [cpfSel, setCpfSel] = useState(null);
  const limit = 50;

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => { setPage(1); }, [buscaDebounced, periodo]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (buscaDebounced) params.busca = buscaDebounced;
      if (periodo) { const { inicio, fim } = periodoISO(PERIODOS.find(p => p.meses === periodo)?.meses || 12); params.inicio = inicio; params.fim = fim; }
      setData(await wifiApi.pessoas(params));
    } catch (e) { toast.error(formatErro(e)); }
    finally { setLoading(false); }
  }, [page, buscaDebounced, periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  const totalPages = Math.max(1, Math.ceil(data.total / limit));

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: C.t3 }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou CPF…"
            style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, fontSize: 14 }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setPeriodo(0)} style={chipStyle(periodo === 0)}>Todos</button>
          {PERIODOS.map(p => (
            <button key={p.meses} onClick={() => setPeriodo(p.meses)} style={chipStyle(periodo === p.meses)}>{p.label}</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.t3, marginBottom: 8 }}>
        {data.total} pessoa(s){periodo ? ` que conectaram nos últimos ${periodo} meses` : ''}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: C.t3 }}>Carregando…</div>}
        {!loading && data.pessoas.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.t3 }}>Nenhuma pessoa encontrada.</div>
        )}
        {!loading && data.pessoas.map((p) => (
          <button key={p.cpf_norm} onClick={() => setCpfSel(p.cpf_norm)} style={{
            width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: 'none', cursor: 'pointer',
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', background: C.primaryBg, color: C.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0,
            }}>{(p.nome || '?').trim().charAt(0).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.nome || 'Sem nome'}
              </div>
              <div style={{ fontSize: 12, color: C.t3 }}>
                {fmtCpf(p.cpf_norm)} · {p.cultos_distintos} culto(s) · última {fmtDataHora(p.ultima_conexao)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {p.eh_membro && <Pill ativo cor="#3B82F6">Membro</Pill>}
              {p.serve && <Pill ativo cor="#F59E0B">Serve</Pill>}
              {p.em_grupo && <Pill ativo cor="#8B5CF6">Grupo</Pill>}
              {p.dizima_oferta && <Pill ativo cor="#10B981">Doa</Pill>}
              {p.tem_batismo && <Pill ativo cor="#06B6D4">Batismo</Pill>}
            </div>
            <ChevronRight size={16} color={C.t3} />
          </button>
        ))}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={chipStyle(false)}>Anterior</button>
          <span style={{ fontSize: 13, color: C.t3 }}>Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={chipStyle(false)}>Próxima</button>
        </div>
      )}

      {cpfSel && <PerfilPessoa cpf={cpfSel} onClose={() => setCpfSel(null)} />}
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
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: C.overlay, zIndex: 1000,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(560px, 100%)', height: '100%', background: C.modalBg, overflowY: 'auto',
        boxShadow: '-8px 0 24px rgba(0,0,0,.2)',
      }}>
        <div style={{ position: 'sticky', top: 0, background: C.modalBg, borderBottom: `1px solid ${C.border}`, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{p?.nome || 'Perfil'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3 }}><X size={20} /></button>
        </div>

        {loading && <div style={{ padding: 32, textAlign: 'center', color: C.t3 }}>Carregando…</div>}

        {!loading && p && (
          <div style={{ padding: 20 }}>
            {/* Identificação */}
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

            {/* Frequência WiFi */}
            <Bloco titulo={`Frequência no WiFi · ${p.total_logins} conexões · ${p.cultos_distintos} cultos`}>
              {(d.freqServico || []).length === 0 && <div style={{ color: C.t3, fontSize: 13 }}>Sem conexões registradas.</div>}
              {(d.freqServico || []).map((f) => (
                <div key={f.servico} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                  <span style={{ color: C.text }}>{f.servico}</span>
                  <span style={{ color: C.t3 }}>{f.logins} conexões · {f.dias} dia(s)</span>
                </div>
              ))}
            </Bloco>

            {/* Vínculos */}
            {p.eh_membro && (
              <Bloco titulo="Engajamento (membresia)">
                <Linha k="Grupos" v={(cz.grupos || []).length ? cz.grupos.map(g => g.nome).join(', ') : '—'} />
                <Linha k="Voluntariado" v={(cz.voluntariado || []).length ? cz.voluntariado.map(v => v.ministerio || v.papel || 'serve').join(', ') : '—'} />
                <Linha k="Contribuições (12m)" v={(cz.contribuicoes || []).length
                  ? cz.contribuicoes.map(c => `${c.tipo} (${c.qtd}x · última ${fmtData(c.ultima)})`).join(' · ')
                  : '—'} />
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

            {/* Histórico de conexões */}
            <Bloco titulo="Histórico de conexões">
              {(d.conexoes || []).slice(0, 50).map((cx) => (
                <div key={cx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.text }}>{cx.servico || (cx.culto_data ? 'culto' : 'fora de culto')}</span>
                  <span style={{ color: C.t3, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <Clock size={12} /> {fmtDataHora(cx.timestamp_evento)}
                  </span>
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

// ─────────────────────────── Aba Por culto ───────────────────────────
function AbaCultos() {
  const [periodo, setPeriodo] = useState(3);
  const [cultos, setCultos] = useState([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { inicio, fim } = periodoISO(periodo);
      const r = await wifiApi.cultos({ inicio, fim });
      setCultos(r.cultos || []);
    } catch (e) { toast.error(formatErro(e)); }
    finally { setLoading(false); }
  }, [periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {PERIODOS.map(p => (
          <button key={p.meses} onClick={() => setPeriodo(p.meses)} style={chipStyle(periodo === p.meses)}>{p.label}</button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: C.t3, marginBottom: 10 }}>
        <strong>Dispositivos</strong> = MACs distintos que conectaram (aproxima a presença) ·
        <strong> Identificadas</strong> = quantas o sistema conseguiu ligar a uma pessoa pelo MAC cadastrado.
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 120px', padding: '10px 16px', fontSize: 12, fontWeight: 700, color: C.t3, borderBottom: `1px solid ${C.border}`, background: C.inputBg }}>
          <span>Culto</span>
          <span style={{ textAlign: 'right' }}>Conexões</span>
          <span style={{ textAlign: 'right' }}>Dispositivos</span>
          <span style={{ textAlign: 'right' }}>Identificadas</span>
        </div>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: C.t3 }}>Carregando…</div>}
        {!loading && cultos.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: C.t3 }}>Nenhuma conexão no período.</div>}
        {!loading && cultos.map((c) => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 120px', padding: '11px 16px', fontSize: 13, borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
            <span style={{ color: C.text }}>
              <CalendarDays size={13} style={{ display: 'inline', marginRight: 6, color: C.t3 }} />
              {c.servico} <span style={{ color: C.t3 }}>· {fmtData(c.data)}</span>
            </span>
            <span style={{ textAlign: 'right', color: C.t2 }}>{c.logins}</span>
            <span style={{ textAlign: 'right', fontWeight: 700, color: C.text }}>{c.dispositivos}</span>
            <span style={{ textAlign: 'right', color: C.primary, fontWeight: 600 }}>{c.pessoas_identificadas}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── helpers UI ───────────────────────────
function chipStyle(ativo) {
  return {
    padding: '7px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${ativo ? C.primary : C.border}`,
    background: ativo ? C.primaryBg : C.card,
    color: ativo ? C.primary : C.t2,
  };
}
function Bloco({ titulo, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>{titulo}</div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px' }}>{children}</div>
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
