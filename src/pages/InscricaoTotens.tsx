// Módulo de Inscrições · TOTENS (estações de autoatendimento) — Fase 0
//
// Substitui, no totem de inscrições, a conta de e-mail/senha por computador
// (20260703160000_totem_membro_kiosk.sql) por credencial de DISPOSITIVO,
// revogável individualmente. Ver = nível 1 · criar/parear/revogar = nível 4.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { inscricoesApi as api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, MonitorSmartphone, Plus, Loader2, Copy, ShieldOff, Wifi, WifiOff,
  KeyRound, CreditCard, Printer, TriangleAlert, RotateCcw, Check,
} from 'lucide-react';

type Credencial = {
  id: string; tipo: string; prefixo: string; rotulo?: string | null;
  expira_em?: string | null; pareado_em?: string | null; usado_em?: string | null;
  ultimo_uso_em?: string | null; revogado_em?: string | null; revogado_motivo?: string | null;
  created_at: string;
};
type Estacao = {
  id: string; codigo: string; nome: string; local?: string | null;
  finalidades: string[]; ativo: boolean; online: boolean;
  revogada_em?: string | null; revogada_motivo?: string | null;
  ultima_batida_em?: string | null; versao_app?: string | null;
  ip_permitidos?: string[] | null;
  tef_ativo: boolean; tef_provider?: string | null; tef_terminal_serie?: string | null;
  printer_target?: string | null;
  conta_id?: string | null;
  conta_email?: string | null;
  dispositivo: Credencial | null; agente: Credencial | null;
  pareamento_pendente: Credencial | null;
  historico: Credencial[];
};

function quando(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
  return d.toLocaleDateString('pt-BR');
}

