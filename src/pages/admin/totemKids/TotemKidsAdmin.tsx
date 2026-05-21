// ============================================================================
// Totem Kids · Admin · Sessoes, Salas, Estacoes, Criancas, Auditoria
// ============================================================================
// Uma pagina com tabs · admin do Kids configura tudo aqui.
// ============================================================================
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Pencil, Baby, Calendar, MapPin, Printer, ShieldAlert, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { totemKids, kpis } from '@/api';
import { useNavigate } from 'react-router-dom';
import { formatIdadeShort } from '@/pages/ministerial/totemKids/lib/idade';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function TotemKidsAdmin() {
  const navigate = useNavigate();
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300">Totem Kids · Administração</h1>
          <p className="text-sm text-muted-foreground">Configuração de sessões, salas, estações, crianças e auditoria.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids')}>
            <ExternalLink className="h-4 w-4 mr-1" /> Ir pro Totem (check-in)
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids/teste-etiqueta')}>
            <Printer className="h-4 w-4 mr-1" /> Testar etiqueta
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids/painel')}>
            <Calendar className="h-4 w-4 mr-1" /> Painel ao vivo
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open('/manuais/totem-kids/', '_blank')}>
            <ExternalLink className="h-4 w-4 mr-1" /> Manual (HTML)
          </Button>
        </div>
      </div>

      <Tabs defaultValue="sessoes">
        <TabsList className="flex-wrap">
          <TabsTrigger value="sessoes"><Calendar className="h-4 w-4 mr-1" /> Sessões</TabsTrigger>
          <TabsTrigger value="salas"><MapPin className="h-4 w-4 mr-1" /> Salas</TabsTrigger>
          <TabsTrigger value="estacoes"><Printer className="h-4 w-4 mr-1" /> Estações</TabsTrigger>
          <TabsTrigger value="criancas"><Baby className="h-4 w-4 mr-1" /> Crianças</TabsTrigger>
          <TabsTrigger value="auditoria"><ShieldAlert className="h-4 w-4 mr-1" /> Auditoria</TabsTrigger>
        </TabsList>
        <TabsContent value="sessoes"><AbaSessoes /></TabsContent>
        <TabsContent value="salas"><AbaSalas /></TabsContent>
        <TabsContent value="estacoes"><AbaEstacoes /></TabsContent>
        <TabsContent value="criancas"><AbaCriancas /></TabsContent>
        <TabsContent value="auditoria"><AbaAuditoria /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Aba Sessões ─────────────────────────────────────────────────────────────
