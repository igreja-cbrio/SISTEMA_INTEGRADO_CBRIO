// Genesis CBA · a série PERMANENTE (24/09/2026 · pedido do Matheus).
// Um evento que fica sempre aberto; cada Genesis é uma EDIÇÃO dele, com data e
// igreja sede. Ativar/inativar = publicar/encerrar a edição. As inscrições já
// são separadas por edição, e a pessoa NÃO vira cadastro da CBRio
// (backend/services/igrejaParceira.js).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { inscricoesApi as api } from '../../api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import { Loader2, Link2, Plus, Repeat, Users, Power } from 'lucide-react';
import { caminhoPublicoEvento, agruparPorIgreja } from '../../lib/genesisCba';

const fmtData = (s?: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
const STATUS: Record<string, { label: string; cls: string }> = {
  publicado: { label: 'ativo', cls: 'bg-emerald-500/15 text-emerald-700' },
  rascunho: { label: 'rascunho', cls: 'bg-foreground/8 text-muted-foreground' },
  encerrado: { label: 'inativo', cls: 'bg-foreground/8 text-muted-foreground' },
  arquivado: { label: 'arquivado', cls: 'bg-foreground/8 text-muted-foreground' },
};

export default function GenesisPainel({ onClose, onChanged, onEditar }: {
  onClose: () => void; onChanged: () => void; onEditar: (e: any) => void;
}) {
  const navigate = useNavigate();
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState('');
  const [igrejas, setIgrejas] = useState<any[]>([]);
  const [nova, setNova] = useState<{ data: string; hora: string; local: string; igreja_id: string } | null>(null);
  const [novaIgreja, setNovaIgreja] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mexendo, setMexendo] = useState<string | null>(null);

  function carregar() {
    setErro('');
    api.genesis().then(setDados).catch((e: any) => setErro(e?.message || 'Não foi possível carregar.'));
  }
  useEffect(() => {
    carregar();
    api.igrejasParceiras().then((r: any) => setIgrejas(Array.isArray(r) ? r : [])).catch(() => setIgrejas([]));
  }, []);

  const porIgreja = useMemo(() => agruparPorIgreja(dados?.edicoes || []), [dados]);
  const linkSempre = `${window.location.origin}/genesis`;

  async function cadastrarIgreja() {
    const nome = novaIgreja.trim();
    if (nome.length < 3) { toast.error('Informe o nome da igreja'); return; }
    try {
      const ig: any = await api.criarIgrejaParceira({ nome });
      setIgrejas((l) => [...l, ig].sort((a, b) => String(a.nome).localeCompare(String(b.nome))));
      setNova((n) => n ? { ...n, igreja_id: ig.id } : n);
      setNovaIgreja('');
    } catch (e: any) { toast.error(e?.message || 'Erro ao cadastrar a igreja'); }
  }

  async function criar() {
    if (!nova?.data) { toast.error('Informe a data'); return; }
    if (!nova.igreja_id) { toast.error('Escolha a igreja sede'); return; }
    setSalvando(true);
    try {
      await api.criarEdicaoGenesis(nova);
      toast.success('Genesis criado em rascunho — ative quando as inscrições puderem abrir');
      setNova(null); carregar(); onChanged();
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar o Genesis'); } finally { setSalvando(false); }
  }

  async function alternar(e: any) {
    const ativar = e.status !== 'publicado';
    setMexendo(e.id);
    try {
      await api.atualizarEvento(e.id, { status: ativar ? 'publicado' : 'encerrado' });
      toast.success(ativar ? 'Inscrições abertas' : 'Inscrições encerradas');
      carregar(); onChanged();
    } catch (err: any) { toast.error(err?.message || 'Erro ao alterar'); } finally { setMexendo(null); }
  }

  function copiar(txt: string) {
    navigator.clipboard.writeText(txt).then(() => toast.success('Link copiado')).catch(() => toast.error('Não deu para copiar'));
  }

  const r = dados?.resumo;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Repeat className="h-4 w-4 text-primary" /> Genesis CBA</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 text-sm">
          {erro ? (
            <p className="text-red-500">{erro}</p>
          ) : !dados ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : !dados.serie ? (
            <p className="text-amber-600">A série Genesis CBA ainda não existe — falta aplicar a migration 20260924170000.</p>
          ) : (
            <>
              <div className="rounded-lg border border-border p-3 space-y-1.5">
                <div className="text-xs text-muted-foreground">
                  Responsável: <b className="text-foreground">{dados.serie.area}</b>
                  {dados.serie.responsavel?.name ? <> · {dados.serie.responsavel.name}</> : null}
                  {' '}— recebe o aviso de cada nova inscrição.
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-muted-foreground">Link sempre aberto:</span>
                  <code className="rounded bg-foreground/8 px-1.5 py-0.5">{linkSempre}</code>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => copiar(linkSempre)}><Link2 className="h-3 w-3 mr-1" /> Copiar</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Esse link mostra o Genesis ativo no momento (se houver mais de um, a pessoa escolhe). Quem se inscreve
                  não vira cadastro da CBRio, não entra nos números da CBRio e não vê o evento no app.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[['Genesis realizados', r?.edicoes], ['Ativos agora', r?.ativas], ['Igrejas', r?.igrejas], ['Inscritos (total)', r?.inscritos]].map(([l, v]) => (
                  <div key={String(l)} className="rounded-lg border border-border p-2.5">
                    <div className="text-[11px] text-muted-foreground">{l}</div>
                    <div className="text-xl font-bold">{v ?? 0}</div>
                  </div>
                ))}
              </div>

              {nova ? (
                <div className="rounded-lg border border-primary/40 p-3 space-y-2">
                  <div className="font-medium">Novo Genesis</div>
                  <div className="grid sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Data *</label>
                      <DatePicker value={nova.data} onChange={(v: string) => setNova({ ...nova, data: v })} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Hora</label>
                      <Input value={nova.hora} onChange={(e) => setNova({ ...nova, hora: e.target.value.replace(/[^\d:]/g, '').slice(0, 5) })} placeholder="19:30" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Local</label>
                      <Input value={nova.local} onChange={(e) => setNova({ ...nova, local: e.target.value })} placeholder="Endereço da igreja" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Igreja sede *</label>
                    <select value={nova.igreja_id} onChange={(e) => setNova({ ...nova, igreja_id: e.target.value })}
                      className="w-full h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-2">
                      <option value="">Selecione a igreja…</option>
                      {igrejas.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                    </select>
                    <div className="flex gap-2 mt-1.5">
                      <Input value={novaIgreja} onChange={(e) => setNovaIgreja(e.target.value)} placeholder="Cadastrar nova igreja" className="h-8 text-sm" />
                      <Button size="sm" variant="outline" onClick={cadastrarIgreja}>Cadastrar</Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Nasce em rascunho, com as perguntas do último Genesis (ou as padrão da CBA). Ajuste em "Editar" e ative quando for abrir.
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setNova(null)}>Cancelar</Button>
                    <Button onClick={criar} disabled={salvando}>{salvando ? 'Criando…' : 'Criar Genesis'}</Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => setNova({ data: '', hora: '', local: '', igreja_id: '' })}>
                  <Plus className="h-4 w-4 mr-1" /> Novo Genesis
                </Button>
              )}

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Todos os Genesis</div>
                {dados.edicoes.length === 0 && <p className="text-xs text-muted-foreground">Nenhum Genesis cadastrado ainda.</p>}
                {dados.edicoes.map((e: any) => {
                  const st = STATUS[e.status] || STATUS.rascunho;
                  return (
                    <div key={e.id} className="rounded-lg border border-border px-2.5 py-2 flex items-center gap-2 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <div className="font-medium">{e.igreja?.nome || 'Igreja não definida'}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span>{fmtData(e.data)}{e.hora ? ` · ${e.hora}` : ''}</span>
                          {e.local && <span>{e.local}</span>}
                          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {e.inscritos}{e.vagas ? `/${e.vagas}` : ''}</span>
                          <span className={`rounded px-1.5 py-0.5 ${st.cls}`}>{st.label}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant={e.status === 'publicado' ? 'outline' : 'default'} className="h-7 text-xs"
                          disabled={mexendo === e.id} onClick={() => alternar(e)}>
                          <Power className="h-3 w-3 mr-1" /> {e.status === 'publicado' ? 'Inativar' : 'Ativar'}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7" title="Inscritos deste Genesis" onClick={() => navigate(`/inscricoes/evento/${e.id}`)}>
                          <Users className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-7" title="Copiar o link deste Genesis"
                          onClick={() => copiar(`${window.location.origin}${caminhoPublicoEvento(e)}`)}>
                          <Link2 className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onEditar(e)}>Editar</Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {porIgreja.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Por igreja</div>
                  <div className="rounded-lg border border-border divide-y divide-border">
                    {porIgreja.map((g) => (
                      <div key={g.chave} className="px-2.5 py-1.5 flex items-center justify-between text-xs">
                        <span className="font-medium">{g.nome}</span>
                        <span className="text-muted-foreground">{g.edicoes} Genesis · {g.inscritos} inscritos · último {fmtData(g.ultima)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end pt-2"><Button variant="outline" onClick={onClose}>Fechar</Button></div>
      </DialogContent>
    </Dialog>
  );
}
