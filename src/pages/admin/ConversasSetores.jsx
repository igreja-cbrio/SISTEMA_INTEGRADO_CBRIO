// Admin · FLUXOS do menu do bot (Conversas) — F3 da reorganização (13/08/2026).
// Cada opção do menu é um CAMINHO completo, desenhado como trilho de nós
// (inspiração: /atlas/fluxograma): pessoa escolhe → bot responde → pede o
// nome? → conversa vai pra ÁREA ou ATENDENTE → equipe avisada. Antes, toda
// opção fazia a mesma coisa e só trocava a etiqueta de área.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { waInbox } from '../../api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import {
  Loader2, Plus, Trash2, MessageSquare, ArrowRight, Pencil, Bot,
  MessageCircle, User, Target, Bell, Eye,
} from 'lucide-react';
import { toast } from 'sonner';

const MSG_PADRAO = 'Obrigado! 🙏 Já encaminhei sua mensagem pro time. Em breve alguém fala com você por aqui.';

// Nó do trilho (linguagem do /atlas/fluxograma numa versão leve): caixinha com
// o TIPO em cima e o valor embaixo, borda esquerda colorida por tipo de passo.
function No({ icone: Icone, titulo, cor, children, apagado }) {
  return (
    <div className="min-w-[130px] max-w-[230px] shrink-0 rounded-lg border border-border bg-card/70 px-2.5 py-1.5"
      style={{ borderLeft: `3px solid ${cor}`, opacity: apagado ? 0.45 : 1 }}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icone className="h-3 w-3" />{titulo}
      </div>
      <div className="truncate text-xs" title={typeof children === 'string' ? children : undefined}>{children}</div>
    </div>
  );
}
function Seta() { return <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />; }

// O trilho de uma opção — é a resposta visual pra "se a pessoa selecionar 1,
// o que acontece de diferente de selecionar 4?".
function Trilho({ s, numero, nomeAtendente }) {
  const paraAtendente = s.destino_tipo === 'atendente' && s.atendente_id;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <No icone={MessageCircle} titulo="pessoa escolhe" cor="#00B39D">{numero != null ? `${numero} · ` : ''}{s.rotulo}</No>
      <Seta />
      <No icone={User} titulo={s.pedir_nome === false ? 'nome' : 'bot pergunta'} cor="#d97706" apagado={s.pedir_nome === false}>
        {s.pedir_nome === false ? 'não pede (vai direto)' : 'pede o nome'}
      </No>
      <Seta />
      <No icone={Bot} titulo="bot confirma" cor="#7c3aed">
        {(s.mensagem_resposta || '').trim() ? `“${s.mensagem_resposta.trim()}”` : 'mensagem padrão'}
      </No>
      <Seta />
      <No icone={Target} titulo="conversa vai para" cor="#0ea5e9">
        {paraAtendente ? `atendente · ${nomeAtendente || '…'}` : `área · ${s.area}`}
      </No>
      <Seta />
      <No icone={Bell} titulo="aviso" cor="#e11d48">
        {paraAtendente ? 'direto pro atendente' : 'equipe da área'}
      </No>
    </div>
  );
}

const FORM_VAZIO = {
  rotulo: '', area: '', ordem: '', ativo: true,
  mensagem_resposta: '', pedir_nome: true, destino_tipo: 'area', atendente_id: '',
};

