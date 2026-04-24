import { useState, useEffect, useCallback } from 'react';
import { governanca } from '../api';
import { toast } from 'sonner';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', purple: '#8b5cf6',
};

const fmtDate = (d) => { if (!d) return '-'; try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };
const MESES = ['', 'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const STATUS_BADGE = {
  agendada: { bg: '#3b82f615', color: '#3b82f6', label: 'Agendada' },
  em_preparo: { bg: '#f59e0b15', color: '#f59e0b', label: 'Em preparo' },
  realizada: { bg: '#10b98115', color: '#10b981', label: 'Realizada' },
  cancelada: { bg: '#ef444415', color: '#ef4444', label: 'Cancelada' },
  adiada: { bg: '#9ca3af15', color: '#9ca3af', label: 'Adiada' },
};
const INPUT = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--cbrio-border)', background: 'var(--cbrio-input-bg)', color: 'var(--cbrio-text)', fontSize: 13, width: '100%' };
const LABEL = { fontSize: 11, fontWeight: 600, color: 'var(--cbrio-text2)', marginBottom: 3, display: 'block' };

export default function Governanca() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [meetingForm, setMeetingForm] = useState({});
  const [dados, setDados] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const loadCycle = useCallback(async () => {
    setLoading(true);
    setSelectedMeeting(null);
    setDados(null);
    try {
      const d = await governanca.cycle(year, month);
      setData(d);
    } catch { toast.error('Erro ao carregar ciclo'); }
    finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { loadCycle(); }, [loadCycle]);

  const criarCiclo = async () => {
    try {
      await governanca.createCycle({ year, month });
      toast.success(`Ciclo ${MESES[month]}/${year} criado`);
      loadCycle();
    } catch (err) { toast.error(err.message); }
  };

  const gerarAno = async () => {
    try {
      const r = await governanca.generateYear(year);
      toast.success(`${r.created} ciclos criados, ${r.skipped} ja existiam`);
      loadCycle();
    } catch (err) { toast.error(err.message); }
  };

  const selectMeeting = async (mtg) => {
    setSelectedMeeting(mtg);
    setMeetingForm({ pauta: mtg.pauta || '', ata: mtg.ata || '', deliberacoes: mtg.deliberacoes || '', status: mtg.status, local: mtg.local || '', observacoes: mtg.observacoes || '', date: mtg.date || '' });
    try {
      const d = await governanca.meetingDados(mtg.id);
      setDados(d);
    } catch { setDados(null); }
  };

  const salvarReuniao = async () => {
    if (!selectedMeeting) return;
    setSaving(true);
    try {
      await governanca.updateMeeting(selectedMeeting.id, meetingForm);
      toast.success('Reuniao atualizada');
      loadCycle();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const toggleTask = async (task) => {
    const newStatus = task.status === 'concluida' ? 'pendente' : 'concluida';
    await governanca.updateTask(task.id, { status: newStatus });
    loadCycle();
  };

  const addTask = async () => {
    if (!newTaskTitle.trim() || !selectedMeeting) return;
    await governanca.createTask({ meeting_id: selectedMeeting.id, titulo: newTaskTitle.trim() });
    setNewTaskTitle('');
    loadCycle();
  };

  // Navegacao de mes
  const navMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m); setYear(y);
  };

  // Se nao tem ciclo
  if (!loading && (!data || !data.cycle)) {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 20px' }}>Governanca</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => navMonth(-1)} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 20, fontWeight: 700 }}>{'\u2039'}</button>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{MESES[month]} {year}</span>
          <button onClick={() => navMonth(1)} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 20, fontWeight: 700 }}>{'\u203A'}</button>
        </div>
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 15, color: C.t2, marginBottom: 20 }}>Nenhum ciclo de governanca para {MESES[month]} {year}</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={criarCiclo} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', background: C.primary, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Criar ciclo de {MESES[month]}</button>
            <button onClick={gerarAno} style={{ padding: '10px 28px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.t2, fontSize: 13, cursor: 'pointer' }}>Gerar ano {year} inteiro</button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Carregando...</div>;

  const meetings = data?.meetings || [];
  const totalTasks = meetings.reduce((s, m) => s + (m.tasks || []).length, 0);
  const tasksDone = meetings.reduce((s, m) => s + (m.tasks || []).filter(t => t.status === 'concluida').length, 0);
  const meetingsDone = meetings.filter(m => m.status === 'realizada').length;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Governanca</h1>

      {/* Nav mes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navMonth(-1)} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 22, fontWeight: 700 }}>{'\u2039'}</button>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{MESES[month]} {year}</span>
        <button onClick={() => navMonth(1)} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontSize: 22, fontWeight: 700 }}>{'\u203A'}</button>
        <span style={{ fontSize: 12, color: C.t3, marginLeft: 8 }}>{meetingsDone}/{meetings.length} realizadas | {tasksDone}/{totalTasks} demandas concluidas</span>
      </div>

      {/* Pipeline visual — 4 reunioes interligadas */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${meetings.length}, 1fr)`, gap: 0, marginBottom: 24, position: 'relative' }}>
        {meetings.map((mtg, i) => {
          const isActive = selectedMeeting?.id === mtg.id;
          const st = STATUS_BADGE[mtg.status] || STATUS_BADGE.agendada;
          const taskCount = (mtg.tasks || []).length;
          const doneCount = (mtg.tasks || []).filter(t => t.status === 'concluida').length;
          const hoje = new Date().toISOString().split('T')[0];
          const isPast = mtg.date && mtg.date < hoje && mtg.status !== 'realizada';
          return (
            <div key={mtg.id} onClick={() => selectMeeting(mtg)} style={{ position: 'relative', cursor: 'pointer' }}>
              {/* Linha conectora */}
              {i < meetings.length - 1 && (
                <div style={{ position: 'absolute', top: 32, right: 0, width: '50%', height: 3, background: meetings[i + 1].status === 'realizada' || mtg.status === 'realizada' ? C.green : C.border, zIndex: 0 }} />
              )}
              {i > 0 && (
                <div style={{ position: 'absolute', top: 32, left: 0, width: '50%', height: 3, background: mtg.status === 'realizada' || meetings[i - 1].status === 'realizada' ? C.green : C.border, zIndex: 0 }} />
              )}
              <div style={{
                margin: '0 6px', padding: '14px 16px', borderRadius: 14, position: 'relative', zIndex: 1, textAlign: 'center',
                background: isActive ? (mtg.type_cor || C.primary) + '18' : C.card,
                border: `2px solid ${isActive ? (mtg.type_cor || C.primary) : C.border}`,
                transition: 'all 0.15s',
              }}
                onMouseEnter={ev => { if (!isActive) ev.currentTarget.style.borderColor = mtg.type_cor || C.primary; }}
                onMouseLeave={ev => { if (!isActive) ev.currentTarget.style.borderColor = C.border; }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: mtg.type_cor || C.primary, letterSpacing: 1, marginBottom: 4 }}>{mtg.type_sigla}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>{mtg.type_nome}</div>
                <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>{fmtDate(mtg.date)}</div>
                <div style={{ fontSize: 10, padding: '2px 10px', borderRadius: 99, display: 'inline-block', background: isPast ? C.red + '15' : st.bg, color: isPast ? C.red : st.color, fontWeight: 600 }}>
                  {isPast ? 'Atrasada' : st.label}
                </div>
                {taskCount > 0 && (
                  <div style={{ marginTop: 6, fontSize: 10, color: C.t3 }}>
                    <span style={{ color: doneCount === taskCount ? C.green : C.t2, fontWeight: 600 }}>{doneCount}/{taskCount}</span> demandas
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ DETALHE DA REUNIAO SELECIONADA ═══ */}
      {selectedMeeting && (() => {
        const mtg = meetings.find(m => m.id === selectedMeeting.id) || selectedMeeting;
        const st = STATUS_BADGE[mtg.status] || STATUS_BADGE.agendada;
        const tasks = mtg.tasks || [];
        return (
          <div style={{ background: C.card, borderRadius: 14, border: `2px solid ${mtg.type_cor || C.border}`, overflow: 'hidden', marginBottom: 24 }}>
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, background: (mtg.type_cor || C.primary) + '08' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: mtg.type_cor || C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800 }}>{mtg.type_sigla}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{mtg.type_nome}</div>
                <div style={{ fontSize: 11, color: C.t3 }}>{fmtDate(mtg.date)} | Semana {mtg.type_semana}</div>
              </div>
              <span style={{ fontSize: 10, padding: '3px 12px', borderRadius: 99, background: st.bg, color: st.color, fontWeight: 700 }}>{st.label}</span>
              <button onClick={() => { setSelectedMeeting(null); setDados(null); }} style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', fontSize: 18 }}>{'\u2715'}</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {/* Coluna esquerda: formulario */}
              <div style={{ padding: 20, borderRight: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Detalhes da reuniao</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px', marginBottom: 12 }}>
                  <div>
                    <label style={LABEL}>Data</label>
                    <input type="date" value={meetingForm.date || ''} onChange={ev => setMeetingForm(f => ({ ...f, date: ev.target.value }))} style={INPUT} />
                  </div>
                  <div>
                    <label style={LABEL}>Status</label>
                    <select value={meetingForm.status || 'agendada'} onChange={ev => setMeetingForm(f => ({ ...f, status: ev.target.value }))} style={INPUT}>
                      {Object.entries(STATUS_BADGE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={LABEL}>Local</label>
                    <input value={meetingForm.local || ''} onChange={ev => setMeetingForm(f => ({ ...f, local: ev.target.value }))} placeholder="Sala de reunioes, online..." style={INPUT} />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={LABEL}>Pauta</label>
                  <textarea value={meetingForm.pauta || ''} onChange={ev => setMeetingForm(f => ({ ...f, pauta: ev.target.value }))} rows={3} placeholder="Topicos a serem discutidos..." style={{ ...INPUT, resize: 'vertical' }} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={LABEL}>Ata / Registro</label>
                  <textarea value={meetingForm.ata || ''} onChange={ev => setMeetingForm(f => ({ ...f, ata: ev.target.value }))} rows={3} placeholder="Registro da reuniao..." style={{ ...INPUT, resize: 'vertical' }} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={LABEL}>Deliberacoes</label>
                  <textarea value={meetingForm.deliberacoes || ''} onChange={ev => setMeetingForm(f => ({ ...f, deliberacoes: ev.target.value }))} rows={2} placeholder="Decisoes tomadas..." style={{ ...INPUT, resize: 'vertical' }} />
                </div>
                <button onClick={salvarReuniao} disabled={saving} style={{ padding: '9px 28px', borderRadius: 8, border: 'none', background: C.primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>

              {/* Coluna direita: demandas + dados automaticos */}
              <div style={{ padding: 20 }}>
                {/* Demandas */}
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Demandas ({tasks.length})</div>
                <div style={{ marginBottom: 12 }}>
                  {tasks.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                      <input type="checkbox" checked={t.status === 'concluida'} onChange={() => toggleTask(t)} style={{ cursor: 'pointer', accentColor: C.primary }} />
                      <span style={{ fontSize: 12, color: t.status === 'concluida' ? C.t3 : C.text, textDecoration: t.status === 'concluida' ? 'line-through' : 'none', flex: 1 }}>{t.titulo}</span>
                      {t.responsavel && <span style={{ fontSize: 10, color: C.t3 }}>{t.responsavel}</span>}
                      {t.prazo && <span style={{ fontSize: 10, color: C.t3 }}>{fmtDate(t.prazo)}</span>}
                      <button onClick={async () => { await governanca.deleteTask(t.id); loadCycle(); }} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 12, opacity: 0.5 }}>{'\u2715'}</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                  <input value={newTaskTitle} onChange={ev => setNewTaskTitle(ev.target.value)} onKeyDown={ev => ev.key === 'Enter' && addTask()} placeholder="Nova demanda..." style={{ ...INPUT, flex: 1 }} />
                  <button onClick={addTask} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: C.primary, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>+</button>
                </div>

                {/* Dados automaticos */}
                {dados?.dados?.resumo && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Dados automaticos ({dados.sigla})</div>
                    <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
                      {dados.sigla === 'OKR' && dados.dados.resumo && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: C.blue }}>{dados.dados.resumo.projetos_ativos}</div>
                            <div style={{ fontSize: 10, color: C.t3 }}>Projetos ativos</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: dados.dados.resumo.projetos_atrasados > 0 ? C.red : C.green }}>{dados.dados.resumo.projetos_atrasados}</div>
                            <div style={{ fontSize: 10, color: C.t3 }}>Atrasados</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: C.purple }}>{dados.dados.resumo.marcos_ativos}</div>
                            <div style={{ fontSize: 10, color: C.t3 }}>Marcos expansao</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: dados.dados.resumo.marcos_atrasados > 0 ? C.red : C.green }}>{dados.dados.resumo.marcos_atrasados}</div>
                            <div style={{ fontSize: 10, color: C.t3 }}>Atrasados</div>
                          </div>
                        </div>
                      )}
                      {dados.sigla === 'DRE' && dados.dados.resumo && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>R$ {Number(dados.dados.resumo.receitas || 0).toLocaleString('pt-BR')}</div>
                            <div style={{ fontSize: 10, color: C.t3 }}>Receitas</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.red }}>R$ {Number(dados.dados.resumo.despesas || 0).toLocaleString('pt-BR')}</div>
                            <div style={{ fontSize: 10, color: C.t3 }}>Despesas</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: dados.dados.resumo.resultado >= 0 ? C.green : C.red }}>R$ {Number(dados.dados.resumo.resultado || 0).toLocaleString('pt-BR')}</div>
                            <div style={{ fontSize: 10, color: C.t3 }}>Resultado</div>
                          </div>
                        </div>
                      )}
                      {dados.sigla === 'KPI' && dados.dados.resumo && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: C.primary }}>{dados.dados.resumo.total_cultos}</div>
                            <div style={{ fontSize: 10, color: C.t3 }}>Cultos no mes</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: C.blue }}>{dados.dados.resumo.presenca_media}</div>
                            <div style={{ fontSize: 10, color: C.t3 }}>Presenca media</div>
                          </div>
                        </div>
                      )}
                      {dados.sigla === 'CC' && dados.dados.resumo && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: dados.dados.resumo.pendencias_abertas > 0 ? C.amber : C.green }}>{dados.dados.resumo.pendencias_abertas}</div>
                          <div style={{ fontSize: 10, color: C.t3 }}>Pendencias abertas do mes</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
