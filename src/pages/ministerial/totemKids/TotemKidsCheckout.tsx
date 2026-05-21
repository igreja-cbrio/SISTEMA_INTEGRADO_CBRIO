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

export default function TotemKidsCheckout() {
  const navigate = useNavigate();
  const { profile, isAdmin } = useAuth();
  const [codigoInput, setCodigoInput] = useState('');
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
  }

  async function confirmarCheckout(metodo: 'codigo_digitado' | 'responsavel_autorizado') {
    if (!checkin) return;
    if (metodo === 'responsavel_autorizado' && !responsavelPickup) {
      toast.error('Selecione qual responsável está buscando');
      return;
    }
    setConfirmandoCheckout(true);
    try {
      const payload: Record<string, unknown> = { checkin_id: checkin.id, metodo };
      if (metodo === 'responsavel_autorizado') {
        const r = checkin.responsaveis.find(x => x.membro?.id === responsavelPickup);
        payload.responsavel_id = responsavelPickup;
        payload.responsavel_nome = r?.membro?.nome;
      } else {
        // codigo_digitado · usa o nome do responsavel do checkin
        payload.responsavel_id = null;
        payload.responsavel_nome = checkin.responsavel_checkin_nome;
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

  return (
    <div className="max-w-2xl mx-auto p-3 md:p-4 space-y-3 md:space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-pink-700 dark:text-pink-300">Totem Kids · Checkout</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Digite o código da etiqueta do responsável</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids')} className="self-start md:self-auto">
          <ArrowLeft className="h-4 w-4 mr-1" /> Check-in
        </Button>
      </div>

      {!checkin ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2">Código de segurança</label>
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  placeholder="ABC1"
                  value={codigoInput}
                  onChange={e => setCodigoInput(e.target.value.toUpperCase().slice(0, 4))}
                  onKeyDown={e => { if (e.key === 'Enter') buscarCodigo(); }}
                  className="h-16 text-3xl font-mono tracking-widest text-center"
                  maxLength={4}
                  autoFocus
                />
                <Button onClick={buscarCodigo} disabled={carregando || codigoInput.length !== 4} size="lg" className="h-16 bg-pink-600 hover:bg-pink-700">
                  {carregando ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Search className="h-5 w-5 mr-1" /> Buscar</>}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Pode escanear o código de barras com leitor USB (vai aparecer no campo acima)
              </p>
            </div>
          </CardContent>
        </Card>
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
              <div className="text-sm font-medium mb-2">Quem está buscando?</div>
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
                        confirmarCheckout('responsavel_autorizado');
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
    </div>
  );
}
