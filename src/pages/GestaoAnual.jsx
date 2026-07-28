import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { events as eventsApi, projects as projectsApi, planejamento as planejamentoApi } from '../api';
import { toast } from 'sonner';
import { CalendarDays, FolderKanban, Plus, Sparkles } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';

// ── Tema ────────────────────────────────────────────────────
const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18',
  green: '#10b981', amber: '#f59e0b', blue: '#3b82f6', red: '#ef4444',
};

// Status de projeto (mesma semântica do módulo Projetos)
const PROJ_STATUS = {
  'planejamento': { label: 'Planejamento', c: C.t3 },
  'no-prazo':     { label: 'No prazo',      c: C.green },
  'em-andamento': { label: 'Em andamento',  c: C.blue },
  'atrasado':     { label: 'Atrasado',      c: C.red },
  'concluido':    { label: 'Concluído',     c: C.green },
  'pausado':      { label: 'Pausado',       c: C.amber },
};

function fmtDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return `${dd}/${m}/${y}`;
}

const cardStyle = { background: C.card, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)', borderRadius: 16 };
const btn = (v = 'primary') => ({
  padding: '7px 13px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  ...(v === 'primary' ? { background: C.primary, color: '#fff' } : {}),
  ...(v === 'ghost' ? { background: 'transparent', color: C.t2, border: `1px solid ${C.border}` } : {}),
  ...(v === 'soft' ? { background: C.primaryBg, color: C.primary } : {}),
});
const input = {
  padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13,
  background: 'var(--cbrio-input-bg, #fff)', color: C.text, outline: 'none', width: '100%', boxSizing: 'border-box',
};

