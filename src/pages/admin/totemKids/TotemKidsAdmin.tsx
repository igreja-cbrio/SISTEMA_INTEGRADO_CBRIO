// ============================================================================
// Totem Kids · Admin · Sessões, Salas, Estações, Crianças, Auditoria
// ============================================================================
// Uma página com tabs · admin do Kids configura tudo aqui.
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
import { Loader2, Plus, Pencil, Baby, Calendar, MapPin, Printer, ShieldAlert, ExternalLink, ArrowLeft, Sparkles, Upload, Download, AlertTriangle, CheckCircle2, FileSpreadsheet, Vibrate, Trash2, Send, RefreshCw } from 'lucide-react';
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
          <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300">Totem Kids · Configurações</h1>
          <p className="text-sm text-muted-foreground">Sessões, salas, estações, crianças e auditoria de overrides.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="default" size="sm" onClick={() => navigate('/ministerial/totem-kids')} className="bg-pink-600 hover:bg-pink-700">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao Totem
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids/decisoes')}>
            <Sparkles className="h-4 w-4 mr-1" /> Decisões
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids/teste-etiqueta')}>
            <Printer className="h-4 w-4 mr-1" /> Testar etiqueta
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids/painel')}>
            <Calendar className="h-4 w-4 mr-1" /> Painel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open('https://github.com/igreja-cbrio/SISTEMA_INTEGRADO_CBRIO/blob/main/docs/totem-kids-manual.md', '_blank')}>
            <ExternalLink className="h-4 w-4 mr-1" /> Manual (HTML)
          </Button>
        </div>
      </div>

      <Tabs defaultValue="sessoes">
        <TabsList className="flex-wrap">
          <TabsTrigger value="sessoes"><Calendar className="h-4 w-4 mr-1" /> Sessões</TabsTrigger>
          <TabsTrigger value="salas"><MapPin className="h-4 w-4 mr-1" /> Salas</TabsTrigger>
          <TabsTrigger value="estacoes"><Printer className="h-4 w-4 mr-1" /> Estações</TabsTrigger>
          <TabsTrigger value="pagers"><Vibrate className="h-4 w-4 mr-1" /> Pagers</TabsTrigger>
          <TabsTrigger value="criancas"><Baby className="h-4 w-4 mr-1" /> Crianças</TabsTrigger>
          <TabsTrigger value="auditoria"><ShieldAlert className="h-4 w-4 mr-1" /> Auditoria</TabsTrigger>
        </TabsList>
        <TabsContent value="sessoes"><AbaSessoes /></TabsContent>
        <TabsContent value="salas"><AbaSalas /></TabsContent>
        <TabsContent value="estacoes"><AbaEstacoes /></TabsContent>
        <TabsContent value="pagers"><AbaPagers /></TabsContent>
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
      // Janela de cultos: últimos 7 + próximos 14 dias.
      // Filtra so cultos cujo service_type tem has_kids=true · evita
      // listar AMI/Bridge que não tem programacao infantil (Marcos 2026-05-21).
      const hoje = new Date();
      const inicio = new Date(hoje); inicio.setDate(hoje.getDate() - 7);
      const fim = new Date(hoje); fim.setDate(hoje.getDate() + 14);
      const [s, c] = await Promise.all([
        totemKids.sessoes.list({ limit: 30 }),
        kpis.cultos.list({
          limit: 100,
          data_inicio: inicio.toISOString().slice(0, 10),
          data_fim: fim.toISOString().slice(0, 10),
        }).catch(() => []),
      ]);
      setSessoes(s);
      // Filtra so cultos com service_type_has_kids=true
      setCultos((c || []).filter((culto: any) => culto.service_type_has_kids === true));
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

// ─── Aba Pagers ──────────────────────────────────────────────────────────────
// Catalogo dos pagers fisicos (pulseira/coaster) entregues a família no check-in.
// Integra com o transmissor LRS Freedom via agente local da recepcao.
const CORES_LRS: { v: string; nome: string; hex: string }[] = [
  { v: 'R', nome: 'Vermelho', hex: '#EF4444' },
  { v: 'B', nome: 'Azul', hex: '#3B82F6' },
  { v: 'G', nome: 'Verde', hex: '#22C55E' },
  { v: 'Y', nome: 'Amarelo', hex: '#EAB308' },
  { v: 'O', nome: 'Laranja', hex: '#F97316' },
  { v: 'P', nome: 'Roxo', hex: '#A855F7' },
  { v: 'W', nome: 'Branco', hex: '#E5E7EB' },
];
function corHex(c?: string) { return CORES_LRS.find(x => x.v === (c || 'R'))?.hex || '#EF4444'; }

