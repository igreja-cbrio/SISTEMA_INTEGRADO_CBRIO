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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Plus, Trash2, Check, X, MessageCircle, RefreshCw, Power } from 'lucide-react';
import { toast } from 'sonner';

const ESCOPOS = [
  { slug: 'grupos', label: 'Grupos / Células' },
  { slug: 'integracao', label: 'Cultos / Integração' },
];

const STATUS_LABEL = {
  recebido: { txt: 'Recebido', cor: 'bg-slate-100 text-slate-700' },
  parseado: { txt: 'Aguardando', cor: 'bg-amber-100 text-amber-800' },
  aplicado: { txt: 'Aplicado', cor: 'bg-emerald-100 text-emerald-700' },
  rejeitado: { txt: 'Rejeitado', cor: 'bg-rose-100 text-rose-700' },
  ignorado: { txt: 'Ignorado', cor: 'bg-slate-100 text-slate-500' },
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
        </TabsList>
        <TabsContent value="coletas"><AbaColetas /></TabsContent>
        <TabsContent value="lideres"><AbaLideres /></TabsContent>
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
