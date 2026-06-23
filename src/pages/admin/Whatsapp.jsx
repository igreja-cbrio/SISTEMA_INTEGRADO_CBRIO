import { useState, useEffect, useCallback } from 'react';
import { whatsapp as api, users as usersApi, grupos as gruposApi } from '../../api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { Checkbox } from '../../components/ui/checkbox';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Plus, Trash2, Check, X, MessageCircle, RefreshCw, Power, Save } from 'lucide-react';
import { toast } from 'sonner';

const ESCOPOS = [
  { slug: 'grupos', label: 'Grupos / Células' },
  { slug: 'integracao', label: 'Cultos / Integração' },
];

const STATUS_LABEL = {
  recebido: { txt: 'Conversa', cor: 'bg-slate-100 text-slate-700' },
  aguardando_info: { txt: 'Coletando…', cor: 'bg-sky-100 text-sky-800' },
  parseado: { txt: 'Aguardando', cor: 'bg-amber-100 text-amber-800' },
  aplicado: { txt: 'Aplicado', cor: 'bg-emerald-100 text-emerald-700' },
  rejeitado: { txt: 'Rejeitado', cor: 'bg-rose-100 text-rose-700' },
  ignorado: { txt: 'Institucional', cor: 'bg-violet-100 text-violet-700' },
};