function AbaPagers() {
  const [pagers, setPagers] = useState<any[]>([]);
  const [emUso, setEmUso] = useState<Record<string, any>>({});
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [testando, setTestando] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const [lista, uso] = await Promise.all([
        totemKids.pagers.list(),
        totemKids.pagers.emUso().catch(() => ({})),
      ]);
      setPagers(lista || []);
      setEmUso(uso || {});
    } finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  function abrir(p?: any) {
    setEditando(p || { numero: '', rotulo: '', cor: 'R', tipo_lrs: 2, observacao: '', ativo: true });
    setModalAberto(true);
  }

  async function salvar() {
    if (editando.numero === '' || editando.numero == null) return toast.error('Número do pager obrigatório');
    try {
      if (editando.id) await totemKids.pagers.update(editando.id, editando);
      else await totemKids.pagers.create(editando);
      toast.success('Pager salvo');
      setModalAberto(false);
      carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    }
  }

  async function remover(p: any) {
    if (!confirm(`Remover o pager ${p.numero}? (fica no histórico, some da operação)`)) return;
    try { await totemKids.pagers.remove(p.id); toast.success('Pager removido'); carregar(); }
    catch (e: any) { toast.error(e?.message || 'Erro'); }
  }

  async function testar(p: any) {
    setTestando(p.id);
    try {
      await totemKids.pagers.testar(p.id);
      toast.success(`Toque de teste enfileirado · o pager ${p.numero} deve vibrar em instantes`);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao testar');
    } finally { setTestando(null); }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <div className="text-sm text-muted-foreground">
            Pagers físicos entregues à família no check-in. O número é o ID no transmissor LRS.
          </div>
          <Button onClick={() => abrir()} size="sm" className="bg-pink-600 hover:bg-pink-700">
            <Plus className="h-4 w-4 mr-1" /> Novo pager
          </Button>
        </div>

        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-800 dark:text-amber-200">
          O toque real depende do <b>agente local</b> (pager-bridge) estar rodando no PC da recepção,
          na mesma rede do transmissor LRS Freedom. Sem ele, os toques ficam enfileirados.
        </div>

        {carregando ? <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-6" /> : (
          <div className="space-y-2">
            {pagers.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">Nenhum pager cadastrado ainda.</div>
            )}
            {pagers.map(p => {
              const uso = emUso[p.id];
              return (
                <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow" style={{ background: corHex(p.cor) }}>
                      {p.numero}
                    </span>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {p.rotulo || `Pager ${p.numero}`}
                        {!p.ativo && <Badge variant="outline">inativo</Badge>}
                        {uso && <Badge className="bg-emerald-600">em uso · {uso.crianca?.nome || uso.responsavel_checkin_nome}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        nº {p.numero} · cor {CORES_LRS.find(c => c.v === p.cor)?.nome || p.cor}
                        {p.responsavel?.nome ? ` · padrão: ${p.responsavel.nome}` : ''}
                        {p.observacao ? ` · ${p.observacao}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" disabled={testando === p.id} onClick={() => testar(p)} title="Toque de teste">
                      {testando === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => abrir(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remover(p)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={modalAberto} onOpenChange={(o) => !o && setModalAberto(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editando?.id ? 'Editar pager' : 'Novo pager'}</DialogTitle>
              <DialogDescription>O número precisa bater com o ID programado no pager físico.</DialogDescription>
            </DialogHeader>
            {editando && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs">Número (ID LRS) *</label>
                    <Input type="number" value={editando.numero} onChange={e => setEditando({ ...editando, numero: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs">Cor</label>
                    <Select value={editando.cor} onValueChange={(v) => setEditando({ ...editando, cor: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CORES_LRS.map(c => (
                          <SelectItem key={c.v} value={c.v}>
                            <span className="inline-flex items-center gap-2">
                              <span className="h-3 w-3 rounded-full" style={{ background: c.hex }} /> {c.nome}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs">Rótulo (opcional)</label>
                  <Input placeholder="ex: Pulseira 21" value={editando.rotulo || ''} onChange={e => setEditando({ ...editando, rotulo: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs">Observação (opcional)</label>
                  <Textarea value={editando.observacao || ''} onChange={e => setEditando({ ...editando, observacao: e.target.value })} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs flex items-center gap-2">
                    <input type="checkbox" checked={editando.ativo} onChange={e => setEditando({ ...editando, ativo: e.target.checked })} />
                    Ativo
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
  const [modalQr, setModalQr] = useState<any>(null);

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

  async function abrirQr(e: any) {
    try {
      const info = await totemKids.estacoes.infoPareamento(e.id);
      setModalQr(info);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao gerar QR');
    }
  }

  async function regenerarToken(estacaoId: string) {
    if (!confirm('Regenerar o token vai REVOGAR tablets já pareados. Eles vão precisar escanear o QR novo. Continuar?')) return;
    try {
      const info = await totemKids.estacoes.regenerarToken(estacaoId);
      setModalQr(info);
      toast.success('Token regenerado · QR novo gerado');
      carregar();
    } catch (err: any) {
      toast.error(err?.message || 'Erro');
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            Totems físicos · cada tablet pareia com 1 estação via QR
          </div>
          <Button onClick={() => abrir()} size="sm" className="bg-pink-600 hover:bg-pink-700">
            <Plus className="h-4 w-4 mr-1" /> Nova estação
          </Button>
        </div>
        {carregando ? <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-6" /> : (
          <div className="space-y-2">
            {estacoes.map(e => (
              <div key={e.id} className="flex items-center justify-between p-3 border rounded-lg gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{e.nome} <Badge variant="outline" className="ml-1">{e.tipo}</Badge> {!e.ativo && <Badge variant="outline">inativa</Badge>}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {e.printer_modelo} {e.printer_target && `· ${e.printer_target}`}
                    {e.pareada_em && <span className="text-emerald-600"> · pareada {format(new Date(e.pareada_em), 'dd/MM HH:mm', { locale: ptBR })}</span>}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => abrirQr(e)} title="QR de pareamento">
                    <Sparkles className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => abrir(e)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal: QR de pareamento */}
        <Dialog open={!!modalQr} onOpenChange={(o) => !o && setModalQr(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>QR de pareamento · {modalQr?.nome}</DialogTitle>
              <DialogDescription>
                Escaneie no tablet/celular pra vincular esse dispositivo à estação.
                O pareamento dura até regenerar o token.
              </DialogDescription>
            </DialogHeader>
            {modalQr && (
              <div className="space-y-3">
                <div className="bg-white p-4 rounded-lg flex justify-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(modalQr.url)}`}
                    alt="QR de pareamento"
                    className="rounded"
                  />
                </div>
                <div className="text-xs bg-muted/50 p-2 rounded font-mono break-all">
                  {modalQr.url}
                </div>
                <div className="flex justify-between items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { navigator.clipboard.writeText(modalQr.url); toast.success('URL copiada'); }}
                  >
                    Copiar URL
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => regenerarToken(modalQr.id)}>
                    Regenerar token
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  <b>Como usar</b>: abre essa URL no tablet (escaneando o QR), aceita o pareamento, pronto. Daí pra frente os check-ins desse tablet vinculam à estação <b>{modalQr.nome}</b>.
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={modalAberto} onOpenChange={(o) => !o && setModalAberto(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editando?.id ? 'Editar estação' : 'Nova estação'}</DialogTitle></DialogHeader>
            {editando && (
              <div className="space-y-2">
                <Input placeholder="Nome (ex: Totem Recepção 1)" value={editando.nome} onChange={ev => setEditando({ ...editando, nome: ev.target.value })} />
                <Select value={editando.tipo} onValueChange={(v: any) => setEditando({ ...editando, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manned">Manned · voluntário opera o totem</SelectItem>
                    <SelectItem value="self">Self · PC touch (pai opera sem login)</SelectItem>
                    <SelectItem value="display">Display · TV de uma sala específica</SelectItem>
                    <SelectItem value="display_foyer">Display foyer · TV agregado de todas as salas</SelectItem>
                    <SelectItem value="roster">Roster · dentro da sala (futuro)</SelectItem>
                  </SelectContent>
                </Select>
                {/* Sala vinculada · só pra display/roster */}
                {(editando.tipo === 'display' || editando.tipo === 'roster') && (
                  <SeletorSala
                    salaId={editando.sala_id}
                    onChange={(id) => setEditando({ ...editando, sala_id: id })}
                  />
                )}
                {/* Impressora · só pra manned/self */}
                {(editando.tipo === 'manned' || editando.tipo === 'self') && (
                  <>
                    <Input placeholder="Modelo da impressora (ex: QL-820NWB)" value={editando.printer_modelo || ''} onChange={ev => setEditando({ ...editando, printer_modelo: ev.target.value })} />
                    <Input placeholder="IP da Brother na rede (informativo · ex: 192.168.10.50)" value={editando.printer_target || ''} onChange={ev => setEditando({ ...editando, printer_target: ev.target.value })} />
                    <p className="text-xs text-muted-foreground">
                      A impressão usa o browser. Configure a Brother como impressora padrão do Windows do totem.
                    </p>
                  </>
                )}
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

// ─── Seletor de sala (usado no modal de estação tipo display/roster) ─────────
function SeletorSala({ salaId, onChange }: { salaId: string | null; onChange: (id: string | null) => void }) {
  const [salas, setSalas] = useState<any[]>([]);
  useEffect(() => { totemKids.salas.list().then(setSalas); }, []);
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">Sala vinculada *</label>
      <Select value={salaId || ''} onValueChange={(v) => onChange(v || null)}>
        <SelectTrigger><SelectValue placeholder="Selecione a sala" /></SelectTrigger>
        <SelectContent>
          {salas.filter((s: any) => s.ativo).map((s: any) => (
            <SelectItem key={s.id} value={s.id}>
              <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ background: s.cor }} />
              {s.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Aba Crianças ────────────────────────────────────────────────────────────
function AbaCriancas() {
  const [criancas, setCriancas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [modalImport, setModalImport] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  async function carregar() {
    setCarregando(true);
    try { setCriancas(await totemKids.criancas.list()); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  async function sincronizarPco() {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const r: any = await totemKids.criancas.syncPco();
      toast.success(`Planning Center sincronizado · ${r.criadas} novas, ${r.atualizadas} atualizadas (${r.criancas_no_pco} crianças no PCO)`);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao sincronizar com o Planning Center');
    } finally {
      setSincronizando(false);
    }
  }

  const filtradas = busca.trim().length >= 2
    ? criancas.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()))
    : criancas;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2 items-center flex-wrap">
          <Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-xs" />
          <span className="text-sm text-muted-foreground">
            {filtradas.length} de {criancas.length}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={sincronizarPco} disabled={sincronizando}>
              {sincronizando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              {sincronizando ? 'Sincronizando…' : 'Sincronizar Planning Center'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setModalImport(true)}>
              <Upload className="h-4 w-4 mr-1" /> Importar XLSX
            </Button>
          </div>
        </div>
        <ImportarCriancasModal open={modalImport} onClose={() => setModalImport(false)} onImportado={carregar} />
        {carregando ? <Loader2 className="h-6 w-6 animate-spin text-pink-500 mx-auto my-6" /> : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filtradas.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3 border rounded-lg">
                {c.foto_url ? (
                  <img data-foto-avatar="" src={c.foto_url} alt="" className="h-10 w-10 rounded-full object-cover" />
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

// ─── Modal de Importação XLSX ────────────────────────────────────────────────
function ImportarCriancasModal({ open, onClose, onImportado }: { open: boolean; onClose: () => void; onImportado: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [resultado, setResultado] = useState<any>(null);

  useEffect(() => {
    if (open) {
      setArquivo(null); setPreview(null); setResultado(null);
    }
  }, [open]);

  async function executarPreview() {
    if (!arquivo) return;
    setAnalisando(true);
    setResultado(null);
    try {
      const r = await totemKids.criancas.importar(arquivo, { dryRun: true });
      setPreview(r);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao analisar planilha');
      setPreview({ erro: e?.message, faltando: e?.faltando, colunas_encontradas: e?.colunas_encontradas });
    } finally {
      setAnalisando(false);
    }
  }

  async function executarImport() {
    if (!arquivo) return;
    if (!confirm(`Confirma importar ${preview?.total || '?'} linhas? Não dá pra desfazer em lote.`)) return;
    setImportando(true);
    try {
      const r = await totemKids.criancas.importar(arquivo, { dryRun: false });
      setResultado(r);
      toast.success(`Import OK · ${r.criadas} criadas · ${r.atualizadas} atualizadas · ${r.erros} erros`);
      onImportado();
    } catch (e: any) {
      toast.error(e?.message || 'Erro no import');
    } finally {
      setImportando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar planilha de crianças
          </DialogTitle>
          <DialogDescription>
            Cadastro em massa a partir de XLSX/CSV · idempotente (não duplica) · faz match com
            <code>mem_membros</code> existentes por CPF/telefone do responsável.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-900 rounded-lg p-3 text-sm">
            <p className="font-semibold mb-1">Colunas esperadas:</p>
            <p className="text-xs text-muted-foreground">
              <b>Obrigatórias</b>: nome_crianca, responsavel_nome, responsavel_telefone<br />
              <b>Recomendadas</b>: data_nascimento, alergia, responsavel_cpf, responsavel_parentesco<br />
              <b>Opcionais</b>: sexo, observacoes, responsavel2_*, ultima_visita
            </p>
            <a
              href="/api/totem-kids/criancas/modelo-importacao"
              className="text-pink-700 dark:text-pink-300 hover:underline text-sm inline-flex items-center gap-1 mt-2"
              target="_blank" rel="noopener"
            >
              <Download className="h-3 w-3" /> Baixar modelo de planilha
            </a>
          </div>

          <div>
            <label className="text-sm font-medium block mb-2">Arquivo (.xlsx, .xls ou .csv)</label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={e => {
                setArquivo(e.target.files?.[0] || null);
                setPreview(null);
                setResultado(null);
              }}
            />
            {arquivo && (
              <p className="text-xs text-muted-foreground mt-1">
                {arquivo.name} · {(arquivo.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>

          {preview?.erro && (
            <div className="bg-red-100 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-lg p-3 text-sm">
              <p className="font-semibold text-red-900 dark:text-red-200 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> {preview.erro}
              </p>
              {preview.faltando && (
                <p className="mt-1">Faltando: <b>{preview.faltando.join(', ')}</b></p>
              )}
              {preview.colunas_encontradas && (
                <p className="text-xs mt-1">Colunas encontradas: {preview.colunas_encontradas.join(', ')}</p>
              )}
            </div>
          )}

          {preview && !preview.erro && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-lg p-3 text-sm space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Planilha válida · {preview.total} linhas
              </p>
              <p className="text-xs">Preview: {preview.preview} ok · {preview.erros} com erro</p>
              {preview.detalhes && preview.erros > 0 && (
                <details className="text-xs mt-2">
                  <summary className="cursor-pointer">Ver erros</summary>
                  <ul className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                    {preview.detalhes.filter((d: any) => d.status === 'erro').slice(0, 20).map((d: any, i: number) => (
                      <li key={i}>Linha {d.linha}: {d.msg}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {resultado && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-800 rounded-lg p-3 text-sm space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Importação concluída
              </p>
              <ul className="text-xs space-y-0.5">
                <li>✅ Criadas: <b>{resultado.criadas}</b></li>
                <li>🔄 Atualizadas: <b>{resultado.atualizadas}</b></li>
                <li>❌ Erros: <b>{resultado.erros}</b></li>
                <li>Total: {resultado.total}</li>
              </ul>
              {resultado.erros > 0 && (
                <details className="text-xs mt-2">
                  <summary className="cursor-pointer">Ver erros</summary>
                  <ul className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                    {resultado.detalhes.filter((d: any) => d.status === 'erro').slice(0, 20).map((d: any, i: number) => (
                      <li key={i}>Linha {d.linha}: {d.msg}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
            {!resultado && (
              <>
                <Button
                  variant="outline"
                  onClick={executarPreview}
                  disabled={!arquivo || analisando}
                >
                  {analisando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Analisar (preview)
                </Button>
                <Button
                  onClick={executarImport}
                  disabled={!arquivo || importando || (preview?.erro)}
                  className="bg-pink-600 hover:bg-pink-700"
                >
                  {importando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Importar
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
