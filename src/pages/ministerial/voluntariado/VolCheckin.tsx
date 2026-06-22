import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { QrCode, Hand, Scan, Sun } from 'lucide-react';
import { voluntariado } from '@/api';
import { useCheckinServices, useServiceSchedules, useCheckIn, useScheduleByQrCode } from './hooks';
import QrScanner from './components/checkin/QrScanner';
import ManualCheckin from './components/checkin/ManualCheckin';
import FaceScanner from './components/checkin/FaceScanner';
import SuccessOverlay from './components/checkin/SuccessOverlay';
import ContactCaptureDialog from './components/checkin/ContactCaptureDialog';
import { toast } from 'sonner';

export default function VolCheckin() {
  const [searchParams] = useSearchParams();
  const { data: todayServices = [] } = useCheckinServices();
  const [selectedServiceId, setSelectedServiceId] = useState(searchParams.get('serviceId') || '');
  const { data: schedules = [] } = useServiceSchedules(selectedServiceId || undefined);
  const checkIn = useCheckIn();
  const qrLookup = useScheduleByQrCode();
  const [success, setSuccess] = useState<{ name: string; team?: string | null; position?: string | null; unscheduled?: boolean } | null>(null);
  const [contactCapture, setContactCapture] = useState<{ id: string; name: string } | null>(null);

  const maybeCapture = (resp: any, name: string) => {
    if (resp?.needs_cpf && resp?.volunteer_id) setContactCapture({ id: resp.volunteer_id, name });
  };

  // Cultos da manhã (08:30/10:00/11:30) · pro check-in perguntar em quais a
  // pessoa vai servir (checkbox). Só aparece quando o culto selecionado é
  // domingo de manhã.
  const { data: cultosManha = [] } = useQuery<{ id: string; name: string; recurrence_time: string }[]>({
    queryKey: ['vol', 'cultos-manha'],
    queryFn: () => voluntariado.cultosManha(),
    staleTime: 60 * 60 * 1000,
  });
  const selSvc = todayServices.find(s => s.id === selectedServiceId);
  const ehDomingoManha = (() => {
    if (!selSvc) return false;
    try {
      const wd = new Date(selSvc.scheduled_at).toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
      const h = Number(new Date(selSvc.scheduled_at).toLocaleString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).slice(0, 2));
      return wd === 'Sun' && h < 14 && cultosManha.length > 1;
    } catch { return false; }
  })();
  const serviceDate = selSvc ? new Date(selSvc.scheduled_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '';

  const [manhaDialog, setManhaDialog] = useState<{ volunteerId?: string; name: string; method: string } | null>(null);
  const [selCultos, setSelCultos] = useState<Set<string>>(new Set());
  const [salvandoManha, setSalvandoManha] = useState(false);

  // Intercepta o check-in: se é domingo de manhã, abre o checkbox dos cultos.
  // Retorna true se interceptou (o chamador deve parar o fluxo normal).
  const perguntarCultosManha = (volunteerId: string | undefined, name: string, method: string) => {
    if (!ehDomingoManha) return false;
    setSelCultos(new Set(cultosManha.map(c => c.id)));
    setManhaDialog({ volunteerId, name, method });
    return true;
  };

  const confirmarManha = async () => {
    if (!manhaDialog) return;
    const ids = cultosManha.filter(c => selCultos.has(c.id)).map(c => c.id);
    if (!ids.length) { toast.error('Marque pelo menos um culto'); return; }
    setSalvandoManha(true);
    try {
      const r = await voluntariado.checkIns.manha({ volunteer_id: manhaDialog.volunteerId, service_date: serviceDate, service_type_ids: ids, method: manhaDialog.method });
      setSuccess({ name: manhaDialog.name });
      toast.success(`Check-in em ${r?.criados ?? ids.length} culto(s) da manhã!`);
      setManhaDialog(null);
    } catch (e: any) { toast.error(e?.message || 'Erro no check-in'); }
    setSalvandoManha(false);
  };

  // Auto-seleciona o culto mais próximo de agora (a lista já vem ordenada).
  if (todayServices.length > 0 && !selectedServiceId) {
    setSelectedServiceId(todayServices[0].id);
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
      // Domingo de manhã: pergunta em quais cultos vai servir (checkbox).
      if (perguntarCultosManha(result.profile?.id || undefined, result.volunteerName, 'qr_code')) return;
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
      // Domingo de manhã: pergunta em quais cultos vai servir (checkbox).
      if (perguntarCultosManha(match.volunteer_id, match.volunteer_name, 'facial')) return;
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
          <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
            <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Selecione o culto" /></SelectTrigger>
            <SelectContent>
              {todayServices.map(svc => {
                const dt = (() => { try { return new Date(svc.scheduled_at).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); } catch { return ''; } })();
                return (
                  <SelectItem key={svc.id} value={svc.id}>
                    {svc.name}{dt ? <span className="text-muted-foreground"> · {dt}</span> : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {todayServices.length === 0 && <p className="text-sm text-muted-foreground mt-2">Nenhum culto no período. Sincronize com o Planning Center.</p>}
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

      {/* Domingo de manhã · em quais cultos a pessoa vai servir? */}
      <Dialog open={!!manhaDialog} onOpenChange={(o) => !o && setManhaDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sun className="h-5 w-5 text-amber-500" /> Cultos da manhã</DialogTitle>
          </DialogHeader>
          {manhaDialog && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{manhaDialog.name}</strong> — em quais cultos da manhã vai servir?
              </p>
              <div className="space-y-1.5">
                {cultosManha.map(c => {
                  const marcado = selCultos.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelCultos(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                      className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${marcado ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/40'}`}
                    >
                      <Checkbox checked={marcado} className="pointer-events-none" />
                      <span className="text-sm font-medium">{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setManhaDialog(null)} disabled={salvandoManha}>Cancelar</Button>
            <Button onClick={confirmarManha} disabled={salvandoManha || selCultos.size === 0}>
              {salvandoManha ? 'Salvando…' : `Fazer check-in (${selCultos.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
