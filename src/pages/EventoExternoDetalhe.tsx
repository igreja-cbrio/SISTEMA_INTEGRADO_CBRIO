// Eventos Externos · tela dedicada do evento — inscritos com espaço de verdade,
// clique na pessoa abre o detalhe da inscrição. Substitui o modal apertado.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { eventosExternos as api } from '../api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, CalendarDays, Clock, MapPin, Users, Gift, Link2, MessageCircle,
  QrCode, Pencil, Trash2, Loader2, Search, ExternalLink, Ticket,
  ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react';
import QrLinkDialog from '../components/QrLinkDialog';
import { EventoFormModal } from './EventosExternos';

export default function EventoExternoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ev, setEv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sorteando, setSorteando] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const [inscSel, setInscSel] = useState<any>(null);
  // Cards recolhidos (só a linha principal) — melhora a visualização com
  // muitas inscrições. Set com os ids recolhidos + botão recolher/expandir todos.
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const toggleRecolhido = (id: string) => setRecolhidos(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });
  const [anim, setAnim] = useState<{ fase: 'rolando' | 'fim'; premio: string; ganhador?: any } | null>(null);
  const [rolNum, setRolNum] = useState(0);

  function carregar() {
    if (!id) return;
    api.get(id).then(setEv).catch(() => toast.error('Erro ao carregar o evento')).finally(() => setLoading(false));
  }
  useEffect(() => { setLoading(true); carregar(); }, [id]);

  const link = ev ? `${window.location.origin}/evento/${ev.slug}` : '';
  function copiar() { navigator.clipboard.writeText(link); toast.success('Link copiado'); }
  const waTexto = ev?.msg_whatsapp
    ? String(ev.msg_whatsapp).replaceAll('{link}', link)
    : `Confirme sua presença no ${ev?.nome || 'evento'}: ${link}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(waTexto)}`;

  const inscritos = useMemo(() => {
    const lista = ev?.inscritos || [];
    const q = busca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((i: any) =>
      String(i.nome || '').toLowerCase().includes(q)
      || String(i.telefone || '').includes(q.replace(/\D/g, '') || ' ')
      || String(i.numero_sorte || '') === q,
    );
  }, [ev, busca]);

  const premiosGanhos = (inscricaoId: string) =>
    (ev?.sorteios || []).filter((s: any) => s.inscricao_id === inscricaoId);

  function confeteBig() {
    const cores = ['#00B39D', '#00d9bd', '#ffd166', '#ef476f', '#118ab2', '#ffffff'];
    const raja = (x: number) => confetti({ particleCount: 80, spread: 80, startVelocity: 55, origin: { x, y: 0.55 }, colors: cores });
    raja(0.5); setTimeout(() => raja(0.2), 200); setTimeout(() => raja(0.8), 400);
    setTimeout(() => confetti({ particleCount: 140, spread: 120, startVelocity: 45, origin: { y: 0.5 }, colors: cores }), 250);
  }

  const sorteioDoPremio = (nome: string) => (ev?.sorteios || []).find((s: any) => (s.premio || '') === nome);

  async function sortearPremio(nome: string) {
    if (anim || !id) return;
    setSorteando(true);
    setAnim({ fase: 'rolando', premio: nome });
    const iv = setInterval(() => setRolNum(1000 + Math.floor(Math.random() * 9000)), 65);
    try {
      const s: any = await api.sortear(id, nome);
      await new Promise(r => setTimeout(r, 2400));
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
    if (!id) return;
    setSorteando(true);
    try {
      const pendentes = (ev?.premios || []).filter((p: string) => !sorteioDoPremio(p));
      for (const p of pendentes) { await api.sortear(id, p); }
      carregar();
      toast.success(`${pendentes.length} prêmio(s) sorteado(s)`);
    } catch (e: any) { toast.error(e?.message || 'Erro ao sortear'); } finally { setSorteando(false); }
  }
  async function excluir() {
    if (!id || !window.confirm('Excluir este evento? (some da lista · reversível por super-admin)')) return;
    try { await api.remover(id); toast.success('Evento excluído'); navigate('/eventos-externos'); }
    catch (e: any) { toast.error(e?.message || 'Erro ao excluir'); }
  }
  async function excluirInscrito(i: any) {
    if (!id || !window.confirm(`Excluir a inscrição de ${i.nome}? Ela não entra mais nos sorteios.`)) return;
    try {
      await api.excluirInscricao(id, i.id);
      toast.success('Inscrição excluída');
      setEv((prev: any) => (prev ? { ...prev, inscritos: (prev.inscritos || []).filter((x: any) => x.id !== i.id) } : prev));
    } catch (e: any) { toast.error(e?.message || 'Erro ao excluir a inscrição'); }
  }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!ev) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-3">
      <p className="text-muted-foreground">Evento não encontrado.</p>
      <Button variant="outline" onClick={() => navigate('/eventos-externos')}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar pros eventos</Button>
    </div>
  );

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

    {editOpen && <EventoFormModal evento={ev} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); carregar(); }} />}
    {qrOpen && (
      <QrLinkDialog
        link={link}
        titulo={ev.nome}
        nomeArquivo={`qr-${ev.slug}`}
        descricao="Imprima ou projete no telão — quem escanear cai direto no formulário de confirmação."
        onClose={() => setQrOpen(false)}
      />
    )}
    {inscSel && (
      <InscricaoDetalheDialog
        inscricao={inscSel}
        campos={ev.campos || []}
        premios={premiosGanhos(inscSel.id)}
        eventoId={ev.id}
        onSaved={(atualizada: any) => { setInscSel(atualizada); carregar(); }}
        onClose={() => setInscSel(null)}
      />
    )}

    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <button onClick={() => navigate('/eventos-externos')} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Eventos Externos
      </button>

      {/* Cabeçalho do evento */}
      <Card className="glass-solid overflow-hidden">
        {ev.capa_url && <img src={ev.capa_url} alt="capa do evento" className="w-full h-36 sm:h-48 object-cover" />}
        <div className="p-4 sm:p-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold break-words">{ev.nome}</h1>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1.5">
                {ev.data && <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" />{new Date(ev.data + 'T00:00:00').toLocaleDateString('pt-BR')}</span>}
                {ev.hora && <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{ev.hora}</span>}
                {ev.local && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{ev.local}</span>}
                <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" />{ev.inscritos?.length || 0} confirmados</span>
                {!ev.form_ativo && <span className="text-amber-600 font-medium">inscrições fechadas</span>}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-3.5 w-3.5 mr-1" /> Editar</Button>
              <Button size="sm" variant="ghost" onClick={excluir} className="text-red-600 hover:text-red-700"><Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir</Button>
            </div>
          </div>
          {ev.descricao && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ev.descricao}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={copiar}><Link2 className="h-3.5 w-3.5 mr-1" /> Copiar link</Button>
            <a href={wa} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><MessageCircle className="h-3.5 w-3.5 mr-1 text-emerald-500" /> WhatsApp</Button></a>
            <Button size="sm" variant="outline" onClick={() => setQrOpen(true)}><QrCode className="h-3.5 w-3.5 mr-1" /> QR Code</Button>
            <a href={link} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir formulário</Button></a>
          </div>
        </div>
      </Card>

      {/* Sorteio */}
      {(ev.tem_sorteio !== false) && (
        <Card className="glass-solid p-4">
          <div className="text-sm font-semibold mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5"><Gift className="h-4 w-4 text-primary" /> Sorteio</span>
            {(ev.premios || []).length > 0 && (ev.premios || []).some((p: string) => !sorteioDoPremio(p)) && (
              <Button size="sm" variant="outline" onClick={sortearTodos} disabled={sorteando || !(ev.inscritos?.length)}>
                {sorteando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Sortear todos'}
              </Button>
            )}
          </div>
          {(ev.premios || []).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {(ev.premios || []).map((p: string, i: number) => {
                const s = sorteioDoPremio(p);
                return (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p || `${i + 1}º prêmio`}</div>
                      {s && <div className="text-xs text-primary">🎉 Nº {s.numero_sorteado} · {s.ganhador_nome}</div>}
                    </div>
                    {s ? (
                      <Button size="sm" variant="ghost" onClick={() => sortearPremio(p)} disabled={sorteando} className="text-xs shrink-0">Re-sortear</Button>
                    ) : (
                      <Button size="sm" onClick={() => sortearPremio(p)} disabled={sorteando || !(ev.inscritos?.length)} className="shrink-0">
                        {sorteando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sortear'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-1">
              Nenhum prêmio definido. Clique em <b>"Editar"</b> e adicione os prêmios do sorteio pra sortear um ganhador por prêmio.
            </p>
          )}
        </Card>
      )}

      {/* Inscritos */}
      <Card className="glass-solid p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="text-sm font-semibold flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" /> Inscritos ({ev.inscritos?.length || 0})</div>
          {(ev.inscritos?.length || 0) > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const todosRecolhidos = (ev.inscritos || []).length > 0 && (ev.inscritos || []).every((i: any) => recolhidos.has(i.id));
                return (
                  <Button size="sm" variant="outline" className="h-8"
                    onClick={() => setRecolhidos(todosRecolhidos ? new Set() : new Set((ev.inscritos || []).map((i: any) => i.id)))}>
                    {todosRecolhidos
                      ? <><ChevronsUpDown className="h-3.5 w-3.5 mr-1" /> Expandir todos</>
                      : <><ChevronsDownUp className="h-3.5 w-3.5 mr-1" /> Recolher todos</>}
                  </Button>
                );
              })()}
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar por nome, telefone ou nº" value={busca} onChange={e => setBusca(e.target.value)} className="h-8 pl-8 text-sm w-64 max-w-full" />
              </div>
            </div>
          )}
        </div>
        {(ev.inscritos || []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Ninguém confirmou ainda.</p>
        ) : inscritos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum inscrito bate com a busca.</p>
        ) : (
          <div className="space-y-2">
            {inscritos.map((i: any) => {
              const ganhos = premiosGanhos(i.id);
              const tel = String(i.telefone || '').replace(/\D/g, '');
              const respostas = (ev.campos || []).filter((c: any) => {
                const v = i.dados?.[c.key];
                return Array.isArray(v) ? v.length > 0 : !!v;
              });
              const recolhido = recolhidos.has(i.id);
              return (
                <div key={i.id} onClick={() => setInscSel(i)}
                  className="rounded-lg border border-border p-3 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors">
                  {/* Linha principal: nº + nome + contato + quando + recolher */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex items-center rounded-full bg-primary/15 text-primary text-xs font-bold px-2 py-0.5 tabular-nums shrink-0">
                        Nº {i.numero_sorte}
                      </span>
                      <span className="font-semibold text-sm truncate">{i.nome}</span>
                      {i.telefone && (
                        <a href={`https://wa.me/55${tel}`} target="_blank" rel="noreferrer"
                          title="Enviar WhatsApp" onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 shrink-0">
                          <MessageCircle className="h-3.5 w-3.5" /> {i.telefone}
                        </a>
                      )}
                      {ganhos.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-600 text-[11px] font-semibold px-2 py-0.5 shrink-0">
                          <Gift className="h-3 w-3" /> {ganhos.length > 1 ? `${ganhos.length} prêmios` : (ganhos[0].premio || 'Prêmio')}
                        </span>
                      )}
                      {recolhido && respostas.length > 0 && (
                        <span className="text-[11px] text-muted-foreground shrink-0">{respostas.length} resposta{respostas.length > 1 ? 's' : ''}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] text-muted-foreground">
                        {i.created_at ? new Date(i.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                      {respostas.length > 0 && (
                        <button
                          onClick={e => { e.stopPropagation(); toggleRecolhido(i.id); }}
                          title={recolhido ? 'Expandir respostas' : 'Recolher respostas'}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors">
                          {recolhido ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); excluirInscrito(i); }}
                        title="Excluir inscrição"
                        className="p-1 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {/* Respostas do formulário: pergunta em cima, resposta embaixo */}
                  {!recolhido && respostas.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 mt-2.5 pt-2.5 border-t border-border/50">
                      {respostas.map((c: any) => {
                        const v = i.dados?.[c.key];
                        return (
                          <div key={c.key} className="min-w-0">
                            <div className="text-[11px] text-muted-foreground truncate" title={c.label}>{c.label}</div>
                            {c.tipo === 'imagem' ? (
                              <a href={v} target="_blank" rel="noreferrer" title="Abrir imagem" onClick={e => e.stopPropagation()}>
                                <img src={v} alt={c.label} className="mt-0.5 h-10 w-auto max-w-[120px] object-contain rounded border border-border" />
                              </a>
                            ) : (
                              <div className="text-sm break-words line-clamp-2" title={Array.isArray(v) ? v.join(', ') : String(v)}>
                                {Array.isArray(v) ? v.join(', ') : v}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {(ev.inscritos?.length || 0) > 0 && (
          <p className="text-[11px] text-muted-foreground mt-2">Clique na pessoa pra ver o detalhamento completo da inscrição.</p>
        )}
      </Card>
    </div>
    </>
  );
}

// Pop-up com o detalhamento completo de UMA inscrição.
// Editor de resposta de "rede social" ("Rede · @handle" numa string só)
const REDES_SOCIAIS_ADM = ['Instagram', 'Facebook', 'X (Twitter)', 'TikTok', 'YouTube', 'LinkedIn', 'Kwai', 'Outra'];
function RedeSocialEdit({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const i = String(value || '').indexOf(' · ');
  const rede = i >= 0 ? String(value).slice(0, i) : '';
  const handle = i >= 0 ? String(value).slice(i + 3) : String(value || '');
  const emit = (r: string, h: string) => onChange(r && h ? `${r} · ${h}` : (h || r || ''));
  return (
    <div className="flex gap-2">
      <select value={rede} onChange={e => emit(e.target.value, handle)}
        className="h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-2 w-36 shrink-0">
        <option value="">Rede…</option>
        {REDES_SOCIAIS_ADM.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <Input value={handle} placeholder="@usuário ou link" onChange={e => emit(rede, e.target.value)} className="h-9" />
    </div>
  );
}

function InscricaoDetalheDialog({ inscricao, campos, premios, eventoId, onSaved, onClose }: {
  inscricao: any; campos: any[]; premios: any[]; eventoId: string;
  onSaved: (atualizada: any) => void; onClose: () => void;
}) {
  const tel = String(inscricao.telefone || '').replace(/\D/g, '');
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<{ nome: string; telefone: string; email: string; dados: Record<string, string> }>({ nome: '', telefone: '', email: '', dados: {} });

  function entrarEdicao() {
    setForm({
      nome: inscricao.nome || '',
      telefone: inscricao.telefone || '',
      email: inscricao.email || '',
      dados: Object.fromEntries(campos.filter((c: any) => c.tipo !== 'imagem').map((c: any) => {
        const v = inscricao.dados?.[c.key];
        return [c.key, Array.isArray(v) ? v.join(', ') : String(v ?? '')];
      })),
    });
    setEditando(true);
  }

  async function salvar() {
    if (form.nome.trim().length < 2) { toast.error('Nome inválido'); return; }
    setSalvando(true);
    try {
      const atualizada = await api.atualizarInscricao(eventoId, inscricao.id, form);
      toast.success('Inscrição atualizada');
      setEditando(false);
      onSaved(atualizada);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  const setDado = (key: string, v: string) => setForm(f => ({ ...f, dados: { ...f.dados, [key]: v } }));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg flex flex-col max-h-[88vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <span className="truncate">{inscricao.nome}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary text-xs font-semibold px-2 py-0.5 shrink-0">
              <Ticket className="h-3 w-3" /> Nº {inscricao.numero_sorte}
            </span>
            {!editando && (
              <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={entrarEdicao}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3 text-sm">
          {editando ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Nome</div>
                  <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="h-9" />
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">WhatsApp</div>
                  <Input value={form.telefone} inputMode="tel" onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} className="h-9" />
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">E-mail</div>
                  <Input value={form.email} type="email" onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-9" />
                </div>
              </div>
              {campos.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Respostas do formulário</div>
                  {campos.map((c: any) => (
                    <div key={c.key} className="rounded-lg border border-border p-2.5">
                      <div className="text-[11px] text-muted-foreground mb-1">{c.label}</div>
                      {c.tipo === 'imagem' ? (
                        <span className="text-xs text-muted-foreground">Imagem não é editável aqui (mantida como está).</span>
                      ) : c.tipo === 'rede_social' ? (
                        <RedeSocialEdit value={form.dados[c.key] || ''} onChange={v => setDado(c.key, v)} />
                      ) : (c.tipo === 'select' || c.tipo === 'escolha') ? (
                        <select value={form.dados[c.key] || ''} onChange={e => setDado(c.key, e.target.value)}
                          className="h-9 w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-2">
                          <option value="">—</option>
                          {(c.opcoes || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
                          {form.dados[c.key] && !(c.opcoes || []).includes(form.dados[c.key]) && (
                            <option value={form.dados[c.key]}>{form.dados[c.key]}</option>
                          )}
                        </select>
                      ) : c.tipo === 'textarea' ? (
                        <textarea value={form.dados[c.key] || ''} onChange={e => setDado(c.key, e.target.value)}
                          className="w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] px-2 py-1.5 text-sm min-h-[70px]" />
                      ) : (
                        <Input value={form.dados[c.key] || ''} onChange={e => setDado(c.key, e.target.value)} className="h-9"
                          placeholder={c.tipo === 'multi' ? 'separe as opções por vírgula' : undefined} />
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setEditando(false)} disabled={salvando}>Cancelar</Button>
                <Button size="sm" onClick={salvar} disabled={salvando} className="bg-primary text-primary-foreground">
                  {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-lg border border-border p-2.5">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">WhatsApp</div>
                  {inscricao.telefone ? (
                    <a href={`https://wa.me/55${tel}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 font-medium">
                      <MessageCircle className="h-4 w-4" /> {inscricao.telefone}
                    </a>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>
                <div className="rounded-lg border border-border p-2.5">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Inscrição feita em</div>
                  {inscricao.created_at ? new Date(inscricao.created_at).toLocaleString('pt-BR') : '—'}
                </div>
                {inscricao.email && (
                  <div className="rounded-lg border border-border p-2.5 sm:col-span-2">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">E-mail</div>
                    <span className="break-all">{inscricao.email}</span>
                  </div>
                )}
              </div>

              {premios.length > 0 && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5">
                  <div className="text-[11px] text-primary uppercase tracking-wide mb-1 flex items-center gap-1"><Gift className="h-3 w-3" /> Ganhou no sorteio</div>
                  {premios.map((s: any) => (
                    <div key={s.id} className="text-sm font-medium">🎉 {s.premio || 'Prêmio'}</div>
                  ))}
                </div>
              )}

              {campos.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Respostas do formulário</div>
                  {campos.map((c: any) => {
                    const v = inscricao.dados?.[c.key];
                    return (
                      <div key={c.key} className="rounded-lg border border-border p-2.5">
                        <div className="text-[11px] text-muted-foreground mb-0.5">{c.label}</div>
                        {c.tipo === 'imagem' ? (
                          v ? (
                            <a href={v} target="_blank" rel="noreferrer" title="Abrir imagem em tamanho real">
                              <img src={v} alt={c.label} className="max-h-40 w-auto max-w-full object-contain rounded border border-border" />
                            </a>
                          ) : <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="whitespace-pre-wrap break-words">{Array.isArray(v) ? v.join(', ') : (v || <span className="text-muted-foreground">—</span>)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
