import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertOctagon, CheckCircle2, CircleHelp, Database, ExternalLink,
  Fingerprint, KeyRound, Loader2, Network, RefreshCw, Save, ShieldAlert,
  ShieldCheck, TriangleAlert, Wifi,
} from 'lucide-react';
import { toast } from 'sonner';
import { sistema as sistemaApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const DOMAINS = [
  { id: 'wifi', label: 'Wi-Fi', icon: Wifi },
  { id: 'facial', label: 'Facial', icon: Fingerprint },
  { id: 'data', label: 'Dados e retenção', icon: Database },
];

const STATUS = {
  implemented: { label: 'Implementado', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  monitoring: { label: 'Monitorando', className: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200' },
  pending_decision: { label: 'Decisão pendente', className: 'border-slate-600 bg-slate-800 text-slate-300' },
  review_required: { label: 'Revisão necessária', className: 'border-amber-500/30 bg-amber-500/10 text-amber-200' },
  blocked: { label: 'Bloqueado', className: 'border-red-500/30 bg-red-500/10 text-red-200' },
};

function number(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

function when(value) {
  if (!value) return 'sem execução registrada';
  return new Date(value).toLocaleString('pt-BR');
}

function StatusPill({ status }) {
  const meta = STATUS[status] || STATUS.pending_decision;
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${meta.className}`}>{meta.label}</span>;
}

function Metric({ label, value, note, tone = 'normal' }) {
  const color = tone === 'danger' ? 'text-red-300' : tone === 'warning' ? 'text-amber-200' : 'text-white';
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-3 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

function SourceUnavailable({ name }) {
  return <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-100">A fonte {name} não respondeu. O estado permanece desconhecido.</div>;
}

function BoundaryMap({ boundaries }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-dashed border-cyan-400/30 bg-slate-950/70 p-4">
      <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-slate-700" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Perímetro de dados</p>
      <div className="mt-3 grid grid-cols-2 gap-5 text-xs">
        <div>
          <p className="font-semibold text-emerald-300">Entra no Sistema</p>
          <p className="mt-2 leading-5 text-slate-400">Agregados, estado de controles, evidências e metadados de auditoria.</p>
        </div>
        <div>
          <p className="font-semibold text-red-300">Fica na origem</p>
          <p className="mt-2 leading-5 text-slate-400">CPF, telefone, IP, MAC, imagem, embedding, payload e segredo.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-slate-800 pt-3 text-[11px] text-slate-500">
        <KeyRound className="h-3.5 w-3.5" /> {number(boundaries?.forbidden?.length)} classes explicitamente bloqueadas
      </div>
    </div>
  );
}

function ControlEditor({ control, onClose, onSaved }) {
  const [form, setForm] = useState({
    status: control?.status || 'pending_decision',
    owner: control?.owner || '',
    evidence_url: control?.evidence_url || '',
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await sistemaApi.updateGovernanceControl(control.control_key, form);
      toast.success('Decisão de governança registrada.');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error?.message || 'Não foi possível registrar a decisão.');
    } finally { setSaving(false); }
  };
  return (
    <Dialog open={!!control} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Registrar decisão de governança</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3"><p className="font-medium">{control?.title}</p><p className="mt-1 text-sm text-muted-foreground">{control?.description}</p></div>
          <label className="block text-sm font-medium">Estado
            <select value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value }))} className="mt-1.5 h-10 w-full rounded-md border bg-background px-3">
              {Object.entries(STATUS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">Responsável
              <input value={form.owner} onChange={(event) => setForm((value) => ({ ...value, owner: event.target.value }))} className="mt-1.5 h-10 w-full rounded-md border bg-background px-3" placeholder="Nome ou função" />
            </label>
            <label className="block text-sm font-medium">Evidência HTTPS
              <input value={form.evidence_url} onChange={(event) => setForm((value) => ({ ...value, evidence_url: event.target.value }))} className="mt-1.5 h-10 w-full rounded-md border bg-background px-3" placeholder="https://…" />
            </label>
          </div>
          <label className="block text-sm font-medium">Motivo da mudança
            <textarea required minLength={10} value={form.reason} onChange={(event) => setForm((value) => ({ ...value, reason: event.target.value }))} className="mt-1.5 min-h-24 w-full rounded-md border bg-background p-3" placeholder="Descreva a decisão, o alcance e a evidência usada." />
          </label>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Registrar decisão</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Controls({ controls, domain, onEdit }) {
  const visible = controls.filter((control) => domain === 'data'
    ? ['data', 'telemetry', 'backup'].includes(control.domain)
    : control.domain === domain);
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="font-semibold">Controles e decisões</h2></div>
      <div className="mt-4 divide-y rounded-xl border">
        {visible.map((control) => (
          <button key={control.control_key} type="button" onClick={() => onEdit(control)} className="flex w-full flex-col gap-3 p-4 text-left transition hover:bg-muted/40 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{control.title}</p><StatusPill status={control.status} /></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{control.description}</p>{control.owner && <p className="mt-2 text-xs text-muted-foreground">Responsável: {control.owner}</p>}</div>
            <span className="text-xs font-medium text-primary">Revisar</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function WifiPanel({ source }) {
  if (!source?.available) return <SourceUnavailable name="Wi-Fi" />;
  const data = source.data || {};
  const syncDanger = data.latestSync?.status === 'erro';
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Visitantes no espelho" value={number(data.visitors)} note="somente contagem no console" />
        <Metric label="Conexões · 30 dias" value={number(data.connections30d)} note="IP e MAC ficam na origem" />
        <Metric label="Sem aceite registrado" value={number(data.withoutConsent)} note="exige revisão de finalidade" tone={data.withoutConsent ? 'warning' : 'normal'} />
        <Metric label="Sem vínculo" value={number(data.unlinked)} note="não cria identidade no console" />
        <Metric label="Conflitos pendentes" value={number(data.pendingIdentity)} note="fila humana obrigatória" tone={data.pendingIdentity ? 'warning' : 'normal'} />
      </div>
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div><div className="flex items-center gap-2">{syncDanger ? <AlertOctagon className="h-5 w-5 text-red-500" /> : <Network className="h-5 w-5 text-primary" />}<h2 className="font-semibold">Sincronização do portal cativo</h2></div><p className="mt-1 text-sm text-muted-foreground">Última execução: {when(data.latestSync?.iniciado_em)}</p></div>
          <a href="/wifi" className="inline-flex items-center gap-2 text-sm font-medium text-primary">Abrir operação ministerial <ExternalLink className="h-4 w-4" /></a>
        </div>
        {data.latestSync ? <div className="mt-4 grid gap-3 sm:grid-cols-4"><Metric label="Estado" value={data.latestSync.status} note="última sincronização" tone={syncDanger ? 'danger' : 'normal'} /><Metric label="Visitantes novos" value={number(data.latestSync.visitantes_novos)} note="na execução" /><Metric label="Conexões novas" value={number(data.latestSync.conexoes_novas)} note="na execução" /><Metric label="Vínculos" value={number(data.latestSync.vinculos_membro)} note="regras de identidade" /></div> : <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma sincronização registrada.</p>}
      </section>
    </>
  );
}

function FacialPanel({ source, controls }) {
  if (!source?.available) return <SourceUnavailable name="reconhecimento facial" />;
  const data = source.data || {};
  const dpo = controls.find((control) => control.control_key === 'facial_dpo_approval');
  const blocked = dpo?.status !== 'implemented';
  return (
    <>
      {blocked && <div className="flex gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" /><div><p className="font-semibold text-red-900 dark:text-red-100">Expansão biométrica bloqueada</p><p className="mt-1 text-sm leading-6 text-red-800/80 dark:text-red-200/80">O fluxo atual pode ser monitorado, mas novos usos não devem ser ativados até existir parecer DPO, termo versionado, revogação e plano de incidente com evidência.</p></div></div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Rostos cadastrados" value={number(data.enrolled)} note="somente contagem" />
        <Metric label="Com consentimento" value={number(data.consented)} note="flag + descriptor presentes" />
        <Metric label="Inconsistência" value={number(data.consentMismatch)} note="descriptor sem consentimento" tone={data.consentMismatch ? 'danger' : 'normal'} />
        <Metric label="Anônimos pendentes" value={number(data.anonymousPending)} note="biometria fica na origem" />
        <Metric label="Expurgo vencido" value={number(data.overduePurge)} note={`${number(data.expiring7d)} vencem em 7 dias`} tone={data.overduePurge ? 'danger' : 'normal'} />
      </div>
      <section className="rounded-2xl border bg-card p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><Fingerprint className="h-5 w-5 text-primary" /><h2 className="font-semibold">Operação facial isolada</h2></div><p className="mt-1 text-sm text-muted-foreground">{number(data.presences30d)} reconhecimentos nos últimos 30 dias. Imagens e embeddings nunca atravessam este painel.</p></div><a href="/ministerial/reconhecimento-facial" className="inline-flex items-center gap-2 text-sm font-medium text-primary">Abrir operação de entrada <ExternalLink className="h-4 w-4" /></a></div></section>
    </>
  );
}

function DataPanel({ source }) {
  if (!source?.available) return <SourceUnavailable name="integridade de dados" />;
  const data = source.data || {};
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Conflitos de identidade" value={number(data.pendingIdentity)} note="aguardando revisão humana" tone={data.pendingIdentity ? 'warning' : 'normal'} />
        <Metric label="Auditorias · 24 h" value={number(data.auditEvents24h)} note="mudanças registradas" />
        <Metric label="Erros de servidor · 24 h" value={number(data.serverErrors24h)} note="sem payload sensível" tone={data.serverErrors24h ? 'warning' : 'normal'} />
        <Metric label="Feedbacks abertos" value={number(data.feedbackOpen)} note="triagem operacional" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[
          ['Identidade', 'Conflitos nunca são resolvidos apenas por telefone ou pelo portal Wi-Fi.', ShieldCheck],
          ['Retenção', 'Prazo sem decisão formal aparece como pendente; ausência de expurgo não vira saúde verde.', CircleHelp],
          ['Auditoria', 'O console guarda metadados e correlação. Conteúdo sensível permanece no módulo dono.', Activity],
        ].map(([title, text, Icon]) => <div key={title} className="rounded-xl border bg-card p-4"><Icon className="h-5 w-5 text-primary" /><p className="mt-3 font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p></div>)}
      </div>
    </>
  );
}

export function GovernanceOperationsPanel() {
  const [domain, setDomain] = useState('wifi');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await sistemaApi.governanceCommandCenter()); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const controls = useMemo(() => data?.controls?.data || [], [data]);

  if (loading) return <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (error || !data) return <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5"><div className="flex items-center gap-3"><TriangleAlert className="h-5 w-5 text-destructive" /><p className="flex-1 text-sm">{error?.message || 'A governança de dados não respondeu.'}</p><Button variant="outline" size="sm" onClick={load}>Recarregar</Button></div></div>;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-white">
        <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
          <div className="p-5 md:p-6"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Governança operacional</p><h2 className="mt-2 text-2xl font-semibold">Controle o risco sem centralizar o dado</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Wi-Fi e reconhecimento facial continuam operando em suas telas próprias. Sistema observa saúde, consentimento, retenção, conflitos e evidências.</p><div className="mt-5 flex flex-wrap gap-2" role="tablist">{DOMAINS.map((item) => { const Icon = item.icon; const active = item.id === domain; return <button key={item.id} type="button" role="tab" aria-selected={active} onClick={() => setDomain(item.id)} className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${active ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100' : 'border-slate-800 text-slate-400 hover:text-white'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</div></div>
          <div className="border-t border-slate-800 p-5 lg:border-l lg:border-t-0"><BoundaryMap boundaries={data.boundaries} /><Button variant="ghost" size="sm" className="mt-3 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Atualizar leituras</Button></div>
        </div>
      </section>

      {domain === 'wifi' && <WifiPanel source={data.wifi} />}
      {domain === 'facial' && <FacialPanel source={data.facial} controls={controls} />}
      {domain === 'data' && <DataPanel source={data.integrity} />}
      {!data.controls?.available ? <SourceUnavailable name="controles de governança" /> : <Controls controls={controls} domain={domain} onEdit={setEditing} />}
      {editing && <ControlEditor control={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}
