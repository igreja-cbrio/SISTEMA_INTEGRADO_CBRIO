import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { voluntariado } from '@/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Calendar, Check, X, Clock, CalendarOff, ChevronRight,
  CheckCircle2, XCircle, Loader2, Users, ScanLine,
} from 'lucide-react';
import { AddToWalletButtons } from '@/components/ui/wallet-buttons';

function isIOSLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || '';
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function AppleWalletIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="6" width="20" height="14" rx="2" fill="currentColor" opacity="0.3" />
      <rect x="3" y="4" width="18" height="14" rx="2" fill="currentColor" opacity="0.5" />
      <rect x="4" y="2" width="16" height="14" rx="2" fill="currentColor" opacity="0.8" />
      <rect x="4" y="2" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}
import type { VolSchedule, VolAvailability } from './types';

function useMySchedules() {
  return useQuery({
    queryKey: ['vol', 'my-schedules'],
    queryFn: () => voluntariado.me.schedules() as Promise<(VolSchedule & { has_checkin: boolean })[]>,
  });
}

function useMyAvailability() {
  return useQuery({
    queryKey: ['vol', 'my-availability'],
    queryFn: () => voluntariado.me.availability() as Promise<VolAvailability[]>,
  });
}

function useRespondSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'confirmed' | 'declined' }) =>
      voluntariado.me.respondSchedule(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'my-schedules'] }),
  });
}

function useAddMyAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { unavailable_from: string; unavailable_to: string; reason?: string }) =>
      voluntariado.me.addAvailability(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'my-availability'] }),
  });
}

function useRemoveMyAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => voluntariado.me.removeAvailability(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'my-availability'] }),
  });
}

function useGoogleWalletUrl() {
  return useMutation<{ url: string }>({
    mutationFn: () => voluntariado.me.walletGoogle(),
  });
}

