// ============================================================================
// Aba "Visitas" do /grupos · registro + agendamento de visitas aos grupos
//
// Marcos (2026-06-10): a aba Tarefas vira um registro de visitas, onde
// supervisores, coordenadores e os pastores Nélio e Natasha programam visitas
// aos grupos de conexão. Toda página de grupo tem "Agendar visita" que cai
// aqui, e há filtro de grupos sem visita há mais de 2 meses.
//
// Dados: mesma infra da supervisão (grupo_supervisao_visitas + view
// vw_grupos_supervisao) · GET /grupos/visitas/painel devolve papel + grupos +
// agendadas + histórico. Quem pode agir (agendar/registrar/concluir):
// admin, donos do módulo (nível >=3), coordenadores e supervisores (estes só
// nos próprios grupos) — o backend autoriza; aqui só escondemos os botões.
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { grupos as api, users } from '../../api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { toast } from 'sonner';
import {
  Calendar, CalendarCheck, CalendarPlus, CheckCircle2, AlertCircle, Activity,
  Search, X, Users, History, MapPin,
} from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', inputBg: 'var(--cbrio-input-bg)',
  green: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6',
};

const hojeISO = () => new Date().toISOString().slice(0, 10);
const fmtData = (d) => { if (!d) return '—'; try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };
const diasDesde = (d) => Math.floor((Date.now() - new Date(d + 'T12:00:00').getTime()) / 86400000);

// Semáforo da última visita realizada · mesma régua da tela de supervisão
function statusVisita(ultima) {
  if (!ultima) return { cor: C.red, bg: '#ef444420', label: 'Nunca visitado', Icon: AlertCircle, dias: Infinity };
  const dias = diasDesde(ultima);
  if (dias <= 30) return { cor: C.green, bg: '#10b98120', label: `Visitado há ${dias}d`, Icon: CheckCircle2, dias };
  if (dias <= 60) return { cor: C.amber, bg: '#f59e0b20', label: `${dias}d sem visita`, Icon: Activity, dias };
  return { cor: C.red, bg: '#ef444420', label: `${dias}d sem visita`, Icon: AlertCircle, dias };
}

