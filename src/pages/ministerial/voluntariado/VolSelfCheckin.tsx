import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useHomeScreenMeta } from '@/hooks/useHomeScreenMeta';
import { voluntariado, publicVoluntariado } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckCircle2, XCircle, Loader2, ArrowLeft, MailCheck, UserPlus, IdCard, AlertTriangle, Wallet, Sun,
} from 'lucide-react';
import { playCheckinSound } from '@/lib/sounds';
import MemberWalletDialog from '@/components/membresia/MemberWalletDialog';

type State =
  | 'loading'      // avaliando sessão / carregando perfil
  | 'checking'     // fazendo checkin do usuário logado
  | 'success'      // checkin ok
  | 'already'      // já tinha checkin
  | 'error'
  | 'cpf'          // pedindo CPF (usuário não autenticado)
  | 'register'     // cadastro completo (CPF não existe em lugar nenhum)
  | 'sent';        // magic link enviado

// Formata CPF enquanto digita (000.000.000-00)
function formatCpf(v: string) {
  const d = v.replace(/\D+/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export default function VolSelfCheckin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  useHomeScreenMeta('checkin');
  const serviceId = searchParams.get('serviceId');

  const [state, setState] = useState<State>('loading');
  const [serviceName, setServiceName] = useState('');
  const [resultName, setResultName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [wasUnscheduled, setWasUnscheduled] = useState(false);

  // Fluxo não autenticado
  const [cpf, setCpf] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);

  // Cultos da manhã (domingo · 08:30/10:00/11:30): após o self check-in num
  // culto de domingo de manhã, pergunta em quais cultos da manhã vai servir.
  // Reusa o mesmo backend da tela de check-in (cultos-manha + check-ins/manha).
  const { data: cultosManha = [] } = useQuery<{ id: string; name: string; recurrence_time: string }[]>({
    queryKey: ['vol', 'cultos-manha'],
    queryFn: () => voluntariado.cultosManha(),
    staleTime: 60 * 60 * 1000,
  });
  const [manhaDialog, setManhaDialog] = useState<{ volunteerId: string; serviceDate: string } | null>(null);
  const [selCultos, setSelCultos] = useState<Set<string>>(new Set());
  const [salvandoManha, setSalvandoManha] = useState(false);
  const [manhaCriados, setManhaCriados] = useState(0);

  // Decide se o culto do check-in é domingo de manhã e, se for, abre o diálogo
  // dos cultos da manhã (todos pré-marcados). Usa o serviço de hoje pra pegar a
  // data/dia exatos (não o relógio do aparelho).
  const maybeOfferManha = async (svcId: string, volId: string) => {
    if (cultosManha.length <= 1) return;
    try {
      const janela = (await voluntariado.services.checkinWindow()) as any[];
      const svc = (janela || []).find(s => s.id === svcId);
      if (!svc) return;
      const wd = new Date(svc.scheduled_at).toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
      const h = Number(new Date(svc.scheduled_at).toLocaleString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).slice(0, 2));
      if (wd !== 'Sun' || h >= 14) return;
      const serviceDate = new Date(svc.scheduled_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      setSelCultos(new Set(cultosManha.map(c => c.id)));
      setManhaDialog({ volunteerId: volId, serviceDate });
    } catch { /* sem cultos da manhã · segue só com o culto atual */ }
  };

  const confirmarManha = async () => {
    if (!manhaDialog) return;
    const ids = cultosManha.filter(c => selCultos.has(c.id)).map(c => c.id);
    if (!ids.length) return;
    setSalvandoManha(true);
    try {
      const r: any = await voluntariado.checkIns.manha({
        volunteer_id: manhaDialog.volunteerId,
        service_date: manhaDialog.serviceDate,
        service_type_ids: ids,
        method: 'self_service',
      });
      setManhaCriados(typeof r?.criados === 'number' ? r.criados : ids.length);
    } catch { /* idempotente · segue */ }
    finally { setSalvandoManha(false); setManhaDialog(null); }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!serviceId) {
      setErrorMsg('Link invalido (sem serviceId). Escaneie novamente o QR do totem.');
      setState('error');
      return;
    }
    if (user) {
      doCheckin();
    } else {
      setState('cpf');
    }
  }, [serviceId, user, authLoading]);

  const doCheckin = async () => {
    if (!serviceId) return;
    setState('checking');

    try {
      const { profile } = await voluntariado.me.get();
      if (!profile) {
        setErrorMsg('Perfil de voluntário não encontrado. Complete seu cadastro primeiro.');
        setState('error');
        return;
      }

      setResultName(profile.full_name);

      if (profile.qr_code) {
        try {
          const lookup = await voluntariado.qrLookup(profile.qr_code);
          setServiceName(lookup.schedule?.service?.name || 'Culto');

          if (lookup.schedule) {
            try {
              const r = await voluntariado.checkIns.create({
                schedule_id: lookup.schedule.id,
                volunteer_id: profile.id,
                service_id: serviceId,
                method: 'self_service',
              });
              setWasUnscheduled(!!r?.isUnscheduled);
              playCheckinSound();
              void maybeOfferManha(serviceId, profile.id);
              setState('success');
              return;
            } catch (ciErr: any) {
              if (ciErr.alreadyCheckedIn || ciErr.status === 409) {
                setState('already');
                return;
              }
              throw ciErr;
            }
          }
        } catch (lookupErr: any) {
          if (lookupErr.alreadyCheckedIn || lookupErr.status === 409) {
            setState('already');
            return;
          }
        }
      }

      try {
        await voluntariado.checkIns.create({
          volunteer_id: profile.id,
          service_id: serviceId,
          method: 'self_service',
          is_unscheduled: true,
        });
        setWasUnscheduled(true);
        playCheckinSound();
        void maybeOfferManha(serviceId, profile.id);
        setState('success');
      } catch (ciErr: any) {
        if (ciErr.alreadyCheckedIn || ciErr.status === 409) {
          setState('already');
        } else {
          throw ciErr;
        }
      }
    } catch (err: any) {
      if (err.alreadyCheckedIn || err.status === 409) {
        setState('already');
      } else {
        setErrorMsg(err.message || 'Erro no check-in');
        setState('error');
      }
    }
  };

  const handleCpfSubmit = async () => {
    const clean = cpf.replace(/\D+/g, '');
    if (clean.length !== 11) {
      setErrorMsg('Digite um CPF valido (11 digitos).');
      return;
    }
    setErrorMsg('');
    setBusy(true);
    try {
      const lookup = await publicVoluntariado.lookupCpf(clean);
      if (!lookup.found) {
        // Não achou em nenhum cadastro — pedir dados completos
        setState('register');
        setBusy(false);
        return;
      }
      if (!lookup.hasEmail) {
        setErrorMsg('Seu cadastro não tem email. Procure um líder para atualizar.');
        setBusy(false);
        return;
      }
      // Achou + tem email: enviar magic link
      const resp = await publicVoluntariado.requestLogin(clean, serviceId || undefined);
      setMaskedEmail(resp.maskedEmail || '');
      setState('sent');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao buscar cadastro');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async () => {
    const clean = cpf.replace(/\D+/g, '');
    if (!regName.trim() || regName.trim().length < 3) {
      setErrorMsg('Informe seu nome completo.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) {
      setErrorMsg('Informe um email válido.');
      return;
    }
    setErrorMsg('');
    setBusy(true);
    try {
      const resp = await publicVoluntariado.register({
        cpf: clean,
        full_name: regName.trim(),
        email: regEmail.trim().toLowerCase(),
        phone: regPhone.replace(/\D+/g, '') || undefined,
        serviceId: serviceId || undefined,
      });
      setMaskedEmail(resp.maskedEmail || '');
      setState('sent');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao cadastrar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 text-white flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-gray-800/50 border-gray-700">
        <CardContent className="flex flex-col items-center py-12 text-center">
          {(state === 'loading' || state === 'checking') && (
            <>
              <Loader2 className="h-16 w-16 animate-spin text-[#00B39D] mb-4" />
              <p className="text-lg text-white">
                {state === 'checking' ? 'Fazendo check-in...' : 'Carregando...'}
              </p>
              {serviceName && <p className="text-sm text-white/60 mt-1">{serviceName}</p>}
            </>
          )}

          {state === 'success' && (
            <>
              <CheckCircle2 className="h-20 w-20 text-green-400 mb-4" />
              <h2 className="text-2xl font-bold text-white">Check-in realizado!</h2>
              <p className="text-lg text-white/80 mt-2">{resultName}</p>
              {manhaCriados > 0 && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-amber-200">
                  <Sun className="h-4 w-4" /> Check-in em {manhaCriados} culto(s) da manhã
                </p>
              )}
              {wasUnscheduled && (
                <div className="mt-5 w-full rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-left">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-300 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-yellow-200 text-sm">
                        Você não estava escalado para hoje.
                      </p>
                      <p className="text-xs text-yellow-100/90 leading-relaxed">
                        A liderança aconselha que você se escale nas próximas vezes
                        para ajudar na gestão dos voluntários da CBRio.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <Button
                className="mt-6 bg-[#00B39D] hover:bg-[#00B39D]/80"
                onClick={() => navigate('/voluntariado/checkin')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Button>
            </>
          )}

          {state === 'already' && (
            <>
              <CheckCircle2 className="h-20 w-20 text-yellow-400 mb-4" />
              <h2 className="text-2xl font-bold text-white">Você já fez check-in!</h2>
              <p className="text-sm text-white/60 mt-2">Seu check-in já foi registrado anteriormente</p>
              <Button
                className="mt-6 bg-[#00B39D] hover:bg-[#00B39D]/80"
                onClick={() => navigate('/voluntariado/checkin')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Button>
            </>
          )}

          {state === 'error' && (
            <>
              <XCircle className="h-20 w-20 text-red-400 mb-4" />
              <h2 className="text-2xl font-bold text-white">Erro</h2>
              <p className="text-sm text-white/60 mt-2">{errorMsg}</p>
              <div className="flex gap-2 mt-6">
                <Button variant="outline" className="border-white/20 text-white" onClick={() => navigate('/voluntariado/checkin')}>
                  Voltar
                </Button>
                {user && (
                  <Button className="bg-[#00B39D] hover:bg-[#00B39D]/80" onClick={doCheckin}>
                    Tentar novamente
                  </Button>
                )}
              </div>
            </>
          )}

          {state === 'cpf' && (
            <div className="w-full text-left">
              <div className="flex flex-col items-center text-center mb-6">
                <IdCard className="h-12 w-12 text-[#00B39D] mb-2" />
                <h2 className="text-xl font-bold text-white">Check-in de voluntário</h2>
                <p className="text-sm text-white/60 mt-1">
                  Digite seu CPF para acessar o sistema
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-white/80">CPF</Label>
                  <Input
                    inputMode="numeric"
                    autoFocus
                    value={cpf}
                    onChange={(e) => setCpf(formatCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    className="bg-gray-900/60 border-gray-700 text-white"
                  />
                </div>
                {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
                <Button
                  className="w-full bg-[#00B39D] hover:bg-[#00B39D]/80 min-h-[48px]"
                  onClick={handleCpfSubmit}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continuar'}
                </Button>
                <div className="pt-3 border-t border-white/10">
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-white/20 text-white bg-transparent hover:bg-white/10 min-h-[44px]"
                    onClick={() => setWalletDialogOpen(true)}
                    disabled={busy}
                  >
                    <Wallet className="h-4 w-4" />
                    Ja sou membro — quero meu QR na wallet
                  </Button>
                </div>
                <p className="text-[11px] text-white/40 text-center pt-2">
                  Ja tem conta? Faca login primeiro e escaneie novamente.
                </p>
              </div>
            </div>
          )}

          {state === 'register' && (
            <div className="w-full text-left">
              <div className="flex flex-col items-center text-center mb-6">
                <UserPlus className="h-12 w-12 text-[#00B39D] mb-2" />
                <h2 className="text-xl font-bold text-white">Cadastro de voluntário</h2>
                <p className="text-sm text-white/60 mt-1">
                  Nao encontramos seu CPF. Preencha para criar seu cadastro.
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-white/80">Nome completo</Label>
                  <Input
                    autoFocus
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Seu nome"
                    className="bg-gray-900/60 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-white/80">Email</Label>
                  <Input
                    type="email"
                    inputMode="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="bg-gray-900/60 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label className="text-white/80">Telefone (opcional)</Label>
                  <Input
                    inputMode="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="(21) 99999-9999"
                    className="bg-gray-900/60 border-gray-700 text-white"
                  />
                </div>
                {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="border-white/20 text-white flex-1"
                    onClick={() => { setState('cpf'); setErrorMsg(''); }}
                    disabled={busy}
                  >
                    Voltar
                  </Button>
                  <Button
                    className="flex-[2] bg-[#00B39D] hover:bg-[#00B39D]/80 min-h-[48px]"
                    onClick={handleRegister}
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cadastrar'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {state === 'sent' && (
            <>
              <MailCheck className="h-20 w-20 text-[#00B39D] mb-4" />
              <h2 className="text-2xl font-bold text-white">Link enviado!</h2>
              <p className="text-sm text-white/60 mt-2">
                Enviamos um link de acesso para
                <br />
                <span className="text-white font-medium">{maskedEmail}</span>
              </p>
              <p className="text-xs text-white/40 mt-4">
                Abra o email, clique no link e você será redirecionado para o check-in.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <MemberWalletDialog
        open={walletDialogOpen}
        onOpenChange={setWalletDialogOpen}
        initialCpf={cpf.replace(/\D+/g, '')}
      />

      {/* Domingo de manhã · em quais cultos a pessoa vai servir? */}
      <Dialog open={!!manhaDialog} onOpenChange={(o) => !o && setManhaDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sun className="h-5 w-5 text-amber-500" /> Cultos da manhã</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Em quais cultos da manhã você vai servir hoje?
            </p>
            <div className="space-y-1.5">
              {cultosManha.map(c => {
                const marcado = selCultos.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelCultos(prev => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                    className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${marcado ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/40'}`}
                  >
                    <Checkbox checked={marcado} className="pointer-events-none" />
                    <span className="text-sm font-medium">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setManhaDialog(null)} disabled={salvandoManha}>Só esse</Button>
            <Button onClick={confirmarManha} disabled={salvandoManha || selCultos.size === 0}>
              {salvandoManha ? 'Salvando…' : `Fazer check-in (${selCultos.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