function telefoneBonito(t) {
  const d = (t || '').replace(/\D+/g, '');
  // 55 21 99999 9999
  if (d.length >= 12) {
    const ddi = d.slice(0, 2), ddd = d.slice(2, 4), resto = d.slice(4);
    return `+${ddi} (${ddd}) ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
  }
  return t;
}

export default function Whatsapp() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bot WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Líderes mandam os números da semana no WhatsApp · o sistema entende e deixa pronto pra você confirmar.
          </p>
        </div>
      </div>

      <Tabs defaultValue="coletas">
        <TabsList>
          <TabsTrigger value="coletas">Coletas</TabsTrigger>
          <TabsTrigger value="lideres">Líderes vinculados</TabsTrigger>
          <TabsTrigger value="avisos">Avisos</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
        </TabsList>
        <TabsContent value="coletas"><AbaColetas /></TabsContent>
        <TabsContent value="lideres"><AbaLideres /></TabsContent>
        <TabsContent value="avisos"><AbaAvisos /></TabsContent>
        <TabsContent value="config"><AbaConfig /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Aba Coletas ─────────────────────────────────────────────────────
function AbaColetas() {
  const [coletas, setColetas] = useState([]);
  const [filtro, setFiltro] = useState('parseado');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listColetas(filtro === 'todos' ? '' : filtro);
      setColetas(data || []);
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar coletas');
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  async function aplicar(id) {
    setBusy(id);
    try {
      const r = await api.aplicarColeta(id);
      toast.success(r?.destino === 'submissao_pendente'
        ? 'Enviado pra fila de Pendentes da Integração ✓'
        : 'Marcado como lançado ✓');
      carregar();
    } catch (e) {
      toast.error(e.message || 'Erro ao aplicar');
    } finally { setBusy(null); }
  }

  async function rejeitar(id) {
    setBusy(id);
    try {
      await api.rejeitarColeta(id);
      toast.success('Coleta rejeitada');
      carregar();
    } catch (e) {
      toast.error(e.message || 'Erro ao rejeitar');
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-2">
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="parseado">Aguardando confirmação</SelectItem>
            <SelectItem value="aplicado">Aplicadas</SelectItem>
            <SelectItem value="rejeitado">Rejeitadas</SelectItem>
            <SelectItem value="ignorado">Ignoradas</SelectItem>
            <SelectItem value="todos">Todas</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : coletas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma coleta {filtro !== 'todos' ? `"${STATUS_LABEL[filtro]?.txt?.toLowerCase()}"` : ''} por aqui.
        </Card>
      ) : (
        coletas.map(c => {
          const st = STATUS_LABEL[c.status] || STATUS_LABEL.recebido;
          const d = c.parsed?.dados || {};
          const moduloLabel = c.modulo_destino === 'integracao' ? 'Cultos/Integração'
            : c.modulo_destino === 'grupos' ? 'Grupos/Células' : '—';
          return (
            <Card key={c.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {c.lider?.nome_exibicao || telefoneBonito(c.telefone)}
                    </span>
                    <Badge className={st.cor}>{st.txt}</Badge>
                    {c.modulo_destino && c.modulo_destino !== 'desconhecido' && (
                      <Badge variant="outline">{moduloLabel}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {telefoneBonito(c.telefone)} · {new Date(c.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              {/* Mensagem original */}
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-foreground/90 italic">
                “{c.raw_text || '—'}”
              </div>

              {/* O que o sistema entendeu */}
              {c.parsed?.resumo && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Entendido: </span>
                  <span className="text-foreground">{c.parsed.resumo}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-xs">
                {d.presentes != null && <Chip label="Presentes" v={d.presentes} />}
                {d.presencial != null && <Chip label="Presencial" v={d.presencial} />}
                {d.visitantes != null && <Chip label="Visitantes" v={d.visitantes} />}
                {d.decisoes != null && <Chip label="Decisões" v={d.decisoes} />}
                {d.kids != null && <Chip label="Kids" v={d.kids} />}
              </div>

              {c.status === 'parseado' && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => aplicar(c.id)} disabled={busy === c.id}>
                    <Check className="h-4 w-4 mr-1" />
                    {c.modulo_destino === 'integracao' ? 'Enviar pra Pendentes' : 'Marcar lançado'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => rejeitar(c.id)} disabled={busy === c.id}>
                    <X className="h-4 w-4 mr-1" /> Rejeitar
                  </Button>
                </div>
              )}
              {c.status === 'aplicado' && c.modulo_destino === 'integracao' && (
                <p className="text-xs text-emerald-600">
                  ✓ Na fila de Pendentes da Integração · confirme lá pra entrar nos KPIs.
                </p>
              )}
              {c.status === 'aplicado' && c.modulo_destino === 'grupos' && (
                <p className="text-xs text-emerald-600">
                  ✓ Marcado · lance o encontro no módulo Grupos (a chamada precisa dos nomes).
                </p>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

function Chip({ label, v }) {
  return (
    <span className="px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
      {label}: {v}
    </span>
  );
}

// ── Aba Líderes ─────────────────────────────────────────────────────
function AbaLideres() {
  const [lideres, setLideres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setLideres(await api.listLideres() || []);
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar líderes');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function toggleAtivo(l) {
    try {
      await api.atualizarLider(l.id, { ativo: !l.ativo });
      carregar();
    } catch (e) { toast.error(e.message || 'Erro ao atualizar'); }
  }

  async function remover(l) {
    if (!window.confirm(`Remover o vínculo de ${l.nome_exibicao || telefoneBonito(l.telefone)}?`)) return;
    try {
      await api.removerLider(l.id);
      toast.success('Vínculo removido');
      carregar();
    } catch (e) { toast.error(e.message || 'Erro ao remover'); }
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Só números vinculados aqui conseguem mandar dados pelo bot.
        </p>
        <Button size="sm" onClick={() => setDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> Vincular líder
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : lideres.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum líder vinculado ainda.
        </Card>
      ) : (
        <div className="space-y-2">
          {lideres.map(l => (
            <Card key={l.id} className="p-3 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {l.nome_exibicao || l.profile?.name || 'Sem nome'}
                  </span>
                  {l.papel && <Badge variant="outline" className="capitalize">{l.papel}</Badge>}
                  {!l.ativo && <Badge variant="outline" className="text-muted-foreground">Inativo</Badge>}
                  {(l.escopo || []).map(s => (
                    <Badge key={s} variant="outline">
                      {ESCOPOS.find(e => e.slug === s)?.label || s}
                    </Badge>
                  ))}
                  {l.grupo?.nome && <Badge variant="outline">{l.grupo.nome}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {telefoneBonito(l.telefone)}{l.profile?.email ? ` · ${l.profile.email}` : ''}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => toggleAtivo(l)} title={l.ativo ? 'Desativar' : 'Ativar'}>
                  <Power className={`h-4 w-4 ${l.ativo ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remover(l)}>
                  <Trash2 className="h-4 w-4 text-rose-500" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {dialog && <DialogVincular onClose={() => setDialog(false)} onSaved={() => { setDialog(false); carregar(); }} />}
    </div>
  );
}

