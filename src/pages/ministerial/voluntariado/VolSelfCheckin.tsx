import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useHomeScreenMeta } from '@/hooks/useHomeScreenMeta';
import { voluntariado, publicVoluntariado } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CheckCircle2, XCircle, Loader2, ArrowLeft, MailCheck, UserPlus, IdCard, AlertTriangle, Wallet,
} from 'lucide-react';
import { playCheckinSound } from '@/lib/sounds';
import MemberWalletDialog from '@/components/membresia/MemberWalletDialog';

type State =
  | 'loading'      // avaliando sessao / carregando perfil
  | 'checking'     // fazendo checkin do usuario logado
  | 'success'      // checkin ok
  | 'already'      // ja tinha checkin
  | 'error'
  | 'cpf'          // pedindo CPF (usuario nao autenticado)
  | 'register'     // cadastro completo (CPF nao existe em lugar nenhum)
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

  // Fluxo nao autenticado
  const [cpf, setCpf] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);

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
        setErrorMsg('Perfil de voluntario nao encontrado. Complete seu cadastro primeiro.');
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
        // Nao achou em nenhum cadastro — pedir dados completos
        setState('register');
        setBusy(false);
        return;
      }
      if (!lookup.hasEmail) {
        setErrorMsg('Seu cadastro nao tem email. Procure um lider para atualizar.');
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
      setErrorMsg('Informe um email valido.');
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
              {wasUnscheduled && (
                <div className="mt-5 w-full rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-left">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-300 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-yellow-200 text-sm">
                        Voce nao estava escalado para hoje.
                      </p>
                      <p className="text-xs text-yellow-100/90 leading-relaxed">
                        A lideranca aconselha que voce se escale nas proximas vezes
                        para ajudar na gestao dos voluntarios da CBRio.
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
              <h2 className="text-2xl font-bold text-white">Voce ja fez check-in!</h2>
              <p className="text-sm text-white/60 mt-2">Seu check-in ja foi registrado anteriormente</p>
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
                <h2 className="text-xl font-bold text-white">Check-in de voluntario</h2>
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
                <h2 className="text-xl font-bold text-white">Cadastro de voluntario</h2>
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
                Abra o email, clique no link e voce sera redirecionado para o check-in.
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
    </div>
  );
}
