import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QrCode, Hand, Scan } from 'lucide-react';
import { useTodaysServices, useBlockSchedules, useCheckIn, useScheduleByQrCode } from './hooks';
import QrScanner from './components/checkin/QrScanner';
import ManualCheckin from './components/checkin/ManualCheckin';
import FaceScanner from './components/checkin/FaceScanner';
import SuccessOverlay from './components/checkin/SuccessOverlay';
import ContactCaptureDialog from './components/checkin/ContactCaptureDialog';
import { toast } from 'sonner';

export default function VolCheckin() {
  const [searchParams] = useSearchParams();
  const { data: todayServices = [] } = useTodaysServices();
  const [selectedServiceId, setSelectedServiceId] = useState(searchParams.get('serviceId') || '');

  // Agrupa os cultos de hoje em BLOCOS: domingo vira "Culto Manhã" / "Culto
  // Noite" (a manhã = 08:30/10:00/11:30); demais dias = o próprio culto. Um
  // check-in cobre o bloco inteiro (o backend deduplica/casa a escala por bloco).
  const blocos = useMemo(() => {
    const periodo = (iso: string) => Number(new Date(iso).toLocaleString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).slice(0, 2)) < 14 ? 'manha' : 'noite';
    const isSun = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }) === 'Sun';
    const map = new Map<string, { label: string; serviceIds: string[]; primary: string; at: string }>();
    for (const s of todayServices) {
      const sun = isSun(s.scheduled_at);
      const per = periodo(s.scheduled_at);
      const k = sun ? `dom-${per}` : s.id;
      const label = sun ? (per === 'manha' ? 'Culto Manhã' : 'Culto Noite') : `${s.name}${s.service_type_name ? ' — ' + s.service_type_name : ''}`;
      const b = map.get(k);
      if (!b) map.set(k, { label, serviceIds: [s.id], primary: s.id, at: s.scheduled_at });
      else { b.serviceIds.push(s.id); if (new Date(s.scheduled_at) < new Date(b.at)) { b.primary = s.id; b.at = s.scheduled_at; } }
    }
    return [...map.values()].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [todayServices]);

  const selectedBloco = useMemo(() => blocos.find(b => b.serviceIds.includes(selectedServiceId)) || null, [blocos, selectedServiceId]);
  const { data: schedules = [] } = useBlockSchedules(selectedBloco?.serviceIds || []);
  const checkIn = useCheckIn();
  const qrLookup = useScheduleByQrCode();
  const [success, setSuccess] = useState<{ name: string; team?: string | null; position?: string | null; unscheduled?: boolean } | null>(null);
  const [contactCapture, setContactCapture] = useState<{ id: string; name: string } | null>(null);

  const maybeCapture = (resp: any, name: string) => {
    if (resp?.needs_cpf && resp?.volunteer_id) setContactCapture({ id: resp.volunteer_id, name });
  };

  // Auto-select if only one block today
  if (blocos.length === 1 && !selectedServiceId) {
    setSelectedServiceId(blocos[0].primary);
  }

  const handleCheckIn = useCallback(async (scheduleId: string) => {
    const sch = schedules.find(s => s.id === scheduleId);
    try {
      const resp = await checkIn.mutateAsync({ schedule_id: scheduleId, volunteer_id: sch?.volunteer_id || undefined, service_id: selectedServiceId, method: 'manual' });
      setSuccess({ name: sch?.volunteer_name || 'Voluntario', team: sch?.team_name, position: sch?.position_name });
      maybeCapture(resp, sch?.volunteer_name || 'Voluntario');
      toast.success('Check-in realizado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro no check-in');
    }
  }, [schedules, checkIn, selectedServiceId]);

  const handleUnscheduledCheckIn = useCallback(async (name: string) => {
    try {
      await checkIn.mutateAsync({ service_id: selectedServiceId, method: 'manual', is_unscheduled: true });
      setSuccess({ name, unscheduled: true });
      toast.success('Check-in sem escala realizado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro no check-in');
    }
  }, [checkIn, selectedServiceId]);

  const handleQrScan = useCallback(async (qrCode: string) => {
    // If the scanned content is a totem URL, extract the volunteer-facing self-checkin URL
    // and advise to use a volunteer's QR code instead.
    if (qrCode.includes('/voluntariado/self-checkin')) {
      toast.error('Este e o QR do totem. Use o QR pessoal do voluntário.');
      return;
    }
    try {
      const result = await qrLookup.mutateAsync(qrCode);
      if (result.isUnscheduled) {
        const resp = await checkIn.mutateAsync({ volunteer_id: result.profile.id || undefined, service_id: selectedServiceId, method: 'qr_code', is_unscheduled: true });
        setSuccess({ name: result.volunteerName, unscheduled: true });
        maybeCapture(resp, result.volunteerName);
      } else if (result.schedule) {
        const resp = await checkIn.mutateAsync({ schedule_id: result.schedule.id, volunteer_id: result.profile.id || undefined, service_id: selectedServiceId, method: 'qr_code' });
        setSuccess({ name: result.volunteerName, team: result.schedule.team_name, position: result.schedule.position_name });
        maybeCapture(resp, result.volunteerName);
      }
      toast.success('Check-in via QR realizado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro no QR check-in');
    }
  }, [qrLookup, checkIn, selectedServiceId]);

  const handleFaceMatch = useCallback(async (match: { volunteer_id: string; volunteer_name: string }) => {
    try {
      // Try to find schedule for this volunteer
      const sch = schedules.find(s => s.volunteer_id === match.volunteer_id && !s.check_in);
      if (sch) {
        const resp = await checkIn.mutateAsync({ schedule_id: sch.id, volunteer_id: match.volunteer_id, service_id: selectedServiceId, method: 'facial' });
        setSuccess({ name: match.volunteer_name, team: sch.team_name, position: sch.position_name });
        maybeCapture(resp, match.volunteer_name);
      } else {
        const resp = await checkIn.mutateAsync({ volunteer_id: match.volunteer_id, service_id: selectedServiceId, method: 'facial', is_unscheduled: true });
        setSuccess({ name: match.volunteer_name, unscheduled: true });
        maybeCapture(resp, match.volunteer_name);
      }
      toast.success('Check-in facial realizado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro no check-in facial');
    }
  }, [schedules, checkIn, selectedServiceId]);

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-xl md:text-2xl font-bold text-foreground">Check-in</h1>

      {/* Service selector */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <Select value={selectedBloco?.primary || ''} onValueChange={setSelectedServiceId}>
            <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Selecione o culto de hoje" /></SelectTrigger>
            <SelectContent>
              {blocos.map(b => (
                <SelectItem key={b.primary} value={b.primary}>{b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {blocos.length === 0 && <p className="text-sm text-muted-foreground mt-2">Nenhum culto agendado para hoje. Sincronize com o Planning Center.</p>}
        </CardContent>
      </Card>

      {selectedServiceId && (
        <Tabs defaultValue="manual">
          <TabsList className="grid w-full grid-cols-3 min-h-[44px]">
            <TabsTrigger value="manual" className="gap-1 min-h-[40px]"><Hand className="h-4 w-4" /><span className="hidden sm:inline">Manual</span></TabsTrigger>
            <TabsTrigger value="qr" className="gap-1 min-h-[40px]"><QrCode className="h-4 w-4" /><span className="hidden sm:inline">QR Code</span><span className="sm:hidden">QR</span></TabsTrigger>
            <TabsTrigger value="face" className="gap-1 min-h-[40px]"><Scan className="h-4 w-4" /><span className="hidden sm:inline">Facial</span></TabsTrigger>
          </TabsList>

          <TabsContent value="manual">
            <Card>
              <CardHeader><CardTitle>Check-in Manual</CardTitle></CardHeader>
              <CardContent>
                <ManualCheckin schedules={schedules} onCheckIn={handleCheckIn} onUnscheduledCheckIn={handleUnscheduledCheckIn} isLoading={checkIn.isPending} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="qr">
            <Card>
              <CardHeader><CardTitle>Scanner QR Code</CardTitle></CardHeader>
              <CardContent><QrScanner onScan={handleQrScan} /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="face">
            <Card>
              <CardHeader><CardTitle>Reconhecimento Facial</CardTitle></CardHeader>
              <CardContent><FaceScanner onMatch={handleFaceMatch} onNoMatch={() => toast.error('Rosto não reconhecido')} /></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {success && <SuccessOverlay volunteerName={success.name} teamName={success.team} positionName={success.position} isUnscheduled={success.unscheduled} onClose={() => setSuccess(null)} />}

      {contactCapture && (
        <ContactCaptureDialog
          volunteerId={contactCapture.id}
          volunteerName={contactCapture.name}
          onDone={() => setContactCapture(null)}
        />
      )}
    </div>
  );
}
