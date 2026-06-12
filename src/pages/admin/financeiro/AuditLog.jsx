import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, RefreshCw, History, Plus, Edit, Trash2, X,
  FileText, Wallet, CreditCard, Lock, Repeat, ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { financeiro } from '../../../api';

const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';
const fmtMoney = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const TABELA_INFO = {
  fin_transacoes:           { label: 'Transação',     icon: FileText, cor: '#3b82f6' },
  fin_contas:               { label: 'Conta',         icon: Wallet,   cor: '#10b981' },
  fin_contas_pagar:         { label: 'Conta a pagar', icon: CreditCard, cor: '#f59e0b' },
  fin_closing_mensal:       { label: 'Fechamento',    icon: Lock,     cor: '#8b5cf6' },
  fin_despesas_recorrentes: { label: 'Recorrente',    icon: Repeat,   cor: '#ec4899' },
};

const ACTION_INFO = {
  INSERT: { label: 'Criado',    cor: '#10b981', icon: Plus },
  UPDATE: { label: 'Alterado',  cor: '#3b82f6', icon: Edit },
  DELETE: { label: 'Excluído',  cor: '#ef4444', icon: Trash2 },
};

const isMoneyField = (col) =>
  ['valor', 'saldo', 'valor_medio', 'total_receita', 'total_despesa', 'resultado'].includes(col);

const formatValor = (col, v) => {
  if (v == null || v === '') return '—';
  if (isMoneyField(col)) return fmtMoney(v);
  return String(v).slice(0, 60);
};

