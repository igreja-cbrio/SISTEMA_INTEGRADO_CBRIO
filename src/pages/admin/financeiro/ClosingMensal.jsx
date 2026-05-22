import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Unlock, Loader2, X, AlertCircle, Check } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { financeiro } from '../../../api';

const fmtMoney = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';
const MES_NOMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export default function ClosingMensal() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fechando, setFechando] = useState(false);
  const [acao, setAcao] = useState(null);

  const reload = () => {
    setLoading(true);
    financeiro.closing.list()
      .then(r => setItems(Array.isArray(r) ? r : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  // Gera lista dos últimos 12 meses + status (fechado/aberto)
  const meses = [];
  const hoje = new Date();
  for (let i = 1; i <= 12; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const ano = d.getFullYear(), mes = d.getMonth() + 1;
    const closing = items.find(c => c.ano === ano && c.mes === mes && !c.reaberto_em);
    meses.push({ ano, mes, label: `${MES_NOMES[mes - 1]}/${ano}`, closing });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" /> Closing Mensal
        </h2>
        <p className="text-xs text-muted-foreground">
          Fechamento contábil · transações de meses fechados ficam bloqueadas (não podem ser editadas).
          Snapshot do DRE é congelado pra auditoria.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {meses.map((m, i) => {
                const fechado = !!m.closing;
                return (
                  <motion.div
                    key={`${m.ano}-${m.mes}`}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className={`border rounded-lg p-3 ${
                      fechado ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-bold">{m.label}</div>
                      {fechado
                        ? <Badge className="bg-emerald-500/20 text-emerald-700 text-[10px]"><Lock className="h-2.5 w-2.5 mr-0.5" />Fechado</Badge>
                        : <Badge variant="outline" className="text-[10px]">Aberto</Badge>}
                    </div>
                    {fechado ? (
                      <div className="text-[11px] text-muted-foreground space-y-0.5 mt-2">
                        <div>Receita: <strong className="text-foreground">{fmtMoney(m.closing.total_receita)}</strong></div>
                        <div>Despesa: <strong className="text-foreground">{fmtMoney(m.closing.total_despesa)}</strong></div>
                        <div>Resultado: <strong className={Number(m.closing.resultado) >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{fmtMoney(m.closing.resultado)}</strong></div>
                        <div className="text-[9px] pt-1">Fechado em {fmtDate(m.closing.fechado_em)}</div>
                        <Button size="sm" variant="ghost" className="h-7 mt-1 text-[10px]"
                          onClick={() => setAcao({ tipo: 'reabrir', ano: m.ano, mes: m.mes, label: m.label, closing: m.closing })}>
                          <Unlock className="h-3 w-3 mr-1" /> Reabrir
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" className="w-full mt-2"
                        onClick={() => setAcao({ tipo: 'fechar', ano: m.ano, mes: m.mes, label: m.label })}>
                        <Lock className="h-3.5 w-3.5 mr-1" /> Fechar
                      </Button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {acao && (
        <AcaoDialog
          acao={acao}
          onClose={() => setAcao(null)}
          onSuccess={() => { setAcao(null); reload(); }}
        />
      )}
    </div>
  );
}

function AcaoDialog({ acao, onClose, onSuccess }) {
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  const submit = async () => {
    setLoading(true); setErro(null);
    try {
      if (acao.tipo === 'fechar') {
        await financeiro.closing.fechar(acao.ano, acao.mes, texto || undefined);
      } else {
        if (texto.length < 5) { setErro('Motivo precisa ter pelo menos 5 caracteres'); setLoading(false); return; }
        await financeiro.closing.reabrir(acao.ano, acao.mes, texto);
      }
      onSuccess();
    } catch (e) { setErro(e.message); }
    finally { setLoading(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="bg-card rounded-lg shadow-xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold flex items-center gap-2">
            {acao.tipo === 'fechar'
              ? <><Lock className="h-4 w-4 text-primary" /> Fechar {acao.label}</>
              : <><Unlock className="h-4 w-4 text-amber-500" /> Reabrir {acao.label}</>}
          </h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {acao.tipo === 'fechar' ? (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              Após fechar, transações de {acao.label} ficam bloqueadas pra edição.
              Um snapshot do DRE é gravado pra auditoria.
            </p>
            <label className="text-xs block mb-1">Observação (opcional)</label>
            <textarea
              value={texto} onChange={(e) => setTexto(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              placeholder="Ex: fechado pelo Yago após conferência com contador"
            />
          </>
        ) : (
          <>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2.5 mb-3 text-xs flex gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <div>
                Reabrir desbloqueia edições retroativas. Use apenas se realmente necessário · há audit log.
              </div>
            </div>
            <label className="text-xs block mb-1">Motivo da reabertura *</label>
            <textarea
              value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} autoFocus
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
              placeholder="Ex: ajustar lançamento que entrou na competência errada"
            />
          </>
        )}

        {erro && (
          <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2 mt-3">{erro}</div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={submit} disabled={loading}
                  variant={acao.tipo === 'reabrir' ? 'destructive' : 'default'}>
            {loading
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : acao.tipo === 'fechar' ? <Lock className="h-4 w-4 mr-1.5" /> : <Unlock className="h-4 w-4 mr-1.5" />}
            {acao.tipo === 'fechar' ? 'Confirmar fechamento' : 'Confirmar reabertura'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
