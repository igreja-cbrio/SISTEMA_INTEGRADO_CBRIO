import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { dashboardSemanal as api } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Sparkles, Loader2, Archive, CheckCircle2, FileQuestion, BarChart2, LineChart, PieChart, AreaChart, Activity, Radar, Trash2 } from 'lucide-react';

const ICONES_GRAFICO = {
  barra:  BarChart2,
  linha:  LineChart,
  area:   AreaChart,
  pizza:  PieChart,
  gauge:  Activity,
  radar:  Radar,
};

const SUGESTOES_EXEMPLO = [
  'Quero medir a taxa de conversão de visitantes em membros ao longo do ano',
  'Como anda a retenção de novos voluntários nos primeiros 90 dias?',
  'Compare a frequência presencial vs online nos cultos de domingo',
  'Indicador de saúde dos grupos: % de grupos com encontro nas últimas 2 semanas',
];

export default function DashIaAba() {
  const qc = useQueryClient();
  const [pergunta, setPergunta] = useState('');
  const [resultado, setResultado] = useState(null);

  const { data: indicadores, isLoading } = useQuery({
    queryKey: ['dash-sem', 'indic-custom'],
    queryFn: () => api.indicadoresCustomList(),
    staleTime: 30_000,
  });

  const gerar = useMutation({
    mutationFn: (p) => api.iaSugerirIndicador(p),
    onSuccess: (data) => {
      setResultado(data);
      qc.invalidateQueries({ queryKey: ['dash-sem', 'indic-custom'] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => api.indicadorCustomPatch(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dash-sem', 'indic-custom'] }),
  });

  const remover = useMutation({
    mutationFn: (id) => api.indicadorCustomRemove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dash-sem', 'indic-custom'] }),
  });

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-7 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#00B39D]" />
              Criar indicador com IA
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Descreva o que você quer medir em linguagem natural. A IA vai sugerir o indicador, a fórmula, o tipo de gráfico ideal e as tabelas envolvidas. Salva como rascunho pra você revisar.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={4}
              placeholder="Ex: Quero acompanhar quantos visitantes voltam pra um segundo culto em até 30 dias..."
              value={pergunta}
              onChange={e => setPergunta(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5">
              {SUGESTOES_EXEMPLO.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setPergunta(s)}
                  className="text-[11px] px-2 py-1 rounded-full border border-border text-muted-foreground hover:border-[#00B39D] hover:text-[#00B39D] transition-colors"
                >
                  {s.length > 60 ? s.slice(0, 57) + '…' : s}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => gerar.mutate(pergunta)}
                disabled={!pergunta.trim() || gerar.isPending}
              >
                {gerar.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Gerando...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-1.5" />Gerar com IA</>
                )}
              </Button>
            </div>
            {gerar.error && (
              <p className="text-xs text-red-500">{gerar.error.message}</p>
            )}
          </CardContent>
        </Card>

        <AnimatePresence>
          {resultado?.sugestao && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <SugestaoCard sugestao={resultado.sugestao} registro={resultado.registro} onSave={() => updateStatus.mutate({ id: resultado.registro.id, status: 'ativo' })} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="col-span-12 lg:col-span-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Archive className="h-4 w-4 text-muted-foreground" />
          Indicadores criados
        </h3>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !indicadores?.length ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              <FileQuestion className="h-10 w-10 mx-auto mb-2 opacity-50" />
              Nenhum indicador criado ainda.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {indicadores.map(ind => (
              <IndicadorMiniCard
                key={ind.id}
                ind={ind}
                onPromote={() => updateStatus.mutate({ id: ind.id, status: 'ativo' })}
                onArchive={() => updateStatus.mutate({ id: ind.id, status: 'arquivado' })}
                onDelete={() => remover.mutate(ind.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SugestaoCard({ sugestao, registro, onSave }) {
  const Icone = ICONES_GRAFICO[sugestao.tipo_grafico] || BarChart2;
  return (
    <Card className="border-[#00B39D]/40">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{sugestao.nome}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{sugestao.descricao}</p>
          </div>
          <div className="rounded-lg p-2 bg-[#00B39D]/10">
            <Icone className="h-5 w-5 text-[#00B39D]" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Info label="Tipo de gráfico" value={sugestao.tipo_grafico} />
          <Info label="Periodicidade" value={sugestao.periodicidade_sugerida} />
          <Info label="Eixo X" value={sugestao.eixo_x} />
          <Info label="Eixo Y" value={sugestao.eixo_y} />
        </div>

        <Bloco titulo="Fórmula sugerida">
          <code className="text-xs bg-muted/50 p-2 rounded block whitespace-pre-wrap font-mono">
            {sugestao.formula}
          </code>
        </Bloco>

        {sugestao.exemplo_consulta && (
          <Bloco titulo="Consulta de exemplo">
            <code className="text-xs bg-muted/50 p-2 rounded block whitespace-pre-wrap font-mono">
              {sugestao.exemplo_consulta}
            </code>
          </Bloco>
        )}

        {sugestao.tabelas_envolvidas?.length > 0 && (
          <Bloco titulo="Tabelas envolvidas">
            <div className="flex flex-wrap gap-1.5">
              {sugestao.tabelas_envolvidas.map(t => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded bg-muted">{t}</span>
              ))}
            </div>
          </Bloco>
        )}

        {sugestao.metricas_relacionadas?.length > 0 && (
          <Bloco titulo="Indicadores relacionados">
            <div className="flex flex-wrap gap-1.5">
              {sugestao.metricas_relacionadas.map(m => (
                <span key={m} className="text-[11px] px-2 py-0.5 rounded bg-[#00B39D]/10 text-[#00B39D]">{m}</span>
              ))}
            </div>
          </Bloco>
        )}

        {sugestao.alertas?.length > 0 && (
          <Bloco titulo="Pontos de atenção">
            <ul className="space-y-1 text-xs">
              {sugestao.alertas.map((a, i) => (
                <li key={i} className="text-amber-700 dark:text-amber-400">• {a}</li>
              ))}
            </ul>
          </Bloco>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button size="sm" onClick={onSave}>
            <CheckCircle2 className="h-4 w-4 mr-1.5" />Promover a ativo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Bloco({ titulo, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {titulo}
      </p>
      {children}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs font-medium mt-0.5 capitalize">{value || '—'}</p>
    </div>
  );
}

function IndicadorMiniCard({ ind, onPromote, onArchive, onDelete }) {
  const Icone = ICONES_GRAFICO[ind.sugestao_ia?.tipo_grafico] || BarChart2;
  const statusColor = {
    rascunho: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    ativo: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    arquivado: 'bg-muted text-muted-foreground',
  }[ind.status] || 'bg-muted';

  return (
    <div className="rounded-lg border p-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-2">
        <div className="rounded p-1.5 bg-muted/50 shrink-0">
          <Icone className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium truncate">{ind.nome}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusColor}`}>
              {ind.status}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
            {ind.descricao || ind.pergunta_usuario}
          </p>
          <div className="flex items-center gap-2 mt-2 text-[11px]">
            {ind.status === 'rascunho' && (
              <button onClick={onPromote} className="text-emerald-600 hover:underline">Promover</button>
            )}
            {ind.status === 'ativo' && (
              <button onClick={onArchive} className="text-muted-foreground hover:underline">Arquivar</button>
            )}
            {ind.status === 'arquivado' && (
              <button onClick={onPromote} className="text-emerald-600 hover:underline">Reativar</button>
            )}
            <button
              onClick={() => { if (confirm('Remover este indicador?')) onDelete(); }}
              className="text-red-500 hover:underline ml-auto"
            >
              <Trash2 className="h-3 w-3 inline mr-0.5" />Excluir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
