// ============================================================================
// MembrosDuplicadosPanel · aba Duplicados de /ministerial/membresia
//
// Tela de comparação LADO A LADO de pares potencialmente duplicados
// (vw_membros_duplicados). Para cada par:
//   - diff campo a campo (CPF · telefone · e-mail · nascimento · status), com
//     destaque de quem tem dado a mais e ALERTA em conflito (nascimento
//     diferente = provável família, não duplicata);
//   - sugestão automática de qual cadastro MANTER (o mais completo), editável;
//   - ações por par (Fundir · Não é duplicata) e EM LOTE (selecionar vários →
//     fundir mantendo o sugerido / ignorar).
//
// Regra de ouro (CLAUDE.md): nunca fundir por telefone/e-mail sozinho — família
// compartilha número. "Selecionar prováveis" só marca pares com 1º nome idêntico
// + um nome expansão do outro + sem conflito de nascimento.
// ============================================================================

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { membresia as membresiaApi } from '../api';
import { toast } from 'sonner';
import {
  GitMerge, X, RefreshCw, AlertCircle, Loader2, Check, AlertTriangle,
  Phone, Mail, Calendar, User as UserIcon, IdCard, CheckCircle2, ShieldCheck,
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog';

const MOTIVO_LABELS = {
  cpf_igual:         { label: 'Mesmo CPF',          cor: '#DC2626' },
  nome_e_nascimento: { label: 'Nome + nascimento',  cor: '#7C3AED' },
  telefone_igual:    { label: 'Mesmo telefone',     cor: '#EA580C' },
  email_igual:       { label: 'Mesmo e-mail',       cor: '#0EA5E9' },
  nome_similar:      { label: 'Nome similar',       cor: '#A16207' },
};

// ── formatadores ────────────────────────────────────────────────────────────
const digits = (v) => String(v || '').replace(/\D/g, '');
function maskCpf(v) {
  const d = digits(v);
  if (d.length !== 11) return v || '';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function maskTelefone(v) {
  const d = digits(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || '';
}
const fmtData = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '';
const fmtDataHora = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

// ── heurísticas de nome (espelham a faixa segura do dedup em massa) ───────────
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const toks = (s) => norm(s).split(' ').filter(Boolean);
function isSubset(short, long) {
  const used = new Array(long.length).fill(false);
  for (const ts of short) {
    let ok = false;
    for (let i = 0; i < long.length; i++) {
      const tl = long[i];
      if (!used[i] && (ts === tl || (ts.length === 1 && tl.startsWith(ts)) || (tl.length === 1 && ts.startsWith(tl)))) { used[i] = true; ok = true; break; }
    }
    if (!ok) return false;
  }
  return true;
}

// completude → sugere qual manter
function score(m) {
  let s = 0;
  if (digits(m.cpf).length === 11) s += 5;
  if (m.data_nascimento) s += 2;
  if (m.email) s += 1;
  if (m.telefone) s += 1;
  if (['membro_ativo', 'membro'].includes(m.status)) s += 3;
  if (m.foto_url) s += 1;
  return s;
}
function sugerirKeep(par) {
  const sa = score(par.membro_a), sb = score(par.membro_b);
  if (sa !== sb) return sa > sb ? 'a' : 'b';
  // empate: mantém o mais antigo (criado primeiro)
  return new Date(par.membro_a.criado_em || 0) <= new Date(par.membro_b.criado_em || 0) ? 'a' : 'b';
}
// nascimentos diferentes (ambos preenchidos) = provável família/pessoa distinta
function conflitoNascimento(par) {
  const a = par.membro_a.data_nascimento, b = par.membro_b.data_nascimento;
  return !!(a && b && a !== b);
}
// provável MESMA pessoa (faixa segura): 1º nome idêntico + um nome expansão do
// outro + sem conflito de nascimento. cpf_igual/nome_e_nascimento entram direto.
function provavelDuplicata(par) {
  if ((par.motivos || []).some(m => m === 'cpf_igual' || m === 'nome_e_nascimento')) return true;
  if (conflitoNascimento(par)) return false;
  const ta = toks(par.membro_a.nome), tb = toks(par.membro_b.nome);
  if (ta.length < 2 || tb.length < 2 || ta[0] !== tb[0]) return false;
  return ta.length <= tb.length ? isSubset(ta, tb) : isSubset(tb, ta);
}

export default function MembrosDuplicadosPanel() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['membresia', 'duplicados'],
    queryFn: () => membresiaApi.duplicados.list({ limit: 300 }),
    staleTime: 30_000,
  });

  const items = useMemo(() => data?.items || [], [data]);
  const total = data?.total || 0;

  const [keepByPair, setKeepByPair] = useState({});   // par_id -> 'a' | 'b'
  const [selected, setSelected] = useState(() => new Set());
  const [filtro, setFiltro] = useState('todos');       // 'todos' | 'provaveis' | 'familia'
  const [batchAction, setBatchAction] = useState(null); // 'merge' | 'ignorar'
  const [working, setWorking] = useState(false);

  const keepOf = (par) => keepByPair[par.par_id] || sugerirKeep(par);
  const setKeep = (par_id, lado) => setKeepByPair(p => ({ ...p, [par_id]: lado }));

  const visiveis = useMemo(() => {
    if (filtro === 'provaveis') return items.filter(provavelDuplicata);
    if (filtro === 'familia') return items.filter(p => !provavelDuplicata(p));
    return items;
  }, [items, filtro]);

  const nProvaveis = useMemo(() => items.filter(provavelDuplicata).length, [items]);

  const toggleSel = (par_id) => setSelected(s => {
    const n = new Set(s); n.has(par_id) ? n.delete(par_id) : n.add(par_id); return n;
  });
  const selecionarProvaveis = () => setSelected(new Set(visiveis.filter(provavelDuplicata).map(p => p.par_id)));
  const limparSel = () => setSelected(new Set());

  // ── executor em lote (sequencial · merge é destrutivo) ──────────────────────
  async function executarLote(acao) {
    const alvos = visiveis.filter(p => selected.has(p.par_id));
    if (!alvos.length) return;
    setWorking(true);
    let ok = 0, falha = 0;
    for (const par of alvos) {
      try {
        if (acao === 'merge') {
          const keep = keepOf(par);
          const keep_id = keep === 'a' ? par.membro_a_id : par.membro_b_id;
          const drop_id = keep === 'a' ? par.membro_b_id : par.membro_a_id;
          await membresiaApi.duplicados.merge({ keep_id, merge_ids: [drop_id], observacao: 'Merge em lote · aba Duplicados' });
        } else {
          await membresiaApi.duplicados.ignorar({ membro_a_id: par.membro_a_id, membro_b_id: par.membro_b_id, motivo: 'Marcado em lote como não duplicado' });
        }
        ok++;
      } catch (e) { falha++; }
    }
    setWorking(false);
    setBatchAction(null);
    limparSel();
    if (acao === 'merge') toast[falha ? 'warning' : 'success'](`${ok} fundido(s)${falha ? ` · ${falha} falhou (revise)` : ''}`);
    else toast[falha ? 'warning' : 'success'](`${ok} ignorado(s)${falha ? ` · ${falha} falhou` : ''}`);
    qc.invalidateQueries({ queryKey: ['membresia', 'duplicados'] });
    qc.invalidateQueries({ queryKey: ['membresia', 'membros'] });
  }

  // ── ação por par único ──────────────────────────────────────────────────────
  const [parMerge, setParMerge] = useState(null); // { par } (confirmação)
  async function fundirUm(par) {
    setWorking(true);
    try {
      const keep = keepOf(par);
      const keep_id = keep === 'a' ? par.membro_a_id : par.membro_b_id;
      const drop_id = keep === 'a' ? par.membro_b_id : par.membro_a_id;
      const res = await membresiaApi.duplicados.merge({ keep_id, merge_ids: [drop_id], observacao: 'Merge manual · aba Duplicados' });
      toast.success(`Fundido · ${res?.merged || 1} cadastro absorvido`);
      qc.invalidateQueries({ queryKey: ['membresia', 'duplicados'] });
      qc.invalidateQueries({ queryKey: ['membresia', 'membros'] });
    } catch (e) { toast.error(e?.message || 'Erro ao fundir'); }
    setWorking(false);
    setParMerge(null);
  }
  async function ignorarUm(par) {
    try {
      await membresiaApi.duplicados.ignorar({ membro_a_id: par.membro_a_id, membro_b_id: par.membro_b_id, motivo: 'Marcado como não duplicado' });
      toast.success('Par ignorado');
      qc.invalidateQueries({ queryKey: ['membresia', 'duplicados'] });
    } catch (e) { toast.error(e?.message || 'Erro ao ignorar'); }
  }

  const nSel = selected.size;

  return (
    <div className="space-y-4">
      {/* Header + filtros */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GitMerge className="size-4 text-primary" /> Possíveis duplicados
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Cadastros que parecem a mesma pessoa, lado a lado. Confira e funda — ou marque "não é duplicata".
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Recarregar
        </Button>
      </div>

      {!isLoading && items.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <FiltroChip ativo={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos ({total})</FiltroChip>
          <FiltroChip ativo={filtro === 'provaveis'} onClick={() => setFiltro('provaveis')} cor="#059669">
            <ShieldCheck className="size-3" /> Prováveis ({nProvaveis})
          </FiltroChip>
          <FiltroChip ativo={filtro === 'familia'} onClick={() => setFiltro('familia')} cor="#B45309">
            <AlertTriangle className="size-3" /> Conferir ({total - nProvaveis})
          </FiltroChip>
        </div>
      )}

      {/* Loading / empty */}
      {isLoading ? (
        <div className="py-12 flex items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin mr-2" /> Procurando duplicados...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
          <CheckCircle2 className="size-8 mx-auto text-emerald-500/70 mb-3" />
          <p className="text-sm font-medium text-foreground">Nenhum duplicado pendente</p>
          <p className="text-xs text-muted-foreground mt-1">Cadastros com CPF, telefone, e-mail ou nome+nascimento iguais aparecem aqui pra fundir.</p>
        </div>
      ) : (
        <div className="space-y-3 pb-20">
          {visiveis.map(par => (
            <ParComparacao
              key={par.par_id}
              par={par}
              keep={keepOf(par)}
              setKeep={(lado) => setKeep(par.par_id, lado)}
              selecionado={selected.has(par.par_id)}
              onToggleSel={() => toggleSel(par.par_id)}
              onFundir={() => setParMerge({ par })}
              onIgnorar={() => ignorarUm(par)}
              disabled={working}
            />
          ))}
        </div>
      )}

      {/* Barra de ações em lote (fixa no rodapé quando há seleção) */}
      {nSel > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border bg-card/95 backdrop-blur-xl shadow-lg px-3 py-2">
          <span className="text-xs font-medium text-foreground pl-2">{nSel} selecionado{nSel > 1 ? 's' : ''}</span>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={limparSel}>Limpar</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setBatchAction('ignorar')} disabled={working}>
            <X className="size-3.5" /> Não são duplicatas
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1" onClick={() => setBatchAction('merge')} disabled={working}>
            {working ? <Loader2 className="size-3.5 animate-spin" /> : <GitMerge className="size-3.5" />} Fundir selecionados
          </Button>
        </div>
      )}
      {nSel === 0 && (filtro === 'provaveis' || nProvaveis > 0) && !isLoading && items.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1 rounded-full shadow bg-card/95 backdrop-blur-xl" onClick={selecionarProvaveis}>
            <ShieldCheck className="size-3.5 text-emerald-600" /> Selecionar prováveis
          </Button>
        </div>
      )}

      {/* Confirmação · 1 par */}
      <AlertDialog open={!!parMerge} onOpenChange={(o) => !o && setParMerge(null)}>
        <AlertDialogContent>
          {parMerge && (() => {
            const keep = keepOf(parMerge.par);
            const k = keep === 'a' ? parMerge.par.membro_a : parMerge.par.membro_b;
            const d = keep === 'a' ? parMerge.par.membro_b : parMerge.par.membro_a;
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Fundir cadastros?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm">
                      <div>Mantém <strong className="text-emerald-600">{k.nome}</strong> e absorve <strong className="text-red-600">{d.nome}</strong> (deletado). Vínculos vão pro mantido. Ação permanente (log em mem_merge_log).</div>
                      {conflitoNascimento(parMerge.par) && (
                        <div className="flex items-start gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 p-2 text-xs">
                          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" /> Nascimentos diferentes — confirme que é a mesma pessoa (pode ser família no mesmo telefone).
                        </div>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={working}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={(e) => { e.preventDefault(); fundirUm(parMerge.par); }} disabled={working} className="gap-1.5">
                    {working ? <Loader2 className="size-3.5 animate-spin" /> : <GitMerge className="size-3.5" />} Confirmar fusão
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação · lote */}
      <AlertDialog open={!!batchAction} onOpenChange={(o) => !o && setBatchAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {batchAction === 'merge' ? `Fundir ${nSel} par(es)?` : `Ignorar ${nSel} par(es)?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {batchAction === 'merge'
                ? 'Cada par é fundido mantendo o cadastro marcado em verde (o mais completo, salvo se você trocou). Ação permanente.'
                : 'Os pares saem da lista (vão pra ignorados). Pode reverter no banco se precisar.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); executarLote(batchAction); }} disabled={working} className="gap-1.5">
              {working ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FiltroChip({ ativo, onClick, cor = '#00B39D', children }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1 border transition"
      style={ativo
        ? { background: cor, borderColor: cor, color: '#fff' }
        : { borderColor: 'var(--hairline)', color: 'var(--cbrio-text2)' }}
    >
      {children}
    </button>
  );
}

// ── 1 par lado a lado, com diff campo a campo ────────────────────────────────
function ParComparacao({ par, keep, setKeep, selecionado, onToggleSel, onFundir, onIgnorar, disabled }) {
  const motivos = par.motivos || [];
  const corPrincipal = MOTIVO_LABELS[motivos[0]]?.cor || '#6B7280';
  const conflito = conflitoNascimento(par);
  const provavel = provavelDuplicata(par);

  // linhas de comparação (valor normalizado p/ detectar igual/diferente)
  const linhas = [
    { icon: IdCard, label: 'CPF', a: par.membro_a.cpf, b: par.membro_b.cpf, fmt: maskCpf, key: (v) => digits(v) },
    { icon: Phone, label: 'Telefone', a: par.membro_a.telefone, b: par.membro_b.telefone, fmt: maskTelefone, key: (v) => digits(v) },
    { icon: Mail, label: 'E-mail', a: par.membro_a.email, b: par.membro_b.email, fmt: (v) => v, key: (v) => String(v || '').toLowerCase().trim() },
    { icon: Calendar, label: 'Nascimento', a: par.membro_a.data_nascimento, b: par.membro_b.data_nascimento, fmt: fmtData, key: (v) => v || '', conflito: true },
  ];

  return (
    <Card className="overflow-hidden" style={{ borderColor: selecionado ? 'var(--teal, #00B39D)' : undefined, borderWidth: selecionado ? 2 : undefined }}>
      {/* topo: seleção + confiança + motivos + alerta + ações */}
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-b" style={{ borderLeft: `3px solid ${corPrincipal}`, background: 'var(--cbrio-input-bg)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Checkbox checked={selecionado} onCheckedChange={onToggleSel} aria-label="Selecionar par" />
          <Badge variant="outline" className="text-[10px] font-bold" style={{ borderColor: corPrincipal, color: corPrincipal }}>
            {par.confianca}% provável
          </Badge>
          {motivos.map(m => {
            const def = MOTIVO_LABELS[m] || { label: m, cor: '#6B7280' };
            return <Badge key={m} variant="outline" className="text-[10px]" style={{ borderColor: def.cor, color: def.cor }}>{def.label}</Badge>;
          })}
          {provavel
            ? <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600"><ShieldCheck className="size-3" /> provável mesma pessoa</span>
            : conflito
              ? <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600"><AlertTriangle className="size-3" /> nascimentos diferentes — confira</span>
              : null}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onIgnorar} disabled={disabled} className="h-7 text-xs gap-1">
            <X className="size-3" /> Não é duplicata
          </Button>
          <Button size="sm" onClick={onFundir} disabled={disabled} className="h-7 text-xs gap-1">
            <GitMerge className="size-3" /> Fundir
          </Button>
        </div>
      </div>

      <CardContent className="p-0">
        {/* cabeçalho dos dois lados (escolha de qual manter) */}
        <div className="grid grid-cols-2 divide-x">
          <LadoHeader membro={par.membro_a} ativo={keep === 'a'} onPick={() => setKeep('a')} />
          <LadoHeader membro={par.membro_b} ativo={keep === 'b'} onPick={() => setKeep('b')} />
        </div>

        {/* diff campo a campo */}
        <div className="border-t">
          {linhas.map((ln, i) => {
            const ka = ln.key(ln.a), kb = ln.key(ln.b);
            const ambos = ka && kb;
            const igual = ambos && ka === kb;
            const conflitam = ambos && ka !== kb;
            const soA = ka && !kb, soB = kb && !ka;
            const cellBg = (lado) => {
              if (conflitam && ln.conflito) return 'rgba(245,158,11,0.10)';        // âmbar (nascimento difere)
              if ((lado === 'a' && soA) || (lado === 'b' && soB)) return 'rgba(16,185,129,0.10)'; // verde: tem dado a mais
              return 'transparent';
            };
            return (
              <div key={i} className="grid grid-cols-[1fr_auto_1fr] items-center text-xs border-b last:border-b-0">
                <div className="px-3 py-1.5 text-right font-mono" style={{ background: cellBg('a'), color: ln.a ? 'var(--cbrio-text)' : 'var(--cbrio-text3)' }}>
                  {ln.a ? ln.fmt(ln.a) : '—'}
                </div>
                <div className="px-2 py-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                  <ln.icon className="size-3" /> {ln.label}
                  {igual && <Check className="size-3 text-emerald-500" title="igual nos dois" />}
                  {conflitam && ln.conflito && <AlertTriangle className="size-3 text-amber-500" />}
                </div>
                <div className="px-3 py-1.5 font-mono" style={{ background: cellBg('b'), color: ln.b ? 'var(--cbrio-text)' : 'var(--cbrio-text3)' }}>
                  {ln.b ? ln.fmt(ln.b) : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function LadoHeader({ membro, ativo, onPick }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="text-left p-3 transition relative"
      style={ativo ? { background: 'rgba(16,185,129,0.08)', boxShadow: 'inset 0 0 0 2px rgba(16,185,129,0.5)' } : {}}
      title="Manter este cadastro na fusão"
    >
      <div className="flex items-center gap-2">
        {membro.foto_url
          ? <img data-foto-avatar="" src={membro.foto_url} alt="" className="size-9 rounded-full object-cover" />
          : <div className="size-9 rounded-full bg-muted flex items-center justify-center"><UserIcon className="size-4 text-muted-foreground" /></div>}
        <div className="min-w-0">
          <div className="font-semibold text-sm text-foreground truncate">{membro.nome}</div>
          <div className="text-[10px] text-muted-foreground">{membro.status} · criado {fmtDataHora(membro.criado_em)}</div>
        </div>
      </div>
      <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide"
        style={{ color: ativo ? '#059669' : 'var(--cbrio-text3)' }}>
        {ativo ? <><CheckCircle2 className="size-3" /> Manter este</> : 'Manter este'}
      </div>
    </button>
  );
}