// ============================================================================
// Modal · agendar (futura) ou registrar (já aconteceu) uma visita
// Reusado pela página de detalhe do grupo (botão "Agendar visita").
// ============================================================================
export function AgendarVisitaModal({ open, onClose, grupo, gruposOptions = [], modoInicial = 'agendar', onSaved }) {
  const [modo, setModo] = useState(modoInicial);
  const [grupoId, setGrupoId] = useState(grupo?.id || '');
  const [data, setData] = useState(hojeISO());
  const [responsavelId, setResponsavelId] = useState('me');
  const [obs, setObs] = useState('');
  const [usersList, setUsersList] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setModo(modoInicial);
      setGrupoId(grupo?.id || '');
      setData(hojeISO());
      setResponsavelId('me');
      setObs('');
      users.list().then(d => setUsersList(d || [])).catch(() => setUsersList([]));
    }
  }, [open, grupo?.id, modoInicial]);

  const submit = async () => {
    if (!grupoId) { toast.error('Escolha o grupo'); return; }
    if (!data) { toast.error('Informe a data'); return; }
    setSaving(true);
    try {
      await api.addVisita(grupoId, {
        data_visita: data,
        observacao: obs || null,
        status: modo === 'agendar' ? 'agendada' : 'realizada',
        responsavel_id: responsavelId !== 'me' ? responsavelId : undefined,
      });
      toast.success(modo === 'agendar' ? 'Visita agendada' : 'Visita registrada');
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || 'Erro ao salvar visita');
    } finally { setSaving(false); }
  };

  const nomeGrupo = grupo?.nome || gruposOptions.find(g => g.id === grupoId)?.nome;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {modo === 'agendar' ? 'Agendar visita' : 'Registrar visita'}
            {nomeGrupo ? ` — ${nomeGrupo}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Modo */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { key: 'agendar', label: 'Agendar (programada)', Icon: CalendarPlus },
              { key: 'registrar', label: 'Registrar (já aconteceu)', Icon: CalendarCheck },
            ].map(m => (
              <button key={m.key} type="button" onClick={() => setModo(m.key)} style={{
                flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: modo === m.key ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
                background: modo === m.key ? C.primaryBg : 'transparent',
                color: modo === m.key ? C.primary : C.t3,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <m.Icon size={14} /> {m.label}
              </button>
            ))}
          </div>

          {/* Grupo (quando não veio fixo) */}
          {!grupo && (
            <div>
              <Label style={{ fontSize: 12 }}>Grupo *</Label>
              <ShadSelect value={grupoId} onValueChange={setGrupoId}>
                <SelectTrigger><SelectValue placeholder="Escolha o grupo" /></SelectTrigger>
                <SelectContent>
                  {gruposOptions.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.nome}{g.bairro ? ` · ${g.bairro}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </ShadSelect>
            </div>
          )}

          <div>
            <Label style={{ fontSize: 12 }}>Data da visita *</Label>
            <Input type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>

          <div>
            <Label style={{ fontSize: 12 }}>Quem vai visitar</Label>
            <ShadSelect value={responsavelId} onValueChange={setResponsavelId}>
              <SelectTrigger><SelectValue placeholder="Eu mesmo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Eu mesmo(a)</SelectItem>
                {usersList.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </ShadSelect>
            {modo === 'agendar' && responsavelId !== 'me' && (
              <p style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>A pessoa designada recebe uma notificação.</p>
            )}
          </div>

          <div>
            <Label style={{ fontSize: 12 }}>Observação (opcional)</Label>
            <Textarea rows={3} value={obs} onChange={e => setObs(e.target.value)}
              placeholder={modo === 'agendar' ? 'Objetivo da visita, combinados com o líder...' : 'Como foi a visita? O que precisa ser acompanhado?'} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving ? 'Salvando...' : modo === 'agendar' ? 'Agendar visita' : 'Registrar visita'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Modal · concluir visita agendada (vira realizada · data + observação)
// ============================================================================
function ConcluirVisitaModal({ visita, onClose, onSaved }) {
  const agendadaNoFuturo = visita && visita.data_visita > hojeISO();
  const [data, setData] = useState(agendadaNoFuturo ? hojeISO() : (visita?.data_visita || hojeISO()));
  const [obs, setObs] = useState(visita?.observacao || '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api.updateVisita(visita.id, { status: 'realizada', data_visita: data, observacao: obs || null });
      toast.success('Visita marcada como realizada');
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || 'Erro ao concluir visita');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!visita} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Concluir visita — {visita?.grupo_nome || 'grupo'}</DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label style={{ fontSize: 12 }}>Data em que a visita aconteceu</Label>
            <Input type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>
          <div>
            <Label style={{ fontSize: 12 }}>Como foi a visita? (opcional)</Label>
            <Textarea rows={3} value={obs} onChange={e => setObs(e.target.value)}
              placeholder="Pontos de atenção, vitórias, próximos passos..." />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={onClose}>Voltar</Button>
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving ? 'Salvando...' : 'Confirmar visita realizada'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Aba Visitas · painel completo
// ============================================================================
export default function GruposVisitas({ onOpenGrupo }) {
  const [painel, setPainel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todos'); // todos | sem60 | nunca | agendadas
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(null);      // { grupo?, modo }
  const [concluir, setConcluir] = useState(null); // visita agendada sendo concluída
  const [verHistorico, setVerHistorico] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api.visitasPainel();
      setPainel(r);
    } catch {
      toast.error('Erro ao carregar visitas');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const papel = painel?.papel || null;
  const grupos = painel?.grupos || [];
  const agendadas = painel?.agendadas || [];
  const historico = painel?.historico || [];

  // Próxima visita agendada por grupo (a view também devolve proxima_visita,
  // mas o objeto completo da agenda traz responsável e id pra concluir)
  const agendadaPorGrupo = useMemo(() => {
    const m = {};
    for (const v of agendadas) {
      if (!m[v.grupo_id] || v.data_visita < m[v.grupo_id].data_visita) m[v.grupo_id] = v;
    }
    return m;
  }, [agendadas]);

  const podeAgirNoGrupo = useCallback((g) => {
    if (!papel) return false;
    if (papel === 'supervisor') return g.supervisor_id === painel?.membro_id;
    return true; // admin / coordenador / donos do módulo
  }, [papel, painel?.membro_id]);

  const stats = useMemo(() => {
    const sem60 = grupos.filter(g => statusVisita(g.ultima_visita).dias > 60).length;
    const nunca = grupos.filter(g => !g.ultima_visita).length;
    return { total: grupos.length, sem60, nunca, agendadas: agendadas.length };
  }, [grupos, agendadas]);

  const filtrados = useMemo(() => {
    let lista = grupos;
    if (busca) {
      const s = busca.toLowerCase();
      lista = lista.filter(g =>
        g.nome?.toLowerCase().includes(s) ||
        g.lider_nome?.toLowerCase().includes(s) ||
        g.supervisor_nome?.toLowerCase().includes(s) ||
        g.bairro?.toLowerCase().includes(s));
    }
    if (filtro === 'sem60') lista = lista.filter(g => statusVisita(g.ultima_visita).dias > 60);
    if (filtro === 'nunca') lista = lista.filter(g => !g.ultima_visita);
    if (filtro === 'agendadas') lista = lista.filter(g => agendadaPorGrupo[g.id]);
    // Mais negligenciado primeiro (nunca visitado no topo)
    return [...lista].sort((a, b) => statusVisita(b.ultima_visita).dias - statusVisita(a.ultima_visita).dias);
  }, [grupos, busca, filtro, agendadaPorGrupo]);

  const cancelarVisita = async (v) => {
    if (!window.confirm(`Cancelar a visita agendada ao grupo ${v.grupo_nome || ''}?`)) return;
    try {
      await api.updateVisita(v.id, { status: 'cancelada' });
      toast.success('Visita cancelada');
      carregar();
    } catch (e) { toast.error(e?.message || 'Erro ao cancelar'); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Carregando visitas...</div>;

  const FILTROS = [
    { key: 'todos', label: 'Todos', count: stats.total },
    { key: 'sem60', label: 'Sem visita há 2+ meses', count: stats.sem60, cor: C.red },
    { key: 'nunca', label: 'Nunca visitados', count: stats.nunca, cor: C.amber },
    { key: 'agendadas', label: 'Com visita agendada', count: stats.agendadas, cor: C.blue },
  ];

  return (
    <div>
      {/* Cabeçalho da aba */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Visitas aos grupos</h3>
          <p style={{ fontSize: 12, color: C.t3, margin: '4px 0 0' }}>
            Programe e registre as visitas de supervisão aos grupos de conexão. Visita agendada vira "realizada" depois que acontecer.
          </p>
        </div>
        {papel && (
          <Button size="sm" onClick={() => setModal({ modo: 'agendar' })}>
            <CalendarPlus size={14} style={{ marginRight: 6 }} /> Nova visita
          </Button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
        {[
          { label: 'Grupos ativos', value: stats.total, color: C.primary },
          { label: 'Sem visita há 2+ meses', value: stats.sem60, color: C.red },
          { label: 'Nunca visitados', value: stats.nunca, color: C.amber },
          { label: 'Visitas agendadas', value: stats.agendadas, color: C.blue },
        ].map(k => (
          <div key={k.label} style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: C.t3 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Próximas visitas agendadas */}
      {agendadas.length > 0 && (
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={14} style={{ color: C.blue }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Próximas visitas ({agendadas.length})</span>
          </div>
          {agendadas.map(v => {
            const atrasada = v.data_visita < hojeISO();
            const grupoDaVisita = grupos.find(g => g.id === v.grupo_id);
            const podeAgir = grupoDaVisita ? podeAgirNoGrupo(grupoDaVisita) : !!papel && papel !== 'supervisor';
            return (
              <div key={v.id} style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: atrasada ? '#ef444415' : '#3b82f615', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: atrasada ? C.red : C.blue, textTransform: 'uppercase' }}>
                    {new Date(v.data_visita + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: atrasada ? C.red : C.blue, lineHeight: 1 }}>
                    {new Date(v.data_visita + 'T12:00:00').getDate()}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {v.grupo_nome || 'Grupo'}
                    {atrasada && (
                      <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 99, background: '#ef444420', color: C.red, fontWeight: 700 }}>
                        passou da data — confirme ou reagende
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                    {fmtData(v.data_visita)}
                    {v.responsavel_nome ? ` · ${v.responsavel_nome}` : ''}
                    {v.grupo_bairro ? ` · ${v.grupo_bairro}` : ''}
                  </div>
                  {v.observacao && <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>{v.observacao}</div>}
                </div>
                {podeAgir && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <Button size="sm" variant="outline" onClick={() => setConcluir(v)}>
                      <CheckCircle2 size={13} style={{ marginRight: 4 }} /> Realizada
                    </Button>
                    <button onClick={() => cancelarVisita(v)} title="Cancelar visita"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 4 }}>
                      <X size={15} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Busca + filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.t3 }} />
          <Input placeholder="Buscar grupo, líder, supervisor ou bairro..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 34 }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTROS.map(f => {
            const ativo = filtro === f.key;
            return (
              <button key={f.key} onClick={() => setFiltro(f.key)} style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: ativo ? 700 : 500, cursor: 'pointer',
                border: ativo ? `2px solid ${f.cor || C.primary}` : `1px solid ${C.border}`,
                background: ativo ? `${f.cor || C.primary}18` : 'transparent',
                color: ativo ? (f.cor || C.primary) : C.t3,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                {f.label}
                <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.8 }}>{f.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista de grupos · mais tempo sem visita primeiro */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {filtrados.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>
            {filtro === 'sem60' ? 'Nenhum grupo há mais de 2 meses sem visita. 🎉' : 'Nenhum grupo encontrado.'}
          </div>
        ) : filtrados.map(g => {
          const sv = statusVisita(g.ultima_visita);
          const proxima = agendadaPorGrupo[g.id];
          const podeAgir = podeAgirNoGrupo(g);
          return (
            <div key={g.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <button onClick={() => onOpenGrupo?.(g.id)} style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, color: C.text, textAlign: 'left',
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = C.primary; }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.text; }}>
                  {g.nome}
                </button>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {g.lider_nome && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Users size={11} /> {g.lider_nome}</span>}
                  {g.supervisor_nome && <span>Supervisor: {g.supervisor_nome}</span>}
                  {g.bairro && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={11} /> {g.bairro}</span>}
                </div>
              </div>

              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10,
                padding: '4px 10px', borderRadius: 99, background: sv.bg, color: sv.cor, fontWeight: 700, flexShrink: 0,
              }}>
                <sv.Icon size={11} /> {sv.label}
              </span>

              {proxima ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10,
                  padding: '4px 10px', borderRadius: 99, background: '#3b82f618', color: C.blue, fontWeight: 700, flexShrink: 0,
                }}>
                  <Calendar size={11} /> {fmtData(proxima.data_visita)}
                </span>
              ) : (
                <span style={{ fontSize: 10, color: C.t3, flexShrink: 0, width: 86, textAlign: 'center' }}>sem agenda</span>
              )}

              {podeAgir && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <Button size="sm" variant="outline" onClick={() => setModal({ grupo: g, modo: 'agendar' })}>
                    <CalendarPlus size={13} style={{ marginRight: 4 }} /> Agendar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setModal({ grupo: g, modo: 'registrar' })}>
                    <CalendarCheck size={13} style={{ marginRight: 4 }} /> Registrar
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Histórico recente (realizadas + canceladas) */}
      {historico.length > 0 && (
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', marginTop: 14 }}>
          <button onClick={() => setVerHistorico(v => !v)} style={{
            width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
          }}>
            <History size={14} style={{ color: C.t3 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Últimas visitas registradas ({historico.length})</span>
            <span style={{ fontSize: 11, color: C.primary, marginLeft: 'auto', fontWeight: 600 }}>{verHistorico ? 'Esconder' : 'Mostrar'}</span>
          </button>
          {verHistorico && historico.map(v => (
            <div key={v.id} style={{ padding: '8px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              {v.status === 'cancelada'
                ? <X size={13} style={{ color: C.t3, marginTop: 3, flexShrink: 0 }} />
                : <CheckCircle2 size={13} style={{ color: C.green, marginTop: 3, flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.text }}>
                  <strong>{v.grupo_nome || 'Grupo'}</strong> · {fmtData(v.data_visita)}
                  {v.responsavel_nome ? ` · ${v.responsavel_nome}` : ''}
                  {v.status === 'cancelada' && <span style={{ color: C.t3 }}> · cancelada</span>}
                </div>
                {v.observacao && <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{v.observacao}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!papel && (
        <p style={{ fontSize: 11, color: C.t3, marginTop: 12 }}>
          Você está no modo visualização. Agendar e registrar visitas é permitido pra supervisores, coordenadores e responsáveis pelo módulo de Grupos.
        </p>
      )}

      {/* Modais */}
      <AgendarVisitaModal
        open={!!modal}
        onClose={() => setModal(null)}
        grupo={modal?.grupo || null}
        gruposOptions={grupos}
        modoInicial={modal?.modo || 'agendar'}
        onSaved={carregar}
      />
      {concluir && (
        <ConcluirVisitaModal visita={concluir} onClose={() => setConcluir(null)} onSaved={carregar} />
      )}
    </div>
  );
}
