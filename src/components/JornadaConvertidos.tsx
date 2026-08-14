/**
 * Jornada do novo convertido · primeiros 90 dias.
 * 3 marcos por pessoa: Contato pastoral ≤3d · Batismo ≤90d · Next ≤90d.
 * Reutilizável e segmentável por área:
 *  - Cuidados (cockpit do Marcelo · todas as áreas + filtro)
 *  - /ami, /bridge, /online (cada líder vê a sua área · prop `area`)
 *  - Integração aba Next (view="next" · foco na cobertura do Next)
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { cuidados as cuidadosApi } from '../api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Loader2, HeartHandshake, Droplets, Sparkles, Phone } from 'lucide-react';
import { toast } from 'sonner';
import JornadaTimeline from './jornada/JornadaTimeline';

const AREA_LABEL: Record<string, string> = { ami: 'AMI', bridge: 'Bridge', online: 'Online', sede: 'Sede', cba: 'CBA' };
const AREAS = ['ami', 'bridge', 'online', 'sede'];

const ST: Record<string, { label: string; color: string }> = {
  feito:          { label: 'Feito',            color: '#10b981' },
  feito_no_prazo: { label: 'No prazo ✓',       color: '#10b981' },
  feito_atrasado: { label: 'Feito (fora)',     color: '#0ea5e9' },
  inscrito:       { label: 'Inscrito',         color: '#3b82f6' },
  no_prazo:       { label: 'No prazo',         color: '#94a3b8' },
  vencendo:       { label: 'Vencendo',         color: '#f59e0b' },
  atrasado:       { label: 'Atrasado',         color: '#ef4444' },
};

function Pill({ status }: { status: string }) {
  const m = ST[status] || ST.no_prazo;
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
      style={{ background: m.color + '22', color: m.color, border: `1px solid ${m.color}40` }}>
      {m.label}
    </span>
  );
}

function ResumoCard({ icon: Icon, titulo, pct, sub, color }: any) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
      <div className="rounded-lg p-2 shrink-0" style={{ background: color + '18' }}>
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div>
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{titulo}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-foreground">{pct}%</span>
        </div>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

export default function JornadaConvertidos({ area, view = 'full' }: { area?: string; view?: 'full' | 'next' }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [areaFiltro, setAreaFiltro] = useState<string>(area || 'todas');
  const [statusFiltro, setStatusFiltro] = useState<'todos' | 'pendentes' | 'atrasados'>(view === 'next' ? 'pendentes' : 'todos');
  // A linha do tempo é a visão padrão do acompanhamento (pedido do Matheus ·
  // 14/08): ela responde "quanto tempo levou" e "quem parou". A aba Next segue
  // na tabela — ali a pergunta é cobertura do Next, não trajetória.
  const [vista, setVista] = useState<'linha' | 'tabela'>(view === 'next' ? 'tabela' : 'linha');

  const efetivaArea = area || (areaFiltro === 'todas' ? undefined : areaFiltro);

  const reload = useCallback(() => {
    setLoading(true);
    cuidadosApi.jornadaConvertidos(efetivaArea ? { area: efetivaArea } : undefined)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [efetivaArea]);

  useEffect(() => { reload(); }, [reload]);

  const marcarContato = async (id: string) => {
    try {
      await cuidadosApi.convertidos.registrarContato(id);
      toast.success('Contato registrado');
      reload();
    } catch (e: any) { toast.error(e.message); }
  };

  const itens = useMemo(() => {
    const arr: any[] = data?.itens || [];
    if (view === 'next') {
      const base = statusFiltro === 'todos' ? arr : arr.filter(i => !i.next.feito);
      return statusFiltro === 'atrasados' ? base.filter(i => i.next.status === 'atrasado') : base;
    }
    if (statusFiltro === 'atrasados') return arr.filter(i => [i.contato, i.batismo, i.next].some(m => m.status === 'atrasado'));
    if (statusFiltro === 'pendentes') return arr.filter(i => !i.contato.feito || !i.batismo.feito || !i.next.feito);
    return arr;
  }, [data, statusFiltro, view]);

  const r = data?.resumo;

  return (
    <div className="space-y-4">
      {/* Resumo · na linha do tempo os tiles próprios já respondem isso */}
      {r && vista === 'tabela' && (
        <div className={`grid gap-3 ${view === 'next' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
          {view !== 'next' && (
            <ResumoCard icon={Phone} color="#00B39D" titulo="Contato feito"
              pct={r.contato_pct} sub={`${r.contato_feitos ?? r.contato_no_prazo}/${r.total} feitos · ${r.contato_pendentes ?? r.contato_atrasados} pendentes`} />
          )}
          {view !== 'next' && (
            <ResumoCard icon={Droplets} color="#0ea5e9" titulo="Batismo ≤ 90 dias"
              pct={r.batismo_pct} sub={`${r.batismo_feitos}/${r.total} batizados`} />
          )}
          <ResumoCard icon={Sparkles} color="#8b5cf6" titulo="Next ≤ 90 dias"
            pct={r.next_pct} sub={`${r.next_feitos}/${r.total} fizeram o Next`} />
          {view === 'next' && (
            <ResumoCard icon={HeartHandshake} color="#00B39D" titulo="Convertidos"
              pct={r.total ? 100 : 0} sub={`${r.total} no acompanhamento`} />
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        {!area && (
          <Select value={areaFiltro} onValueChange={setAreaFiltro}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as áreas</SelectItem>
              {AREAS.map(a => <SelectItem key={a} value={a}>{AREA_LABEL[a]}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {vista === 'tabela' && (
          <Select value={statusFiltro} onValueChange={(v: any) => setStatusFiltro(v)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendentes">{view === 'next' ? 'Ainda sem Next' : 'Com pendência'}</SelectItem>
              <SelectItem value="atrasados">Atrasados</SelectItem>
            </SelectContent>
          </Select>
        )}

        {view !== 'next' && (
          <div className="ml-auto inline-flex rounded-lg border border-border p-0.5">
            {([['linha', 'Linha do tempo'], ['tabela', 'Tabela']] as const).map(([v, rotulo]) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  vista === v ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        )}
      </div>

      {vista === 'linha' ? (
        loading ? (
          <div className="rounded-[16px] border border-border bg-card py-12 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground inline" />
          </div>
        ) : !data ? (
          <div className="rounded-[16px] border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            Não foi possível carregar o acompanhamento. Tente recarregar a página.
          </div>
        ) : (
          <JornadaTimeline data={data} />
        )
      ) : (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              {!area && <TableHead>Área</TableHead>}
              <TableHead className="whitespace-nowrap">Dias</TableHead>
              {view !== 'next' && <TableHead>Contato</TableHead>}
              {view !== 'next' && <TableHead>Batismo 90d</TableHead>}
              <TableHead>Next 90d</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground inline" /></TableCell></TableRow>
            ) : itens.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                {data?.itens?.length ? 'Nada neste filtro.' : 'Nenhum convertido no acompanhamento.'}
              </TableCell></TableRow>
            ) : itens.map((i: any) => (
              <TableRow key={i.id} className={i.contato.status === 'atrasado' ? 'border-l-2 border-l-destructive' : undefined}>
                <TableCell className="font-medium">
                  {(() => {
                    // Inscrito no Batismo/Next mas ainda não foi/não formou → nome em azul
                    const inscritoPendente = i.batismo?.status === 'inscrito' || i.next?.status === 'inscrito';
                    return (
                      <span
                        style={inscritoPendente ? { color: '#3b82f6' } : undefined}
                        title={inscritoPendente ? 'Inscrito no Batismo/Next, mas ainda não foi/não formou' : undefined}
                      >
                        {i.nome}
                      </span>
                    );
                  })()}
                  {i.telefone && <div className="text-xs text-muted-foreground">{i.telefone}</div>}
                </TableCell>
                {!area && <TableCell className="text-sm">{AREA_LABEL[i.area] || '—'}</TableCell>}
                <TableCell className="text-sm whitespace-nowrap">{i.dias_desde_conversao}d</TableCell>
                {view !== 'next' && (
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Pill status={i.contato.status} />
                      {!i.contato.feito && (
                        <button onClick={() => marcarContato(i.id)} className="text-[11px] text-primary hover:underline whitespace-nowrap">marcar contato</button>
                      )}
                    </div>
                  </TableCell>
                )}
                {view !== 'next' && <TableCell><Pill status={i.batismo.status} /></TableCell>}
                <TableCell><Pill status={i.next.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}
    </div>
  );
}
