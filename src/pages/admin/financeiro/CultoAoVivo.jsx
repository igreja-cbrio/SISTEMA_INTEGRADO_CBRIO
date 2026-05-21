import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, TrendingUp, Calendar, Users, Sparkles } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { supabase } from '../../../integrations/supabase/client';
import { santander } from '../../../api';

const COLORS = {
  primary: '#00B39D',
  green: '#10b981',
  red: '#ef4444',
  amber: '#f59e0b',
  blue: '#3b82f6',
  purple: '#8b5cf6',
};

const fmtMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtHora = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return new Date(iso).toLocaleString('pt-BR');
}

function extractCentavo(valor) {
  const cent = Math.round((Math.abs(Number(valor)) % 1) * 100);
  return String(cent).padStart(2, '0');
}

function shortMemo(memo) {
  if (!memo) return '';
  let s = memo.replace(/PIX RECEBIDO/i, '').replace(/\d{11,14}/g, '').replace(/\s+/g, ' ').trim();
  return s.length > 40 ? s.slice(0, 39) + '…' : s || 'PIX';
}

export default function CultoAoVivo() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState(new Set());
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [, forceRender] = useState(0);

  const loadStats = useCallback(async () => {
    try {
      const res = await santander.pixCultoAtual?.() || await fetch('/api/santander/pix/culto-atual', {
        headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
      }).then(r => r.json());
      setData(res);
      setLastUpdate(Date.now());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Re-render a cada 10s pra atualizar "X seg atrás" nos cards
  useEffect(() => {
    const id = setInterval(() => forceRender(n => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  // Refresh stats a cada 60s (fallback se Realtime falhar)
  useEffect(() => {
    const id = setInterval(loadStats, 60_000);
    return () => clearInterval(id);
  }, [loadStats]);

  // Supabase Realtime · escuta novos creditos em fin_lancamentos_brutos
  useEffect(() => {
    const channel = supabase
      .channel('culto-ao-vivo')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'fin_lancamentos_brutos',
          filter: 'tipo_trn=eq.CREDIT',
        },
        (payload) => {
          const novo = payload.new;
          setNewIds(prev => new Set([...prev, novo.id]));
          setTimeout(() => setNewIds(prev => {
            const next = new Set(prev);
            next.delete(novo.id);
            return next;
          }), 5_000);
          // Atualiza stats apos receber novo PIX
          loadStats();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
        Carregando culto ao vivo...
      </div>
    );
  }

  const ativo = data?.culto_ativo;
  const transacoes = data?.transacoes || [];
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="h-3 w-3 rounded-full"
            style={{ background: ativo ? COLORS.red : COLORS.amber }}
          />
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              Culto ao Vivo
            </h2>
            <p className="text-sm text-muted-foreground capitalize">{hoje}</p>
          </div>
        </div>
        <Badge variant={ativo ? 'default' : 'secondary'} className="px-3 py-1">
          {ativo ? '🔴 AO VIVO' : '⚫ Sem culto agora'}
        </Badge>
      </div>

      {/* Cards de totalizadores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TotalCard
          icon={Sparkles}
          color={COLORS.primary}
          label={ativo ? `${ativo.nome}` : 'Próximo culto'}
          sublabel={ativo ? 'Acumulado deste culto' : 'Esperando início'}
          valor={ativo?.total || 0}
          qtd={ativo?.qtd || 0}
          ativo={!!ativo}
          highlight={!!ativo}
        />
        <TotalCard
          icon={Calendar}
          color={COLORS.blue}
          label="Total do dia"
          sublabel="PIX recebidos hoje"
          valor={data?.total_dia || 0}
          qtd={data?.qtd_dia || 0}
        />
        <TotalCard
          icon={TrendingUp}
          color={COLORS.purple}
          label="Total da semana"
          sublabel="Qua a Ter (ciclo financeiro)"
          valor={data?.total_semana || 0}
          qtd={data?.qtd_semana || 0}
        />
      </div>

      {/* Lista de transações */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Últimas contribuições
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Atualizando em tempo real · {fmtHora(new Date(lastUpdate))} ({transacoes.length} mais recentes)
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadStats}>
              Recarregar
            </Button>
          </div>

          {transacoes.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Aguardando primeiras contribuições...
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {transacoes.map((t) => {
                  const isNew = newIds.has(t.id);
                  const centavo = extractCentavo(t.valor);
                  const identCentavo = ['17', '22', '31'].includes(centavo) ? centavo : null;
                  return (
                    <motion.div
                      key={t.id}
                      layout
                      initial={isNew ? { opacity: 0, y: -20, scale: 1.05 } : { opacity: 1 }}
                      animate={{
                        opacity: 1, y: 0, scale: 1,
                        backgroundColor: isNew ? 'rgba(16, 185, 129, 0.12)' : 'rgba(0,0,0,0)',
                      }}
                      transition={{ duration: 0.4 }}
                      className="flex items-center justify-between p-3 rounded-lg border border-border"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base font-bold tabular-nums" style={{ color: COLORS.green }}>
                            +{fmtMoney(t.valor)}
                          </span>
                          {identCentavo && (
                            <Badge variant="secondary" className="text-[10px] py-0">
                              ,{identCentavo} · {identCentavo === '17' ? 'Templo' : identCentavo === '22' ? 'Bazar' : 'Ação Social'}
                            </Badge>
                          )}
                          {isNew && (
                            <Badge style={{ background: COLORS.green, color: 'white' }} className="text-[10px] py-0">
                              novo!
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t.nome_contraparte || shortMemo(t.memo)}
                          {t.documento_contraparte && (
                            <span className="ml-2 font-mono opacity-60">
                              · {String(t.documento_contraparte).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums ml-3 shrink-0">
                        {timeAgo(t.created_at)}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer info */}
      <div className="text-xs text-muted-foreground text-center">
        Atualiza automaticamente a cada novo PIX (Supabase Realtime) · sync a cada 3min durante cultos.
        {!ativo && ' Não há culto ativo agora · monitorando recepção contínua.'}
      </div>
    </div>
  );
}

function TotalCard({ icon: Icon, color, label, sublabel, valor, qtd, highlight }) {
  return (
    <motion.div
      animate={highlight ? { boxShadow: ['0 0 0 0 rgba(0,179,157,0)', '0 0 0 6px rgba(0,179,157,0.18)', '0 0 0 0 rgba(0,179,157,0)'] } : {}}
      transition={highlight ? { duration: 2.5, repeat: Infinity } : {}}
      className="rounded-xl"
    >
      <Card className={highlight ? 'border-primary/50' : ''}>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center"
                style={{ background: color + '22', color }}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </div>
                <div className="text-[10px] text-muted-foreground">{sublabel}</div>
              </div>
            </div>
          </div>
          <motion.div
            key={valor}
            initial={{ scale: 1.08, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="text-2xl font-bold tabular-nums"
          >
            {fmtMoney(valor)}
          </motion.div>
          <div className="text-xs text-muted-foreground mt-1">
            {qtd} {qtd === 1 ? 'contribuição' : 'contribuições'}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
