import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Mail, Phone, CalendarCheck, ScanLine, ListChecks, Activity, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { voluntariado } from '@/api';
import { hrefConversa } from '@/lib/conversas';

const TERMOMETRO: Record<string, { color: string; hint: string }> = {
  muito_ativo: { color: '#0f9d6b', hint: 'serve com frequência' },
  ativo:       { color: '#00B39D', hint: 'ativo nas escalas' },
  pouco_ativo: { color: '#e08a00', hint: 'caiu a frequência' },
  inativo:     { color: '#e0524d', hint: '90+ dias sem servir' },
};
function waContato(tel?: string | null) {
  if (!tel) return null;
  let d = String(tel).replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}`;
}

function fmt(d?: string | null) {
  if (!d) return '—';
  const s = d.length <= 10 ? d + 'T12:00:00' : d;
  return new Date(s).toLocaleDateString('pt-BR');
}
const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-700' },
  pending: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700' },
  declined: { label: 'Recusou', cls: 'bg-red-100 text-red-700' },
};

export default function VolDetalheDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['vol', 'detalhe', id],
    queryFn: () => voluntariado.profiles.detalhe(id as string),
    enabled: !!id,
  });
  const d: any = data || {};
  const p = d.profile || {};
  const t = d.totais || {};

  return (
    <Dialog open={!!id} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
              {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : (p.full_name || '?').charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="truncate">{p.full_name || 'Voluntário'}</p>
              <div className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
                {p.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</span>}
                {p.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> carregando…</div>
          ) : (
            <>
              {/* Termômetro de atividade + contato */}
              {(() => {
                const term = d.termometro;
                const meta = term ? (TERMOMETRO[term.nivel] || TERMOMETRO.ativo) : null;
                const wa = waContato(p.phone);
                if (!term && !wa) return null;
                return (
                  <div className="flex items-center justify-between gap-2 flex-wrap rounded-lg border p-3"
                    style={meta ? { borderColor: meta.color + '55', background: meta.color + '12' } : undefined}>
                    {term ? (
                      <div className="min-w-0">
                        <span className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: meta!.color }}>
                          <Activity className="w-4 h-4" /> {term.label}
                        </span>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {term.dias_desde_ultima_atividade != null ? `serviu há ${term.dias_desde_ultima_atividade} dia(s)` : 'sem atividade registrada'}
                          {' · '}{term.servicos_4m} serviço(s) em 4 meses · {meta!.hint}
                        </p>
                      </div>
                    ) : <span className="text-sm text-muted-foreground">Contato</span>}
                    {wa && (
                      <Link to={hrefConversa(p.phone)}>
                        <Button size="sm" className="h-8 gap-1.5 bg-[#25D366] hover:bg-[#25D366]/85 text-white">
                          <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                        </Button>
                      </Link>
                    )}
                  </div>
                );
              })()}

              {Array.isArray(d.equipes) && d.equipes.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Serve em:</span>
                  {d.equipes.map((eq: string) => (
                    <span key={eq} className="text-xs bg-[#00B39D]/10 text-[#046b60] px-2 py-1 rounded-full font-medium">{eq}</span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold">{t.total_servicos ?? 0}</p><p className="text-[11px] text-muted-foreground">Serviços (total)</p></CardContent></Card>
                <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-emerald-600">{t.servicos_4m ?? 0}</p><p className="text-[11px] text-muted-foreground">Serviços (4 meses)</p></CardContent></Card>
                <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold">{t.total_checkins ?? 0}</p><p className="text-[11px] text-muted-foreground">Check-ins</p></CardContent></Card>
                <Card><CardContent className="p-3 text-center"><p className="text-sm font-bold">{fmt(t.ultimo_servico)}</p><p className="text-[11px] text-muted-foreground">Último serviço</p></CardContent></Card>
              </div>

              {t.por_culto && Object.keys(t.por_culto).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(t.por_culto).map(([c, n]) => (
                    <span key={c} className="text-xs bg-muted px-2 py-1 rounded-full">{c}: <b>{n as number}</b></span>
                  ))}
                </div>
              )}

              <Tabs defaultValue="servicos" className="mt-1">
                <TabsList>
                  <TabsTrigger value="servicos"><ListChecks className="w-3.5 h-3.5 mr-1" /> Serviços ({(d.servicos || []).length})</TabsTrigger>
                  <TabsTrigger value="checkins"><ScanLine className="w-3.5 h-3.5 mr-1" /> Check-ins ({(d.checkins || []).length})</TabsTrigger>
                  <TabsTrigger value="escalas"><CalendarCheck className="w-3.5 h-3.5 mr-1" /> Escalas ({(d.escalas || []).length})</TabsTrigger>
                </TabsList>

                <TabsContent value="servicos" className="mt-2">
                  <div className="max-h-72 overflow-y-auto divide-y">
                    {(d.servicos || []).length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nenhum serviço registrado.</p>}
                    {(d.servicos || []).map((s: any, i: number) => (
                      <div key={i} className="py-2 flex items-center justify-between text-sm">
                        <span>{fmt(s.data)} · {s.culto_label}</span>
                        <Badge variant="secondary" className="text-[10px]">{s.origem === 'planning_center' ? 'Planning Center' : 'Planilha'}</Badge>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="checkins" className="mt-2">
                  <div className="max-h-72 overflow-y-auto divide-y">
                    {(d.checkins || []).length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nenhum check-in.</p>}
                    {(d.checkins || []).map((c: any) => (
                      <div key={c.id} className="py-2 flex items-center justify-between text-sm">
                        <span>{fmt(c.checked_in_at)} · {c.service?.service_type_name || c.service?.name || 'Culto'}</span>
                        <span className="text-xs text-muted-foreground">{c.is_unscheduled ? 'sem escala' : 'escalado'}{c.method ? ` · ${c.method}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="escalas" className="mt-2">
                  <div className="max-h-72 overflow-y-auto divide-y">
                    {(d.escalas || []).length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma escala.</p>}
                    {(d.escalas || []).map((e: any) => {
                      const st = STATUS[e.confirmation_status] || { label: e.confirmation_status || '—', cls: 'bg-muted text-muted-foreground' };
                      return (
                        <div key={e.id} className="py-2 flex items-center justify-between text-sm gap-2">
                          <span className="min-w-0 truncate">{fmt(e.service?.scheduled_at)} · {e.team_name || '—'}{e.position_name ? ` · ${e.position_name}` : ''}</span>
                          <Badge className={`text-[10px] shrink-0 ${st.cls}`}>{st.label}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
