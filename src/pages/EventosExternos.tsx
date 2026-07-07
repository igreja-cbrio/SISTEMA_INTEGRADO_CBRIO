// Eventos Externos · calendário + eventos com formulário público de confirmação
// de presença e sorteio (número da sorte aleatório por inscrito).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { eventosExternos as api } from '../api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  CalendarDays, Plus, Loader2, ChevronLeft, ChevronRight, Users,
  Trash2, Image as ImageIcon,
} from 'lucide-react';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function EventosExternos() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [eventos, setEventos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesRef, setMesRef] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [novoOpen, setNovoOpen] = useState(false);

  // Link legado de notificação (?evento=id) → tela dedicada do evento.
  useEffect(() => {
    const evId = searchParams.get('evento');
    if (evId) navigate(`/eventos-externos/${evId}`, { replace: true });
  }, [searchParams, navigate]);

  function carregar() {
    setLoading(true);
    api.list().then((d: any) => setEventos(Array.isArray(d) ? d : [])).catch(() => toast.error('Erro ao carregar eventos')).finally(() => setLoading(false));
  }
  useEffect(() => { carregar(); }, []);

  const porDia = useMemo(() => {
    const m: Record<string, any[]> = {};
    eventos.forEach(e => { if (e.data) (m[e.data] = m[e.data] || []).push(e); });
    return m;
  }, [eventos]);

  // Grade do mês
  const celulas = useMemo(() => {
    const ini = new Date(mesRef.getFullYear(), mesRef.getMonth(), 1);
    const fimDia = new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < ini.getDay(); i++) arr.push(null);
    for (let d = 1; d <= fimDia; d++) arr.push(new Date(mesRef.getFullYear(), mesRef.getMonth(), d));
    return arr;
  }, [mesRef]);

  const hojeStr = ymd(new Date());

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><CalendarDays className="h-6 w-6 text-primary" /> Eventos Externos</h1>
          <p className="text-sm text-muted-foreground">Confirmação de presença + sorteio · calendário dos eventos.</p>
        </div>
        <Button onClick={() => setNovoOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo evento</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Calendário */}
        <Card className="glass-solid p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() - 1, 1))} className="p-1.5 rounded hover:bg-foreground/5"><ChevronLeft className="h-4 w-4" /></button>
            <div className="font-semibold">{MESES[mesRef.getMonth()]} {mesRef.getFullYear()}</div>
            <button onClick={() => setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 1))} className="p-1.5 rounded hover:bg-foreground/5"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
            {DIAS.map((d, i) => <div key={i}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celulas.map((d, i) => {
              const key = d ? ymd(d) : `x${i}`;
              const evs = d ? (porDia[ymd(d)] || []) : [];
              return (
                <div key={key} className={`min-h-[64px] rounded-lg border p-1 text-left ${d ? 'border-border' : 'border-transparent'} ${d && ymd(d) === hojeStr ? 'ring-1 ring-primary/50' : ''}`}>
                  {d && <div className="text-xs text-muted-foreground">{d.getDate()}</div>}
                  <div className="space-y-0.5 mt-0.5">
                    {evs.map(e => (
                      <button key={e.id} onClick={() => navigate(`/eventos-externos/${e.id}`)} title={e.nome}
                        className="w-full truncate rounded bg-primary/15 text-primary text-[11px] px-1 py-0.5 text-left hover:bg-primary/25">
                        {e.nome}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Lista de eventos */}
        <Card className="glass-solid p-4">
          <div className="font-semibold text-sm mb-2">Todos os eventos</div>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum evento ainda.</p>
          ) : (
            <div className="space-y-2 max-h-[440px] overflow-y-auto">
              {eventos.map(e => (
                <button key={e.id} onClick={() => navigate(`/eventos-externos/${e.id}`)} className="w-full text-left rounded-lg border border-border p-2.5 hover:border-primary/40 transition-colors">
                  <div className="font-medium text-sm">{e.nome}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    {e.data && <span>{new Date(e.data + 'T00:00:00').toLocaleDateString('pt-BR')}</span>}
                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {e.inscritos}</span>
                    {!e.form_ativo && <span className="text-amber-600">inscrições fechadas</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {novoOpen && <EventoFormModal onClose={() => setNovoOpen(false)} onSaved={(id) => { setNovoOpen(false); navigate(`/eventos-externos/${id}`); }} />}
    </div>
  );
}

const slugCampo = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || `campo_${Date.now() % 1000}`;

function CamposEditor({ campos, setCampos }: { campos: any[]; setCampos: (v: any[]) => void }) {
  function add() { setCampos([...campos, { key: slugCampo(`campo ${campos.length + 1}`), label: '', tipo: 'texto', obrigatorio: true, opcoes: [] }]); }
  function upd(i: number, patch: any) { const c = [...campos]; c[i] = { ...c[i], ...patch }; if (patch.label) c[i].key = slugCampo(patch.label); setCampos(c); }
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">Campos do formulário <span className="font-normal">(além de Nome e WhatsApp, que são fixos)</span></div>
      {campos.map((c, i) => (
        <div key={i} className="rounded-lg border border-border p-2 space-y-2">
          <div className="flex gap-2">
            <Input placeholder="Pergunta (ex.: Em qual área você serve?)" value={c.label} onChange={e => upd(i, { label: e.target.value })} className="h-8 text-sm" />
            <select value={c.tipo} onChange={e => upd(i, { tipo: e.target.value })} className="h-8 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-1">
              <option value="texto">Texto</option>
              <option value="textarea">Parágrafo</option>
              <option value="email">E-mail</option>
              <option value="select">Lista suspensa</option>
              <option value="escolha">Escolha</option>
              <option value="multi">Múltipla escolha</option>
              <option value="imagem">Imagem / Logo (upload)</option>
            </select>
            <button onClick={() => setCampos(campos.filter((_, j) => j !== i))} className="text-red-500 px-1"><Trash2 className="h-4 w-4" /></button>
          </div>
          {(c.tipo === 'select' || c.tipo === 'escolha' || c.tipo === 'multi') && (
            <textarea placeholder="Opções (uma por linha)" value={(c.opcoes || []).join('\n')} onChange={e => upd(i, { opcoes: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
              className="w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] px-2 py-1.5 text-xs min-h-[110px]" />
          )}
          {c.tipo === 'imagem' && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><ImageIcon className="h-3 w-3" /> A pessoa envia uma imagem (ex.: a logo da empresa). Aceita PNG, JPG, WEBP ou GIF, até 5MB.</p>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={c.obrigatorio !== false} onChange={e => upd(i, { obrigatorio: e.target.checked })} /> Obrigatório
          </label>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar campo</Button>
    </div>
  );
}

// ISO (UTC) → valor do input datetime-local (horário local), e vazio se nulo.
function isoParaInputLocal(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// Exportado: a tela dedicada do evento (EventoExternoDetalhe) reusa o mesmo form de edição.
export function EventoFormModal({ evento, onClose, onSaved }: { evento?: any; onClose: () => void; onSaved: (id: string) => void }) {
  const ed = !!evento;
  const [f, setF] = useState({
    nome: evento?.nome || '', data: evento?.data || '', hora: evento?.hora || '', local: evento?.local || '',
    descricao: evento?.descricao || '', tem_sorteio: evento?.tem_sorteio !== false, form_ativo: evento?.form_ativo !== false,
    capa_url: evento?.capa_url || '',
    inscricoes_encerram_em: isoParaInputLocal(evento?.inscricoes_encerram_em),
    msg_sucesso_titulo: evento?.msg_sucesso_titulo || '', msg_sucesso_texto: evento?.msg_sucesso_texto || '',
    msg_whatsapp: evento?.msg_whatsapp || '',
  });
  const [campos, setCampos] = useState<any[]>(evento?.campos || []);
  const [premios, setPremios] = useState<string[]>(evento?.premios || []);
  const [salvando, setSalvando] = useState(false);
  const [enviandoCapa, setEnviandoCapa] = useState(false);
  async function enviarCapa(file?: File) {
    if (!file) return;
    setEnviandoCapa(true);
    try { const r: any = await api.uploadCapa(file); setF(s => ({ ...s, capa_url: r.url })); }
    catch (e: any) { toast.error(e?.message || 'Erro ao enviar a capa'); } finally { setEnviandoCapa(false); }
  }
  async function salvar() {
    if (f.nome.trim().length < 2) { toast.error('Informe o nome do evento'); return; }
    for (const c of campos) { if (!c.label?.trim()) { toast.error('Todo campo precisa de uma pergunta'); return; } if (['select', 'escolha', 'multi'].includes(c.tipo) && !(c.opcoes || []).length) { toast.error(`Adicione opções em "${c.label}"`); return; } }
    setSalvando(true);
    try {
      const payload = {
        ...f, campos, premios: premios.map(p => p.trim()).filter(Boolean),
        // datetime-local (horário local) → ISO; vazio → null (sem prazo)
        inscricoes_encerram_em: f.inscricoes_encerram_em ? new Date(f.inscricoes_encerram_em).toISOString() : null,
      };
      const ev: any = ed ? await api.atualizar(evento.id, payload) : await api.criar(payload);
      toast.success(ed ? 'Evento atualizado' : 'Evento criado');
      onSaved(ed ? evento.id : ev.id);
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); } finally { setSalvando(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader><DialogTitle>{ed ? 'Editar evento' : 'Novo evento'}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm flex-1 overflow-y-auto min-h-0 px-0.5">
          {/* Foto de capa */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Foto de capa (aparece no topo do formulário)</div>
            {f.capa_url ? (
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img src={f.capa_url} alt="capa" className="w-full h-32 object-cover" />
                <button type="button" onClick={() => setF({ ...f, capa_url: '' })} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-4 cursor-pointer hover:border-primary/40 text-muted-foreground">
                {enviandoCapa ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                {enviandoCapa ? 'Enviando…' : 'Enviar foto de capa'}
                <input type="file" accept="image/*" className="hidden" onChange={e => enviarCapa(e.target.files?.[0])} />
              </label>
            )}
          </div>
          <Input placeholder="Nome do evento (ex.: Celebra)" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={f.data || ''} onChange={e => setF({ ...f, data: e.target.value })} />
            <Input placeholder="Horário (ex.: 8h30)" value={f.hora} onChange={e => setF({ ...f, hora: e.target.value })} />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Encerrar inscrições em (opcional)</div>
            <Input type="datetime-local" value={f.inscricoes_encerram_em} onChange={e => setF({ ...f, inscricoes_encerram_em: e.target.value })} />
            <p className="text-[11px] text-muted-foreground mt-1">Depois desse horário o formulário bloqueia novas inscrições automaticamente.</p>
          </div>
          <Input placeholder="Local" value={f.local} onChange={e => setF({ ...f, local: e.target.value })} />
          <textarea placeholder="Descrição (opcional)" value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })}
            className="w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] px-3 py-2 text-sm min-h-[90px]" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.tem_sorteio} onChange={e => setF({ ...f, tem_sorteio: e.target.checked })} />
            Tem sorteio (mostra o número da sorte com confete ao confirmar)
          </label>
          {f.tem_sorteio && (
            <div className="space-y-2 rounded-lg border border-border p-2">
              <div className="text-xs font-medium text-muted-foreground">Prêmios do sorteio <span className="font-normal">(1 ganhador por prêmio)</span></div>
              {premios.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder={`${i + 1}º prêmio`} value={p} onChange={e => { const a = [...premios]; a[i] = e.target.value; setPremios(a); }} className="h-8 text-sm" />
                  <button onClick={() => setPremios(premios.filter((_, j) => j !== i))} className="text-red-500 px-1"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setPremios([...premios, ''])}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar prêmio</Button>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.form_ativo} onChange={e => setF({ ...f, form_ativo: e.target.checked })} />
            Inscrições abertas
          </label>

          {/* Mensagem de agradecimento (tela pós-inscrição) */}
          <div className="space-y-2 rounded-lg border border-border p-2">
            <div className="text-xs font-medium text-muted-foreground">Mensagem de agradecimento (após confirmar) <span className="font-normal">— opcional</span></div>
            <Input placeholder='Título (padrão: "Presença confirmada!")' value={f.msg_sucesso_titulo} onChange={e => setF({ ...f, msg_sucesso_titulo: e.target.value })} />
            <textarea placeholder="Texto abaixo do título (padrão: mensagem de agradecimento)" value={f.msg_sucesso_texto}
              onChange={e => setF({ ...f, msg_sucesso_texto: e.target.value })}
              className="w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] px-3 py-2 text-sm min-h-[70px]" />
          </div>

          {/* Mensagem pré-definida do compartilhar no WhatsApp */}
          <div className="space-y-1 rounded-lg border border-border p-2">
            <div className="text-xs font-medium text-muted-foreground">Mensagem do botão "Compartilhar no WhatsApp" <span className="font-normal">— opcional</span></div>
            <textarea placeholder="Ex.: Vem pro Celebra! Confirme sua presença: {link}" value={f.msg_whatsapp}
              onChange={e => setF({ ...f, msg_whatsapp: e.target.value })}
              className="w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] px-3 py-2 text-sm min-h-[60px]" />
            <p className="text-[11px] text-muted-foreground">Use <code>{'{link}'}</code> onde o link do formulário deve aparecer.</p>
          </div>

          <CamposEditor campos={campos} setCampos={setCampos} />
        </div>
        <Button onClick={salvar} disabled={salvando} className="w-full mt-2">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : (ed ? 'Salvar' : 'Criar evento')}</Button>
      </DialogContent>
    </Dialog>
  );
}
