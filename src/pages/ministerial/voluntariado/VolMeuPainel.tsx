import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { voluntariado } from '@/api';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Calendar, Check, X, Clock, CalendarOff,
  CheckCircle2, XCircle, Loader2, ScanLine, Search,
} from 'lucide-react';
import { useMyServices, useToggleServiceUnavailability } from './hooks';
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
import type { VolSchedule } from './types';

function useMySchedules() {
  return useQuery({
    queryKey: ['vol', 'my-schedules'],
    queryFn: () => voluntariado.me.schedules() as Promise<(VolSchedule & { has_checkin: boolean })[]>,
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

const SERVICE_COLORS: Record<string, string> = {
  'Quarta com Deus': '#6366f1',
  'AMI': '#f59e0b',
  'Bridge': '#ec4899',
  'Domingo 08:30': '#00B39D',
  'Domingo 10:00': '#10b981',
  'Domingo 11:30': '#3b82f6',
  'Domingo 19:00': '#8b5cf6',
};
function svcColor(name: string) { return SERVICE_COLORS[name] ?? '#00B39D'; }

function MyAvailabilityTab() {
  const [searchDate, setSearchDate] = useState('');
  const { data: services = [], isLoading } = useMyServices(2026);
  const toggle = useToggleServiceUnavailability();

  // Usa format para comparar datas no fuso local, evitando off-by-one de UTC
  const filtered = useMemo(() => {
    if (!searchDate) return null;
    return services.filter(s => format(parseISO(s.scheduled_at), 'yyyy-MM-dd') === searchDate);
  }, [services, searchDate]);

  const byMonth = useMemo(() => {
    const map = new Map<string, typeof services>();
    for (const s of services) {
      const key = format(parseISO(s.scheduled_at), 'yyyy-MM');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [services]);

  const handleToggle = (service: typeof services[0]) => {
    toggle.mutate(
      { serviceId: service.id, isUnavailable: service.is_unavailable, availabilityId: service.availability_id },
      {
        onSuccess: () => toast.success(service.is_unavailable ? 'Disponibilidade restaurada' : 'Ausencia registrada'),
        onError: (err: any) => toast.error(err.message || 'Erro ao atualizar'),
      }
    );
  };

  const ServiceChip = ({ service }: { service: typeof services[0] }) => {
    const date = parseISO(service.scheduled_at);
    const color = svcColor(service.service_type_name || service.name);
    const unavailable = service.is_unavailable;
    return (
      <button
        onClick={() => handleToggle(service)}
        disabled={toggle.isPending}
        className={`flex flex-col items-center px-3 py-2 rounded-lg border text-xs font-medium transition-all
          ${unavailable
            ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-950/30 dark:border-red-700 dark:text-red-300'
            : 'bg-background border-border text-foreground hover:border-primary/50 hover:bg-primary/5'
          }`}
      >
        <span className="h-2 w-2 rounded-full mb-1" style={{ backgroundColor: unavailable ? '#ef4444' : color }} />
        <span>{format(date, 'EEE dd', { locale: ptBR })}</span>
        <span className="text-[10px] opacity-70">{format(date, 'HH:mm')}</span>
        <span className="text-[10px] max-w-[80px] text-center leading-tight mt-0.5 opacity-80 truncate">
          {service.service_type_name || service.name}
        </span>
        {unavailable
          ? <span className="text-[9px] text-red-500 mt-0.5 font-bold">ausente</span>
          : <Check className="h-2.5 w-2.5 text-[#00B39D] mt-0.5" />
        }
      </button>
    );
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Toque nos cultos que voce <strong>nao podera comparecer</strong>. Os demais indicam disponibilidade.
      </p>

      {/* Busca por data */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="date"
          value={searchDate}
          onChange={e => setSearchDate(e.target.value)}
          className="pl-9 pr-8"
        />
        {searchDate && (
          <button
            onClick={() => setSearchDate('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CalendarOff className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Nenhum culto cadastrado para 2026</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Peca para o lider gerar os cultos do ano</p>
          </CardContent>
        </Card>
      ) : filtered !== null ? (
        // Resultado da busca por data
        filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-8 text-center">
              <CalendarOff className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhum culto em {format(parseISO(searchDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {filtered.length} culto(s) em {format(parseISO(searchDate), "dd 'de' MMMM", { locale: ptBR })}
            </p>
            <div className="flex flex-wrap gap-2">
              {filtered.map(s => <ServiceChip key={s.id} service={s} />)}
            </div>
          </div>
        )
      ) : (
        // Lista completa por mes
        <div className="space-y-5">
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-[#00B39D]" /> Disponivel
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-red-500" /> Ausente ({services.filter(s => s.is_unavailable).length})
            </div>
          </div>
          {byMonth.map(([monthKey, monthServices]) => (
            <div key={monthKey}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 capitalize">
                {format(parseISO(`${monthKey}-01`), 'MMMM yyyy', { locale: ptBR })}
              </h3>
              <div className="flex flex-wrap gap-2">
                {monthServices.map(s => <ServiceChip key={s.id} service={s} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