function DialogVincular({ onClose, onSaved }) {
  const [profiles, setProfiles] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [profileId, setProfileId] = useState('');
  const [telefone, setTelefone] = useState('');
  const [escopo, setEscopo] = useState([]);
  const [grupoId, setGrupoId] = useState('');
  const [papel, setPapel] = useState('lider');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    usersApi.list().then(setProfiles).catch(() => {});
    gruposApi.list().then(d => setGrupos(d || [])).catch(() => {});
  }, []);

  function toggleEscopo(slug) {
    setEscopo(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  }

  async function salvar() {
    const tel = telefone.replace(/\D+/g, '');
    if (tel.length < 12 || tel.length > 13) {
      toast.error('Telefone precisa ter DDI+DDD+número (ex: 5521999998888)');
      return;
    }
    if (escopo.length === 0) { toast.error('Escolha ao menos um escopo'); return; }
    setSaving(true);
    try {
      await api.vincularLider({
        profile_id: profileId || null,
        telefone: tel,
        escopo,
        grupo_id: grupoId || null,
        papel: papel || null,
      });
      toast.success('Líder vinculado');
      onSaved();
    } catch (e) {
      toast.error(e.message || 'Erro ao vincular');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Vincular líder ao WhatsApp</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Pessoa (profile)</label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {profiles.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Papel</label>
            <Select value={papel} onValueChange={setPapel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lider">Líder</SelectItem>
                <SelectItem value="assistente">Assistente</SelectItem>
                <SelectItem value="coordenador">Coordenador</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Telefone (com DDI 55)</label>
            <Input
              value={telefone}
              onChange={e => setTelefone(e.target.value)}
              placeholder="5521999998888"
              inputMode="tel"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Só dígitos. Ex: 55 + 21 + 99999-9999 → 5521999998888
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">O que esse líder reporta</label>
            <div className="space-y-2">
              {ESCOPOS.map(e => (
                <label key={e.slug} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={escopo.includes(e.slug)} onCheckedChange={() => toggleEscopo(e.slug)} />
                  {e.label}
                </label>
              ))}
            </div>
          </div>

          {escopo.includes('grupos') && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Grupo (opcional)</label>
              <Select value={grupoId} onValueChange={setGrupoId}>
                <SelectTrigger><SelectValue placeholder="Sem grupo específico" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {grupos.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Vincular'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Aba Avisos · broadcast pontual pra equipe ───────────────────────
// Envia texto livre pra quem JÁ LOGOU no sistema e tem celular no perfil
// (dedup por número). {nome} vira o primeiro nome. Fora da janela de 24h da
// Meta o envio pode falhar — o relatório por pessoa aparece após o envio.
const MENSAGEM_PADRAO_AVISO = `Oi, {nome}! 👋

Aqui é o sistema CBRio. Estamos na fase inicial de implantação e o seu uso diário faz toda a diferença: é usando que a gente encontra os bugs, corrige rápido e prioriza as melhorias a partir da experiência de cada um.

💬 Achou um erro ou tem uma sugestão? No canto inferior esquerdo do sistema tem o botão "Reportar" — é rapidinho e ajuda demais.

Acesse: cbrio.org
Conta com a gente — e a gente conta com você! 🙏`;

function AbaAvisos() {
  const [mensagem, setMensagem] = useState(MENSAGEM_PADRAO_AVISO);
  const [destinatarios, setDestinatarios] = useState(null); // null = não carregado
  const [loadingDest, setLoadingDest] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function carregarDestinatarios() {
    setLoadingDest(true);
    setResultado(null);
    try {
      const d = await api.broadcastDestinatarios();
      setDestinatarios(d?.destinatarios || []);
    } catch (e) {
      toast.error(e.message || 'Erro ao montar a lista');
    } finally { setLoadingDest(false); }
  }

  async function enviar() {
    setEnviando(true);
    setConfirmando(false);
    try {
      const r = await api.broadcastEnviar(mensagem);
      setResultado(r);
      toast.success(`Enviado para ${r.enviados} de ${r.total}`);
    } catch (e) {
      toast.error(e.message || 'Erro ao enviar');
    } finally { setEnviando(false); }
  }

  const fmtTel = (t) => (t || '').replace(/^55(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');

  return (
    <div className="space-y-4 mt-4">
      <Card className="p-4 space-y-3">
        <div>
          <p className="font-medium text-foreground">Aviso pra equipe (WhatsApp)</p>
          <p className="text-xs text-muted-foreground">
            Vai pra quem <strong>já logou no sistema</strong> e tem <strong>celular cadastrado</strong> no perfil (contas duplicadas contam 1x).
            Use <code className="px-1 rounded bg-muted">{'{nome}'}</code> pro primeiro nome. Fora da janela de 24h da Meta, alguns envios podem falhar — o relatório mostra quem recebeu.
          </p>
        </div>
        <Textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={9} />
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" onClick={carregarDestinatarios} disabled={loadingDest || enviando} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loadingDest ? 'animate-spin' : ''}`} />
            {destinatarios ? 'Recarregar destinatários' : 'Ver destinatários'}
          </Button>
          <Button
            onClick={() => setConfirmando(true)}
            disabled={enviando || !destinatarios?.length || mensagem.trim().length < 20}
            className="gap-1.5"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {enviando ? 'Enviando...' : `Enviar${destinatarios?.length ? ` para ${destinatarios.length}` : ''}`}
          </Button>
        </div>
      </Card>

      {destinatarios && (
        <Card className="p-4">
          <p className="text-sm font-medium text-foreground mb-2">Destinatários ({destinatarios.length})</p>
          {destinatarios.length === 0 && <p className="text-xs text-muted-foreground">Ninguém com celular cadastrado ainda.</p>}
          <div className="space-y-1">
            {destinatarios.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-border/50 last:border-0 py-1.5">
                <span className="text-foreground">{d.nome}</span>
                <span className="text-xs text-muted-foreground">{fmtTel(d.telefone)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {resultado && (
        <Card className="p-4">
          <p className="text-sm font-medium text-foreground mb-2">
            Relatório · {resultado.enviados}/{resultado.total} enviados
          </p>
          <div className="space-y-1">
            {(resultado.resultados || []).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-border/50 last:border-0 py-1.5">
                <span className="text-foreground">{r.nome}</span>
                {r.ok
                  ? <Badge className="bg-emerald-100 text-emerald-700">✓ enviado</Badge>
                  : <Badge className="bg-rose-100 text-rose-700" title={r.erro || ''}>falhou</Badge>}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Falhas geralmente são a janela de 24h da Meta (a pessoa nunca falou com o bot). Nesse caso, peça pra pessoa mandar um "oi" pro número do bot e reenvie, ou usamos um template aprovado.
          </p>
        </Card>
      )}

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar envio</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Enviar a mensagem pra <strong className="text-foreground">{destinatarios?.length || 0} pessoa(s)</strong> no WhatsApp? Essa ação não pode ser desfeita.
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button onClick={enviar} className="gap-1.5"><MessageCircle className="h-3.5 w-3.5" />Enviar agora</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Aba Configuração (institucional + toggle IA) ────────────────────
function AbaConfig() {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testChave, setTestChave] = useState('pedido_atualizado');
  const [testando, setTestando] = useState(false);

  async function testarDisparo() {
    setTestando(true);
    try {
      const r = await api.testDisparo(testChave);
      if (r?.ok) toast.success('Enviado! Confira seu WhatsApp.');
      else {
        const motivo = r?.motivo || ({
          template_nao_configurado: 'Env do template não setado na Vercel (ou sem redeploy).',
          sem_telefone: 'Seu membro está sem telefone.',
          sem_optin: 'Você não está com opt-in (template de Marketing).',
          wpp_nao_configurado: 'Token/número do WhatsApp não configurado.',
        }[r?.resultado?.skipped] || JSON.stringify(r?.resultado || {}));
        toast.error(`Não enviou: ${motivo}`);
      }
    } catch (e) { toast.error(e.message || 'Erro no teste'); }
    finally { setTestando(false); }
  }

  useEffect(() => {
    api.getConfig().then(d => {
      const inst = d?.institucional || {};
      setCfg({
        ia_ativa: d?.ia_ativa !== false,
        missao: inst.missao || '',
        visao: inst.visao || '',
        valores: Array.isArray(inst.valores) ? inst.valores.join('\n') : (inst.valores || ''),
        horarios: inst.horarios || '',
        endereco: inst.endereco || '',
        sobre: inst.sobre || '',
        instrucoes_extra: inst.instrucoes_extra || '',
      });
    }).catch(e => toast.error(e.message || 'Erro ao carregar config'))
      .finally(() => setLoading(false));
  }, []);

  function set(k, v) { setCfg(c => ({ ...c, [k]: v })); }

  async function salvar() {
    setSaving(true);
    try {
      await api.saveConfig({
        ia_ativa: cfg.ia_ativa,
        institucional: {
          missao: cfg.missao,
          visao: cfg.visao,
          valores: cfg.valores.split('\n').map(s => s.trim()).filter(Boolean),
          horarios: cfg.horarios,
          endereco: cfg.endereco,
          sobre: cfg.sobre,
          instrucoes_extra: cfg.instrucoes_extra,
        },
      });
      toast.success('Configuração salva');
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  if (loading || !cfg) return <p className="text-sm text-muted-foreground mt-4">Carregando…</p>;

  return (
    <div className="space-y-5 mt-4">
      <Card className="p-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground">Bot ativo</p>
          <p className="text-xs text-muted-foreground">Desligue pra pausar o bot sem mexer no webhook.</p>
        </div>
        <Switch checked={cfg.ia_ativa} onCheckedChange={v => set('ia_ativa', v)} />
      </Card>

      <Card className="p-4 space-y-3">
        <div>
          <p className="font-medium text-foreground">Testar disparo de template</p>
          <p className="text-xs text-muted-foreground">Envia o template escolhido pra você (seu WhatsApp) e mostra o motivo se não enviar — pra validar o env do template e o redeploy.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={testChave} onChange={e => setTestChave(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="pedido_atualizado">pedido_atualizado (solicitação)</option>
            <option value="inscricao_confirmada">inscricao_confirmada</option>
            <option value="kids_precheckin">kids_precheckin</option>
            <option value="kids_vinculo">kids_vinculo</option>
            <option value="batismo_lembrete">batismo_lembrete</option>
            <option value="aniversario">aniversario (Marketing · opt-in)</option>
          </select>
          <Button size="sm" onClick={testarDisparo} disabled={testando} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
            {testando ? 'Enviando…' : 'Enviar teste pra mim'}
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div>
          <p className="font-medium text-foreground">Conteúdo institucional</p>
          <p className="text-xs text-muted-foreground">
            Usado pra responder quem <strong>não é cadastrado</strong> (visitantes). A IA só usa o que estiver aqui — não inventa.
          </p>
        </div>

        <Campo label="Sobre a igreja" v={cfg.sobre} onChange={v => set('sobre', v)} rows={2} />
        <Campo label="Missão" v={cfg.missao} onChange={v => set('missao', v)} rows={2} />
        <Campo label="Visão" v={cfg.visao} onChange={v => set('visao', v)} rows={2} />
        <Campo label="Valores (um por linha)" v={cfg.valores} onChange={v => set('valores', v)} rows={4} />
        <Campo label="Horários de culto" v={cfg.horarios} onChange={v => set('horarios', v)} rows={4} />
        <Campo label="Endereço" v={cfg.endereco} onChange={v => set('endereco', v)} rows={2} />
        <Campo label="Instruções extras pra IA (opcional)" v={cfg.instrucoes_extra} onChange={v => set('instrucoes_extra', v)} rows={3} />

        <div className="flex justify-end">
          <Button onClick={salvar} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Campo({ label, v, onChange, rows }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Textarea value={v} onChange={e => onChange(e.target.value)} rows={rows} className="mt-1" />
    </div>
  );
}
