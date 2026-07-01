// Eventos Externos · calendário + eventos com formulário público de confirmação
// de presença e sorteio (número da sorte aleatório por inscrito).
import { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { eventosExternos as api } from '../api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  CalendarDays, Plus, Loader2, ChevronLeft, ChevronRight, Users, Gift, Link2, MessageCircle,
  Trash2, MapPin, Clock, PartyPopper, Pencil, Image as ImageIcon,
} from 'lucide-react';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function EventosExternos() {
  const [eventos, setEventos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesRef, setMesRef] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [novoOpen, setNovoOpen] = useState(false);
  const [detId, setDetId] = useState<string | null>(null);

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
                      <button key={e.id} onClick={() => setDetId(e.id)} title={e.nome}
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
                <button key={e.id} onClick={() => setDetId(e.id)} className="w-full text-left rounded-lg border border-border p-2.5 hover:border-primary/40 transition-colors">
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

      {novoOpen && <EventoFormModal onClose={() => setNovoOpen(false)} onSaved={(id) => { setNovoOpen(false); carregar(); setDetId(id); }} />}
      {detId && <EventoDetalhe id={detId} onClose={() => setDetId(null)} onChanged={carregar} />}
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
            </select>
            <button onClick={() => setCampos(campos.filter((_, j) => j !== i))} className="text-red-500 px-1"><Trash2 className="h-4 w-4" /></button>
          </div>
          {(c.tipo === 'select' || c.tipo === 'escolha' || c.tipo === 'multi') && (
            <textarea placeholder="Opções (uma por linha)" value={(c.opcoes || []).join('\n')} onChange={e => upd(i, { opcoes: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
              className="w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] px-2 py-1.5 text-xs min-h-[110px]" />
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

function EventoFormModal({ evento, onClose, onSaved }: { evento?: any; onClose: () => void; onSaved: (id: string) => void }) {
  const ed = !!evento;
  const [f, setF] = useState({
    nome: evento?.nome || '', data: evento?.data || '', hora: evento?.hora || '', local: evento?.local || '',
    descricao: evento?.descricao || '', tem_sorteio: evento?.tem_sorteio !== false, form_ativo: evento?.form_ativo !== false,
    capa_url: evento?.capa_url || '',
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
      const payload = { ...f, campos, premios: premios.map(p => p.trim()).filter(Boolean) };
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
          <CamposEditor campos={campos} setCampos={setCampos} />
        </div>
        <Button onClick={salvar} disabled={salvando} className="w-full mt-2">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : (ed ? 'Salvar' : 'Criar evento')}</Button>
      </DialogContent>
    </Dialog>
  );
}

function EventoDetalhe({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [ev, setEv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sorteando, setSorteando] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [anim, setAnim] = useState<{ fase: 'rolando' | 'fim'; premio: string; ganhador?: any } | null>(null);
  const [rolNum, setRolNum] = useState(0);

  function carregar() { setLoading(true); api.get(id).then(setEv).catch(() => toast.error('Erro')).finally(() => setLoading(false)); }
  useEffect(() => { carregar(); }, [id]);

  const link = ev ? `${window.location.origin}/evento/${ev.slug}` : '';
  function copiar() { navigator.clipboard.writeText(link); toast.success('Link copiado'); }
  const wa = `https://wa.me/?text=${encodeURIComponent(`Confirme sua presença no ${ev?.nome || 'evento'}: ${link}`)}`;

  function confeteBig() {
    const cores = ['#00B39D', '#00d9bd', '#ffd166', '#ef476f', '#118ab2', '#ffffff'];
    const raja = (x: number) => confetti({ particleCount: 80, spread: 80, startVelocity: 55, origin: { x, y: 0.55 }, colors: cores });
    raja(0.5); setTimeout(() => raja(0.2), 200); setTimeout(() => raja(0.8), 400);
    setTimeout(() => confetti({ particleCount: 140, spread: 120, startVelocity: 45, origin: { y: 0.5 }, colors: cores }), 250);
  }

  const sorteioDoPremio = (nome: string) => (ev?.sorteios || []).find((s: any) => (s.premio || '') === nome);

  // Sorteio com animação cinematográfica: números "rolando" + revelação do ganhador.
  async function sortearPremio(nome: string) {
    if (anim) return;
    setSorteando(true);
    setAnim({ fase: 'rolando', premio: nome });
    const iv = setInterval(() => setRolNum(1000 + Math.floor(Math.random() * 9000)), 65);
    try {
      const s: any = await api.sortear(id, nome);
      await new Promise(r => setTimeout(r, 2400)); // suspense
      clearInterval(iv);
      setRolNum(s.numero_sorteado);
      setAnim({ fase: 'fim', premio: nome, ganhador: { numero: s.numero_sorteado, nome: s.ganhador_nome } });
      confeteBig();
      carregar();
    } catch (e: any) {
      clearInterval(iv); setAnim(null);
      toast.error(e?.message || 'Erro ao sortear');
    } finally { setSorteando(false); }
  }
  async function sortearTodos() {
    setSorteando(true);
    try {
      const pendentes = (ev?.premios || []).filter((p: string) => !sorteioDoPremio(p));
      for (const p of pendentes) { await api.sortear(id, p); }
      carregar();
      toast.success(`${pendentes.length} prêmio(s) sorteado(s)`);
    } catch (e: any) { toast.error(e?.message || 'Erro ao sortear'); } finally { setSorteando(false); }
  }
  async function excluir() {
    if (!window.confirm('Excluir este evento? (some da lista · reversível por super-admin)')) return;
    try { await api.remover(id); toast.success('Evento excluído'); onChanged(); onClose(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao excluir'); }
  }

  return (
    <>
    {anim && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
        style={{ background: 'radial-gradient(circle at 50% 40%, rgba(0,60,55,0.92), rgba(4,10,12,0.97))', backdropFilter: 'blur(6px)' }}>
        <div className="absolute inset-0 opacity-30" style={{ background: 'conic-gradient(from 0deg at 50% 45%, transparent, rgba(0,179,157,0.25), transparent 60%)', animation: anim.fase === 'rolando' ? 'spin 8s linear infinite' : undefined }} />
        <div className="relative text-center px-6">
          <div className="uppercase tracking-[0.35em] text-white/60 text-sm mb-4">{anim.premio || 'Sorteio'}</div>
          <div className="font-black tabular-nums leading-none"
            style={{
              fontSize: 'clamp(72px, 18vw, 180px)',
              background: 'linear-gradient(90deg,#00d9bd,#00B39D,#7CF5E4)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              filter: anim.fase === 'fim' ? 'drop-shadow(0 0 30px rgba(0,217,189,0.6))' : 'none',
              transform: anim.fase === 'fim' ? 'scale(1)' : 'scale(0.96)', transition: 'transform .3s ease',
            }}>
            {String(rolNum).padStart(4, '0')}
          </div>
          {anim.fase === 'rolando' ? (
            <div className="mt-6 text-white/80 text-lg tracking-wide animate-pulse">Sorteando…</div>
          ) : (
            <div className="mt-4">
              <div className="text-white text-3xl sm:text-4xl font-bold">{anim.ganhador?.nome}</div>
              <div className="text-teal-300 mt-1">🎉 Ganhador(a) do sorteio</div>
              <button onClick={() => setAnim(null)}
                className="mt-8 rounded-full bg-white/10 hover:bg-white/20 text-white px-8 py-2.5 text-sm font-semibold border border-white/20">
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    )}
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[88vh]">
        {loading || !ev ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {ev.nome}
                <Button size="sm" variant="outline" className="ml-auto mr-6" onClick={() => setEditOpen(true)}><Pencil className="h-3.5 w-3.5 mr-1" /> Editar</Button>
              </DialogTitle>
            </DialogHeader>
            {editOpen && <EventoFormModal evento={ev} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); carregar(); onChanged(); }} />}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                {ev.data && <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" />{new Date(ev.data + 'T00:00:00').toLocaleDateString('pt-BR')}</span>}
                {ev.hora && <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{ev.hora}</span>}
                {ev.local && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{ev.local}</span>}
                <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" />{ev.inscritos?.length || 0} confirmados</span>
              </div>

              {/* Link do formulário */}
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs font-medium mb-2">Formulário de confirmação {ev.form_ativo ? '' : '(inscrições fechadas)'}</div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={copiar}><Link2 className="h-3.5 w-3.5 mr-1" /> Copiar link</Button>
                  <a href={wa} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><MessageCircle className="h-3.5 w-3.5 mr-1 text-emerald-500" /> WhatsApp</Button></a>
                  <a href={link} target="_blank" rel="noreferrer" className="text-xs text-primary self-center truncate max-w-[220px]">{link}</a>
                </div>
              </div>

              {/* Sorteio */}
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs font-medium mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Gift className="h-4 w-4 text-primary" /> Sorteio</span>
                  {(ev.premios || []).length > 0 && (ev.premios || []).some((p: string) => !sorteioDoPremio(p)) && (
                    <Button size="sm" variant="outline" onClick={sortearTodos} disabled={sorteando || !(ev.inscritos?.length)}>
                      {sorteando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Sortear todos'}
                    </Button>
                  )}
                </div>

                {(ev.premios || []).length > 0 ? (
                  <div className="space-y-1.5">
                    {(ev.premios || []).map((p: string, i: number) => {
                      const s = sorteioDoPremio(p);
                      return (
                        <div key={i} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{p || `${i + 1}º prêmio`}</div>
                            {s && <div className="text-xs text-primary">🎉 Nº {s.numero_sorteado} · {s.ganhador_nome}</div>}
                          </div>
                          {s ? (
                            <Button size="sm" variant="ghost" onClick={() => sortearPremio(p)} disabled={sorteando} className="text-xs">Re-sortear</Button>
                          ) : (
                            <Button size="sm" onClick={() => sortearPremio(p)} disabled={sorteando || !(ev.inscritos?.length)}>
                              {sorteando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sortear'}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                    <p className="text-[11px] text-muted-foreground">Defina/edite os prêmios em "Editar".</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-1">
                    Nenhum prêmio definido. Clique em <b>"Editar"</b> e adicione os prêmios do sorteio pra sortear um ganhador por prêmio.
                  </p>
                )}
              </div>

              {/* Inscritos */}
              <div>
                <div className="text-xs font-medium mb-1">Inscritos ({ev.inscritos?.length || 0})</div>
                {(ev.inscritos || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Ninguém confirmou ainda.</p>
                ) : (
                  <div className="max-h-[220px] overflow-y-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-foreground/5 text-muted-foreground"><tr>
                        <th className="text-left p-1.5">Nº</th><th className="text-left p-1.5">Nome</th><th className="text-left p-1.5">Telefone</th>
                        {(ev.campos || []).map((c: any) => <th key={c.key} className="text-left p-1.5">{c.label}</th>)}
                      </tr></thead>
                      <tbody>
                        {ev.inscritos.map((i: any) => (
                          <tr key={i.id} className="border-t border-border/40">
                            <td className="p-1.5 font-semibold tabular-nums">{i.numero_sorte}</td>
                            <td className="p-1.5">
                              <span className="inline-flex items-center gap-1.5">
                                {i.nome}
                                {i.telefone && (
                                  <a href={`https://wa.me/55${String(i.telefone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                                    title="Enviar WhatsApp" className="text-emerald-500 hover:text-emerald-600">
                                    <MessageCircle className="h-3.5 w-3.5" />
                                  </a>
                                )}
                              </span>
                            </td>
                            <td className="p-1.5 text-muted-foreground">{i.telefone || ''}</td>
                            {(ev.campos || []).map((c: any) => <td key={c.key} className="p-1.5 text-muted-foreground">{i.dados?.[c.key] || ''}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="pt-1">
                <Button size="sm" variant="ghost" onClick={excluir} className="text-red-600 hover:text-red-700"><Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir evento</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
