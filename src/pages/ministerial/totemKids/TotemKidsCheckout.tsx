// ============================================================================
// Totem Kids · Tela de Checkout (pickup)
// ============================================================================
// Mãe entrega a etiqueta · voluntário digita ou escaneia o código de 4 chars
// · sistema mostra a criança · voluntário trás da sala · confirma.
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Baby, ShieldAlert, ArrowLeft, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { totemKids } from '@/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { KidsZoneShell, KidsZoneRelogio, KidsZoneToggle } from './KidsZoneShell';

type CheckinData = {
  id: string;
  codigo_seguranca: string;
  checkin_at: string;
  responsavel_checkin_nome: string;
  responsavel_checkin_telefone: string | null;
  observacoes_no_dia: string | null;
  fez_decisao_jesus: boolean;
  crianca: { id: string; nome: string; foto_url: string | null; observacoes_medicas: string | null };
  sala: { id: string; nome: string; cor: string };
  sessao: { id: string; status: string; culto: { id: string; nome: string; data: string } | null };
  responsaveis: Array<{
    id: string;
    parentesco: string | null;
    autorizado_buscar: boolean;
    membro: { id: string; nome: string; telefone: string | null; foto_url: string | null } | null;
  }>;
};

export default function TotemKidsCheckout({ embutido = false }: { embutido?: boolean } = {}) {
  const navigate = useNavigate();
  const { profile, isAdmin } = useAuth();
  const [codigoInput, setCodigoInput] = useState('');
  // 3 jeitos de achar a criança (Marcos 2026-07-27): código da etiqueta
  // (padrão), NOME da criança e número do PAGER — pra quando a etiqueta some.
  const [modoBusca, setModoBusca] = useState<'codigo' | 'nome' | 'pager'>('codigo');
  const [buscaAberta, setBuscaAberta] = useState('');
  const [resultadosAbertos, setResultadosAbertos] = useState<any[]>([]);
  const [buscandoAbertos, setBuscandoAbertos] = useState(false);
  const [buscouAbertos, setBuscouAbertos] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [checkin, setCheckin] = useState<CheckinData | null>(null);
  const [responsavelPickup, setResponsavelPickup] = useState<string>('');
  const [confirmandoCheckout, setConfirmandoCheckout] = useState(false);
  const [modalOverride, setModalOverride] = useState(false);
  const [overrideMotivo, setOverrideMotivo] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [checkin]);

  async function buscarCodigo() {
    const c = codigoInput.toUpperCase().trim();
    if (c.length !== 4) {
      toast.error('Código tem 4 caracteres');
      return;
    }
    setCarregando(true);
    try {
      const data = await totemKids.checkin.porCodigo(c);
      setCheckin(data);
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err?.status === 404) {
        toast.error('Código não encontrado ou já foi feito checkout');
      } else {
        toast.error(err?.message || 'Erro');
      }
    } finally {
      setCarregando(false);
    }
  }

  function reset() {
    setCheckin(null);
    setCodigoInput('');
    setResponsavelPickup('');
    setBuscaAberta('');
    setResultadosAbertos([]);
    setBuscouAbertos(false);
  }

  // Busca check-ins ABERTOS por nome da criança ou nº do pager (debounce) —
  // o clique num resultado entra no MESMO fluxo do código (porCodigo).
  useEffect(() => {
    if (modoBusca === 'codigo') return;
    const q = buscaAberta.trim();
    const pager = q.replace(/\D/g, '');
    if (modoBusca === 'pager' ? !pager : q.length < 2) {
      setResultadosAbertos([]);
      setBuscouAbertos(false);
      return;
    }
    setBuscandoAbertos(true);
    const t = setTimeout(() => {
      totemKids.checkin.abertosBuscar(modoBusca === 'pager' ? { pager } : { nome: q })
        .then((data: any[]) => { setResultadosAbertos(Array.isArray(data) ? data : []); setBuscouAbertos(true); })
        .catch(() => toast.error('Erro ao buscar check-ins abertos'))
        .finally(() => setBuscandoAbertos(false));
    }, 300);
    return () => clearTimeout(t);
  }, [buscaAberta, modoBusca]);

  async function abrirCheckinAberto(codigo: string) {
    setCarregando(true);
    try {
      const data = await totemKids.checkin.porCodigo(codigo);
      setCheckin(data);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao abrir o check-in');
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarCheckout(
    metodo: 'codigo_digitado' | 'responsavel_autorizado',
    responsavelId?: string,
  ) {
    if (!checkin) return;
    const pickupId = responsavelId || responsavelPickup;
    if (metodo === 'responsavel_autorizado' && !pickupId) {
      toast.error('Selecione qual responsável está buscando');
      return;
    }
    setConfirmandoCheckout(true);
    try {
      const payload: Record<string, unknown> = { checkin_id: checkin.id, metodo };
      if (metodo === 'responsavel_autorizado') {
        const r = checkin.responsaveis.find(x => x.membro?.id === pickupId);
        payload.responsavel_id = pickupId;
        payload.responsavel_nome = r?.membro?.nome;
      } else {
        // codigo_digitado · usa o nome do responsável do checkin
        payload.responsavel_id = null;
        payload.responsavel_nome = checkin.responsavel_checkin_nome;
        payload.codigo_seguranca = checkin.codigo_seguranca;
      }
      await totemKids.checkout.realizar(payload);
      toast.success(`${checkin.crianca.nome} saiu · obrigado!`);
      reset();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro no checkout');
    } finally {
      setConfirmandoCheckout(false);
    }
  }

  async function confirmarOverride() {
    if (!checkin || !overrideMotivo.trim() || overrideMotivo.trim().length < 10) {
      toast.error('Motivo precisa ter pelo menos 10 caracteres');
      return;
    }
    setConfirmandoCheckout(true);
    try {
      await totemKids.checkout.realizar({
        checkin_id: checkin.id,
        metodo: 'override_supervisor',
        responsavel_nome: `[OVERRIDE por ${profile?.name || 'staff'}]`,
        override_motivo: overrideMotivo.trim(),
      });
      toast.success('Checkout com override registrado · auditoria salva');
      setModalOverride(false);
      setOverrideMotivo('');
      reset();
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err?.status === 403) {
        toast.error('Sem permissão pra aprovar override · chame coord ou admin');
      } else {
        toast.error(err?.message || 'Erro');
      }
    } finally {
      setConfirmandoCheckout(false);
    }
  }

  // Embutido no totem de check-in: sem moldura/barra próprios (o pai já provê o
  // KidsZoneShell + a barra com o toggle) → alterna check-in/out sem recarregar.
  const Wrapper: any = embutido ? 'div' : KidsZoneShell;
  return (
    <Wrapper>
      {!embutido && (
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 mb-6 border-b border-dashed border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-2xl shadow-lg shadow-pink-500/30">🧸</div>
          <div>
            <p className="text-lg font-black leading-none">Totem Kids</p>
            <p className="text-xs font-medium text-slate-400 tracking-wide">Check-out · entrega das crianças</p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <KidsZoneRelogio />
          <KidsZoneToggle ativo="checkout" onCheckin={() => navigate('/ministerial/totem-kids')} />
        </div>
      </div>
      )}

      {!checkin ? (
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Hora do check-out! 🎒</h1>
            <p className="text-slate-500 mt-2 text-sm sm:text-base">
              {modoBusca === 'codigo' && 'Digite o código de segurança da etiqueta do responsável.'}
              {modoBusca === 'nome' && 'Perdeu a etiqueta? Busque pelo nome da criança.'}
              {modoBusca === 'pager' && 'Digite o número do pager que a família está segurando.'}
            </p>
          </div>

          {/* Como buscar? Código (padrão) · Nome · Pager */}
          <div className="max-w-xl mx-auto grid grid-cols-3 gap-2">
            {([
              { key: 'codigo', rotulo: '🔑 Código', dica: 'da etiqueta' },
              { key: 'nome', rotulo: '🧒 Nome', dica: 'da criança' },
              { key: 'pager', rotulo: '📟 Pager', dica: 'da família' },
            ] as const).map(m => (
              <button
                key={m.key}
                type="button"
                onClick={() => { setModoBusca(m.key); setBuscaAberta(''); setResultadosAbertos([]); setBuscouAbertos(false); }}
                className={`rounded-xl border-2 px-3 py-2.5 text-center transition ${
                  modoBusca === m.key
                    ? 'border-cyan-400 bg-cyan-50 dark:bg-cyan-950/30 font-bold text-cyan-800 dark:text-cyan-200'
                    : 'border-slate-200 bg-white/60 text-slate-500 hover:border-cyan-200'
                }`}
              >
                <div className="text-sm sm:text-base">{m.rotulo}</div>
                <div className="text-[10px] text-slate-400">{m.dica}</div>
              </button>
            ))}
          </div>

          {modoBusca === 'codigo' ? (
            <div className="max-w-xl mx-auto rounded-2xl border-2 border-slate-100 bg-slate-50/70 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center text-base">🔑</span>
                <h2 className="font-bold text-slate-700 text-sm sm:text-base">Código de segurança</h2>
              </div>
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  placeholder="ABC1"
                  value={codigoInput}
                  onChange={e => setCodigoInput(e.target.value.toUpperCase().slice(0, 4))}
                  onKeyDown={e => { if (e.key === 'Enter') buscarCodigo(); }}
                  className="h-16 text-3xl font-black font-mono tracking-[0.4em] text-center rounded-xl border-2 border-slate-200 bg-white text-slate-700"
                  maxLength={4}
                  autoFocus
                />
                <Button onClick={buscarCodigo} disabled={carregando || codigoInput.length !== 4} size="lg" className="h-16 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:opacity-90 text-white font-bold">
                  {carregando ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Search className="h-5 w-5 mr-1" /> Buscar</>}
                </Button>
              </div>
              <p className="text-xs text-slate-400 text-center">
                Pode escanear o código de barras com leitor USB (vai aparecer no campo acima)
              </p>
            </div>
          ) : (
            <div className="max-w-xl mx-auto rounded-2xl border-2 border-slate-100 bg-slate-50/70 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center text-base">
                  {modoBusca === 'nome' ? '🧒' : '📟'}
                </span>
                <h2 className="font-bold text-slate-700 text-sm sm:text-base">
                  {modoBusca === 'nome' ? 'Nome da criança' : 'Número do pager'}
                </h2>
              </div>
              <Input
                autoFocus
                inputMode={modoBusca === 'pager' ? 'numeric' : 'text'}
                placeholder={modoBusca === 'nome' ? 'ex.: Maitê' : 'ex.: 12'}
                value={buscaAberta}
                onChange={e => setBuscaAberta(modoBusca === 'pager' ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value)}
                className={`h-14 rounded-xl border-2 border-slate-200 bg-white text-slate-700 ${modoBusca === 'pager' ? 'text-2xl text-center font-bold tracking-widest' : 'text-lg'}`}
              />
              {buscandoAbertos && (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-400 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                </div>
              )}
              {!buscandoAbertos && buscouAbertos && resultadosAbertos.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-2">
                  Nenhuma criança com check-in aberto encontrada.
                </p>
              )}
              <div className="space-y-2 max-h-[340px] overflow-y-auto">
                {resultadosAbertos.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => abrirCheckinAberto(r.codigo_seguranca)}
                    disabled={carregando}
                    className="w-full text-left flex items-center gap-3 p-3 rounded-xl border-2 border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/50 transition"
                  >
                    {r.crianca?.foto_url ? (
                      <img src={r.crianca.foto_url} alt="" className="h-11 w-11 rounded-full object-cover" />
                    ) : (
                      <div className="h-11 w-11 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center">
                        <Baby className="h-5 w-5 text-pink-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{r.crianca?.nome}</div>
                      <div className="text-xs text-slate-400 truncate">
                        Entrou às {format(new Date(r.checkin_at), 'HH:mm')}
                        {r.responsavel_checkin_nome ? ` · com ${r.responsavel_checkin_nome}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {r.pager_numero && (
                        <span className="inline-flex items-center justify-center min-w-[2rem] h-6 px-1.5 rounded-md bg-amber-500 text-white text-xs font-mono font-bold">
                          {r.pager_numero}
                        </span>
                      )}
                      {r.sala?.nome && (
                        <Badge style={{ background: r.sala.cor || '#EC4899' }} className="text-white">{r.sala.nome}</Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="flex items-start gap-4">
              {checkin.crianca.foto_url ? (
                <img src={checkin.crianca.foto_url} alt="" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <div className="h-20 w-20 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center">
                  <Baby className="h-10 w-10 text-pink-500" />
                </div>
              )}
              <div className="flex-1">
                <h2 className="text-2xl font-bold">{checkin.crianca.nome}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge style={{ background: checkin.sala.cor }} className="text-white">{checkin.sala.nome}</Badge>
                  <span className="text-sm text-muted-foreground">
                    Entrou às {format(new Date(checkin.checkin_at), 'HH:mm')}
                  </span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Novo
              </Button>
            </div>

            {checkin.crianca.observacoes_medicas && (
              <div className="bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 rounded-lg p-3 flex gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div className="text-sm">{checkin.crianca.observacoes_medicas}</div>
              </div>
            )}

            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Entregue por</div>
              <div className="font-medium">{checkin.responsavel_checkin_nome}</div>
              {checkin.responsavel_checkin_telefone && (
                <div className="text-sm text-muted-foreground">{checkin.responsavel_checkin_telefone}</div>
              )}
            </div>

            <div>
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 mb-3">
                <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">Último passo pra liberar a saída</div>
                <div className="text-sm text-blue-800 dark:text-blue-200 mt-0.5">
                  Confira a criança acima e <b>toque em quem veio buscar</b> — isso confirma o check-out e libera a saída.
                </div>
              </div>
              <div className="text-sm font-medium mb-2">Quem veio buscar a criança?</div>
              <div className="space-y-2">
                {/* Atalho: mesma pessoa que entregou */}
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-3"
                  onClick={() => confirmarCheckout('codigo_digitado')}
                  disabled={confirmandoCheckout}
                >
                  <CheckCircle2 className="h-5 w-5 mr-2 text-green-600" />
                  <span>Mesma pessoa que entregou (<b>{checkin.responsavel_checkin_nome}</b>)</span>
                </Button>

                {/* Outros responsáveis autorizados */}
                {checkin.responsaveis
                  .filter(r => r.autorizado_buscar && r.membro?.nome !== checkin.responsavel_checkin_nome)
                  .map(r => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setResponsavelPickup(r.membro!.id);
                        // Não depende do setState (assíncrono): envia o id tocado
                        // diretamente e evita a falha no primeiro toque.
                        confirmarCheckout('responsavel_autorizado', r.membro!.id);
                      }}
                      disabled={confirmandoCheckout}
                      className="w-full text-left flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition"
                    >
                      {r.membro?.foto_url ? (
                        <img src={r.membro.foto_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-muted-foreground/20 flex items-center justify-center text-sm font-medium">
                          {(r.membro?.nome || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="font-medium">{r.membro?.nome}</div>
                        <div className="text-xs text-muted-foreground">{r.parentesco}</div>
                      </div>
                    </button>
                  ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-amber-700 dark:text-amber-400"
                onClick={() => setModalOverride(true)}
              >
                <ShieldAlert className="h-4 w-4 mr-1" /> Outra pessoa (precisa override)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={modalOverride} onOpenChange={(o) => !o && setModalOverride(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <ShieldAlert className="h-5 w-5" /> Override de segurança
            </DialogTitle>
            <DialogDescription>
              Use só em emergência. Vai ficar registrado em auditoria com seu nome e motivo.
              Precisa ser coord-kids, admin ou líder Kids do dia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Motivo (obrigatório, mín 10 caracteres). Ex: 'Mãe pediu pelo WhatsApp, tia Cláudia vem buscar. Conferi a identidade'"
              value={overrideMotivo}
              onChange={e => setOverrideMotivo(e.target.value)}
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalOverride(false)}>Cancelar</Button>
              <Button onClick={confirmarOverride} disabled={confirmandoCheckout || overrideMotivo.trim().length < 10} className="bg-amber-600 hover:bg-amber-700">
                {confirmandoCheckout ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-2" />}
                Aprovar override
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Wrapper>
  );
}