export default function InscricaoTotens() {
  const navigate = useNavigate();
  const { getAccessLevel } = useAuth();
  const nivel = getAccessLevel(['inscricoes']);
  const podeGerenciar = nivel >= 4;

  const [carregando, setCarregando] = useState(true);
  const [estacoes, setEstacoes] = useState<Estacao[]>([]);
  const [novoAberto, setNovoAberto] = useState(false);
  const [codigoPareamento, setCodigoPareamento] = useState<{ codigo: string; expira_em: string; nome: string } | null>(null);
  const [vinculando, setVinculando] = useState<Estacao | null>(null);

  async function carregar() {
    try {
      const r = await api.totens();
      setEstacoes(r.estacoes || []);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar os totens');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  // O "online" depende de heartbeat recente; sem recarregar, a tela mentiria
  // sobre um totem que caiu 5 minutos depois de a página abrir.
  useEffect(() => {
    const t = setInterval(carregar, 30000);
    return () => clearInterval(t);
  }, []);

  async function parear(e: Estacao) {
    try {
      const r = await api.parearTotem(e.id);
      setCodigoPareamento({ codigo: r.codigo, expira_em: r.expira_em, nome: e.nome });
      carregar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar o código');
    }
  }

  async function revogarEstacao(e: Estacao) {
    const motivo = window.prompt(
      `Revogar "${e.nome}"?\n\nO dispositivo para de funcionar em até 1 minuto e volta pra tela de pareamento. As inscrições e os pagamentos que ele já registrou continuam intactos.\n\nMotivo (fica no registro de auditoria):`,
    );
    if (motivo === null) return;
    try {
      await api.revogarTotem(e.id, motivo);
      toast.success('Totem revogado');
      carregar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao revogar');
    }
  }

  async function reativar(e: Estacao) {
    try {
      await api.atualizarTotem(e.id, { ativo: true });
      toast.success('Totem reativado — gere um código novo pra parear o dispositivo.');
      carregar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao reativar');
    }
  }


  const semCerco = useMemo(
    () => estacoes.filter((e) => e.ativo && !e.revogada_em && (!e.ip_permitidos || e.ip_permitidos.length === 0)),
    [estacoes],
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/inscricoes')} aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Totens</h1>
          <p className="text-sm text-muted-foreground">
            Cada computador do lounge é uma estação. É o vínculo com a conta de quiosque que faz o sistema saber <strong>qual totem</strong> registrou cada inscrição e cada pagamento.
          </p>
        </div>
        {podeGerenciar && (
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo totem
          </Button>
        )}
      </div>

      {/* Aviso sobre o cerco de IP: é a mitigação mais eficaz contra credencial
          copiada, e ficar sem ela é decisão, não esquecimento. */}
      {semCerco.length > 0 && (
        <Card className="mb-4 border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="text-sm">
              <p className="font-medium">
                {semCerco.length === 1 ? '1 totem sem cerco de rede' : `${semCerco.length} totens sem cerco de rede`}
              </p>
              <p className="text-muted-foreground">
                Sem <span className="font-medium">IPs permitidos</span>, a credencial copiada desse totem funciona de qualquer lugar da internet.
                Com o IP da igreja preenchido, ela só funciona aqui dentro. Deixe vazio só se o totem for usado fora da sede.
              </p>
            </div>
          </div>
        </Card>
      )}

      {carregando ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : estacoes.length === 0 ? (
        <Card className="p-10 text-center">
          <MonitorSmartphone className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium">Nenhum totem cadastrado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre o computador, gere o código de pareamento e digite esse código no próprio totem.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {estacoes.map((e) => {
            const revogada = !e.ativo || !!e.revogada_em;
            return (
              <Card key={e.id} className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{e.nome}</span>
                      <code className="rounded bg-foreground/5 px-1.5 py-0.5 text-xs">{e.codigo}</code>
                      {revogada ? (
                        <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600">revogado</span>
                      ) : e.online ? (
                        <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600">
                          <Wifi className="h-3 w-3" /> online
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded bg-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">
                          <WifiOff className="h-3 w-3" /> {e.ultima_batida_em ? `visto ${quando(e.ultima_batida_em)}` : 'nunca usado'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[e.local, e.finalidades?.join(' · ')].filter(Boolean).join(' — ') || 'sem local definido'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <KeyRound className="h-3.5 w-3.5" />
                        {e.conta_email ? `conta ${e.conta_email}` : 'sem conta vinculada'}
                      </span>
                      <span className="flex items-center gap-1">
                        <CreditCard className="h-3.5 w-3.5" />
                        {e.tef_ativo ? `pinpad ${e.tef_provider || ''} ${e.tef_terminal_serie || ''}`.trim() : 'sem pinpad'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Printer className="h-3.5 w-3.5" />
                        {e.printer_target ? 'com impressora' : 'sem impressora'}
                      </span>
                      <span>
                        {e.ip_permitidos?.length ? `rede: ${e.ip_permitidos.join(', ')}` : 'rede: qualquer'}
                      </span>
                    </div>
                    {revogada && e.revogada_motivo && (
                      <p className="mt-2 text-xs text-red-600">Motivo: {e.revogada_motivo}</p>
                    )}
                  </div>

                  {podeGerenciar && (
                    <div className="flex flex-wrap gap-2">
                      {revogada ? (
                        <Button size="sm" variant="outline" onClick={() => reativar(e)}>
                          <RotateCcw className="mr-2 h-4 w-4" /> Reativar
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setVinculando(e)}>
                            <KeyRound className="mr-2 h-4 w-4" />
                            {e.conta_id ? 'Trocar conta' : 'Vincular conta'}
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => revogarEstacao(e)}>
                            <ShieldOff className="mr-2 h-4 w-4" /> Revogar totem
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {!e.conta_id && !revogada && (
                  <p className="mt-3 rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    Sem conta vinculada, este totem não aparece como origem das inscrições que fizer — a cobrança nasce sem estação, como se viesse da web.
                  </p>
                )}

                {/* Código do agente do pinpad: só faz sentido quando o cartão
                    presencial existir (Fase 3). Fica escondido até lá pra não
                    oferecer um botão cujo resultado ninguém tem onde usar. */}
                {e.tef_ativo && !revogada && (
                  <div className="mt-3 flex items-center gap-2 rounded bg-foreground/5 px-3 py-2 text-xs">
                    <CreditCard className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1">
                      Agente do pinpad: {e.agente ? `credencial ${e.agente.prefixo}…` : 'sem credencial'}
                      {e.pareamento_pendente && ` · código gerado, válido até ${new Date(e.pareamento_pendente.expira_em!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => parear(e)}>Gerar código</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {codigoPareamento && (
        <CodigoDialog dados={codigoPareamento} onClose={() => setCodigoPareamento(null)} />
      )}
      {vinculando && (
        <VincularContaDialog
          estacao={vinculando}
          onClose={() => setVinculando(null)}
          onSalvo={() => { setVinculando(null); carregar(); }}
        />
      )}
      {novoAberto && (
        <NovoTotemDialog
          onClose={() => setNovoAberto(false)}
          onCriado={() => { setNovoAberto(false); carregar(); }}
        />
      )}
    </div>
  );
}

// ⚠️ O código existe SÓ nesta tela e SÓ agora: o servidor guarda apenas o hash.
// Por isso o diálogo é explícito sobre não ser recuperável — e gerar outro é o
// caminho normal, não um erro.
function CodigoDialog({ dados, onClose }: { dados: { codigo: string; expira_em: string; nome: string }; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const hora = new Date(dados.expira_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  async function copiar() {
    try {
      await navigator.clipboard.writeText(dados.codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error('Não foi possível copiar — digite o código manualmente.');
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Agente do pinpad · {dados.nome}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          No <strong>agente do pinpad</strong> instalado neste PC, informe este código:
        </p>
        <div className="my-2 rounded-lg border border-dashed p-6 text-center">
          <div className="select-all font-mono text-4xl font-bold tracking-[0.2em]">{dados.codigo}</div>
        </div>
        <Button variant="outline" onClick={copiar}>
          {copiado ? <><Check className="mr-2 h-4 w-4" /> Copiado</> : <><Copy className="mr-2 h-4 w-4" /> Copiar código</>}
        </Button>
        <p className="text-xs text-muted-foreground">
          Vale até <strong>{hora}</strong> e serve <strong>uma única vez</strong>. Ele não pode ser consultado depois — se perder, gere outro (o anterior é cancelado automaticamente).
        </p>
      </DialogContent>
    </Dialog>
  );
}

function NovoTotemDialog({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const [form, setForm] = useState({ nome: '', codigo: '', local: '', ip_permitidos: '' });
  const [salvando, setSalvando] = useState(false);

  // Sugere o código a partir do nome, mas deixa editável: ele aparece no
  // comprovante impresso e na tela de erro ("chame um voluntário · hall-01").
  function mudarNome(nome: string) {
    setForm((f) => ({
      ...f,
      nome,
      codigo: f.codigo || nome.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30),
    }));
  }

  async function salvar() {
    setSalvando(true);
    try {
      await api.criarTotem({
        nome: form.nome.trim(),
        codigo: form.codigo.trim(),
        local: form.local.trim() || undefined,
        ip_permitidos: form.ip_permitidos.trim() || undefined,
      });
      toast.success('Totem cadastrado — agora gere o código de pareamento.');
      onCriado();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cadastrar');
    } finally {
      setSalvando(false);
    }
  }

  const valido = form.nome.trim().length >= 3 && /^[a-z0-9][a-z0-9-]{1,30}$/.test(form.codigo.trim());

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
        <DialogHeader><DialogTitle>Novo totem</DialogTitle></DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div>
            <Label className="block">Nome *</Label>
            <Input value={form.nome} onChange={(e) => mudarNome(e.target.value)} placeholder="Totem do Hall" />
          </div>
          <div>
            <Label className="block">Código *</Label>
            <Input
              value={form.codigo}
              onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toLowerCase() }))}
              placeholder="hall-01"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Curto e legível de longe: aparece no comprovante e é o que a pessoa fala ao chamar um voluntário.
            </p>
          </div>
          <div>
            <Label className="block">Onde fica</Label>
            <Input value={form.local} onChange={(e) => setForm((f) => ({ ...f, local: e.target.value }))} placeholder="Hall, ao lado do café" />
          </div>
          <div>
            <Label className="block">IPs permitidos</Label>
            <Input
              value={form.ip_permitidos}
              onChange={(e) => setForm((f) => ({ ...f, ip_permitidos: e.target.value }))}
              placeholder="191.0.2.10 ou 191.0.2.0/24"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Recomendado: o IP da igreja. Assim a credencial deste totem não funciona fora daqui, mesmo se alguém copiá-la. Vazio = funciona de qualquer rede.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={!valido || salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Cadastrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Vincular a conta de quiosque à estação. É este vínculo que faz o servidor
// resolver `estacao_id` a partir do usuário logado no Totem Membro — sem ele o
// totem funciona, mas as inscrições dele nascem sem origem.
function VincularContaDialog({
  estacao, onClose, onSalvo,
}: { estacao: Estacao; onClose: () => void; onSalvo: () => void }) {
  const [contas, setContas] = useState<{ id: string; email: string; nome?: string; em_uso_por: string | null }[]>([]);
  const [sel, setSel] = useState<string>(estacao.conta_id || '');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.totensContas()
      .then((r: any) => setContas(r.contas || []))
      .catch((e: any) => toast.error(e.message || 'Erro ao carregar as contas'))
      .finally(() => setCarregando(false));
  }, []);

  async function salvar() {
    setSalvando(true);
    try {
      await api.atualizarTotem(estacao.id, { conta_id: sel || null });
      toast.success(sel ? 'Conta vinculada' : 'Conta desvinculada');
      onSalvo();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao vincular');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
        <DialogHeader><DialogTitle>Conta de {estacao.nome}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Escolha a conta de quiosque com que <strong>este computador</strong> faz login no totem. É por ela que o sistema reconhece a origem das inscrições e dos pagamentos.
        </p>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto py-2">
          {carregando ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : contas.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Nenhuma conta de quiosque encontrada. Elas são criadas por <code className="rounded bg-foreground/5 px-1">backend/scripts/_criar_conta_totem.js</code>.
            </p>
          ) : (
            <>
              <button
                onClick={() => setSel('')}
                className={`w-full rounded-lg border p-3 text-left text-sm ${!sel ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <span className="font-medium">Nenhuma</span>
                <span className="block text-xs text-muted-foreground">O totem funciona, mas as inscrições dele não terão origem registrada.</span>
              </button>
              {contas.map((c) => {
                // Conta já usada por OUTRA estação: o índice único no banco
                // recusaria, então a tela avisa antes em vez de deixar a pessoa
                // levar um erro que não explica nada.
                const ocupada = !!c.em_uso_por && c.id !== estacao.conta_id;
                return (
                  <button
                    key={c.id}
                    disabled={ocupada}
                    onClick={() => setSel(c.id)}
                    className={`w-full rounded-lg border p-3 text-left text-sm ${
                      sel === c.id ? 'border-primary bg-primary/5' : 'border-border'
                    } ${ocupada ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <span className="font-medium">{c.email}</span>
                    <span className="block text-xs text-muted-foreground">
                      {ocupada ? `já é o totem "${c.em_uso_por}"` : (c.nome || 'conta de quiosque')}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || carregando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
