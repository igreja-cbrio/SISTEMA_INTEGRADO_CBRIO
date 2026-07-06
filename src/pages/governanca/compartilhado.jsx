// ============================================================================
// Governança — peças compartilhadas entre a home (agenda) e as páginas de
// ritual (/governanca/:sigla): tokens de estilo, helpers de data, o modal de
// detalhe da reunião (pauta · documentos · ata · pendências) e o bloco de
// markdown editável usado pela pauta/memória geradas por IA.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import {
  X, Plus, Trash2, FileText, Upload, Download,
  CheckCircle2, Circle, ClipboardList, Sparkles, Loader2, Brain, Pencil,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { governanca as gov } from '../../api';
import { formatErro } from '../../lib/formatErro';
import useConfirmarSaida from '../../hooks/useConfirmarSaida';

export const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  inputBg: 'var(--cbrio-input-bg)', modalBg: 'var(--cbrio-modal-bg)', overlay: 'var(--cbrio-overlay)',
  primary: '#00B39D', primaryBg: '#00B39D18',
};

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export const STATUS_MEETING = {
  agendada: { label: 'Agendada', cor: '#3B82F6' },
  em_preparo: { label: 'Em preparo', cor: '#F59E0B' },
  realizada: { label: 'Realizada', cor: '#10B981' },
  cancelada: { label: 'Cancelada', cor: '#9CA3AF' },
  adiada: { label: 'Adiada', cor: '#EF4444' },
};
export const STATUS_TASK = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' };
export const TIPO_DOC = {
  entrada: { label: 'Documento (pré-reunião)', cor: '#3B82F6' },
  transcricao: { label: 'Transcrição (Plaud)', cor: '#0EA5E9' },
  ata: { label: 'Ata', cor: '#10B981' },
  apoio: { label: 'Apoio', cor: '#8B5CF6' },
  pauta_ia: { label: 'Pauta (IA)', cor: '#00B39D' },
};
// Tipos que o usuário pode SUBIR (pauta_ia é gerada pela IA, não enviada).
export const UPLOAD_TIPOS = ['transcricao', 'entrada', 'apoio', 'ata'];
export const SIGLAS_RELATORIO = new Set(['OKR', 'DRE', 'KPI', 'CC', 'DE', 'AG']);

export function pad(n) { return String(n).padStart(2, '0'); }
export function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function fmtData(s) { if (!s) return 'Sem data'; const [y, m, dd] = s.split('-').map(Number); return `${pad(dd)}/${pad(m)}/${y}`; }
export function diaSemana(s) { if (!s) return ''; const d = new Date(`${s}T00:00:00`); return DIAS_SEMANA[d.getDay()]; }