export default function GestaoAnual() {
  const { profile } = useAuth();
  // Criar projeto/evento exige role admin/diretor no backend (authorize('admin','diretor')).
  const canEdit = ['admin', 'diretor'].includes(profile?.role);
  const anoAtual = new Date().getFullYear();

  const [ano, setAno] = useState(anoAtual + 1); // default: planejar o próximo ano
  const [projetos, setProjetos] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novoProj, setNovoProj] = useState(null); // { name, area }
  const [novoEv, setNovoEv] = useState(null);     // { name, date }
  const [saving, setSaving] = useState(false);
  const [gerando, setGerando] = useState(false);

  const ehFuturo = ano > anoAtual;
  const ehPassado = ano < anoAtual;
  const ehCorrente = ano === anoAtual;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pj, ev] = await Promise.all([
        projectsApi.list({ year: ano }).catch(() => []),
        eventsApi.list({ year: ano }).catch(() => []),
      ]);
      setProjetos(Array.isArray(pj) ? pj : (pj?.items || []));
      setEventos(Array.isArray(ev) ? ev : (ev?.items || []));
    } catch {
      toast.error('Erro ao carregar o ano');
    } finally {
      setLoading(false);
    }
  }, [ano]);
  useEffect(() => { load(); }, [load]);

  const criarProjeto = async () => {
    if (!novoProj?.name?.trim()) return;
    setSaving(true);
    try {
      await projectsApi.create({ name: novoProj.name.trim(), year: ano, status: 'planejamento', area: novoProj.area || '' });
      setNovoProj(null);
      toast.success('Projeto adicionado ao planejamento');
      await load();
    } catch (e) { toast.error(e.message || 'Erro ao criar projeto'); } finally { setSaving(false); }
  };

  const criarEvento = async () => {
    if (!novoEv?.name?.trim() || !novoEv?.date) return;
    setSaving(true);
    try {
      await eventsApi.create({ name: novoEv.name.trim(), date: novoEv.date });
      setNovoEv(null);
      toast.success('Evento adicionado ao planejamento');
      await load();
    } catch (e) { toast.error(e.message || 'Erro ao criar evento'); } finally { setSaving(false); }
  };

  const gerarLiturgia = async () => {
    setGerando(true);
    try {
      const r = await planejamentoApi.gerarLiturgia(ano);
      toast.success(`Litúrgicos ${ano}: ${r?.created ?? 0} criado(s), ${r?.skipped ?? 0} já existia(m)`);
      await load();
    } catch (e) { toast.error(e.message || 'Erro ao gerar litúrgicos'); } finally { setGerando(false); }
  };

  const projConcluidos = projetos.filter(p => p.status === 'concluido').length;
  const projPct = projetos.length ? Math.round((projConcluidos / projetos.length) * 100) : 0;
  const anos = [anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1, anoAtual + 2];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>Gestão Anual</div>
        <div style={{ fontSize: 13, color: C.t2, marginTop: 2 }}>
          Planejar o próximo ano e revisar os resultados dos anos fechados {'·'} eventos e projetos.
          O ano corrente é executado em Projetos e Eventos.
        </div>
      </div>

      {/* Navegador de ano */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {anos.map(a => {
          const active = a === ano;
          const tag = a === anoAtual ? 'corrente' : a > anoAtual ? 'futuro' : 'fechado';
          return (
            <button key={a} onClick={() => setAno(a)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
              border: active ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
              background: active ? C.primaryBg : 'transparent', color: active ? C.primary : C.t2,
            }}>{a} <span style={{ fontSize: 10, opacity: 0.7 }}>{'·'} {tag}</span></button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>Carregando {ano}{'…'}</div>
      ) : ehCorrente ? (
        <div style={{ ...cardStyle, padding: '20px 24px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>{ano} é o ano corrente</div>
          <div style={{ fontSize: 13, color: C.t2 }}>
            A execução do ano corrente vive em <b>Projetos</b> e <b>Eventos</b>. Aqui na Gestão Anual você
            planeja o próximo ano e revisa os anos fechados.
          </div>
          <div style={{ display: 'flex', gap: 28, marginTop: 16 }}>
            <div><div style={{ fontSize: 28, fontWeight: 800, color: C.primary }}>{projetos.length}</div><div style={{ fontSize: 11, color: C.t3 }}>projetos em {ano}</div></div>
            <div><div style={{ fontSize: 28, fontWeight: 800, color: C.blue }}>{eventos.length}</div><div style={{ fontSize: 11, color: C.t3 }}>eventos em {ano}</div></div>
          </div>
        </div>
      ) : (
        <>
          {ehPassado && (
            <div style={{ ...cardStyle, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Resultados de {ano}</div>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: 26, fontWeight: 800, color: C.green }}>{projPct}%</div><div style={{ fontSize: 11, color: C.t3 }}>projetos concluídos ({projConcluidos}/{projetos.length})</div></div>
                <div><div style={{ fontSize: 26, fontWeight: 800, color: C.blue }}>{eventos.length}</div><div style={{ fontSize: 11, color: C.t3 }}>eventos realizados</div></div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {/* Projetos */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: C.text, fontSize: 14 }}><FolderKanban size={16} /> Projetos ({projetos.length})</div>
                {ehFuturo && canEdit && <button style={btn('soft')} onClick={() => setNovoProj({ name: '', area: '' })}><Plus size={14} /> Projeto</button>}
              </div>
              <div style={{ maxHeight: 440, overflowY: 'auto' }}>
                {ehFuturo && canEdit && novoProj && (
                  <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, background: C.bg, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input autoFocus style={input} placeholder="Nome do projeto" value={novoProj.name}
                      onChange={e => setNovoProj(p => ({ ...p, name: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') criarProjeto(); }} />
                    <input style={input} placeholder="Área (opcional)" value={novoProj.area}
                      onChange={e => setNovoProj(p => ({ ...p, area: e.target.value }))} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={btn('primary')} disabled={saving} onClick={criarProjeto}>{saving ? '…' : 'Adicionar'}</button>
                      <button style={btn('ghost')} onClick={() => setNovoProj(null)}>Cancelar</button>
                    </div>
                  </div>
                )}
                {projetos.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum projeto em {ano}.</div>
                ) : projetos.map(p => {
                  const st = PROJ_STATUS[p.status] || { label: p.status || '—', c: C.t3 };
                  return (
                    <div key={p.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: C.t3 }}>{p.area || '—'}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: st.c, whiteSpace: 'nowrap' }}>{st.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Eventos */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: C.text, fontSize: 14 }}><CalendarDays size={16} /> Eventos ({eventos.length})</div>
                {ehFuturo && canEdit && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={btn('soft')} onClick={gerarLiturgia} disabled={gerando} title="Cria os eventos litúrgicos fixos do ano (Ceia, Batismo, Apresentação)"><Sparkles size={14} /> {gerando ? 'Gerando…' : 'Litúrgicos'}</button>
                    <button style={btn('soft')} onClick={() => setNovoEv({ name: '', date: `${ano}-01-01` })}><Plus size={14} /> Evento</button>
                  </div>
                )}
              </div>
              <div style={{ maxHeight: 440, overflowY: 'auto' }}>
                {ehFuturo && canEdit && novoEv && (
                  <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, background: C.bg, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input autoFocus style={input} placeholder="Nome do evento" value={novoEv.name}
                      onChange={e => setNovoEv(p => ({ ...p, name: e.target.value }))} />
                    <DatePicker style={input} value={novoEv.date} min={`${ano}-01-01`} max={`${ano}-12-31`}
                      onChange={v => setNovoEv(p => ({ ...p, date: v }))} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={btn('primary')} disabled={saving} onClick={criarEvento}>{saving ? '…' : 'Adicionar'}</button>
                      <button style={btn('ghost')} onClick={() => setNovoEv(null)}>Cancelar</button>
                    </div>
                  </div>
                )}
                {eventos.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: C.t3, fontSize: 13 }}>Nenhum evento em {ano}.</div>
                ) : eventos.map(ev => (
                  <div key={ev.id} style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{ev.name}</div>
                    <span style={{ fontSize: 11, color: C.t3, whiteSpace: 'nowrap' }}>{fmtDate(ev.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {ehFuturo && !canEdit && (
            <div style={{ fontSize: 12, color: C.t3, marginTop: 12 }}>
              Você tem acesso de leitura. Criar itens de planejamento é para líderes/diretores.
            </div>
          )}
        </>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}
