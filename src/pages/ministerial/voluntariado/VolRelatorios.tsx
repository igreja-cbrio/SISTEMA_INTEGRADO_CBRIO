import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PeriodFilter from './components/reports/PeriodFilter';
import VolunteerThermometer from './components/reports/VolunteerThermometer';
import { useVolReportData, useVolunteerThermometer, useInactiveVolunteers } from './hooks';
import { useVolTeams } from './hooks';
import { UserX, Flame, BarChart3, Calendar, CheckCircle2, TrendingUp, Users, Printer, AlertTriangle, Filter, Clock, ChevronRight, XCircle, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ciMatchesSched, dateOfSP, normName } from './volMatch';

// Escala do PCO tem 1 linha por horário/função (ex.: Bazar 8:30/10:00/11:30) —
// a MESMA pessoa aparece várias vezes. Presença é por PESSOA: dedup das linhas
// de escala pela identidade (PCID > volunteer_id > nome), juntando as equipes.
const schedPersonKey = (s: any) =>
  s.planning_center_person_id || s.volunteer_id || normName(s.volunteer_name) || s.id;

function dedupePorPessoa(scheds: any[]): any[] {
  const map = new Map<string, any>();
  for (const s of scheds) {
    const k = schedPersonKey(s);
    const ex = map.get(k);
    if (!ex) {
      map.set(k, { ...s, _equipes: [s.team_name].filter(Boolean) });
    } else if (s.team_name && !ex._equipes.includes(s.team_name)) {
      ex._equipes.push(s.team_name);
    }
  }
  return [...map.values()];
}

// Check-in tem identidade? (check-ins anônimos do fluxo antigo não têm)
const ciTemIdentidade = (c: any) =>
  !!(c.volunteer?.full_name || c.schedule?.volunteer_name || c.volunteer_name);

const METHOD_LABELS: Record<string, string> = {
  qr_code: 'QR',
  manual: 'Manual',
  facial: 'Facial',
  self_service: 'Self',
};

