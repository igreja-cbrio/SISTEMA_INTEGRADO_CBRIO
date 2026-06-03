import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { marketing as api } from '../../api';
import MarketingNav from './MarketingNav';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import {
  Megaphone, BarChart3, Kanban, CalendarDays, Settings, Loader2, TrendingUp,
  Clock, Users, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

const KPI_META = {
  'MKT-PRAZO':      { nome: '% no prazo',           unidade: '%',     meta: 85,  cor: '#10B981', icone: CheckCircle2, melhor: 'maior' },
  'MKT-LEAD':       { nome: 'Lead time médio',      unidade: 'dias',  meta: 7,   cor: '#0EA5E9', icone: Clock,        melhor: 'menor' },
  'MKT-THROUGHPUT': { nome: 'Cards entregues/sem',  unidade: 'cards', meta: 5,   cor: '#A855F7', icone: TrendingUp,   melhor: 'maior' },
  'MKT-DEM-CAP':    { nome: 'Demanda / Capacidade', unidade: '%',     meta: 100, cor: '#F59E0B', icone: AlertTriangle,melhor: 'menor' },
};

export default function MarketingAnalytics() {
  const navigate = useNavigate();
  const { isAdmin, modulePerms } = useAuth();
  const lvl = modulePerms?.marketing?.leitura || 0;
  const isCoord = isAdmin || (modulePerms?.marketing?.escrita || 0) >= 5;

  const [semanas, setSemanas] = useState('12');
  const [kpis, setKpis] = useState({ snapshot: {}, serie: {} });
  const [aprovacoes, setAprovacoes] = useState([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [k, a] = await Promise.all([
        api.analytics.kpis(parseInt(semanas)),
        api.analytics.aprovacoesOrigem(90),
      ]);
      if (k) setKpis(k);
      if (Array.isArray(a)) setAprovacoes(a);
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar analytics');
    } finally {
      setLoading(false);
    }
  }, [semanas]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Marketing · Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">4 KPIs MKT-* + tempo de aprovação dos diretores</p>
        </div>
        <MarketingNav />
      </div>

      {/* Filtro de período */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Período da série:</span>
        <Select value={semanas} onValueChange={setSemanas}>
          <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="4">4 semanas</SelectItem>
            <SelectItem value="8">8 semanas</SelectItem>
            <SelectItem value="12">12 semanas</SelectItem>
            <SelectItem value="24">24 semanas</SelectItem>
            <SelectItem value="52">52 semanas (1 ano)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Cards de snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(KPI_META).map(([id, meta]) => {
              const snap = kpis.snapshot?.[id];
              const valor = snap?.valor;
              const Icone = meta.icone;
              const alerta = valor != null && (
                meta.melhor === 'maior' ? valor < meta.meta : valor > meta.meta
              );
              return (
                <Card key={id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icone className="h-4 w-4" style={{ color: meta.cor }} />
                      <p className="text-xs font-medium text-muted-foreground">{meta.nome}</p>
                    </div>
                    {alerta && <Badge className="text-[10px] bg-rose-500/15 text-rose-700">fora da meta</Badge>}
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {valor != null ? (
                      <>{valor}<span className="text-sm text-muted-foreground ml-1">{meta.unidade}</span></>
                    ) : (
                      <span className="text-muted-foreground text-base">—</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Meta: {meta.melhor === 'maior' ? '≥' : '≤'} {meta.meta} {meta.unidade}
                  </p>
                  {snap?.observacao && (
                    <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2">{snap.observacao}</p>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Gráfico temporal · 1 linha por KPI */}
          <Card className="p-4">
            <p className="text-sm font-semibold text-foreground mb-3">Evolução temporal · últimas {semanas} semanas</p>
            <SeriesChart serie={kpis.serie} />
          </Card>

          {/* Gargalo dos diretores de origem (Spec 011) */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 text-amber-600" />
                  Tempo médio de aprovação por diretor de origem
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Últimos 90 dias · solicitações da área Marketing · monitora gargalos
                </p>
              </div>
            </div>
            {aprovacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Sem solicitações aprovadas/rejeitadas no período
              </p>
            ) : (
              <div className="space-y-2">
                {aprovacoes.map(a => (
                  <div key={a.diretor_id} className="flex items-center justify-between gap-3 p-2 rounded bg-muted/20">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{a.diretor_nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.total} decisões · {a.rejeitadas} rejeitadas
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${a.gargalo ? 'text-rose-600' : 'text-foreground'}`}>
                        {a.tempo_medio_h}h
                      </p>
                      {a.gargalo && <Badge className="text-[10px] bg-rose-500/15 text-rose-700">gargalo</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function SeriesChart({ serie }) {
  // Monta dataset unificado · 1 linha por período · valor de cada KPI como coluna
  const data = useMemo(() => {
    const periodos = new Set();
    Object.values(serie || {}).forEach(arr => (arr || []).forEach(r => periodos.add(r.periodo)));
    const sorted = [...periodos].sort();
    return sorted.map(p => {
      const row = { periodo: p };
      for (const [id, arr] of Object.entries(serie || {})) {
        const found = (arr || []).find(r => r.periodo === p);
        row[id] = found?.valor != null ? Number(found.valor) : null;
      }
      return row;
    });
  }, [serie]);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Sem dados no período</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,120,0.2)" />
        <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--cbrio-card, #111)', border: '1px solid rgba(120,120,120,0.3)', borderRadius: 6, fontSize: 12 }}
        />
        {Object.entries(KPI_META).map(([id, meta]) => (
          <Line
            key={id}
            type="monotone"
            dataKey={id}
            stroke={meta.cor}
            strokeWidth={2}
            dot={{ r: 3 }}
            name={`${meta.nome} (${meta.unidade})`}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
