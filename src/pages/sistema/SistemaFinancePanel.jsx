import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeDollarSign, Banknote, BarChart3, Check, Download, ExternalLink, FileClock,
  FileText, Loader2, Pencil, Plus, RefreshCw, Save, ShieldCheck, WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import { sistema as sistemaApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STATUS = {
  estimated: { label: 'Estimado', className: 'border-slate-600 bg-slate-800 text-slate-200' },
  accrued: { label: 'Provisionado', className: 'border-amber-500/30 bg-amber-500/10 text-amber-200' },
  actual: { label: 'Realizado', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' },
};

const TYPE_LABEL = {
  subscription: 'Assinatura', usage: 'Uso', one_off: 'Pontual', tax: 'Imposto',
  adjustment: 'Ajuste', credit: 'Crédito',
};

const inputClass = 'mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}

function date(value) {
  return value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
}

function monthLabel(value) {
  if (!value) return '—';
  const [year, month] = value.slice(0, 7).split('-');
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' })
    .format(new Date(Number(year), Number(month) - 1, 1)).replace('.', '');
}

function StatusPill({ status }) {
  const meta = STATUS[status] || STATUS.estimated;
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${meta.className}`}>{meta.label}</span>;
}

function Metric({ icon: Icon, label, value, note, tone = 'cyan' }) {
  const tones = { cyan: 'text-cyan-300', amber: 'text-amber-200', green: 'text-emerald-300', slate: 'text-slate-300' };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"><Icon className={`h-4 w-4 ${tones[tone]}`} />{label}</div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

function CostDialog({ open, providers, onClose, onSaved }) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    provider_key: providers[0]?.provider_key || '', competence: currentMonth,
    cost_type: 'subscription', amount: '', currency: 'BRL', fx_rate_to_brl: '1',
    status: 'actual', source_type: 'invoice', evidence_url: '', external_ref: '', notes: '',
  });

  useEffect(() => {
    if (!form.provider_key && providers[0]) setForm((value) => ({ ...value, provider_key: providers[0].provider_key }));
  }, [providers, form.provider_key]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await sistemaApi.createFinanceCost(form);
      toast.success('Custo registrado na prestação de contas.');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error?.message || 'Não foi possível registrar o custo.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Registrar custo</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm text-muted-foreground">
            Informe se o valor é estimado, provisionado ou realizado. Essa distinção permanece no relatório executivo.
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Fornecedor
              <select required value={form.provider_key} onChange={(e) => setForm({ ...form, provider_key: e.target.value })} className={inputClass}>
                {providers.filter((item) => item.active).map((item) => <option key={item.provider_key} value={item.provider_key}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Competência
              <input required type="month" value={form.competence} onChange={(e) => setForm({ ...form, competence: e.target.value })} className={inputClass} />
            </label>
            <label className="text-sm font-medium">Natureza do valor
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
                <option value="estimated">Estimado</option><option value="accrued">Provisionado</option><option value="actual">Realizado</option>
              </select>
            </label>
            <label className="text-sm font-medium">Tipo
              <select value={form.cost_type} onChange={(e) => setForm({ ...form, cost_type: e.target.value })} className={inputClass}>
                {Object.entries(TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Valor
              <input required min="0" step="0.0001" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">Moeda
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value, fx_rate_to_brl: e.target.value === 'BRL' ? '1' : form.fx_rate_to_brl })} className={inputClass}>
                  <option value="BRL">BRL</option><option value="USD">USD</option>
                </select>
              </label>
              <label className="text-sm font-medium">Cotação BRL
                <input required min="0.000001" step="0.000001" type="number" value={form.fx_rate_to_brl} onChange={(e) => setForm({ ...form, fx_rate_to_brl: e.target.value })} className={inputClass} />
              </label>
            </div>
            <label className="text-sm font-medium">Fonte
              <select value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })} className={inputClass}>
                <option value="invoice">Fatura</option><option value="manual">Manual</option><option value="api">API</option><option value="legacy_estimate">Estimativa legada</option>
              </select>
            </label>
            <label className="text-sm font-medium">Referência externa
              <input value={form.external_ref} onChange={(e) => setForm({ ...form, external_ref: e.target.value })} className={inputClass} placeholder="Número da fatura ou transação" />
            </label>
          </div>
          <label className="block text-sm font-medium">Evidência HTTPS
            <input type="url" value={form.evidence_url} onChange={(e) => setForm({ ...form, evidence_url: e.target.value })} className={inputClass} placeholder="https://…" />
          </label>
          <label className="block text-sm font-medium">Observações
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1.5 min-h-20 w-full rounded-md border bg-background p-3 text-sm" />
          </label>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Registrar custo</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BudgetDialog({ provider, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [budget, setBudget] = useState(provider?.budget_monthly_brl ?? '');
  const [owner, setOwner] = useState(provider?.owner_email || '');
  useEffect(() => { setBudget(provider?.budget_monthly_brl ?? ''); setOwner(provider?.owner_email || ''); }, [provider]);
  const save = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      await sistemaApi.updateFinanceProvider(provider.provider_key, { budget_monthly_brl: budget, owner_email: owner });
      toast.success('Orçamento do fornecedor atualizado.'); onSaved(); onClose();
    } catch (error) { toast.error(error?.message || 'Não foi possível atualizar o fornecedor.'); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={!!provider} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Orçamento · {provider?.name}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm font-medium">Teto mensal em reais<input min="0" step="0.01" type="number" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass} placeholder="Sem teto definido" /></label>
          <label className="block text-sm font-medium">Responsável<input type="email" value={owner} onChange={(e) => setOwner(e.target.value)} className={inputClass} placeholder="responsavel@cbrio.org" /></label>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MonthlyLedger({ rows }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.estimated, row.accrued, row.actual]));
  if (!rows.length) return <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">Registre o primeiro custo para iniciar a série mensal.</div>;
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[560px] items-end gap-3" style={{ height: 210 }}>
        {rows.map((row) => (
          <div key={row.month} className="flex h-full min-w-16 flex-1 flex-col justify-end">
            <div className="flex h-[170px] items-end justify-center gap-1 border-b border-slate-700">
              {[['estimated', 'bg-slate-500'], ['accrued', 'bg-amber-400'], ['actual', 'bg-emerald-400']].map(([key, color]) => (
                <div key={key} title={`${STATUS[key].label}: ${money(row[key])}`} className={`w-2.5 rounded-t ${color} transition-[height]`} style={{ height: `${Math.max(row[key] ? 3 : 0, (row[key] / max) * 100)}%` }} />
              ))}
            </div>
            <p className="mt-2 text-center text-[10px] uppercase tracking-wide text-slate-500">{monthLabel(row.month)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinanceOperationsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [months, setMonths] = useState(12);
  const [costOpen, setCostOpen] = useState(false);
  const [providerEdit, setProviderEdit] = useState(null);
  const [reporting, setReporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await sistemaApi.financeCommandCenter(months)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [months]);
  useEffect(() => { load(); }, [load]);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const current = useMemo(() => (data?.summary?.monthly || []).find((row) => row.month === currentMonth) || { estimated: 0, accrued: 0, actual: 0 }, [data, currentMonth]);

  const generateReport = async () => {
    setReporting(true);
    try {
      const now = new Date();
      const first = `${now.toISOString().slice(0, 7)}-01`;
      const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
      await sistemaApi.createExecutiveReport({ period_start: first, period_end: last, title: `Prestação de contas · ${monthLabel(currentMonth)}` });
      toast.success('Relatório executivo gerado como rascunho.'); await load();
    } catch (error) { toast.error(error?.message || 'Não foi possível gerar o relatório.'); }
    finally { setReporting(false); }
  };

  const publish = async (id) => {
    try { await sistemaApi.publishExecutiveReport(id); toast.success('Relatório publicado e congelado.'); await load(); }
    catch (error) { toast.error(error?.message || 'Não foi possível publicar o relatório.'); }
  };

  const download = async (report) => {
    try {
      const full = await sistemaApi.executiveReport(report.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `sistema-relatorio-${report.period_start}-${report.period_end}.json`; link.click(); URL.revokeObjectURL(url);
      toast.success('Relatório exportado.');
    } catch (error) { toast.error(error?.message || 'Não foi possível exportar o relatório.'); }
  };

  if (loading && !data) return <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (error && !data) return <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-200">A fonte financeira não respondeu. Confirme a migration da etapa 6 e tente novamente.<Button variant="outline" size="sm" className="ml-3" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button></div>;

  const summary = data?.summary || { totals: {}, monthly: [], byProvider: [], monthlyBudget: 0, entriesCount: 0 };
  const providers = data?.providers || [];
  const entries = data?.entries || [];
  const reports = data?.reports || [];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-5 text-white md:p-6">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-[linear-gradient(135deg,transparent_40%,rgba(52,211,153,0.07)_40%,rgba(52,211,153,0.07)_55%,transparent_55%)] bg-[length:32px_32px]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">Livro-caixa operacional</p><h2 className="mt-2 text-2xl font-semibold">Custos e prestação de contas</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Valores estimados, provisionados e realizados permanecem separados. Cada publicação congela um retrato financeiro e operacional verificável.</p></div>
          <div className="flex flex-wrap gap-2"><select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"><option value="6">6 meses</option><option value="12">12 meses</option><option value="24">24 meses</option></select><Button variant="outline" className="border-slate-700 bg-slate-900 text-white hover:bg-slate-800" onClick={load} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Atualizar</Button><Button onClick={() => setCostOpen(true)}><Plus className="mr-2 h-4 w-4" />Registrar custo</Button></div>
        </div>
        <div className="relative mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Banknote} label="Realizado no mês" value={money(current.actual)} note={`${summary.entriesCount} lançamentos na janela`} tone="green" />
          <Metric icon={FileClock} label="Provisionado no mês" value={money(current.accrued)} note="competência ainda não faturada" tone="amber" />
          <Metric icon={BadgeDollarSign} label="Estimado no mês" value={money(current.estimated)} note="não tratado como custo real" tone="slate" />
          <Metric icon={WalletCards} label="Orçamento mensal" value={money(summary.monthlyBudget)} note={`${providers.filter((item) => item.budget_monthly_brl != null).length} fornecedores com teto`} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
        <section className="rounded-2xl border bg-card p-5"><div className="flex items-start justify-between"><div><h3 className="font-semibold">Evolução por competência</h3><p className="mt-1 text-sm text-muted-foreground">As três barras nunca são somadas entre si.</p></div><BarChart3 className="h-5 w-5 text-primary" /></div><div className="mt-4 flex gap-4 text-xs text-muted-foreground"><span className="before:mr-1.5 before:inline-block before:h-2 before:w-2 before:rounded-full before:bg-slate-500">Estimado</span><span className="before:mr-1.5 before:inline-block before:h-2 before:w-2 before:rounded-full before:bg-amber-400">Provisionado</span><span className="before:mr-1.5 before:inline-block before:h-2 before:w-2 before:rounded-full before:bg-emerald-400">Realizado</span></div><div className="mt-4"><MonthlyLedger rows={summary.monthly} /></div></section>
        <section className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><div><h3 className="font-semibold">Fornecedores</h3><p className="mt-1 text-sm text-muted-foreground">Teto mensal e responsável.</p></div><ShieldCheck className="h-5 w-5 text-emerald-500" /></div><div className="mt-4 max-h-[260px] space-y-1 overflow-auto">{providers.map((provider) => <button key={provider.provider_key} type="button" onClick={() => setProviderEdit(provider)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-muted"><span><span className="block text-sm font-medium">{provider.name}</span><span className="text-xs text-muted-foreground">{provider.owner_email || 'Sem responsável'}</span></span><span className="flex items-center gap-2 text-sm tabular-nums">{provider.budget_monthly_brl == null ? 'Sem teto' : money(provider.budget_monthly_brl)}<Pencil className="h-3.5 w-3.5 text-muted-foreground" /></span></button>)}</div></section>
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card"><div className="border-b p-5"><h3 className="font-semibold">Lançamentos recentes</h3><p className="mt-1 text-sm text-muted-foreground">Evidência, origem e natureza permanecem vinculadas ao valor.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Competência</th><th className="px-4 py-3">Fornecedor</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Natureza</th><th className="px-4 py-3 text-right">Valor BRL</th><th className="px-4 py-3">Evidência</th></tr></thead><tbody className="divide-y">{entries.slice(0, 50).map((entry) => <tr key={entry.id} className="hover:bg-muted/30"><td className="px-4 py-3">{monthLabel(entry.competence)}</td><td className="px-4 py-3 font-medium">{providers.find((item) => item.provider_key === entry.provider_key)?.name || entry.provider_key}</td><td className="px-4 py-3">{TYPE_LABEL[entry.cost_type] || entry.cost_type}</td><td className="px-4 py-3"><StatusPill status={entry.status} /></td><td className="px-4 py-3 text-right font-medium tabular-nums">{money(entry.amount_brl)}</td><td className="px-4 py-3">{entry.evidence_url ? <a href={entry.evidence_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Abrir <ExternalLink className="h-3.5 w-3.5" /></a> : <span className="text-muted-foreground">Sem link</span>}</td></tr>)}{!entries.length && <tr><td colSpan="6" className="px-4 py-10 text-center text-muted-foreground">Nenhum custo registrado nesta janela.</td></tr>}</tbody></table></div></section>

      <section className="overflow-hidden rounded-2xl border bg-card"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Relatórios executivos</h3><p className="mt-1 text-sm text-muted-foreground">O rascunho reúne custos, releases, incidentes, erros e automações. Publicar congela o retrato.</p></div><Button onClick={generateReport} disabled={reporting}>{reporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Gerar relatório do mês</Button></div><div className="divide-y">{reports.map((report) => <div key={report.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="font-medium">{report.title}</p><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${report.status === 'published' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200'}`}>{report.status === 'published' ? 'Publicado' : 'Rascunho'}</span></div><p className="mt-1 text-xs text-muted-foreground">{date(report.period_start)} a {date(report.period_end)} · checksum {report.checksum_sha256?.slice(0, 10)}…</p></div><div className="flex gap-2">{report.status === 'draft' && <Button size="sm" variant="outline" onClick={() => publish(report.id)}><Check className="mr-2 h-4 w-4" />Publicar</Button>}<Button size="sm" variant="ghost" onClick={() => download(report)}><Download className="mr-2 h-4 w-4" />JSON</Button></div></div>)}{!reports.length && <div className="p-8 text-center text-sm text-muted-foreground">Nenhum relatório gerado. O primeiro será criado como rascunho.</div>}</div></section>

      <CostDialog open={costOpen} providers={providers} onClose={() => setCostOpen(false)} onSaved={load} />
      <BudgetDialog provider={providerEdit} onClose={() => setProviderEdit(null)} onSaved={load} />
    </div>
  );
}
