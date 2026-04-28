import { useState, useEffect } from 'react';
import { kpis as kpisApi } from '@/api';
import { Loader2, Target, TrendingUp, AlertCircle, CheckCircle2, Clock, ChevronRight } from 'lucide-react';

const C = {
  primary: '#00B39D',
  warn: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
  purple: '#8B5CF6',
};

type SaudeKPI = 'saudavel' | 'atencao' | 'critico' | 'sem_dados';

interface NSM {
  id: string;
  ano: number;
  metrica: string;
  objetivo?: string;
  alvo_descricao?: string;
  alvo_valor?: number;
  alvo_unidade?: string;
  area_responsavel?: string;
}

interface KPIEstrategico {
  id: string;
  direcionador_id: string;
  nome: string;
  alvo_descricao?: string;
  alvo_valor?: number;
  alvo_unidade?: string;
  area_envolvida?: string;
  taticos_total?: number;
  taticos_verde?: number;
  taticos_vermelho?: number;
  taticos_pendente?: number;
  saude?: SaudeKPI;
}

interface Direcionador {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  cor?: string;
  kpis: KPIEstrategico[];
}

function saudeColor(saude?: SaudeKPI): string {
  switch (saude) {
    case 'saudavel': return C.primary;
    case 'atencao': return C.warn;
    case 'critico': return C.danger;
    default: return '#6B7280';
  }
}

function saudeIcon(saude?: SaudeKPI) {
  const cor = saudeColor(saude);
  if (saude === 'saudavel') return <CheckCircle2 className="h-4 w-4" style={{ color: cor }} />;
  if (saude === 'atencao') return <AlertCircle className="h-4 w-4" style={{ color: cor }} />;
  if (saude === 'critico') return <AlertCircle className="h-4 w-4" style={{ color: cor }} />;
  return <Clock className="h-4 w-4" style={{ color: cor }} />;
}

function StatusDots({ verde = 0, vermelho = 0, pendente = 0, total = 0 }: {
  verde?: number; vermelho?: number; pendente?: number; total?: number;
}) {
  if (total === 0) return <span className="text-xs text-muted-foreground/50">sem táticos</span>;
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: C.primary }} />
        {verde}
      </span>
      {vermelho > 0 && (
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: C.danger }} />
          {vermelho}
        </span>
      )}
      {pendente > 0 && (
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
          {pendente}
        </span>
      )}
      <span className="text-muted-foreground/50">/ {total}</span>
    </div>
  );
}

function KPICard({ kpi, onClick }: { kpi: KPIEstrategico; onClick?: () => void }) {
  const cor = saudeColor(kpi.saude);
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-border bg-card p-4 transition-all ${onClick ? 'cursor-pointer hover:border-[#00B39D]/50 hover:shadow-md' : ''}`}
      style={{ borderLeftWidth: 3, borderLeftColor: cor }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {saudeIcon(kpi.saude)}
            <span className="text-[10px] font-mono text-muted-foreground/60 uppercase">{kpi.id}</span>
          </div>
          <h4 className="text-sm font-semibold text-foreground leading-tight">{kpi.nome}</h4>
        </div>
        {onClick && <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
        <span className="text-xs text-muted-foreground truncate">
          {kpi.alvo_descricao || '—'}
        </span>
        <StatusDots
          verde={kpi.taticos_verde}
          vermelho={kpi.taticos_vermelho}
          pendente={kpi.taticos_pendente}
          total={kpi.taticos_total}
        />
      </div>
      {kpi.area_envolvida && (
        <p className="text-[10px] text-muted-foreground/60 mt-1 truncate">
          {kpi.area_envolvida}
        </p>
      )}
    </div>
  );
}

function NSMCard({ nsm }: { nsm: NSM | null }) {
  if (!nsm) return null;
  return (
    <div
      className="rounded-2xl border-2 p-6 relative overflow-hidden"
      style={{ borderColor: C.primary, background: `linear-gradient(135deg, ${C.primary}10, transparent)` }}
    >
      <div className="absolute top-3 right-3">
        <Target className="h-8 w-8 opacity-20" style={{ color: C.primary }} />
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ background: C.primary, color: 'white' }}
        >
          NSM • {nsm.ano}
        </span>
        <span className="text-xs text-muted-foreground">
          Norte Star Metric — Avaliada {/* periodicidade */} mensalmente
        </span>
      </div>
      <h2 className="text-lg font-bold text-foreground mb-2 max-w-3xl">{nsm.metrica}</h2>
      {nsm.objetivo && (
        <p className="text-sm text-muted-foreground mb-3 max-w-3xl">{nsm.objetivo}</p>
      )}
      <div className="flex items-center gap-4 mt-3 text-sm">
        <div>
          <span className="text-muted-foreground">Alvo: </span>
          <span className="font-bold text-foreground">{nsm.alvo_descricao || '—'}</span>
        </div>
        {nsm.area_responsavel && (
          <div>
            <span className="text-muted-foreground">Responsável: </span>
            <span className="font-medium text-foreground">{nsm.area_responsavel}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TabEstrategico({ onTaticoClick }: { onTaticoClick?: (kpiId: string) => void }) {
  const [nsm, setNsm] = useState<NSM | null>(null);
  const [direcionadores, setDirecionadores] = useState<Direcionador[]>([]);
  const [estrategicosSaude, setEstrategicosSaude] = useState<Record<string, KPIEstrategico>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [nsmData, dirData, estrData] = await Promise.all([
          kpisApi.v2.nsm(),
          kpisApi.v2.direcionadores(),
          kpisApi.v2.estrategicos(),
        ]);
        if (!alive) return;
        setNsm(nsmData);
        setDirecionadores(dirData || []);
        const saudeMap: Record<string, KPIEstrategico> = {};
        (estrData || []).forEach((k: KPIEstrategico) => { saudeMap[k.id] = k; });
        setEstrategicosSaude(saudeMap);
      } catch (e) {
        console.error('Erro ao carregar dados estratégicos', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <NSMCard nsm={nsm} />

      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Direcionadores
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {direcionadores.map(dir => (
            <div
              key={dir.id}
              className="rounded-2xl border border-border bg-card overflow-hidden"
              style={{ borderTopWidth: 4, borderTopColor: dir.cor || C.primary }}
            >
              <div className="px-5 py-3 border-b border-border">
                <h3 className="font-bold text-foreground">{dir.nome}</h3>
                {dir.descricao && (
                  <p className="text-xs text-muted-foreground mt-0.5">{dir.descricao}</p>
                )}
              </div>
              <div className="p-3 space-y-2">
                {dir.kpis.length === 0 && (
                  <p className="text-xs text-muted-foreground/60 text-center py-4">
                    Sem KPIs configurados
                  </p>
                )}
                {dir.kpis.map(kpi => {
                  const enriched = estrategicosSaude[kpi.id] || kpi;
                  return (
                    <KPICard
                      key={kpi.id}
                      kpi={enriched}
                      onClick={onTaticoClick ? () => onTaticoClick(kpi.id) : undefined}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-4 text-xs text-muted-foreground">
        <strong className="text-foreground">Como funciona:</strong> os pontos coloridos em cada KPI mostram quantos
        indicadores táticos estão verde (lançado no período), vermelho (atrasado) ou pendente (nunca lançado).
        A saúde do KPI é calculada pelo % de táticos verdes.
      </div>
    </div>
  );
}