export const inputStyle = { background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 10px', width: '100%', fontSize: 14 };

export function Campo({ label, hint, children }) {
  return (
    <div>
      <label className="text-xs font-medium" style={{ color: C.t2 }}>{label}{hint ? <span style={{ color: C.t3 }}> · {hint}</span> : null}</label>
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
export function DetalheReuniao({ id, canEdit, onClose, onChange }) {
  const [m, setM] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [snap, setSnap] = useState('');
  const [saving, setSaving] = useState(false);
  const [prep, setPrep] = useState(null);
  const [prepLoading, setPrepLoading] = useState(false);
  const [novaTarefa, setNovaTarefa] = useState({ titulo: '', responsavel: '', prazo: '' });
  const [uploadTipo, setUploadTipo] = useState('transcricao');
  const [uploading, setUploading] = useState(false);
  const [gerandoPauta, setGerandoPauta] = useState(false);

  async function gerarPautaIA() {
    if (gerandoPauta) return;
    if (!window.confirm('Gerar a pauta desta reunião com IA (resumo + pendências + indicadores)? Pode levar até 1 minuto.')) return;
    setGerandoPauta(true);
    try { await gov.meetings.gerarPauta(id); toast.success('Pauta gerada pela IA'); await carregar(); }
    catch (e) { toast.error(formatErro(e)); }
    finally { setGerandoPauta(false); }
  }
  async function salvarDocMd(docId, md) {
    const r = await gov.docs.update(docId, md);
    await carregar();
    return r;
  }

  const carregar = useCallback(async () => {
    try {
      const data = await gov.meetings.get(id);
      setM(data);
      const f = {
        date: data.date || '', status: data.status || 'agendada',
        pauta: data.pauta || '', ata: data.ata || '', deliberacoes: data.deliberacoes || '',
        participantes: (data.participantes || []).join(', '),
        quorum_presente: data.quorum_presente ?? '', local: data.local || '',
      };
      setForm(f); setSnap(JSON.stringify(f));
    } catch (e) { toast.error(formatErro(e)); onClose(); }
    finally { setLoading(false); }
  }, [id, onClose]);

  useEffect(() => { carregar(); }, [carregar]);

  const dirty = !!form && JSON.stringify(form) !== snap;
  const { tentarFechar, backdropProps } = useConfirmarSaida(dirty, onClose);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function salvar() {
    if (!form || saving) return;
    setSaving(true);
    try {
      const payload = {
        date: form.date || null, status: form.status,
        pauta: form.pauta || null, ata: form.ata || null, deliberacoes: form.deliberacoes || null,
        participantes: form.participantes ? form.participantes.split(',').map(s => s.trim()).filter(Boolean) : null,
        quorum_presente: form.quorum_presente === '' ? null : Number(form.quorum_presente),
        local: form.local || null,
      };
      await gov.meetings.update(id, payload);
      const novoSnap = JSON.stringify(form); setSnap(novoSnap);
      toast.success('Reunião salva');
      onChange?.();
    } catch (e) { toast.error(formatErro(e)); }
    finally { setSaving(false); }
  }

  async function excluir() {
    if (!window.confirm('Excluir esta reunião? (pode ser restaurada por um super-admin)')) return;
    try { await gov.meetings.remove(id); toast.success('Reunião excluída'); onChange?.(); onClose(); }
    catch (e) { toast.error(formatErro(e)); }
  }

  async function preparar(sigla) {
    setPrepLoading(true);
    try { setPrep(await gov.relatorio(sigla)); }
    catch (e) { toast.error(formatErro(e)); }
    finally { setPrepLoading(false); }
  }

  async function addTarefa() {
    if (!novaTarefa.titulo.trim()) return;
    try {
      await gov.tasks.create(id, { titulo: novaTarefa.titulo.trim(), responsavel: novaTarefa.responsavel || null, prazo: novaTarefa.prazo || null });
      setNovaTarefa({ titulo: '', responsavel: '', prazo: '' });
      await carregar();
    } catch (e) { toast.error(formatErro(e)); }
  }
  async function toggleTarefa(t) {
    const novo = t.status === 'concluida' ? 'pendente' : 'concluida';
    try { await gov.tasks.update(t.id, { status: novo }); await carregar(); }
    catch (e) { toast.error(formatErro(e)); }
  }
  async function removerTarefa(t) {
    try { await gov.tasks.remove(t.id); await carregar(); } catch (e) { toast.error(formatErro(e)); }
  }
  async function aplicarTemplates() {
    try { const r = await gov.meetings.aplicarTemplates(id); toast.success(`${r?.criadas || 0} tarefa(s) adicionada(s)`); await carregar(); }
    catch (e) { toast.error(formatErro(e)); }
  }

  async function enviarDoc(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setUploading(true);
    try { await gov.docs.upload(id, file, uploadTipo); toast.success('Documento enviado'); await carregar(); }
    catch (err) { toast.error(formatErro(err)); }
    finally { setUploading(false); }
  }
  async function baixarDoc(d) {
    try { const { url } = await gov.docs.download(d.id); if (url) window.open(url, '_blank', 'noopener'); }
    catch (e) { toast.error(formatErro(e)); }
  }
  async function removerDoc(d) {
    if (!window.confirm(`Remover "${d.nome_arquivo}"?`)) return;
    try { await gov.docs.remove(d.id); await carregar(); } catch (e) { toast.error(formatErro(e)); }
  }

  const tipo = m?.governance_meeting_types || {};
  const sigla = tipo.sigla;
  const ro = !canEdit;

  return (
    <div {...backdropProps} style={{ position: 'fixed', inset: 0, background: C.overlay, zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: 16 }}>
      <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 14, width: '100%', maxWidth: 720, margin: '24px 0' }}>
        {/* topo */}
        <div className="flex items-start justify-between gap-3 p-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2">
            <span style={{ width: 10, height: 10, borderRadius: 99, background: tipo.cor || C.primary, display: 'inline-block' }} />
            <div>
              <div className="font-semibold text-lg" style={{ color: C.text }}>{tipo.nome || 'Reunião'}{sigla ? <span style={{ color: C.t3 }}> · {sigla}</span> : null}</div>
              {m?.governance_cycles && <div className="text-xs" style={{ color: C.t3 }}>Ciclo {MESES[(m.governance_cycles.month || 1) - 1]} {m.governance_cycles.year}</div>}
            </div>
          </div>
          <button onClick={tentarFechar} style={{ color: C.t2 }}><X size={20} /></button>
        </div>

        {loading || !form ? (
          <div className="flex items-center gap-2 p-8 justify-center" style={{ color: C.t3 }}><Loader2 className="animate-spin" size={18} /> Carregando…</div>
        ) : (
          <div className="p-4 space-y-5">
            {/* data + status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium" style={{ color: C.t2 }}>Data</label>
                <input type="date" disabled={ro} value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: C.t2 }}>Status</label>
                <select disabled={ro} value={form.status} onChange={e => set('status', e.target.value)} style={inputStyle}>
                  {Object.entries(STATUS_MEETING).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>

            {/* preparar reunião */}
            {SIGLAS_RELATORIO.has(sigla) && (
              <div className="rounded-lg p-3" style={{ background: C.primaryBg, border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium flex items-center gap-1.5" style={{ color: C.text }}><Sparkles size={15} style={{ color: C.primary }} /> Preparo automático</div>
                  <button onClick={() => preparar(sigla)} disabled={prepLoading} className="text-xs px-2.5 py-1.5 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.t2 }}>
                    {prepLoading ? 'Gerando…' : 'Gerar checklist'}
                  </button>
                </div>
                {prep?.checklist && (
                  <ul className="mt-2 space-y-1">
                    {prep.checklist.map((c, i) => (
                      <li key={i} className="text-sm flex items-start gap-2" style={{ color: C.t2 }}>
                        {c.ok ? <CheckCircle2 size={15} style={{ color: '#10B981', flexShrink: 0, marginTop: 2 }} /> : <Circle size={15} style={{ color: '#EF4444', flexShrink: 0, marginTop: 2 }} />}
                        <span><b style={{ color: C.text }}>{c.item}:</b> {c.valor}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <Campo label="Pauta" hint="O que será tratado · enviada à diretoria antes da reunião">
              <textarea disabled={ro} rows={3} value={form.pauta} onChange={e => set('pauta', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Tópicos da pauta…" />
            </Campo>

            {/* documentos */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.text }}><FileText size={15} /> Documentos</div>
                {canEdit && (
                  <div className="flex items-center gap-1.5">
                    <button onClick={gerarPautaIA} disabled={gerandoPauta} title="Gera a pauta desta reunião com IA"
                      className="text-xs px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 text-white" style={{ background: C.primary, opacity: gerandoPauta ? 0.6 : 1 }}>
                      {gerandoPauta ? <Loader2 className="animate-spin" size={14} /> : <Brain size={14} />} {gerandoPauta ? 'Gerando…' : 'Gerar pauta (IA)'}
                    </button>
                    <select value={uploadTipo} onChange={e => setUploadTipo(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 12 }}>
                      {UPLOAD_TIPOS.map(k => <option key={k} value={k}>{TIPO_DOC[k].label}</option>)}
                    </select>
                    <label className="text-xs px-2.5 py-1.5 rounded-lg cursor-pointer inline-flex items-center gap-1.5" style={{ border: `1px solid ${C.border}`, color: C.t2, opacity: uploading ? 0.6 : 1 }}>
                      {uploading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />} Enviar
                      <input type="file" hidden disabled={uploading} onChange={enviarDoc} />
                    </label>
                  </div>
                )}
              </div>
              {(m?.docs || []).length === 0 ? (
                <p className="text-sm" style={{ color: C.t3 }}>Nenhum documento anexado.</p>
              ) : (
                <div className="space-y-2">
                  {m.docs.filter(d => d.tipo !== 'pauta_ia').map(d => {
                    const td = TIPO_DOC[d.tipo] || TIPO_DOC.entrada;
                    return (
                      <div key={d.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ border: `1px solid ${C.border}` }}>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${td.cor}22`, color: td.cor }}>{td.label}</span>
                        <span className="flex-1 text-sm truncate" style={{ color: C.text }}>{d.nome_arquivo}</span>
                        <button onClick={() => baixarDoc(d)} title="Baixar" style={{ color: C.t2 }}><Download size={16} /></button>
                        {canEdit && <button onClick={() => removerDoc(d)} title="Remover" style={{ color: '#EF4444' }}><Trash2 size={15} /></button>}
                      </div>
                    );
                  })}
                  {m.docs.filter(d => d.tipo === 'pauta_ia').map(d => (
                    <BlocoMarkdownEditavel key={d.id} titulo="Pauta gerada pela IA" conteudo={d.conteudo_md ?? ''} canEdit={canEdit}
                      onSalvar={(md) => salvarDocMd(d.id, md)} onRemover={canEdit ? () => removerDoc(d) : null} />
                  ))}
                </div>
              )}
            </div>

            <Campo label="Ata" hint="Registro do que foi decidido na reunião">
              <textarea disabled={ro} rows={4} value={form.ata} onChange={e => set('ata', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Ata da reunião…" />
            </Campo>
            <Campo label="Deliberações">
              <textarea disabled={ro} rows={2} value={form.deliberacoes} onChange={e => set('deliberacoes', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Decisões formais…" />
            </Campo>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium" style={{ color: C.t2 }}>Participantes <span style={{ color: C.t3 }}>(separados por vírgula)</span></label>
                <input disabled={ro} value={form.participantes} onChange={e => set('participantes', e.target.value)} style={inputStyle} placeholder="Eduardo, Arthur, …" />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: C.t2 }}>Quórum</label>
                <input type="number" disabled={ro} value={form.quorum_presente} onChange={e => set('quorum_presente', e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: C.t2 }}>Local</label>
              <input disabled={ro} value={form.local} onChange={e => set('local', e.target.value)} style={inputStyle} placeholder="Sala / link…" />
            </div>

            {/* tarefas */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.text }}><ClipboardList size={15} /> Pendências</div>
                {canEdit && <button onClick={aplicarTemplates} className="text-xs px-2.5 py-1.5 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.t2 }}>Aplicar templates</button>}
              </div>
              <div className="space-y-1.5">
                {(m?.tasks || []).map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ border: `1px solid ${C.border}` }}>
                    <button disabled={ro} onClick={() => toggleTarefa(t)} style={{ color: t.status === 'concluida' ? '#10B981' : C.t3 }}>
                      {t.status === 'concluida' ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate" style={{ color: C.text, textDecoration: t.status === 'concluida' ? 'line-through' : 'none' }}>{t.titulo}</div>
                      <div className="text-xs" style={{ color: C.t3 }}>{[t.responsavel, t.prazo ? `prazo ${fmtData(t.prazo)}` : '', STATUS_TASK[t.status]].filter(Boolean).join(' · ')}</div>
                    </div>
                    {canEdit && <button onClick={() => removerTarefa(t)} style={{ color: '#EF4444' }}><Trash2 size={14} /></button>}
                  </div>
                ))}
                {(m?.tasks || []).length === 0 && <p className="text-sm" style={{ color: C.t3 }}>Sem pendências.</p>}
              </div>
              {canEdit && (
                <div className="flex flex-wrap items-end gap-2 mt-2">
                  <input value={novaTarefa.titulo} onChange={e => setNovaTarefa(t => ({ ...t, titulo: e.target.value }))} placeholder="Nova pendência…" style={{ ...inputStyle, flex: '2 1 180px', width: 'auto' }} onKeyDown={e => { if (e.key === 'Enter') addTarefa(); }} />
                  <input value={novaTarefa.responsavel} onChange={e => setNovaTarefa(t => ({ ...t, responsavel: e.target.value }))} placeholder="Responsável" style={{ ...inputStyle, flex: '1 1 120px', width: 'auto' }} />
                  <input type="date" value={novaTarefa.prazo} onChange={e => setNovaTarefa(t => ({ ...t, prazo: e.target.value }))} style={{ ...inputStyle, width: 'auto' }} />
                  <button onClick={addTarefa} className="text-sm px-3 py-2 rounded-lg text-white" style={{ background: C.primary }}><Plus size={15} /></button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* rodapé */}
        {!loading && form && (
          <div className="flex items-center justify-between gap-2 p-4" style={{ borderTop: `1px solid ${C.border}` }}>
            {canEdit ? <button onClick={excluir} className="text-sm px-3 py-2 rounded-lg" style={{ color: '#EF4444', border: `1px solid ${C.border}` }}><Trash2 size={14} className="inline mr-1" /> Excluir</button> : <span />}
            <div className="flex items-center gap-2">
              <button onClick={tentarFechar} className="text-sm px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.t2 }}>Fechar</button>
              {canEdit && <button onClick={salvar} disabled={saving || !dirty} className="text-sm px-4 py-2 rounded-lg text-white" style={{ background: C.primary, opacity: (saving || !dirty) ? 0.5 : 1 }}>{saving ? 'Salvando…' : 'Salvar'}</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
export function NovaReuniaoModal({ types, dataPadrao, onClose, onSaved }) {
  const [typeId, setTypeId] = useState(types?.[0]?.id || '');
  const [date, setDate] = useState(dataPadrao || '');
  const [saving, setSaving] = useState(false);
  const dirty = !!typeId;
  const { tentarFechar, backdropProps } = useConfirmarSaida(dirty, onClose);

  async function salvar() {
    if (!typeId) { toast.error('Escolha o tipo de reunião'); return; }
    setSaving(true);
    try { await gov.meetings.create({ type_id: typeId, date: date || null }); toast.success('Reunião criada'); onSaved(); }
    catch (e) { toast.error(formatErro(e)); }
    finally { setSaving(false); }
  }

  return (
    <div {...backdropProps} style={{ position: 'fixed', inset: 0, background: C.overlay, zIndex: 1010, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: 16 }}>
      <div style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 14, width: '100%', maxWidth: 440, margin: '60px 0' }}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="font-semibold" style={{ color: C.text }}>Nova reunião</div>
          <button onClick={tentarFechar} style={{ color: C.t2 }}><X size={20} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium" style={{ color: C.t2 }}>Tipo</label>
            <select value={typeId} onChange={e => setTypeId(e.target.value)} style={inputStyle}>
              <option value="">Selecione…</option>
              {(types || []).filter(t => t.ativo !== false).map(t => <option key={t.id} value={t.id}>{t.nome} ({t.sigla})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: C.t2 }}>Data</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
          <p className="text-xs" style={{ color: C.t3 }}>A reunião entra no ciclo do mês da data escolhida.</p>
        </div>
        <div className="flex items-center justify-end gap-2 p-4" style={{ borderTop: `1px solid ${C.border}` }}>
          <button onClick={tentarFechar} className="text-sm px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.t2 }}>Cancelar</button>
          <button onClick={salvar} disabled={saving} className="text-sm px-4 py-2 rounded-lg text-white" style={{ background: C.primary, opacity: saving ? 0.6 : 1 }}>{saving ? 'Criando…' : 'Criar'}</button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
export function BlocoMarkdownEditavel({ titulo, conteudo, canEdit, onSalvar, onRemover, vazioMsg }) {
  const [editando, setEditando] = useState(false);
  const [txt, setTxt] = useState(conteudo || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setTxt(conteudo || ''); }, [conteudo]);
  const temConteudo = conteudo != null && conteudo !== '';
  async function salvar() {
    setSaving(true);
    try { await onSalvar(txt); setEditando(false); toast.success('Salvo'); }
    catch (e) { toast.error(formatErro(e)); }
    finally { setSaving(false); }
  }
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <div className="flex items-center justify-between gap-2 p-2" style={{ background: C.primaryBg }}>
        <span className="text-sm font-medium flex items-center gap-1.5" style={{ color: C.text }}><Brain size={14} style={{ color: C.primary }} /> {titulo}</span>
        <div className="flex items-center gap-1.5">
          {canEdit && temConteudo && !editando && <button onClick={() => setEditando(true)} className="text-xs px-2 py-1 rounded" style={{ border: `1px solid ${C.border}`, color: C.t2 }}><Pencil size={12} className="inline mr-1" />Editar</button>}
          {canEdit && editando && <button onClick={salvar} disabled={saving} className="text-xs px-2 py-1 rounded text-white" style={{ background: C.primary }}>{saving ? 'Salvando…' : 'Salvar'}</button>}
          {canEdit && editando && <button onClick={() => { setEditando(false); setTxt(conteudo || ''); }} className="text-xs px-2 py-1 rounded" style={{ border: `1px solid ${C.border}`, color: C.t2 }}>Cancelar</button>}
          {onRemover && !editando && <button onClick={onRemover} title="Remover" style={{ color: '#EF4444' }}><Trash2 size={14} /></button>}
        </div>
      </div>
      <div className="p-3">
        {!temConteudo ? <p className="text-sm" style={{ color: C.t3 }}>{vazioMsg || 'Sem conteúdo.'}</p>
          : editando ? <textarea value={txt} onChange={e => setTxt(e.target.value)} rows={16} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 13 }} />
            : <div className="text-sm leading-relaxed governanca-md" style={{ color: C.text }}><ReactMarkdown>{conteudo}</ReactMarkdown></div>}
      </div>
    </div>
  );
}