export default function AuditLog() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabela, setTabela] = useState('');
  const [aberto, setAberto] = useState(null);

  const reload = () => {
    setLoading(true);
    financeiro.audit.geral({ tabela: tabela || undefined, limit: 200 })
      .then(r => setItems(Array.isArray(r) ? r : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [tabela]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> Audit Log Financeiro
          </h2>
          <p className="text-xs text-muted-foreground">
            Quem alterou o quê e quando · transações, contas, recorrentes, fechamentos. Imutável.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={tabela} onChange={(e) => setTabela(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-md border border-border bg-background"
          >
            <option value="">Todas as tabelas</option>
            {Object.entries(TABELA_INFO).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <History className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhuma alteração registrada nesse filtro
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((a, i) => {
                const tab = TABELA_INFO[a.table_name] || { label: a.table_name, cor: '#6b7280', icon: FileText };
                const act = ACTION_INFO[a.action] || { label: a.action, cor: '#6b7280', icon: Edit };
                const TabIcon = tab.icon;
                const ActIcon = act.icon;
                const changesKeys = a.changes ? Object.keys(a.changes) : [];
                return (
                  <motion.button
                    key={a.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.01, 0.3) }}
                    onClick={() => setAberto(a)}
                    className="w-full text-left border border-border rounded-lg p-3 hover:bg-muted/30 transition-colors flex items-start gap-3"
                  >
                    <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
                         style={{ background: tab.cor + '20', color: tab.cor }}>
                      <TabIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]" style={{ borderColor: tab.cor, color: tab.cor }}>
                          {tab.label}
                        </Badge>
                        <Badge className="text-[10px]" style={{ background: act.cor + '20', color: act.cor }}>
                          <ActIcon className="h-2.5 w-2.5 mr-0.5" /> {act.label}
                        </Badge>
                        {changesKeys.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {changesKeys.length} {changesKeys.length === 1 ? 'campo' : 'campos'} alterados
                          </span>
                        )}
                      </div>
                      <div className="text-xs mt-1 truncate">
                        <strong>{a.user_email || 'sistema'}</strong> · {changesKeys.slice(0, 3).join(', ')}
                        {changesKeys.length > 3 && ` +${changesKeys.length - 3}`}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(a.created_at)}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  </motion.button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AnimatePresence>
        {aberto && <DetalheDialog evento={aberto} onClose={() => setAberto(null)} />}
      </AnimatePresence>
    </div>
  );
}

function DetalheDialog({ evento, onClose }) {
  const tab = TABELA_INFO[evento.table_name] || { label: evento.table_name, cor: '#6b7280' };
  const act = ACTION_INFO[evento.action] || { label: evento.action, cor: '#6b7280' };
  const entries = Object.entries(evento.changes || {});

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="bg-card rounded-lg shadow-xl max-w-lg w-full p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]" style={{ borderColor: tab.cor, color: tab.cor }}>
              {tab.label}
            </Badge>
            <Badge className="text-[10px]" style={{ background: act.cor + '20', color: act.cor }}>
              {act.label}
            </Badge>
          </div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="bg-muted/30 rounded-md p-3 mb-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Usuário</div>
              <div className="font-medium">{evento.user_email || 'sistema'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Quando</div>
              <div className="text-xs">{fmtDate(evento.created_at)}</div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] uppercase text-muted-foreground">Registro ID</div>
              <code className="text-[10px] break-all">{evento.row_id}</code>
            </div>
          </div>
        </div>

        {entries.length > 0 && (
          <>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Mudanças
            </div>
            <div className="space-y-2">
              {entries.map(([col, valores]) => (
                <div key={col} className="border border-border rounded-md p-2.5">
                  <div className="text-[11px] font-mono font-semibold text-muted-foreground mb-1">{col}</div>
                  {evento.action === 'INSERT' ? (
                    <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      {formatValor(col, valores?.new ?? valores)}
                    </div>
                  ) : evento.action === 'DELETE' ? (
                    <div className="text-sm font-medium text-rose-700 dark:text-rose-400 line-through">
                      {formatValor(col, valores?.old ?? valores)}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-[9px] uppercase text-muted-foreground">Antes</div>
                        <div className="text-rose-700 dark:text-rose-400 line-through tabular-nums">
                          {formatValor(col, valores?.old)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase text-muted-foreground">Depois</div>
                        <div className="text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
                          {formatValor(col, valores?.new)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// Componente standalone · botao "Histórico" que abre dialog com timeline
// Pode ser usado em qualquer tela. Aceita { tabela, rowId, label?, size? }
export function HistoricoButton({ tabela, rowId, label = 'Histórico', size = 'sm' }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const abrir = () => {
    setOpen(true);
    setLoading(true);
    financeiro.audit.porRegistro(tabela, rowId)
      .then(r => setItems(Array.isArray(r) ? r : []))
      .finally(() => setLoading(false));
  };

  return (
    <>
      <Button size={size} variant="ghost" onClick={abrir} title="Ver histórico de alterações">
        <History className="h-3.5 w-3.5 mr-1" /> {label}
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              className="bg-card rounded-lg shadow-xl max-w-md w-full p-5 max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" /> Histórico de alterações
                </h3>
                <button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
              </div>
              {loading ? (
                <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
              ) : items.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma alteração registrada</div>
              ) : (
                <div className="space-y-2">
                  {items.map(a => {
                    const act = ACTION_INFO[a.action] || { label: a.action, cor: '#6b7280' };
                    const entries = Object.entries(a.changes || {});
                    return (
                      <div key={a.id} className="border border-border rounded-md p-2.5 text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="text-[10px]" style={{ background: act.cor + '20', color: act.cor }}>
                            {act.label}
                          </Badge>
                          <span className="text-muted-foreground text-[10px]">{fmtDate(a.created_at)}</span>
                        </div>
                        <div className="text-[11px] mb-1.5">
                          <strong>{a.user_email || 'sistema'}</strong>
                        </div>
                        {entries.length > 0 && (
                          <div className="space-y-1">
                            {entries.map(([col, v]) => (
                              <div key={col} className="text-[11px] flex gap-2 items-baseline">
                                <code className="font-mono text-muted-foreground text-[10px] shrink-0">{col}</code>
                                {a.action === 'UPDATE' ? (
                                  <>
                                    <span className="line-through text-rose-600 tabular-nums">{formatValor(col, v?.old)}</span>
                                    <span className="text-muted-foreground">→</span>
                                    <span className="text-emerald-600 font-semibold tabular-nums">{formatValor(col, v?.new)}</span>
                                  </>
                                ) : (
                                  <span className="tabular-nums">{formatValor(col, v?.new ?? v?.old ?? v)}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
