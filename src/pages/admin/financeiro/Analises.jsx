import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, TrendingUp, TrendingDown, Activity, Bell, X, RefreshCw,
  Calendar, ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { financeiroV2 } from '../../../api';
import {
  LineChart, Line, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

const COLORS = {
  primary: '#00B39D',
  green: '#10b981',
  red: '#ef4444',
  amber: '#f59e0b',
  blue: '#3b82f6',
  purple: '#8b5cf6',
};

const SUBTABS = ['Visão geral', 'Heatmap', 'Previsão', 'Alertas'];

const fmtMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCompact = (v) => {
  const n = Math.abs(Number(v || 0));
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(0)}k`;
  return fmtMoney(v);
};
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

export default function Analises() {
  const [sub, setSub] = useState(0);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {SUBTABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setSub(i)}
            style={{
              padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6,
              cursor: 'pointer',
              border: `1px solid ${sub === i ? COLORS.primary : 'var(--cbrio-border)'}`,
              background: sub === i ? '#00B39D18' : 'transparent',
              color: sub === i ? COLORS.primary : 'var(--cbrio-text2)',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {sub === 0 && <VisaoGeral onJumpToAlertas={() => setSub(3)} />}
      {sub === 1 && <Heatmap />}
      {sub === 2 && <Previsao />}
      {sub === 3 && <Alertas />}
    </div>
  );
}

// ============================================================
// VISAO GERAL · resumo de tudo
// ============================================================
function VisaoGeral({ onJumpToAlertas }) {
  const [alertas, setAlertas] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rodando, setRodando] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [a, f] = await Promise.all([
        financeiroV2.alertas.list({ status: 'pendente', limit: 10 }).catch((e) => {
          console.warn('[Analises] alertas falhou:', e.message);
          return [];
        }),
        financeiroV2.analises.forecast(4).catch((e) => {
          console.warn('[Analises] forecast falhou:', e.message);
          return null;
        }),
      ]);
      setAlertas(a || []);
      setForecast(f);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rodarAgora = async () => {
    setRodando(true);
    await financeiroV2.analises.rodar();
    await load();
    setRodando(false);
  };

  const criticos = alertas.filter(a => a.severidade === 'critico');
  const avisos = alertas.filter(a => a.severidade === 'aviso');
  const infos = alertas.filter(a => a.severidade === 'info');

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ResumoCard
          icon={AlertTriangle}
          color={COLORS.red}
          label="Alertas críticos"
          valor={criticos.length}
          onClick={onJumpToAlertas}
        />
        <ResumoCard
          icon={Bell}
          color={COLORS.amber}
          label="Avisos"
          valor={avisos.length}
          onClick={onJumpToAlertas}
        />
        <ResumoCard
          icon={Activity}
          color={COLORS.blue}
          label="Notas informativas"
          valor={infos.length}
          onClick={onJumpToAlertas}
        />
      </div>

      {/* Acoes */}
      <Card>
        <CardContent className="pt-4 pb-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold">Análise financeira</h3>
            <p className="text-xs text-muted-foreground">
              Engine roda automaticamente no cron diário. Pode rodar manualmente também.
            </p>
          </div>
          <Button onClick={rodarAgora} disabled={rodando}>
            <RefreshCw className={`h-4 w-4 mr-2 ${rodando ? 'animate-spin' : ''}`} />
            {rodando ? 'Rodando...' : 'Rodar análise agora'}
          </Button>
        </CardContent>
      </Card>

      {/* Top alertas */}
      {alertas.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Alertas pendentes</h3>
              <Button variant="ghost" size="sm" onClick={onJumpToAlertas}>
                Ver todos <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <div className="space-y-2">
              {alertas.slice(0, 5).map(a => (
                <AlertaItem key={a.id} alerta={a} compact onDismiss={null} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Previsao mini */}
      {forecast && !forecast.erro && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-1">Previsão das próximas semanas</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Média das últimas 4 semanas: <strong>{fmtMoney(forecast.base_media_4_semanas)}</strong>
            </p>
            <ForecastChart forecast={forecast} height={200} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResumoCard({ icon: Icon, color, label, valor, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-card border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: color + '22', color }}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      </div>
      <div className="text-3xl font-bold tabular-nums" style={{ color }}>
        {valor}
      </div>
    </button>
  );
}

// ============================================================
// HEATMAP · dia da semana × hora
// ============================================================
function Heatmap() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    setLoading(true);
    financeiroV2.analises.heatmap()
      .then(setData)
      .catch((e) => {
        console.warn('[Heatmap] falhou:', e.message);
        setErro(e.message || 'Erro ao carregar heatmap');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (erro || !data) return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        {erro
          ? `Erro: ${erro}. Verifique se a migration de análises foi aplicada no Supabase.`
          : 'Sem dados de heatmap · ainda não há transações suficientes'}
      </CardContent>
    </Card>
  );

  const max = data.max || 1;
  const corFundo = (valor) => {
    if (valor === 0) return 'bg-muted/20';
    const intensidade = valor / max;
    // gradient de verde claro a verde escuro
    if (intensidade >= 0.85) return 'bg-emerald-600';
    if (intensidade >= 0.65) return 'bg-emerald-500';
    if (intensidade >= 0.45) return 'bg-emerald-400';
    if (intensidade >= 0.25) return 'bg-emerald-300';
    if (intensidade >= 0.10) return 'bg-emerald-200';
    return 'bg-emerald-100';
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold mb-1">Heatmap de Arrecadação</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Receita total por dia da semana × hora · últimos 12 meses
          </p>

          {/* Hover info */}
          <div className="h-6 mb-2 text-xs font-medium" style={{ color: COLORS.green }}>
            {hover
              ? `${data.dias_label[hover.dia]} às ${String(hover.hora).padStart(2, '0')}h · ${fmtMoney(hover.valor)} (${hover.qtd} contribuições)`
              : 'Passe o mouse sobre uma célula pra ver detalhes'}
          </div>

          {/* Grid */}
          <div className="overflow-x-auto">
            <table className="border-collapse" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th className="text-[10px] font-semibold p-1"></th>
                  {Array.from({ length: 24 }, (_, h) => (
                    <th key={h} className="text-[10px] font-semibold text-muted-foreground p-1 w-7 text-center">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.dias_label.map((dia, d) => (
                  <tr key={d}>
                    <td className="text-xs font-semibold pr-2 text-right">{dia}</td>
                    {Array.from({ length: 24 }, (_, h) => {
                      const valor = data.matriz[d][h];
                      const qtd = data.qtd[d][h];
                      return (
                        <td key={h} className="p-0.5">
                          <div
                            className={`w-7 h-7 rounded ${corFundo(valor)} cursor-pointer transition hover:ring-2 hover:ring-primary`}
                            onMouseEnter={() => setHover({ dia: d, hora: h, valor, qtd })}
                            onMouseLeave={() => setHover(null)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-1 mt-4 text-xs text-muted-foreground">
            <span>Menor</span>
            <div className="w-5 h-3 rounded bg-emerald-100" />
            <div className="w-5 h-3 rounded bg-emerald-200" />
            <div className="w-5 h-3 rounded bg-emerald-300" />
            <div className="w-5 h-3 rounded bg-emerald-400" />
            <div className="w-5 h-3 rounded bg-emerald-500" />
            <div className="w-5 h-3 rounded bg-emerald-600" />
            <span>Maior · {fmtMoney(max)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Top horários */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold mb-3">Top 5 horários de arrecadação</h3>
          <div className="space-y-2">
            {topHorarios(data).slice(0, 5).map((h, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{i + 1}º</Badge>
                  <span className="text-sm">
                    <strong>{data.dias_label[h.dia]}</strong> às <strong>{String(h.hora).padStart(2, '0')}h</strong>
                  </span>
                </div>
                <div className="text-sm tabular-nums">
                  <strong style={{ color: COLORS.green }}>{fmtMoney(h.valor)}</strong>
                  <span className="text-xs text-muted-foreground ml-2">· {h.qtd} contribuições</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function topHorarios(data) {
  const result = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (data.matriz[d][h] > 0) {
        result.push({ dia: d, hora: h, valor: data.matriz[d][h], qtd: data.qtd[d][h] });
      }
    }
  }
  return result.sort((a, b) => b.valor - a.valor);
}

// ============================================================
// PREVISAO · forecast
// ============================================================
function Previsao() {
  const [semanas, setSemanas] = useState(4);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    financeiroV2.analises.forecast(semanas)
      .then(setData)
      .finally(() => setLoading(false));
  }, [semanas]);

  if (loading) return <Loading />;
  if (!data || data.erro) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {data?.erro === 'historico_insuficiente'
            ? 'Histórico insuficiente · precisa de pelo menos 4 semanas de receita pra gerar previsão'
            : 'Sem dados pra prever'}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-4 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium mr-2">Prever próximas:</span>
          {[2, 4, 8, 12].map(n => (
            <Button
              key={n}
              variant={semanas === n ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSemanas(n)}
            >
              {n} semanas
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold mb-1">Previsão de receita</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Histórico real (azul) + projeção (verde) + intervalo ±20%
          </p>
          <ForecastChart forecast={data} height={360} />

          <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Média das últimas 4 semanas</div>
              <div className="font-bold text-lg">{fmtMoney(data.base_media_4_semanas)}</div>
            </div>
            {data.base_media_anual && (
              <div>
                <div className="text-xs text-muted-foreground">Média do ano</div>
                <div className="font-bold text-lg">{fmtMoney(data.base_media_anual)}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ForecastChart({ forecast, height = 300 }) {
  const dados = [
    ...forecast.historico.map(h => ({
      label: h.semana_inicio.slice(5),
      real: h.receita_total,
      tipo: 'real',
    })),
    ...forecast.previsoes.map(p => ({
      label: p.semana_inicio.slice(5),
      previsto: p.estimativa,
      minimo: p.minimo,
      maximo: p.maximo,
      tipo: 'previsto',
    })),
  ];

  // adiciona ponto de transicao pra ligar as duas linhas
  if (forecast.historico.length > 0 && forecast.previsoes.length > 0) {
    const ultimoReal = forecast.historico[forecast.historico.length - 1].receita_total;
    if (dados.find(d => d.tipo === 'previsto')) {
      dados[forecast.historico.length - 1].previsto = ultimoReal;
    }
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={dados}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCompact(v).replace('R$ ', '')} />
          <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="maximo" stroke="none" fill={COLORS.green} fillOpacity={0.1} legendType="none" />
          <Area type="monotone" dataKey="minimo" stroke="none" fill={COLORS.green} fillOpacity={0.1} legendType="none" />
          <Line type="monotone" dataKey="real" stroke={COLORS.blue} strokeWidth={2.5} name="Receita real" dot={{ r: 3 }} />
          <Line type="monotone" dataKey="previsto" stroke={COLORS.green} strokeWidth={2.5} strokeDasharray="5 5" name="Previsão" dot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// ALERTAS · lista + dismiss
// ============================================================
function Alertas() {
  const [status, setStatus] = useState('pendente');
  const [tipo, setTipo] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = { status, limit: 100 };
      if (tipo) params.tipo = tipo;
      const result = await financeiroV2.alertas.list(params).catch((e) => {
        console.warn('[Analises/Alertas] list falhou:', e.message);
        return [];
      });
      setData(result || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [status, tipo]);

  const dismiss = async (id, comentario) => {
    await financeiroV2.alertas.dismiss(id, { comentario });
    load();
  };

  const tipos = ['', 'queda_receita', 'contribuinte_sumido', 'despesa_fixa_atrasada', 'pico_anormal', 'composicao_mudou'];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium mr-1">Status:</span>
          {['pendente', 'atendido'].map(s => (
            <Button key={s} variant={status === s ? 'default' : 'outline'} size="sm" onClick={() => setStatus(s)}>
              {s === 'pendente' ? 'Pendentes' : 'Atendidos'}
            </Button>
          ))}
          <span className="text-xs font-medium ml-4 mr-1">Tipo:</span>
          {tipos.map(t => (
            <Button key={t} variant={tipo === t ? 'default' : 'outline'} size="sm" onClick={() => setTipo(t)}>
              {t || 'Todos'}
            </Button>
          ))}
        </CardContent>
      </Card>

      {loading ? <Loading /> : (
        <div className="space-y-2">
          {data.map(a => (
            <AlertaItem key={a.id} alerta={a} onDismiss={status === 'pendente' ? dismiss : null} />
          ))}
          {data.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {status === 'pendente' ? 'Nenhum alerta pendente ✓' : 'Nenhum alerta atendido'}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function AlertaItem({ alerta, onDismiss, compact = false }) {
  const corSev = alerta.severidade === 'critico' ? COLORS.red
    : alerta.severidade === 'aviso' ? COLORS.amber
    : COLORS.blue;

  return (
    <Card style={{ borderLeftColor: corSev, borderLeftWidth: 4 }}>
      <CardContent className={compact ? 'py-3' : 'pt-4 pb-4'}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge style={{ background: corSev + '22', color: corSev, borderColor: corSev + '50' }}>
                {alerta.severidade}
              </Badge>
              <Badge variant="outline" className="text-[10px]">{alerta.tipo}</Badge>
              {alerta.atendido_em && (
                <Badge variant="secondary" className="text-[10px]">✓ atendido</Badge>
              )}
              <span className="text-[10px] text-muted-foreground">
                {new Date(alerta.created_at).toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="text-sm font-semibold">{alerta.titulo}</div>
            <div className="text-xs text-muted-foreground mt-1">{alerta.mensagem}</div>
            {alerta.comentario_atendimento && (
              <div className="text-xs text-muted-foreground mt-1 italic">
                Atendido: {alerta.comentario_atendimento}
              </div>
            )}
          </div>
          {onDismiss && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const c = prompt('Comentário (opcional):', '');
                if (c !== null) onDismiss(alerta.id, c);
              }}
            >
              <X className="h-3 w-3 mr-1" /> Atender
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Loading
// ============================================================
function Loading() {
  return (
    <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
      Carregando...
    </div>
  );
}
