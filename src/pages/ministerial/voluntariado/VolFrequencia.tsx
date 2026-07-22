import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { voluntariado as api } from '@/api';
import { hrefConversa } from '@/lib/conversas';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Activity, Upload, RefreshCw, Search, Link2, Loader2, CheckCircle2, Sparkles, Phone } from 'lucide-react';
import { toast } from 'sonner';

function waLink(tel?: string | null) {
  if (!tel) return null;
  const d = tel.replace(/\D/g, '');
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}`;
}

type Sugestao = {
  nome_norm: string; nome: string; total_servicos: number;
  sugestao: { profile_id: string; full_name: string } | null;
  confianca: 'exata' | 'alta' | 'media' | 'baixa' | 'nenhuma';
  motivo: string;
};

type Row = {
  chave: string; vol_profile_id: string | null; nome_norm: string; nome: string;
  total_servicos: number; servicos_3m: number; ultimo_servico: string | null; ativo: boolean;
  telefone: string | null; membro_id: string | null;
  inatividade_motivo?: string | null; inatividade_detalhe?: string | null; inatividade_em?: string | null;
};

// Motivos comuns pra inatividade (o valor é guardado · o rótulo é exibido).
const MOTIVOS: { v: string; l: string }[] = [
  { v: 'mudou_cidade', l: 'Mudou de cidade' },
  { v: 'saude', l: 'Problema de saúde' },
  { v: 'afastamento', l: 'Afastamento temporário' },
  { v: 'estudos_trabalho', l: 'Estudos / trabalho' },
  { v: 'familia', l: 'Questões familiares' },
  { v: 'trocou_ministerio', l: 'Trocou de ministério' },
  { v: 'desligou', l: 'Não quer mais servir' },
  { v: 'sem_contato', l: 'Sem contato / não responde' },
  { v: 'outro', l: 'Outro' },
];
const MOTIVO_LABEL: Record<string, string> = Object.fromEntries(MOTIVOS.map(m => [m.v, m.l]));

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
  const [iaOpen, setIaOpen] = useState(false);

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
      const ign = r.ignorados_nao_pessoa ? ` · ${r.ignorados_nao_pessoa} ignorados (posição/equipe)` : '';
      const ins = r.inscritos ? ` · ${r.inscritos} inscritos no cadastro` : '';
      toast.success(`Importado: ${r.processadas} registros · ${r.nomes_vinculados} nomes vinculados${ins}${ign}`);
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
            <p className="text-xs text-muted-foreground">Voluntários únicos (por CPF) · inativo = <b>3 meses sem servir</b> (desaparecido · candidato a contato)</p>
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
          <Button size="sm" className="gap-1.5 bg-[#00B39D] hover:bg-[#00B39D]/90" onClick={() => setIaOpen(true)}>
            <Sparkles className="h-3.5 w-3.5" /> Vincular com IA
          </Button>
        </div>
      </div>

      {resumo && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3"><div className="text-xs text-muted-foreground">Inscritos</div><div className="text-xl font-bold text-foreground">{resumo.total}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">Ativos (serviram em 3 meses)</div><div className="text-xl font-bold text-emerald-600">{resumo.ativos}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">Inativos (0 em 3 meses)</div><div className="text-xl font-bold text-amber-600">{resumo.inativos}</div></Card>
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
                <th className="px-4 py-2 font-semibold">Serviços (3 meses)</th>
                <th className="px-4 py-2 font-semibold">Último</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Contato</th>
                <th className="px-4 py-2 font-semibold">Vínculo</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /> carregando…</td></tr>
              ) : itens.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Nada por aqui. Importe a planilha de controle (.xlsx) pra começar.</td></tr>
              ) : itens.map(r => (
                <tr key={r.chave} className="border-t border-border/60 hover:bg-accent/40 cursor-pointer" onClick={() => setDetalhe(r)}>
                  <td className="px-4 py-2 font-medium text-foreground">{r.nome}</td>
                  <td className="px-4 py-2"><span className={r.servicos_3m === 0 ? 'text-amber-600 font-semibold' : ''}>{r.servicos_3m}</span><span className="text-xs text-muted-foreground"> / {r.total_servicos} total</span></td>
                  <td className="px-4 py-2 text-muted-foreground">{fmt(r.ultimo_servico)}</td>
                  <td className="px-4 py-2">
                    {r.ativo
                      ? <Badge className="bg-emerald-100 text-emerald-700">Ativo</Badge>
                      : <Badge className="bg-amber-100 text-amber-700">Inativo</Badge>}
                    {!r.ativo && r.inatividade_motivo && (
                      <div className="mt-1 text-[11px] text-muted-foreground truncate max-w-[170px]" title={r.inatividade_detalhe || ''}>
                        {MOTIVO_LABEL[r.inatividade_motivo] || r.inatividade_motivo}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {waLink(r.telefone)
                      ? <Link to={hrefConversa(r.telefone)} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"><Phone className="h-3 w-3" /> WhatsApp</Link>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2">
                    {r.membro_id
                      ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> membro (CPF)</span>
                      : <span className="text-xs text-muted-foreground">sem CPF</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {detalhe && <DetalheModal row={detalhe} onClose={() => setDetalhe(null)} onChanged={carregar} />}
      {vincular && <VincularModal row={vincular} onClose={() => setVincular(null)} onDone={() => { setVincular(null); carregar(); }} />}
      {iaOpen && <SugestoesIaModal onClose={() => setIaOpen(false)} onDone={() => { setIaOpen(false); carregar(); }} />}
    </div>
  );
}

const CONF_BADGE: Record<Sugestao['confianca'], { label: string; cls: string }> = {
  exata: { label: 'Idêntico', cls: 'bg-emerald-100 text-emerald-700' },
  alta: { label: 'Alta', cls: 'bg-emerald-100 text-emerald-700' },
  media: { label: 'Média', cls: 'bg-amber-100 text-amber-700' },
  baixa: { label: 'Baixa', cls: 'bg-slate-100 text-slate-600' },
  nenhuma: { label: 'Sem sugestão', cls: 'bg-slate-100 text-slate-500' },
};

function SugestoesIaModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [loading, setLoading] = useState(true);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.frequencia.sugerirVinculos()
      .then((r: any) => {
        const ss: Sugestao[] = r.sugestoes || [];
        setSugestoes(ss);
        // pré-seleciona só os de confiança idêntica/alta (resto exige aprovação)
        const pre: Record<string, boolean> = {};
        for (const s of ss) if (s.sugestao && (s.confianca === 'exata' || s.confianca === 'alta')) pre[s.nome_norm] = true;
        setSel(pre);
      })
      .catch((e: any) => toast.error(e.message || 'Erro ao gerar sugestões'))
      .finally(() => setLoading(false));
  }, []);

  const comSugestao = sugestoes.filter(s => s.sugestao);
  const semSugestao = sugestoes.filter(s => !s.sugestao);
  const selecionados = comSugestao.filter(s => sel[s.nome_norm]);
  const todosMarcados = comSugestao.length > 0 && selecionados.length === comSugestao.length;

  function alternarTodos(marcar: boolean) {
    const novo: Record<string, boolean> = {};
    if (marcar) for (const s of comSugestao) novo[s.nome_norm] = true;
    setSel(novo);
  }

  async function aplicar() {
    if (!selecionados.length) return;
    setSalvando(true);
    try {
      const vinculos = selecionados.map(s => ({ nome_norm: s.nome_norm, vol_profile_id: s.sugestao!.profile_id }));
      const r = await api.frequencia.vincularLote(vinculos);
      toast.success(`${r.vinculados} nome(s) vinculados`);
      onDone();
    } catch (e: any) { toast.error(e.message || 'Erro ao vincular'); setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vincular com IA</DialogTitle>
          <DialogDescription>
            A IA cruzou os nomes não vinculados com os voluntários do sistema. Revise e marque os que estão corretos — nada é vinculado sem você aprovar.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline" /> analisando os nomes…
          </div>
        ) : sugestoes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Não há nomes não vinculados. Tudo certo!</p>
        ) : (
          <>
            {comSugestao.length > 0 && (
              <label className="flex items-center gap-2 px-1 text-sm font-medium text-foreground cursor-pointer select-none">
                <input type="checkbox" className="h-4 w-4 accent-[#00B39D]"
                  checked={todosMarcados}
                  ref={(el) => { if (el) el.indeterminate = selecionados.length > 0 && !todosMarcados; }}
                  onChange={(e) => alternarTodos(e.target.checked)} />
                {todosMarcados ? 'Limpar seleção' : 'Selecionar todos'} ({comSugestao.length})
              </label>
            )}
            <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1 space-y-1.5">
              {comSugestao.map(s => (
                <label key={s.nome_norm} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card cursor-pointer hover:bg-accent/40">
                  <input type="checkbox" className="h-4 w-4 accent-[#00B39D]"
                    checked={!!sel[s.nome_norm]}
                    onChange={(e) => setSel(p => ({ ...p, [s.nome_norm]: e.target.checked }))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{s.nome}</span>
                      <span className="text-xs text-muted-foreground shrink-0">({s.total_servicos} serv.)</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">→ {s.sugestao!.full_name}</div>
                  </div>
                  <Badge className={`shrink-0 ${CONF_BADGE[s.confianca].cls}`}>{CONF_BADGE[s.confianca].label}</Badge>
                </label>
              ))}
              {semSugestao.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs font-medium text-muted-foreground px-1 mb-1">Sem correspondência ({semSugestao.length}) — vincule manualmente pela lista</p>
                  {semSugestao.map(s => (
                    <div key={s.nome_norm} className="flex items-center justify-between p-2.5 rounded-lg border border-dashed bg-muted/30">
                      <span className="text-sm text-foreground truncate">{s.nome} <span className="text-xs text-muted-foreground">({s.total_servicos} serv.)</span></span>
                      <Badge className="bg-slate-100 text-slate-500 shrink-0">Sem sugestão</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs text-muted-foreground">{selecionados.length} de {comSugestao.length} selecionados</span>
              <Button onClick={aplicar} disabled={salvando || !selecionados.length} className="gap-1.5 bg-[#00B39D] hover:bg-[#00B39D]/90">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aplicar selecionados ({selecionados.length})
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetalheModal({ row, onClose, onChanged }: { row: Row; onClose: () => void; onChanged: () => void }) {
  const [regs, setRegs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [motivo, setMotivo] = useState(row.inatividade_motivo || '');
  const [detMotivo, setDetMotivo] = useState(row.inatividade_detalhe || '');
  const [salvandoM, setSalvandoM] = useState(false);
  useEffect(() => {
    const params: any = row.vol_profile_id ? { profile_id: row.vol_profile_id } : { nome_norm: row.nome_norm };
    api.frequencia.detalhe(params).then(setRegs).catch(() => {}).finally(() => setLoading(false));
  }, [row]);
  async function salvarMotivo() {
    setSalvandoM(true);
    try {
      await api.frequencia.setInatividade(row.chave, motivo, detMotivo);
      toast.success(motivo ? 'Motivo salvo' : 'Motivo removido');
      onChanged();
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar o motivo'); }
    finally { setSalvandoM(false); }
  }
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
          <DialogDescription>{row.servicos_3m} em 3 meses · {row.total_servicos} no total · {row.ativo ? 'Ativo' : 'Inativo'} · último em {fmt(row.ultimo_servico)}</DialogDescription>
        </DialogHeader>

        {/* Motivo da inatividade · por que a pessoa parou de servir (candidato a contato) */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <div className="text-xs font-semibold text-foreground">Motivo da inatividade</div>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)}
            className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="">— Sem motivo registrado —</option>
            {MOTIVOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
          {motivo && (
            <textarea value={detMotivo} onChange={(e) => setDetMotivo(e.target.value)} rows={2}
              placeholder="Detalhe (opcional): o que foi conversado, previsão de retorno, etc."
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm resize-none" />
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{row.inatividade_em ? `Registrado em ${fmt(String(row.inatividade_em).slice(0, 10))}` : 'Não registrado'}</span>
            <Button size="sm" onClick={salvarMotivo} disabled={salvandoM}
              className="h-8 gap-1.5 bg-[#00B39D] hover:bg-[#00B39D]/90">
              {salvandoM ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Salvar motivo
            </Button>
          </div>
        </div>
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
