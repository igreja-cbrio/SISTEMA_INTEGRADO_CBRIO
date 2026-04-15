import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { voluntariado } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2, ArrowLeft } from 'lucide-react';

type State = 'loading' | 'ready' | 'checking' | 'success' | 'error' | 'already';

export default function VolSelfCheckin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const serviceId = searchParams.get('serviceId');
  const [state, setState] = useState<State>('loading');
  const [serviceName, setServiceName] = useState('');
  const [resultName, setResultName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!serviceId || !user) {
      navigate('/login', { replace: true });
      return;
    }
    doCheckin();
  }, [serviceId, user]);

  const doCheckin = async () => {
    if (!serviceId) return;
    setState('checking');

    try {
      // First get the volunteer's vol_profile
      const { profile } = await voluntariado.me.get();
      if (!profile) {
        setErrorMsg('Perfil de voluntario nao encontrado. Complete seu cadastro primeiro.');
        setState('error');
        return;
      }

      // Show the name immediately (used in both success and already states)
      setResultName(profile.full_name);

      // Try scheduled check-in first (if qr_code is set and lookup finds a schedule)
      if (profile.qr_code) {
        try {
          const lookup = await voluntariado.qrLookup(profile.qr_code);
          setServiceName(lookup.schedule?.service?.name || 'Culto');

          if (lookup.schedule) {
            try {
              await voluntariado.checkIns.create({
                schedule_id: lookup.schedule.id,
                volunteer_id: profile.id,
                service_id: serviceId,
                method: 'self_service',
              });
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
          // lookup.isUnscheduled = true → fall through to direct check-in below
        } catch (lookupErr: any) {
          // Duplicate check-in from qr-lookup path
          if (lookupErr.alreadyCheckedIn || lookupErr.status === 409) {
            setState('already');
            return;
          }
          // qr-lookup 404 or any other error → silently fall through to direct check-in
        }
      }

      // Fallback: direct unscheduled check-in (works even without qr_code / schedule)
      try {
        await voluntariado.checkIns.create({
          volunteer_id: profile.id,
          service_id: serviceId,
          method: 'self_service',
          is_unscheduled: true,
        });
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 text-white flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-gray-800/50 border-gray-700">
        <CardContent className="flex flex-col items-center py-12 text-center">
          {(state === 'loading' || state === 'checking') && (
            <>
              <Loader2 className="h-16 w-16 animate-spin text-[#00B39D] mb-4" />
              <p className="text-lg text-white">Fazendo check-in...</p>
              {serviceName && <p className="text-sm text-white/60 mt-1">{serviceName}</p>}
            </>
          )}

          {state === 'success' && (
            <>
              <CheckCircle2 className="h-20 w-20 text-green-400 mb-4" />
              <h2 className="text-2xl font-bold text-white">Check-in realizado!</h2>
              <p className="text-lg text-white/80 mt-2">{resultName}</p>
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
                <Button className="bg-[#00B39D] hover:bg-[#00B39D]/80" onClick={doCheckin}>
                  Tentar novamente
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
