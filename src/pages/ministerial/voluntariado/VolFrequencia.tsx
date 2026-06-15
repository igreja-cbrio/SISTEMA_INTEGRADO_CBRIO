import { useEffect, useMemo, useState, useCallback } from 'react';
import { voluntariado as api } from '@/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Activity, Upload, RefreshCw, Search, Link2, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

type Row = {
  chave: string; vol_profile_id: string | null; nome_norm: string; nome: string;
  total_servicos: number; ultimo_servico: string | null; ativo: boolean;
};

function fmt(d: string | null) {
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

export default function VolFrequencia() {
  const [itens, setItens] = useState<Row[]>([]);
  const [resumo, setResumo] = useState<{ total: number; ativos: number; inativos: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<'todos' | 'ativos' | 'inativos'>('todos');
  const [vinculo, setVinculo] = useState<'todos' | 'nao' | 'sim'>('todos');
  const [importando, setImportando] = useState(false);
  const [revinc, setRevinc] = useState(false);
  const [detalhe, setDetalhe] = useState<Row | null>(null);
  const [vincular, setVincular] = useState<Row | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (status !== 'todos') params.status = status;
      if (vinculo !== 'todos') params.vinculo = vinculo;
      if (busca.trim()) params.busca = busca.trim();
      const r = await api.frequencia.list(params);
      setItens(r.itens || []);
      setResumo(r.resumo || null);
    } catch (e: any) { toast.error(e.message || 'Erro ao carregar'); }
    finally { setLoading(false); }
  }, [status, vinculo, busca]);

  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [carregar]);

  async function importar(file: File) {
    setImportando(true);
    try {
      const r = await api.frequencia.importar(file);
      toast.success(`Importado: ${r.processadas} registros · ${r.nomes_vinculados} nomes vinculados automaticamente`);
      carregar();
    } catch (e: any) { toast.error(e.message || 'Erro ao importar'); }
    finally { setImportando(false); }
  }

  async function revincularNomes() {
    setRevinc(true);
    try {
      const r = await api.frequencia.revincular();
      toast.success(`${r.nomes_vinculados} nome(s) vinculados`);
      carregar();
    } catch (e: any) { toast.error(e.message || 'Erro'); }
    finally { setRevinc(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Controle de frequência</h2>
            <p className="text-xs text-muted-foreground">Quantas vezes cada um serviu e em qual culto · ativos × inativos (90 dias sem servir = inativo)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex">
            <input type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.currentTarget.value = ''; }} />
            <Button asChild variant="outline" size="sm" className="gap-1.5" disabled={importando}>
              <span>{importando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Importar planilha (.xlsx/.csv)</span>
            </Button>
          </label>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={revincularNomes} disabled={revinc}>
            {revinc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Revincular nomes
          </Button>
        </div>
      </div>

      {resumo && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3"><div className="text-xs text-muted-foreground">Pessoas</div><div className="text-xl font-bold text-foreground">{resumo.total}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">Ativos (90d)</div><div className="text-xl font-bold text-emerald-600">{resumo.ativos}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">Inativos</div><div className="text-xl font-bold text-muted-foreground">{resumo.inativos}</div></Card>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome..." className="h-9 pl-8 w-56" />
        </div>
        {(['todos', 'ativos', 'inativos'] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${status === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            {s === 'todos' ? 'Todos' : s === 'ativos' ? 'Ativos' : 'Inativos'}
          </button>
        ))}
        <span className="text-border">·</span>
        {(['todos', 'nao', 'sim'] as const).map(v => (
          <button key={v} onClick={() => setVinculo(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${vinculo === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            {v === 'todos' ? 'Vínculo: todos' : v === 'nao' ? 'Não vinculados' : 'Vinculados'}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Nome</th>
                <th className="px-4 py-2 font-semibold">Serviços</th>
                <th className="px-4 py-2 font-semibold">Último</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Vínculo</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /> carregando…</td></tr>
              ) : itens.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">Nada por aqui. Importe a planilha (CSV) pra começar.</td></tr>
              ) : itens.map(r => (
                <tr key={r.chave} className="border-t border-border/60 hover:bg-accent/40 cursor-pointer" onClick={() => setDetalhe(r)}>
                  <td className="px-4 py-2 font-medium text-foreground">{r.nome}</td>
                  <td className="px-4 py-2">{r.total_servicos}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fmt(r.ultimo_servico)}</td>
                  <td className="px-4 py-2">
                    {r.ativo
                      ? <Badge className="bg-emerald-100 text-emerald-700">Ativo</Badge>
                      : <Badge className="bg-slate-100 text-slate-600">Inativo</Badge>}
                  </td>
                  <td className="px-4 py-2">
                    {r.vol_profile_id
                      ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> vinculado</span>
                      : <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); setVincular(r); }}><Link2 className="h-3 w-3" /> vincular</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {detalhe && <DetalheModal row={detalhe} onClose={() => setDetalhe(null)} />}
      {vincular && <VincularModal row={vincular} onClose={() => setVincular(null)} onDone={() => { setVincular(null); carregar(); }} />}
    </div>
  );
}

function DetalheModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const [regs, setRegs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const params: any = row.vol_profile_id ? { profile_id: row.vol_profile_id } : { nome_norm: row.nome_norm };
    api.frequencia.detalhe(params).then(setRegs).catch(() => {}).finally(() => setLoading(false));
  }, [row]);
  const porCulto = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of regs) m[r.culto_label] = (m[r.culto_label] || 0) + 1;
    return m;
  }, [regs]);
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{row.nome}</DialogTitle>
          <DialogDescription>{row.total_servicos} serviços · {row.ativo ? 'Ativo' : 'Inativo'} · último em {fmt(row.ultimo_servico)}</DialogDescription>
        </DialogHeader>
        {Object.keys(porCulto).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(porCulto).map(([c, n]) => (
              <span key={c} className="text-xs bg-muted px-2 py-1 rounded-full">{c}: <strong>{n}</strong></span>
            ))}
          </div>
        )}
        <div className="max-h-[50vh] overflow-y-auto mt-1">
          {loading ? <p className="text-sm text-muted-foreground py-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></p> : (
            <table className="w-full text-sm">
              <tbody>
                {regs.map((r, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="py-1.5 text-foreground">{fmt(r.data)}</td>
                    <td className="py-1.5 text-muted-foreground">{r.culto_label}</td>
                    <td className="py-1.5 text-[11px] text-muted-foreground">{r.mes || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VincularModal({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState(row.nome || '');
  const [opcoes, setOpcoes] = useState<{ id: string; full_name: string }[]>([]);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { api.frequencia.perfis(q).then(setOpcoes).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  async function escolher(id: string) {
    setSalvando(true);
    try { await api.frequencia.vincular(row.nome_norm, id); toast.success('Vinculado'); onDone(); }
    catch (e: any) { toast.error(e.message || 'Erro'); setSalvando(false); }
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular "{row.nome}"</DialogTitle>
          <DialogDescription>Escolha o voluntário do sistema. O histórico desse nome passa a contar junto com os check-ins reais dele.</DialogDescription>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar voluntário..." autoFocus />
        <div className="max-h-[40vh] overflow-y-auto mt-1 space-y-1">
          {opcoes.length === 0 && <p className="text-sm text-muted-foreground py-3 text-center">Nenhum voluntário encontrado</p>}
          {opcoes.map(o => (
            <button key={o.id} disabled={salvando} onClick={() => escolher(o.id)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent text-sm text-foreground disabled:opacity-50">
              {o.full_name}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