export default function ConversasSetores() {
  const [setores, setSetores] = useState(null);
  const [erroSetores, setErroSetores] = useState(false);
  const [areas, setAreas] = useState([]);
  const [colabs, setColabs] = useState([]);
  const [dialogo, setDialogo] = useState(null); // null | { id? , ...FORM_VAZIO }
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    setErroSetores(false);
    waInbox.setores().then((r) => setSetores(r?.setores || [])).catch(() => { setSetores([]); setErroSetores(true); });
  }, []);
  useEffect(() => {
    carregar();
    waInbox.areas().then((r) => setAreas(r?.areas || [])).catch(() => {});
    waInbox.colaboradores().then((r) => setColabs(r?.colaboradores || [])).catch(() => {});
  }, [carregar]);

  const nomeColab = useMemo(() => new Map(colabs.map((c) => [c.id, c.name])), [colabs]);
  const ativosOrdenados = useMemo(
    () => (setores || []).filter((s) => s.ativo).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)),
    [setores],
  );
  const numeroDe = useMemo(() => new Map(ativosOrdenados.map((s, i) => [s.id, i + 1])), [ativosOrdenados]);

  function abrirEdicao(s) {
    setDialogo(s ? {
      id: s.id, rotulo: s.rotulo || '', area: s.area || '', ordem: String(s.ordem ?? ''), ativo: s.ativo !== false,
      mensagem_resposta: s.mensagem_resposta || '', pedir_nome: s.pedir_nome !== false,
      destino_tipo: s.destino_tipo === 'atendente' ? 'atendente' : 'area', atendente_id: s.atendente_id || '',
    } : { ...FORM_VAZIO });
  }

  async function salvarDialogo() {
    const d = dialogo;
    if (!d.rotulo.trim()) { toast.error('Dê um rótulo à opção (é o que aparece no menu).'); return; }
    if (!d.area) { toast.error('Escolha a área — mesmo indo pra um atendente, ela dá o contexto da conversa.'); return; }
    if (d.destino_tipo === 'atendente' && !d.atendente_id) { toast.error('Escolha o atendente de destino.'); return; }
    setSalvando(true);
    const body = {
      rotulo: d.rotulo.trim(), area: d.area, ativo: d.ativo,
      ordem: d.ordem !== '' ? Number(d.ordem) : ((setores || []).reduce((m, s) => Math.max(m, s.ordem || 0), 0) + 1),
      mensagem_resposta: d.mensagem_resposta.trim() || null,
      pedir_nome: d.pedir_nome,
      destino_tipo: d.destino_tipo,
      atendente_id: d.destino_tipo === 'atendente' ? d.atendente_id : null,
    };
    try {
      const r = d.id ? await waInbox.salvarSetor(d.id, body) : await waInbox.criarSetor(body);
      if (r?.aviso) toast.warning(r.aviso, { duration: 9000 });
      else toast.success(d.id ? 'Fluxo atualizado' : 'Opção criada no menu');
      setDialogo(null); carregar();
    } catch (e) { toast.error(e?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  async function toggleAtivo(s) {
    try { await waInbox.salvarSetor(s.id, { ativo: !s.ativo }); carregar(); }
    catch (e) { toast.error(e?.message || 'Erro'); }
  }
  async function remover(s) {
    if (!window.confirm(`Remover a opção "${s.rotulo}" do menu?`)) return;
    try { await waInbox.removerSetor(s.id); setSetores((list) => list.filter((x) => x.id !== s.id)); }
    catch (e) { toast.error(e?.message || 'Erro ao remover'); }
  }

  return (
    <div className="max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><MessageSquare className="h-5 w-5 text-primary" />Fluxos do menu do bot</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Quando alguém desconhecido escreve no WhatsApp da igreja, o bot mostra o menu. Cada opção
            tem o seu caminho completo — o que o bot responde, se pede o nome, e pra quem a conversa vai.
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => abrirEdicao(null)}><Plus className="h-4 w-4" />Nova opção</Button>
      </div>

      {/* Prévia do menu como a PESSOA vê no WhatsApp */}
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />O que a pessoa recebe
        </div>
        <div className="max-w-md rounded-xl bg-muted/60 p-3 text-sm">
          Olá! Obrigado por entrar em contato com a CBRio!<br />
          Responda, com qual setor você deseja entrar em contato:<br /><br />
          {ativosOrdenados.length === 0
            ? <i className="text-muted-foreground">— nenhuma opção ativa: o bot cai na resposta institucional —</i>
            : ativosOrdenados.map((s, i) => <span key={s.id}>{i + 1} - {s.rotulo}<br /></span>)}
        </div>
      </Card>

      {setores === null ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : erroSetores ? (
        <Card className="p-6 text-center text-sm">
          <p className="mb-1 font-semibold">Não foi possível carregar os fluxos</p>
          <p className="mb-3 text-xs text-muted-foreground">Fluxos existentes podem estar configurados — não recrie sem confirmar.</p>
          <Button variant="outline" size="sm" onClick={carregar}>Tentar de novo</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {setores.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma opção no menu. Crie a primeira.</Card>}
          {[...setores].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map((s) => (
            <Card key={s.id} className="space-y-2 p-3" style={{ opacity: s.ativo ? 1 : 0.55 }}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">ordem {s.ordem ?? 0}</span>
                  {!s.ativo && <span className="rounded bg-muted px-1.5 py-0.5">fora do menu</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Switch checked={!!s.ativo} onCheckedChange={() => toggleAtivo(s)} title={s.ativo ? 'Tirar do menu (sem apagar)' : 'Voltar pro menu'} />
                  <button onClick={() => abrirEdicao(s)} className="rounded p-1.5 text-muted-foreground hover:text-primary" title="Editar fluxo"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => remover(s)} className="rounded p-1.5 text-muted-foreground hover:text-destructive" title="Remover"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <Trilho s={s} numero={numeroDe.get(s.id) ?? null} nomeAtendente={nomeColab.get(s.atendente_id)} />
            </Card>
          ))}
        </div>
      )}

      {/* Editor do fluxo — os campos na ORDEM do caminho, com prévia ao vivo */}
      <Dialog open={!!dialogo} onOpenChange={(v) => { if (!v) setDialogo(null); }}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
          <DialogHeader><DialogTitle>{dialogo?.id ? 'Editar fluxo da opção' : 'Nova opção do menu'}</DialogTitle></DialogHeader>
          {dialogo && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-[1fr_90px] gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Rótulo no menu</label>
                  <Input placeholder="ex.: Oração" value={dialogo.rotulo} onChange={(e) => setDialogo((d) => ({ ...d, rotulo: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Ordem</label>
                  <Input type="number" placeholder="auto" value={dialogo.ordem} onChange={(e) => setDialogo((d) => ({ ...d, ordem: e.target.value }))} />
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · O bot pede o nome?</div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={dialogo.pedir_nome} onCheckedChange={(v) => setDialogo((d) => ({ ...d, pedir_nome: v }))} />
                  {dialogo.pedir_nome ? 'Sim — pergunta o nome antes de encaminhar' : 'Não — encaminha direto (ex.: a pessoa já vai escrever o pedido)'}
                </label>
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · O que o bot responde ao concluir</div>
                <textarea rows={3} value={dialogo.mensagem_resposta}
                  onChange={(e) => setDialogo((d) => ({ ...d, mensagem_resposta: e.target.value }))}
                  placeholder={`Vazio = mensagem padrão:\n“${MSG_PADRAO}”`}
                  className="w-full resize-none rounded-lg border border-border bg-background p-2 text-sm outline-none focus:border-primary" />
                <p className="mt-1 text-[11px] text-muted-foreground">O protocolo de atendimento é acrescentado automaticamente no fim.</p>
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">3 · Pra quem a conversa vai</div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Select value={dialogo.destino_tipo} onValueChange={(v) => setDialogo((d) => ({ ...d, destino_tipo: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="area">Fila da área (qualquer um atende)</SelectItem>
                      <SelectItem value="atendente">Atendente específico (já atribuída)</SelectItem>
                    </SelectContent>
                  </Select>
                  {dialogo.destino_tipo === 'atendente' && (
                    <Select value={dialogo.atendente_id || undefined} onValueChange={(v) => setDialogo((d) => ({ ...d, atendente_id: v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Escolha o atendente" /></SelectTrigger>
                      <SelectContent>{colabs.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>
                <div className="mt-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Área da conversa {dialogo.destino_tipo === 'atendente' ? '(contexto/etiqueta, mesmo indo pro atendente)' : ''}
                  </label>
                  <Select value={dialogo.area || undefined} onValueChange={(v) => setDialogo((d) => ({ ...d, area: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Área" /></SelectTrigger>
                    <SelectContent>{areas.map((a) => <SelectItem key={a.nome} value={a.nome}>{a.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-border p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia do caminho</div>
                <Trilho
                  s={{
                    ...dialogo,
                    mensagem_resposta: dialogo.mensagem_resposta, pedir_nome: dialogo.pedir_nome,
                    destino_tipo: dialogo.destino_tipo, atendente_id: dialogo.atendente_id,
                  }}
                  numero={null}
                  nomeAtendente={nomeColab.get(dialogo.atendente_id)}
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" onClick={() => setDialogo(null)}>Cancelar</Button>
            <Button disabled={salvando} onClick={salvarDialogo} className="gap-1.5">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {dialogo?.id ? 'Salvar fluxo' : 'Criar opção'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