export default function VolMeuPainel() {
  const navigate = useNavigate();
  const googleWallet = useGoogleWalletUrl();
  const [appleBusy, setAppleBusy] = useState(false);
  const iOS = isIOSLike();

  const handleAddToGoogleWallet = async () => {
    try {
      const data = await googleWallet.mutateAsync();
      window.open(data.url, '_blank');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar passe do Google Wallet');
    }
  };

  const handleAddToAppleWallet = async () => {
    setAppleBusy(true);
    try {
      const blob = await voluntariado.me.walletApple();
      downloadBlob(blob, 'cbrio-voluntario.pkpass');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar passe Apple Wallet');
    } finally {
      setAppleBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Meu Painel</h1>

      <Button
        size="lg"
        className="w-full gap-2 min-h-[56px] bg-[#00B39D] hover:bg-[#00B39D]/90 text-base"
        onClick={() => navigate('/voluntariado/checkin/checkin')}
      >
        <ScanLine className="h-5 w-5" /> Escanear QR do Totem para Check-in
      </Button>

      <AddToWalletButtons
        onApple={handleAddToAppleWallet}
        onGoogle={handleAddToGoogleWallet}
        appleBusy={appleBusy}
        googleBusy={googleWallet.isPending}
        showApple={iOS}
        className="w-full"
      />

      <Tabs defaultValue="escalas" className="w-full">
        <TabsList className="w-full grid grid-cols-2 h-auto p-1.5 bg-muted/60 rounded-xl gap-1.5">
          <TabsTrigger
            value="escalas"
            className="flex items-center justify-center gap-2 min-h-[48px] rounded-lg text-sm font-semibold transition-all data-[state=active]:bg-[#00B39D] data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
          >
            <Calendar className="h-4 w-4" />
            <span>Minhas Escalas</span>
          </TabsTrigger>
          <TabsTrigger
            value="disponibilidade"
            className="flex items-center justify-center gap-2 min-h-[48px] rounded-lg text-sm font-semibold transition-all data-[state=active]:bg-[#00B39D] data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
          >
            <CalendarOff className="h-4 w-4" />
            <span>Disponibilidade</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="escalas" className="mt-4">
          <MySchedulesTab />
        </TabsContent>

        <TabsContent value="disponibilidade" className="mt-4">
          <MyAvailabilityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MySchedulesTab() {
  const { data: schedules = [], isLoading } = useMySchedules();
  const respond = useRespondSchedule();

  const pendingSchedules = schedules.filter(s => s.confirmation_status === 'pending');
  const upcomingSchedules = schedules.filter(s => s.confirmation_status !== 'pending' && s.confirmation_status !== 'declined');
  const declinedSchedules = schedules.filter(s => s.confirmation_status === 'declined');

  const handleRespond = (id: string, status: 'confirmed' | 'declined') => {
    respond.mutate({ id, status }, {
      onSuccess: () => toast.success(status === 'confirmed' ? 'Escala confirmada!' : 'Escala recusada'),
      onError: () => toast.error('Erro ao responder'),
    });
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Pending — need response */}
      {pendingSchedules.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-yellow-600 flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> Aguardando sua confirmacao ({pendingSchedules.length})
          </h3>
          {pendingSchedules.map(s => (
            <Card key={s.id} className="border-yellow-200 dark:border-yellow-900/30">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{s.service?.name}</p>
                    {s.service?.scheduled_at && (
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(s.service.scheduled_at), "EEEE, dd 'de' MMMM 'as' HH:mm", { locale: ptBR })}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {s.team_name && <Badge variant="outline" className="text-xs">{s.team_name}</Badge>}
                      {s.position_name && <span className="text-xs text-muted-foreground">{s.position_name}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="gap-1.5 bg-green-600 hover:bg-green-700"
                      onClick={() => handleRespond(s.id, 'confirmed')}
                      disabled={respond.isPending}
                    >
                      <Check className="h-4 w-4" /> Aceitar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-red-600 hover:text-red-700"
                      onClick={() => handleRespond(s.id, 'declined')}
                      disabled={respond.isPending}
                    >
                      <X className="h-4 w-4" /> Recusar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upcoming confirmed */}
      {upcomingSchedules.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Calendar className="h-4 w-4" /> Proximas escalas ({upcomingSchedules.length})
          </h3>
          {upcomingSchedules.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{s.service?.name}</p>
                    {s.service?.scheduled_at && (
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(s.service.scheduled_at), "EEE, dd/MM 'as' HH:mm", { locale: ptBR })}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {s.team_name && <Badge variant="outline" className="text-xs">{s.team_name}</Badge>}
                      {s.position_name && <span className="text-xs text-muted-foreground">{s.position_name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.has_checkin ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Presente
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        <Check className="h-3 w-3 mr-1" /> Confirmado
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Declined */}
      {declinedSchedules.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
            <XCircle className="h-4 w-4" /> Recusadas ({declinedSchedules.length})
          </h3>
          {declinedSchedules.map(s => (
            <Card key={s.id} className="opacity-60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{s.service?.name}</p>
                    {s.service?.scheduled_at && (
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(s.service.scheduled_at), "EEE, dd/MM 'as' HH:mm", { locale: ptBR })}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-red-600">Recusada</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {schedules.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Nenhuma escala encontrada</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Quando voce for escalado, aparecera aqui</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MyAvailabilityTab() {
  const { data: availability = [], isLoading } = useMyAvailability();
  const addAvailability = useAddMyAvailability();
  const removeAvailability = useRemoveMyAvailability();
  const [showAdd, setShowAdd] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');

  const handleAdd = () => {
    if (!fromDate || !toDate) return toast.error('Selecione as datas');
    if (new Date(toDate) < new Date(fromDate)) return toast.error('Data final deve ser maior que a inicial');

    addAvailability.mutate({ unavailable_from: fromDate, unavailable_to: toDate, reason: reason || undefined }, {
      onSuccess: () => {
        toast.success('Ausencia registrada');
        setShowAdd(false);
        setFromDate('');
        setToDate('');
        setReason('');
      },
      onError: () => toast.error('Erro ao registrar'),
    });
  };

  const handleRemove = (id: string) => {
    removeAvailability.mutate(id, {
      onSuccess: () => toast.success('Ausencia removida'),
      onError: () => toast.error('Erro ao remover'),
    });
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Informe os dias que voce nao podera servir</p>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 bg-[#00B39D] hover:bg-[#00B39D]/90">
          <CalendarOff className="h-4 w-4" /> Nova ausencia
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>De</Label>
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </div>
              <div>
                <Label>Ate</Label>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Motivo (opcional)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: Viagem, compromisso pessoal..." />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleAdd} disabled={addAvailability.isPending} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {availability.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CalendarOff className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Nenhuma ausencia registrada</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Registre os dias que nao pode servir para os lideres saberem</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {availability.map(a => (
            <Card key={a.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <CalendarOff className="h-4 w-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {format(new Date(a.unavailable_from + 'T00:00:00'), 'dd/MM/yyyy')}
                      {a.unavailable_from !== a.unavailable_to && (
                        <> a {format(new Date(a.unavailable_to + 'T00:00:00'), 'dd/MM/yyyy')}</>
                      )}
                    </p>
                    {a.reason && <p className="text-xs text-muted-foreground">{a.reason}</p>}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleRemove(a.id)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