function AbaSessoes() {
  const [sessoes, setSessoes] = useState<any[]>([]);
  const [cultos, setCultos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [cultoSelecionado, setCultoSelecionado] = useState('');

  async function carregar() {
    setCarregando(true);
    try {
      // Pega cultos dos ultimos 7 dias + proximos 14 dias (3 semanas total).
      // Marcos: "ele sempre mostra o do dia, faz sentido" · entao janela
      // larga ate o admin conseguir criar com antecedencia.
      const hoje = new Date();
      const inicio = new Date(hoje); inicio.setDate(hoje.getDate() - 7);
      const fim = new Date(hoje); fim.setDate(hoje.getDate() + 14);
      const [s, c] = await Promise.all([
        totemKids.sessoes.list({ limit: 30 }),
        kpis.cultos.list({
          limit: 50,
          data_inicio: inicio.toISOString().slice(0, 10),
          data_fim: fim.toISOString().slice(0, 10),
        }).catch(() => []),
      ]);
      setSessoes(s);
      setCultos(c || []);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function criarSessao() {
    if (!cultoSelecionado) return toast.error('Selecione um culto');
    try {
      await totemKids.sessoes.create({ culto_id: cultoSelecionado });
      toast.success('Sessão criada e aberta');
      setModalAberto(false);
      setCultoSelecionado('');
      carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  }

  async function encerrarSessao(id: string) {
    if (!confirm('Encerrar essa sessão? KPIs serão consolidados.')) return;
    try {
      await totemKids.sessoes.encerrar(id);
      toast.success('Encerrada');
      carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  }

  async function abrirSessao(id: string) {
    try {
      await totemKids.sessoes.abrir(id);
      toast.success('Sessão aberta');
      carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">Sessões mais recentes</div>
          <Button onClick={() => setModalAberto(true)} size="sm" className="bg-pink-600 hover:bg-pink-700">
            <Plus className="h-4 w-4 mr-1" /> Nova sessão
          </Button>
        </div>
        {carregando ? (
          <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-6" />
        ) : sessoes.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">Sem sessões ainda · crie uma pro próximo culto.</p>
        ) : (
          <div className="space-y-2">
            {sessoes.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium">{s.culto?.nome || '(culto removido)'}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.culto?.data && format(new Date(s.culto.data + 'T00:00:00'), "EEE, dd/MM/yyyy", { locale: ptBR })}
                    {s.culto?.presencial_kids != null && ` · ${s.culto.presencial_kids} criança(s) consolidadas`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={s.status === 'aberta' ? 'default' : s.status === 'encerrada' ? 'secondary' : 'outline'}>
                    {s.status}
                  </Badge>
                  {s.status === 'aberta' && (
                    <Button size="sm" variant="outline" onClick={() => encerrarSessao(s.id)}>Encerrar</Button>
                  )}
                  {s.status === 'agendada' && (
                    <Button size="sm" onClick={() => abrirSessao(s.id)}>Abrir</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={modalAberto} onOpenChange={(o) => !o && setModalAberto(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova sessão Kids</DialogTitle>
              <DialogDescription>
                Cultos dos últimos 7 dias até próximos 14. Selecione o culto
                que vai ter Kids · sessão sai já <b>aberta</b>.
              </DialogDescription>
            </DialogHeader>
            {cultos.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Nenhum culto cadastrado nessa janela.
                <br />
                <Button variant="link" className="text-pink-600" onClick={() => window.open('/integracao?aba=cultos', '_blank')}>
                  Abrir /integração para cadastrar cultos
                </Button>
              </div>
            ) : (
              <Select value={cultoSelecionado} onValueChange={setCultoSelecionado}>
                <SelectTrigger><SelectValue placeholder="Selecione o culto" /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {cultos.map((c: any) => {
                    const dt = c.data && new Date(c.data + 'T00:00:00');
                    const jaTemSessao = sessoes.some(s => s.culto_id === c.id);
                    return (
                      <SelectItem key={c.id} value={c.id} disabled={jaTemSessao}>
                        {dt && format(dt, "EEE dd/MM", { locale: ptBR })} · {c.nome}
                        {jaTemSessao && ' (já tem sessão)'}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
              <Button onClick={criarSessao} disabled={!cultoSelecionado} className="bg-pink-600 hover:bg-pink-700">Criar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── Aba Salas ───────────────────────────────────────────────────────────────
function AbaSalas() {
  const [salas, setSalas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<any>(null);

  async function carregar() {
    setCarregando(true);
    try { setSalas(await totemKids.salas.list()); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  function abrir(s?: any) {
    setEditando(s || { nome: '', faixa_etaria_min_meses: 0, faixa_etaria_max_meses: 156, capacidade: 30, cor: '#EC4899', ativo: true, ordem: salas.length + 1 });
    setModalAberto(true);
  }

  async function salvar() {
    if (!editando.nome?.trim()) return toast.error('Nome obrigatório');
    try {
      if (editando.id) {
        await totemKids.salas.update(editando.id, editando);
      } else {
        await totemKids.salas.create(editando);
      }
      toast.success('Sala salva');
      setModalAberto(false);
      carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">Salas físicas do Kids</div>
          <Button onClick={() => abrir()} size="sm" className="bg-pink-600 hover:bg-pink-700">
            <Plus className="h-4 w-4 mr-1" /> Nova sala
          </Button>
        </div>
        {carregando ? <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-6" /> : (
          <div className="space-y-2">
            {salas.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="h-4 w-4 rounded-full" style={{ background: s.cor }} />
                  <div>
                    <div className="font-medium">{s.nome} {!s.ativo && <Badge variant="outline">inativa</Badge>}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatIdadeShort(s.faixa_etaria_min_meses)}–{formatIdadeShort(s.faixa_etaria_max_meses)} · cap {s.capacidade}
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => abrir(s)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <Dialog open={modalAberto} onOpenChange={(o) => !o && setModalAberto(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editando?.id ? 'Editar sala' : 'Nova sala'}</DialogTitle></DialogHeader>
            {editando && (
              <div className="space-y-2">
                <Input placeholder="Nome (ex: Berçário)" value={editando.nome} onChange={e => setEditando({ ...editando, nome: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs">Idade mínima (meses)</label>
                    <Input type="number" value={editando.faixa_etaria_min_meses} onChange={e => setEditando({ ...editando, faixa_etaria_min_meses: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs">Idade máxima (meses)</label>
                    <Input type="number" value={editando.faixa_etaria_max_meses} onChange={e => setEditando({ ...editando, faixa_etaria_max_meses: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs">Capacidade</label>
                    <Input type="number" value={editando.capacidade} onChange={e => setEditando({ ...editando, capacidade: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs">Cor (hex)</label>
                    <Input value={editando.cor} onChange={e => setEditando({ ...editando, cor: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs flex items-center gap-2">
                    <input type="checkbox" checked={editando.ativo} onChange={e => setEditando({ ...editando, ativo: e.target.checked })} />
                    Ativa
                  </label>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
                    <Button onClick={salvar} className="bg-pink-600 hover:bg-pink-700">Salvar</Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── Aba Estações ────────────────────────────────────────────────────────────
function AbaEstacoes() {
  const [estacoes, setEstacoes] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<any>(null);

  async function carregar() {
    setCarregando(true);
    try { setEstacoes(await totemKids.estacoes.list()); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  function abrir(e?: any) {
    setEditando(e || { nome: '', tipo: 'manned', printer_modelo: 'QL-820NWB', printer_target: '', ativo: true });
    setModalAberto(true);
  }

  async function salvar() {
    if (!editando.nome?.trim()) return toast.error('Nome obrigatório');
    try {
      if (editando.id) await totemKids.estacoes.update(editando.id, editando);
      else await totemKids.estacoes.create(editando);
      toast.success('Estação salva');
      setModalAberto(false);
      carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            Totems físicos · MVP usa só <b>manned</b>
          </div>
          <Button onClick={() => abrir()} size="sm" className="bg-pink-600 hover:bg-pink-700">
            <Plus className="h-4 w-4 mr-1" /> Nova estação
          </Button>
        </div>
        {carregando ? <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-6" /> : (
          <div className="space-y-2">
            {estacoes.map(e => (
              <div key={e.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium">{e.nome} <Badge variant="outline" className="ml-1">{e.tipo}</Badge> {!e.ativo && <Badge variant="outline">inativa</Badge>}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.printer_modelo} {e.printer_target && `· ${e.printer_target}`}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => abrir(e)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <Dialog open={modalAberto} onOpenChange={(o) => !o && setModalAberto(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editando?.id ? 'Editar estação' : 'Nova estação'}</DialogTitle></DialogHeader>
            {editando && (
              <div className="space-y-2">
                <Input placeholder="Nome (ex: Totem Recepção 1)" value={editando.nome} onChange={ev => setEditando({ ...editando, nome: ev.target.value })} />
                <Select value={editando.tipo} onValueChange={(v: any) => setEditando({ ...editando, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manned">Manned (voluntário opera)</SelectItem>
                    <SelectItem value="self">Self-service (futuro)</SelectItem>
                    <SelectItem value="roster">Roster · dentro da sala (futuro)</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Modelo da impressora (ex: QL-820NWB)" value={editando.printer_modelo || ''} onChange={ev => setEditando({ ...editando, printer_modelo: ev.target.value })} />
                <Input placeholder="IP da Brother na rede (informativo · ex: 192.168.10.50)" value={editando.printer_target || ''} onChange={ev => setEditando({ ...editando, printer_target: ev.target.value })} />
                <p className="text-xs text-muted-foreground">
                  No MVP, a impressão usa o browser. Configure a Brother como impressora padrão do Windows do totem.
                </p>
                <div className="flex items-center justify-between">
                  <label className="text-xs flex items-center gap-2">
                    <input type="checkbox" checked={editando.ativo} onChange={ev => setEditando({ ...editando, ativo: ev.target.checked })} />
                    Ativa
                  </label>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
                    <Button onClick={salvar} className="bg-pink-600 hover:bg-pink-700">Salvar</Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── Aba Crianças ────────────────────────────────────────────────────────────
function AbaCriancas() {
  const [criancas, setCriancas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');

  async function carregar() {
    setCarregando(true);
    try { setCriancas(await totemKids.criancas.list()); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  const filtradas = busca.trim().length >= 2
    ? criancas.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()))
    : criancas;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2 items-center">
          <Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-xs" />
          <span className="text-sm text-muted-foreground">
            {filtradas.length} de {criancas.length}
          </span>
        </div>
        {carregando ? <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-6" /> : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filtradas.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3 border rounded-lg">
                {c.foto_url ? (
                  <img src={c.foto_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center">
                    <Baby className="h-5 w-5 text-pink-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.nome} {c.visitante && <Badge variant="secondary" className="ml-1 text-xs">visitante</Badge>}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.idade_label || '?'} ·
                    {c.responsaveis?.[0]?.membro?.nome ? ` resp: ${c.responsaveis[0].membro.nome}` : ' sem responsável'}
                    {c.observacoes_medicas && ' · ⚠ obs médica'}
                  </div>
                </div>
              </div>
            ))}
            {filtradas.length === 0 && (
              <p className="text-muted-foreground text-center py-6">Nenhuma criança</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Aba Auditoria ───────────────────────────────────────────────────────────
function AbaAuditoria() {
  const [overrides, setOverrides] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    setCarregando(true);
    try { setOverrides(await totemKids.auditoria.overrides()); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="text-sm text-muted-foreground">Overrides realizados (últimos 100)</div>
        {carregando ? <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-6" /> : overrides.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">Nenhum override registrado · 👍</p>
        ) : (
          <div className="space-y-2">
            {overrides.map(o => (
              <div key={o.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-amber-600" />
                      {o.crianca?.nome}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {o.sessao?.culto?.nome} · {o.checkout_at && format(new Date(o.checkout_at), "dd/MM HH:mm")}
                    </div>
                  </div>
                </div>
                <div className="text-sm mt-2">
                  Entregue por: <b>{o.responsavel_checkin_nome}</b>
                  {o.responsavel_checkout_nome && (
                    <> · Buscado por: <b>{o.responsavel_checkout_nome}</b></>
                  )}
                </div>
                {o.override_motivo && (
                  <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded text-sm">
                    <b>Motivo:</b> {o.override_motivo}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