export default function VolRelatorios() {
  const [period, setPeriod] = useState('week');
  const [teamFilter, setTeamFilter] = useState('__all__');
  const [inactiveMode, setInactiveMode] = useState<'checkin' | 'schedule'>('checkin');
  const [openServiceId, setOpenServiceId] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const teamFilterValue = teamFilter === '__all__' ? undefined : teamFilter;
  const { data: reportData } = useVolReportData(period as any);
  const { data: thermometerData = [] } = useVolunteerThermometer(period as any, teamFilterValue);
  const { data: inactiveByCheckin = [] } = useInactiveVolunteers(period, teamFilterValue, 'checkin');
  const { data: inactiveBySchedule = [] } = useInactiveVolunteers(period, teamFilterValue, 'schedule');
  const { data: teams = [] } = useVolTeams();
  const inactiveData = inactiveMode === 'checkin' ? inactiveByCheckin : inactiveBySchedule;

  // Data (SP) por service_id · usada pra casar check-in × escala mesmo quando o
  // serviço duplicou no sync (mesma data, service_id diferente).
  const svcDateById = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const s of reportData?.services || []) m.set(s.id, dateOfSP(s.scheduled_at));
    return m;
  }, [reportData]);

  // Um check-in só é "sem escala" se NÃO existe escala da mesma pessoa na mesma
  // data (não confia no flag is_unscheduled, que não enxerga a ponte de PCID).
  const isRealmenteSemEscala = useMemo(() => {
    const schedules = reportData?.schedules || [];
    return (ci: import('./types').VolCheckIn) => {
      const ciDate = (ci.service_id ? svcDateById.get(ci.service_id) : null) ?? dateOfSP(ci.service?.scheduled_at);
      return !schedules.some(sch => ciMatchesSched(ci, sch) && svcDateById.get(sch.service_id) === ciDate);
    };
  }, [reportData, svcDateById]);

  // ── Overview stats (Visão Geral) ──
  const overviewStats = useMemo(() => {
    if (!reportData) return { rate: 0, uniqueVol: 0, totalServices: 0, unscheduledCount: 0 };
    const scheduled = reportData.schedules.length;
    const checkedIn = reportData.checkIns.length;
    const rate = scheduled > 0 ? Math.round((checkedIn / scheduled) * 100) : 0;
    const uniqueVol = new Set(reportData.schedules.map(s => s.planning_center_person_id)).size;
    const unscheduledCount = reportData.checkIns.filter(isRealmenteSemEscala).length;
    return { rate, uniqueVol, totalServices: reportData.services.length, unscheduledCount };
  }, [reportData, isRealmenteSemEscala]);

  // Unscheduled check-ins list
  const unscheduledCheckIns = useMemo(() => {
    if (!reportData) return [];
    return reportData.checkIns
      .filter(isRealmenteSemEscala)
      .filter(ciTemIdentidade) // anônimos ficam na contagem agregada (unscheduledAnonimos)
      .sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime())
      .map(ci => {
        const svc = reportData.services.find(s => s.id === ci.service_id);
        return { ...ci, serviceName: svc?.name || 'Desconhecido' };
      });
  }, [reportData, isRealmenteSemEscala]);

  const unscheduledAnonimos = useMemo(() => {
    if (!reportData) return 0;
    return reportData.checkIns.filter(isRealmenteSemEscala).filter(c => !ciTemIdentidade(c)).length;
  }, [reportData, isRealmenteSemEscala]);

  // ── Weekly/Report stats (Relatório Semanal + Por Culto) ──
  const weeklyStats = useMemo(() => {
    if (!reportData) return { scheduled: 0, checkedIn: 0, rate: 0, uniqueVol: 0 };
    const scheduled = reportData.schedules.length;
    const checkedIn = reportData.checkIns.length;
    const rate = scheduled > 0 ? Math.round((checkedIn / scheduled) * 100) : 0;
    const uniqueVol = new Set(reportData.schedules.map(s => s.planning_center_person_id)).size;
    return { scheduled, checkedIn, rate, uniqueVol };
  }, [reportData]);

  // Per-service breakdown · esconde serviços VAZIOS (0 escala e 0 check-in) —
  // são os duplicados internos ("Domingo 08:30/10:00/11:30", "AMI", "Bridge")
  // que nunca recebem escala (as escalas reais vão pros serviços do Planning
  // Center: "Domingo - Manhã", "Culto AMI", etc.).
  const serviceBreakdown = useMemo(() => {
    if (!reportData) return [];
    return reportData.services
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
      .map(svc => {
        const svcSchedules = dedupePorPessoa(reportData.schedules.filter(s => s.service_id === svc.id));
        const svcCheckIns = reportData.checkIns.filter(c => c.service_id === svc.id);
        // Por PESSOA: total = escalados distintos; present = escalados com check-in
        const total = svcSchedules.length;
        const present = svcSchedules.filter(sch => svcCheckIns.some(c => ciMatchesSched(c, sch))).length;
        const rate = total > 0 ? Math.round((present / total) * 100) : 0;
        return { ...svc, total, present, rate };
      })
      .filter(s => s.total > 0 || s.present > 0);
  }, [reportData]);

  // Detalhe de UM culto: quem dos escalados fez check-in (presente), quem não
  // fez (faltou) e quem fez check-in sem estar escalado (sem escala). Tudo
  // derivado do que o relatório já carregou — sem ida ao servidor.
  const serviceDetail = useMemo(() => {
    if (!openServiceId || !reportData) return null;
    const svc = reportData.services.find(s => s.id === openServiceId) || null;
    // Dedup por PESSOA: a escala do PCO tem 1 linha por horário/função e a
    // mesma pessoa aparecia 3x como "presente" (1 check-in × 3 linhas).
    const scheds = dedupePorPessoa(reportData.schedules.filter(s => s.service_id === openServiceId));
    const checks = reportData.checkIns.filter(c => c.service_id === openServiceId);

    // Presente = escalado que tem check-in casado (por id/volunteer_id/PCID/nome);
    // faltou = escalado sem check-in casado.
    const present: typeof scheds = [];
    const absent: typeof scheds = [];
    for (const s of scheds) {
      const did = checks.some(c => ciMatchesSched(c, s));
      (did ? present : absent).push(s);
    }

    // "Sem escala" = check-in que não casa com nenhuma escala DESTE culto E que
    // também não tem escala da mesma pessoa na mesma data (evita falso positivo
    // quando o serviço duplicou no sync). Anônimos (check-in antigo sem nome)
    // são agrupados numa contagem só — não dá pra saber quem foram.
    const extrasTodos = checks.filter(c => !scheds.some(s => ciMatchesSched(c, s)) && isRealmenteSemEscala(c));
    const extras = extrasTodos.filter(ciTemIdentidade);
    const extrasAnonimos = extrasTodos.length - extras.length;

    return { svc, present, absent, extras, extrasAnonimos };
  }, [openServiceId, reportData, isRealmenteSemEscala]);

  // Imprime a chamada (presença) de UM culto numa janela própria.
  const imprimirCulto = (svc: any) => {
    if (!reportData) return;
    const scheds = dedupePorPessoa(reportData.schedules.filter(s => s.service_id === svc.id));
    const checks = reportData.checkIns.filter(c => c.service_id === svc.id);
    const present = scheds.filter(s => checks.some(c => ciMatchesSched(c, s)));
    const absent = scheds.filter(s => !checks.some(c => ciMatchesSched(c, s)));
    const extrasTodos = checks.filter(c => !scheds.some(s => ciMatchesSched(c, s)) && isRealmenteSemEscala(c));
    const extras = extrasTodos.filter(ciTemIdentidade);
    const extrasAnon = extrasTodos.length - extras.length;
    const esc = (t: string) => (t || '').replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m] as string));
    const nomeSched = (s: any) => esc(s.volunteer_name || s.volunteer?.full_name || 'Voluntário');
    const nomeCi = (c: any) => esc(c.volunteer?.full_name || c.schedule?.volunteer_name || c.volunteer_name || 'Voluntário');
    const equipe = (s: any) => s.team_name ? ` <span style="color:#888">· ${esc(s.team_name)}${s.position_name ? ' / ' + esc(s.position_name) : ''}</span>` : '';
    const dt = (() => { try { return new Date(svc.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' }); } catch { return ''; } })();
    const liS = (arr: any[]) => arr.length ? arr.map(s => `<li>${nomeSched(s)}${equipe(s)}</li>`).join('') : '<li style="color:#999">—</li>';
    const liC = (arr: any[]) => arr.length ? arr.map(c => `<li>${nomeCi(c)}</li>`).join('') : '<li style="color:#999">—</li>';
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Chamada · ${esc(svc.name)}</title>
<style>body{font-family:system-ui,-apple-system,Arial,sans-serif;padding:28px;color:#111;max-width:760px;margin:0 auto}
h1{font-size:20px;margin:0 0 2px} .meta{color:#555;font-size:13px;margin-bottom:14px}
h2{font-size:14px;margin:20px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
ul{margin:0;padding-left:20px} li{margin:3px 0;font-size:14px}
.stats{font-size:13px;color:#333;background:#f4f4f5;padding:8px 12px;border-radius:8px;display:inline-block}
@media print{button{display:none}}</style></head><body>
<h1>${esc(svc.name)}</h1>
<div class="meta">${dt}</div>
<div class="stats">Escalados: <b>${scheds.length}</b> · Presentes: <b>${present.length}</b> · Faltaram: <b>${absent.length}</b> · Sem escala: <b>${extras.length}</b></div>
<h2>✓ Presentes (${present.length})</h2><ul>${liS(present)}</ul>
<h2>✗ Faltaram (${absent.length})</h2><ul>${liS(absent)}</ul>
<h2>Check-in sem escala (${extras.length}${extrasAnon ? ` + ${extrasAnon} sem identificação` : ''})</h2><ul>${liC(extras)}${extrasAnon ? `<li style="color:#999">${extrasAnon} check-in(s) sem identificação</li>` : ''}</ul>
<script>window.onload=function(){setTimeout(function(){window.print();},150);}</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=820,height=920');
    if (w) { w.document.write(html); w.document.close(); }
    else { /* popup bloqueado */ alert('Permita pop-ups para imprimir.'); }
  };

  return (
    <div className="space-y-6">
      {/* Diálogo · escolher de qual culto imprimir a chamada */}
      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Imprimir chamada de qual culto?</DialogTitle></DialogHeader>
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {serviceBreakdown.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum culto com escala/check-in no período.</p>
            )}
            {serviceBreakdown.map(svc => (
              <button
                key={svc.id}
                onClick={() => { imprimirCulto(svc); setPrintOpen(false); }}
                className="w-full flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-left hover:bg-accent transition"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{svc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(() => { try { return new Date(svc.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } })()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{svc.present}/{svc.total}</span>
                  <Printer className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Analise de presença</p>
        </div>
        <div className="flex gap-2 items-center w-full sm:w-auto">
          <Button variant="outline" size="sm" className="gap-1 hidden sm:flex" onClick={() => setPrintOpen(true)}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                <SelectValue placeholder="Todas Equipes" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas Equipes</SelectItem>
              {teams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="weekly">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="w-full sm:w-auto overflow-x-auto scrollbar-hide">
            <TabsList className="inline-flex w-auto min-w-max">
              <TabsTrigger value="weekly" className="gap-1 text-xs sm:text-sm"><Calendar className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">Relatório</span> Semanal</TabsTrigger>
              <TabsTrigger value="overview" className="gap-1 text-xs sm:text-sm"><BarChart3 className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">Visão</span> Geral</TabsTrigger>
              <TabsTrigger value="inactive" className="gap-1 text-xs sm:text-sm"><UserX className="h-4 w-4 shrink-0" />Inativos</TabsTrigger>
              <TabsTrigger value="thermometer" className="gap-1 text-xs sm:text-sm"><Flame className="h-4 w-4 shrink-0" />Termometro</TabsTrigger>
            </TabsList>
          </div>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            RELATÓRIO SEMANAL — stats + por culto
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="weekly">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card><CardContent className="p-4 text-center">
              <Calendar className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">{weeklyStats.scheduled}</p>
              <p className="text-xs text-muted-foreground">Escalados</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-600" />
              <p className="text-2xl font-bold">{weeklyStats.checkedIn}</p>
              <p className="text-xs text-muted-foreground">Check-ins</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <TrendingUp className="h-5 w-5 mx-auto mb-1 text-blue-600" />
              <p className="text-2xl font-bold">{weeklyStats.rate}%</p>
              <p className="text-xs text-muted-foreground">Taxa</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <Users className="h-5 w-5 mx-auto mb-1 text-purple-600" />
              <p className="text-2xl font-bold">{weeklyStats.uniqueVol}</p>
              <p className="text-xs text-muted-foreground">Vol. Únicos</p>
            </CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-4">Por Culto</h3>
              {serviceBreakdown.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum culto no período</p>
              ) : (
                <div className="space-y-1">
                  {serviceBreakdown.map(svc => (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => setOpenServiceId(svc.id)}
                      className="w-full flex items-center gap-4 text-left rounded-lg px-2 py-2 -mx-2 hover:bg-accent transition-colors"
                      title="Ver quem fez e quem faltou"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{svc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(svc.scheduled_at), "EEEE, dd/MM 'as' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="w-32 h-2 bg-muted rounded-full overflow-hidden hidden sm:block">
                          <div
                            className={`h-full rounded-full cbrio-bar ${svc.rate >= 80 ? 'bg-green-500' : svc.rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(svc.rate, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground w-16 text-right">{svc.present}/{svc.total}</span>
                        <Badge variant={svc.rate >= 80 ? 'default' : 'outline'} className={svc.rate >= 80 ? 'bg-green-600 text-white' : ''}>
                          {svc.rate}%
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            VISÃO GERAL — taxa, voluntários, cultos, sem escala + lista
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="overview">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card><CardContent className="p-4 text-center">
              <TrendingUp className="h-5 w-5 mx-auto mb-1 text-blue-600" />
              <p className="text-2xl font-bold">{overviewStats.rate}%</p>
              <p className="text-xs text-muted-foreground">Taxa</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <Users className="h-5 w-5 mx-auto mb-1 text-purple-600" />
              <p className="text-2xl font-bold">{overviewStats.uniqueVol}</p>
              <p className="text-xs text-muted-foreground">Voluntários</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <Calendar className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">{overviewStats.totalServices}</p>
              <p className="text-xs text-muted-foreground">Cultos</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
              <p className="text-2xl font-bold">{overviewStats.unscheduledCount}</p>
              <p className="text-xs text-muted-foreground">Sem escala</p>
            </CardContent></Card>
          </div>

          {/* Unscheduled check-ins */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <h3 className="font-semibold">Check-ins sem Escala</h3>
              </div>
              {unscheduledAnonimos > 0 && (
                <p className="text-xs text-muted-foreground mb-3 rounded-lg border border-dashed px-3 py-2 bg-muted/40">
                  {unscheduledAnonimos} check-in{unscheduledAnonimos === 1 ? '' : 's'} sem identificação no período (registrados antes do sistema guardar o nome).
                </p>
              )}
              {unscheduledCheckIns.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum check-in identificado sem escala no período</p>
              ) : (
                <div className="space-y-2">
                  {unscheduledCheckIns.map(ci => (
                    <div key={ci.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{ci.volunteer?.full_name || ci.schedule?.volunteer_name || ci.volunteer_name || 'Voluntário não identificado'}</p>
                        <p className="text-xs text-muted-foreground">{ci.serviceName}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(ci.checked_in_at), 'dd/MM HH:mm')}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {METHOD_LABELS[ci.method] || ci.method}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            TERMOMETRO
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="thermometer">
          <VolunteerThermometer data={thermometerData} period={period} />
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            INATIVOS — Por Check-in / Por Escala
        ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="inactive">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              <button
                onClick={() => setInactiveMode('checkin')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${inactiveMode === 'checkin' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Por Check-in
              </button>
              <button
                onClick={() => setInactiveMode('schedule')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${inactiveMode === 'schedule' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Por Escala
              </button>
            </div>
            <div className="flex items-center gap-2">
              <UserX className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{inactiveData.length} inativos</span>
            </div>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <UserX className="h-5 w-5 text-red-500" />
                <h3 className="font-semibold">
                  Voluntarios Inativos
                </h3>
                <span className="text-sm text-muted-foreground">
                  ({inactiveMode === 'checkin' ? 'sem check-in' : 'sem escala'})
                </span>
              </div>
              <div className="space-y-2">
                {inactiveData.map((v: any) => (
                  <div key={v.planningCenterId} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="min-w-0">
                      <p className="font-medium">{v.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.team ? `${v.team} · ` : ''}
                        {v.lastDate ? `Ultimo: ${new Date(v.lastDate).toLocaleDateString('pt-BR')}` : inactiveMode === 'checkin' ? 'Nunca fez check-in' : 'Nunca foi escalado'}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {v.monthsInactive ? (
                        <Badge className="bg-red-500 text-white hover:bg-red-600">
                          {v.monthsInactive} {v.monthsInactive === 1 ? 'mes' : 'meses'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Nunca
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                {inactiveData.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum voluntário inativo encontrado</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detalhe do culto · quem fez check-in e quem faltou */}
      <Dialog open={!!openServiceId} onOpenChange={(o) => !o && setOpenServiceId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{serviceDetail?.svc?.name || 'Culto'}</DialogTitle>
            {serviceDetail?.svc && (
              <p className="text-sm text-muted-foreground">
                {format(new Date(serviceDetail.svc.scheduled_at), "EEEE, dd/MM 'as' HH:mm", { locale: ptBR })}
              </p>
            )}
          </DialogHeader>

          {serviceDetail && (
            <div className="space-y-5 flex-1 overflow-y-auto min-h-0">
              {/* Resumo */}
              <div className="flex gap-2 text-xs">
                <Badge className="bg-green-600 text-white hover:bg-green-600">{serviceDetail.present.length} presente(s)</Badge>
                <Badge variant="outline" className="border-red-300 text-red-600">{serviceDetail.absent.length} faltou(aram)</Badge>
                {(serviceDetail.extras.length > 0 || serviceDetail.extrasAnonimos > 0) && (
                  <Badge variant="outline" className="border-yellow-300 text-yellow-700">
                    {serviceDetail.extras.length + serviceDetail.extrasAnonimos} sem escala
                  </Badge>
                )}
              </div>

              {/* Presentes */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <h4 className="text-sm font-semibold">Fizeram check-in</h4>
                </div>
                {serviceDetail.present.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ninguém escalado fez check-in.</p>
                ) : (
                  <div className="space-y-1.5">
                    {serviceDetail.present.map(s => (
                      <div key={s.id} className="flex items-center justify-between gap-3 p-2 rounded-lg border bg-card">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.volunteer_name}</p>
                          {(s._equipes?.length || s.position_name) && (
                            <p className="text-xs text-muted-foreground truncate">
                              {s._equipes?.join(' · ') || s.team_name}{(s._equipes?.length || s.team_name) && s.position_name ? ' — ' : ''}{s.position_name}
                            </p>
                          )}
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Faltaram */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <h4 className="text-sm font-semibold">Não fizeram check-in</h4>
                </div>
                {serviceDetail.absent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Todos os escalados fizeram check-in. 🎉</p>
                ) : (
                  <div className="space-y-1.5">
                    {serviceDetail.absent.map(s => (
                      <div key={s.id} className="flex items-center justify-between gap-3 p-2 rounded-lg border bg-card">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.volunteer_name}</p>
                          {(s._equipes?.length || s.position_name) && (
                            <p className="text-xs text-muted-foreground truncate">
                              {s._equipes?.join(' · ') || s.team_name}{(s._equipes?.length || s.team_name) && s.position_name ? ' — ' : ''}{s.position_name}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-red-500 shrink-0">faltou</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sem escala */}
              {(serviceDetail.extras.length > 0 || serviceDetail.extrasAnonimos > 0) && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <UserPlus className="h-4 w-4 text-yellow-600" />
                    <h4 className="text-sm font-semibold">Fizeram check-in sem escala</h4>
                  </div>
                  <div className="space-y-1.5">
                    {serviceDetail.extras.map(c => (
                      <div key={c.id} className="flex items-center justify-between gap-3 p-2 rounded-lg border bg-card">
                        <p className="text-sm font-medium truncate">{c.volunteer?.full_name || c.schedule?.volunteer_name || c.volunteer_name || 'Voluntário'}</p>
                        <Badge variant="outline" className="border-yellow-300 text-yellow-700 text-xs shrink-0">sem escala</Badge>
                      </div>
                    ))}
                    {serviceDetail.extrasAnonimos > 0 && (
                      <div className="flex items-center justify-between gap-3 p-2 rounded-lg border border-dashed bg-muted/40">
                        <p className="text-sm text-muted-foreground">
                          {serviceDetail.extrasAnonimos} check-in{serviceDetail.extrasAnonimos === 1 ? '' : 's'} sem identificação
                          <span className="block text-xs">registrados antes do sistema guardar o nome (05/07) — sem como saber quem foram</span>
                        </p>
                        <Badge variant="outline" className="text-xs shrink-0">anônimos</Badge>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
