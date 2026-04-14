import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QrCode, Hand, Scan } from 'lucide-react';
import { useTodaysServices, useServiceSchedules, useCheckIn, useScheduleByQrCode } from './hooks';
import QrScanner from './components/checkin/QrScanner';
import ManualCheckin from './components/checkin/ManualCheckin';
import FaceScanner from './components/checkin/FaceScanner';
import SuccessOverlay from './components/checkin/SuccessOverlay';
import { toast } from 'sonner';

export default function VolCheckin() {
  const [searchParams] = useSearchParams();
  const { data: todayServices = [] } = useTodaysServices();
  const [selectedServiceId, setSelectedServiceId] = useState(searchParams.get('serviceId') || '');
  const { data: schedules = [] } = useServiceSchedules(selectedServiceId || undefined);
  const checkIn = useCheckIn();
  const qrLookup = useScheduleByQrCode();
  const [success, setSuccess] = useState<{ name: string; team?: string | null; position?: string | null; unscheduled?: boolean } | null>(null);

  // Auto-select if only one service today
  if (todayServices.length === 1 && !selectedServiceId) {
    setSelectedServiceId(todayServices[0].id);
  }

  const handleCheckIn = useCallback(async (scheduleId: string) => {
    const sch = schedules.find(s => s.id === scheduleId);
    try {
      await checkIn.mutateAsync({ schedule_id: scheduleId, volunteer_id: sch?.volunteer_id || undefined, service_id: selectedServiceId, method: 'manual' });
      setSuccess({ name: sch?.volunteer_name || 'Voluntario', team: sch?.team_name, position: sch?.position_name });
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
    try {
      const result = await qrLookup.mutateAsync(qrCode);
      if (result.isUnscheduled) {
        await checkIn.mutateAsync({ volunteer_id: result.profile.id || undefined, service_id: selectedServiceId, method: 'qr_code', is_unscheduled: true });
        setSuccess({ name: result.volunteerName, unscheduled: true });
      } else if (result.schedule) {
        await checkIn.mutateAsync({ schedule_id: result.schedule.id, volunteer_id: result.profile.id || undefined, service_id: selectedServiceId, method: 'qr_code' });
        setSuccess({ name: result.volunteerName, team: result.schedule.team_name, position: result.schedule.position_name });
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
        await checkIn.mutateAsync({ schedule_id: sch.id, volunteer_id: match.volunteer_id, service_id: selectedServiceId, method: 'facial' });
        setSuccess({ name: match.volunteer_name, team: sch.team_name, position: sch.position_name });
      } else {
        await checkIn.mutateAsync({ volunteer_id: match.volunteer_id, service_id: selectedServiceId, method: 'facial', is_unscheduled: true });
        setSuccess({ name: match.volunteer_name, unscheduled: true });
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
            <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Selecione o culto de hoje" /></SelectTrigger>
            <SelectContent>
              {todayServices.map(svc => (
                <SelectItem key={svc.id} value={svc.id}>{svc.name} — {svc.service_type_name || ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {todayServices.length === 0 && <p className="text-sm text-muted-foreground mt-2">Nenhum culto agendado para hoje. Sincronize com o Planning Center.</p>}
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
              <CardContent><FaceScanner onMatch={handleFaceMatch} onNoMatch={() => toast.error('Rosto nao reconhecido')} /></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {success && <SuccessOverlay volunteerName={success.name} teamName={success.team} positionName={success.position} isUnscheduled={success.unscheduled} onClose={() => setSuccess(null)} />}
    </div>
  );
}
