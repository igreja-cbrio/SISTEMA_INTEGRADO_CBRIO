// Eventos Externos · calendário + eventos com formulário público de confirmação
// de presença e sorteio (número da sorte aleatório por inscrito).
import { useEffect, useMemo, useState } from 'react';
import { eventosExternos as api } from '../api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  CalendarDays, Plus, Loader2, ChevronLeft, ChevronRight, Users, Gift, Link2, MessageCircle,
  Trash2, MapPin, Clock, PartyPopper,
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

      {novoOpen && <NovoEventoModal onClose={() => setNovoOpen(false)} onCriado={(id) => { setNovoOpen(false); carregar(); setDetId(id); }} />}
      {detId && <EventoDetalhe id={detId} onClose={() => setDetId(null)} onChanged={carregar} />}
    </div>
  );
}

function NovoEventoModal({ onClose, onCriado }: { onClose: () => void; onCriado: (id: string) => void }) {
  const [f, setF] = useState({ nome: '', data: '', hora: '', local: '', descricao: '' });
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    if (f.nome.trim().length < 2) { toast.error('Informe o nome do evento'); return; }
    setSalvando(true);
    try { const ev: any = await api.criar(f); toast.success('Evento criado'); onCriado(ev.id); }
    catch (e: any) { toast.error(e?.message || 'Erro ao criar'); } finally { setSalvando(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Novo evento</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <Input placeholder="Nome do evento (ex.: Celebra)" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} />
            <Input placeholder="Horário (ex.: 19h)" value={f.hora} onChange={e => setF({ ...f, hora: e.target.value })} />
          </div>
          <Input placeholder="Local" value={f.local} onChange={e => setF({ ...f, local: e.target.value })} />
          <textarea placeholder="Descrição (opcional)" value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })}
            className="w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] px-3 py-2 text-sm min-h-[70px]" />
          <Button onClick={salvar} disabled={salvando} className="w-full">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar evento'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EventoDetalhe({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [ev, setEv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [premio, setPremio] = useState('');
  const [sorteando, setSorteando] = useState(false);
  const [ultimo, setUltimo] = useState<any>(null);

  function carregar() { setLoading(true); api.get(id).then(setEv).catch(() => toast.error('Erro')).finally(() => setLoading(false)); }
  useEffect(() => { carregar(); }, [id]);

  const link = ev ? `${window.location.origin}/evento/${ev.slug}` : '';
  function copiar() { navigator.clipboard.writeText(link); toast.success('Link copiado'); }
  const wa = `https://wa.me/?text=${encodeURIComponent(`Confirme sua presença no ${ev?.nome || 'evento'}: ${link}`)}`;

  async function sortear() {
    setSorteando(true);
    try { const s: any = await api.sortear(id, premio); setUltimo(s); setPremio(''); carregar(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao sortear'); } finally { setSorteando(false); }
  }
  async function excluir() {
    if (!window.confirm('Excluir este evento? (some da lista · reversível por super-admin)')) return;
    try { await api.remover(id); toast.success('Evento excluído'); onChanged(); onClose(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao excluir'); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[88vh]">
        {loading || !ev ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">{ev.nome}</DialogTitle>
            </DialogHeader>
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
                <div className="text-xs font-medium mb-2 flex items-center gap-1.5"><Gift className="h-4 w-4 text-primary" /> Sorteio</div>
                <div className="flex gap-2">
                  <Input placeholder="Prêmio (opcional)" value={premio} onChange={e => setPremio(e.target.value)} className="h-9" />
                  <Button size="sm" onClick={sortear} disabled={sorteando || !(ev.inscritos?.length)}>{sorteando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sortear'}</Button>
                </div>
                {ultimo && (
                  <div className="mt-3 rounded-lg bg-primary/10 border border-primary/30 p-3 text-center">
                    <PartyPopper className="h-6 w-6 text-primary mx-auto" />
                    <div className="text-lg font-bold mt-1">Nº {ultimo.numero_sorteado} · {ultimo.ganhador_nome}</div>
                    {ultimo.premio && <div className="text-xs text-muted-foreground">{ultimo.premio}</div>}
                  </div>
                )}
                {(ev.sorteios || []).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {ev.sorteios.map((s: any) => (
                      <div key={s.id} className="flex justify-between text-xs border-b border-border/40 py-1">
                        <span><b>Nº {s.numero_sorteado}</b> · {s.ganhador_nome}{s.premio ? ` · ${s.premio}` : ''}</span>
                        <span className="text-muted-foreground">{new Date(s.sorteado_em).toLocaleDateString('pt-BR')}</span>
                      </div>
                    ))}
                  </div>
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
                      <thead className="bg-foreground/5 text-muted-foreground"><tr><th className="text-left p-1.5">Nº</th><th className="text-left p-1.5">Nome</th><th className="text-left p-1.5">Telefone</th></tr></thead>
                      <tbody>
                        {ev.inscritos.map((i: any) => (
                          <tr key={i.id} className="border-t border-border/40">
                            <td className="p-1.5 font-semibold tabular-nums">{i.numero_sorte}</td>
                            <td className="p-1.5">{i.nome}</td>
                            <td className="p-1.5 text-muted-foreground">{i.telefone || ''}</td>
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
  );
}
