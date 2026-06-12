import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, AlertCircle, Bell, Check, X, RefreshCw, Loader2,
  Calendar, Wallet, TrendingDown, UserX, Clock, Zap,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { financeiro } from '../../../api';

const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';

const TIPO_INFO = {
  conta_vencida:              { icon: AlertCircle,  cor: '#ef4444', label: 'Vencida' },
  conta_vencendo:             { icon: Clock,        cor: '#f59e0b', label: 'Vencendo' },
  saldo_baixo:                { icon: Wallet,       cor: '#ef4444', label: 'Saldo' },
  despesa_atipica:            { icon: TrendingDown, cor: '#f59e0b', label: 'Despesa' },
  receita_baixa:              { icon: TrendingDown, cor: '#f59e0b', label: 'Receita' },
  doador_parou:               { icon: UserX,        cor: '#6b7280', label: 'Doador' },
  saldo_projetado_negativo:   { icon: Zap,          cor: '#ef4444', label: 'Projeção' },
};

const SEV_INFO = {
  critico: { cor: '#ef4444', bg: 'bg-rose-500/10',   border: 'border-rose-500/40', label: 'Crítico' },
  alerta:  { cor: '#f59e0b', bg: 'bg-amber-500/10',  border: 'border-amber-500/40', label: 'Alerta' },
  aviso:   { cor: '#3b82f6', bg: 'bg-blue-500/10',   border: 'border-blue-500/40', label: 'Aviso' },
  info:    { cor: '#6b7280', bg: 'bg-muted/30',      border: 'border-border', label: 'Info' },
};

export default function Alertas() {
  const [tab, setTab] = useState('abertos');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [atendendo, setAtendendo] = useState(null);

  const reload = () => {
    setLoading(true);
    financeiro.alertas.list({ atendido: tab === 'atendidos' ? 'true' : 'false' })
      .then(r => setItems(Array.isArray(r) ? r : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, [tab]);

  const gerar = async () => {
    setGerando(true);
    try {
      const r = await financeiro.alertas.gerar();
      alert(`${r.total_criados} novos alertas criados`);
      reload();
    } catch (e) { alert(e.message); }
    finally { setGerando(false); }
  };

  const atender = async (a, comentario) => {
    try {
      await financeiro.alertas.atender(a.id, comentario);
      setAtendendo(null);
      reload();
    } catch (e) { alert(e.message); }
  };

  // Stats agrupados
  const porSev = items.reduce((acc, a) => {
    acc[a.severidade] = (acc[a.severidade] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-500" />
            Alertas Financeiros
          </h2>
          <p className="text-xs text-muted-foreground">
            Sistema detecta automaticamente · contas vencidas, despesas atípicas, saldos baixos, doadores que pararam, etc.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={gerar} disabled={gerando}>
          {gerando ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          Gerar agora
        </Button>
      </div>

      {/* Cards de stats por severidade */}
      {tab === 'abertos' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {['critico', 'alerta', 'aviso', 'info'].map(sev => {
            const info = SEV_INFO[sev];
            const qtd = porSev[sev] || 0;
            return (
              <div key={sev} className={`border rounded-lg p-3 ${info.bg} ${info.border}`}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: info.cor }}>{info.label}</div>
                <div className="text-2xl font-bold tabular-nums mt-0.5">{qtd}</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {[
          { k: 'abertos', label: 'Abertos' },
          { k: 'atendidos', label: 'Histórico' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {tab === 'abertos'
            ? <><Check className="h-10 w-10 mx-auto mb-2 text-emerald-500/40" /> Nenhum alerta aberto · tudo em ordem</>
            : 'Nenhum alerta atendido ainda'}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a, i) => {
            const tipo = TIPO_INFO[a.tipo] || { icon: Bell, cor: '#6b7280', label: a.tipo };
            const sev = SEV_INFO[a.severidade] || SEV_INFO.info;
            const Icon = tipo.icon;
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
                className={`border rounded-lg p-3 ${sev.bg} ${sev.border}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
                         style={{ background: tipo.cor + '20', color: tipo.cor }}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold">{a.titulo}</h4>
                        <Badge className="text-[10px]" style={{ background: sev.cor + '20', color: sev.cor }}>
                          {sev.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]" style={{ borderColor: tipo.cor, color: tipo.cor }}>
                          {tipo.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{a.mensagem}</p>
                      <div className="text-[10px] text-muted-foreground mt-1.5">{fmtDate(a.created_at)}</div>
                      {a.comentario_atendimento && (
                        <div className="text-[11px] mt-1.5 italic text-emerald-700 dark:text-emerald-400">
                          ✓ {a.comentario_atendimento}
                        </div>
                      )}
                    </div>
                  </div>
                  {tab === 'abertos' && (
                    <Button size="sm" variant="ghost" onClick={() => setAtendendo(a)}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Atender
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {atendendo && (
          <AtenderDialog alerta={atendendo} onClose={() => setAtendendo(null)} onSubmit={atender} />
        )}
      </AnimatePresence>
    </div>
  );
}

function AtenderDialog({ alerta, onClose, onSubmit }) {
  const [comentario, setComentario] = useState('');
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="bg-card rounded-lg shadow-xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold">Atender alerta</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="text-sm font-medium mb-1">{alerta.titulo}</div>
        <div className="text-xs text-muted-foreground mb-4">{alerta.mensagem}</div>
        <label className="text-xs font-medium block mb-1">Comentário (opcional)</label>
        <textarea
          value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3}
          className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
          placeholder="Ex: paguei pelo PIX · conversei com a pessoa · etc"
        />
        <div className="flex gap-2 mt-4 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSubmit(alerta, comentario)}>
            <Check className="h-4 w-4 mr-1.5" /> Marcar como atendido
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
