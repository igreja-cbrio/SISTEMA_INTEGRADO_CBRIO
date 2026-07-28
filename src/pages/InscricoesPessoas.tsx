// Aba "Pessoas" do /inscricoes (SPEC-01 aba 4 · nível ≥2, PII concentrada) —
// rollup por PESSOA sobre a view unificada: quem se inscreveu em quê, com
// destaque pra quem tem 2+ inscrições ("apenas para conferência" — Marcos).
// Âncora de pessoa: membro_id > CPF > telefone > nome (contrato de porta).
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { inscricoesApi as api } from '../api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Loader2, Search, ChevronLeft, ChevronRight, UserSearch, ExternalLink, IdCard } from 'lucide-react';
import { PORTA_LABEL, STATUS_CANONICO, fmtQuando } from './InscricoesTodas';

const fmtCpf = (c?: string | null) =>
  c && c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : (c || '');
const fmtTel = (t?: string | null) =>
  t && t.length >= 10 ? `(${t.slice(0, 2)}) ${t.slice(2, -4)}-${t.slice(-4)}` : (t || '');

export default function InscricoesPessoas() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [todas, setTodas] = useState(false);
  const [page, setPage] = useState(0);
  const [dados, setDados] = useState<{ items: any[]; total_pessoas: number; total_inscricoes: number }>({ items: [], total_pessoas: 0, total_inscricoes: 0 });
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (todas) p.set('todas', '1');
      p.set('page', String(page));
      api.unificadasPessoas(p.toString())
        .then((r: any) => setDados({ items: r.items || [], total_pessoas: r.total_pessoas || 0, total_inscricoes: r.total_inscricoes || 0 }))
        .catch(() => toast.error('Erro no rollup de pessoas'))
        .finally(() => setLoading(false));
    }, q ? 400 : 0);
    return () => clearTimeout(debounceRef.current);
  }, [q, todas, page]);

  const ultimaPagina = Math.max(0, Math.ceil(dados.total_pessoas / 50) - 1);

  return (
    <Card className="glass-solid p-4 space-y-3">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Nome, CPF ou telefone" value={q} onChange={e => { setPage(0); setQ(e.target.value); }} className="h-9 pl-8" />
        </div>
        <div className="flex rounded-md border border-border overflow-hidden">
          <button onClick={() => { setPage(0); setTodas(false); }}
            className={`px-3 py-1.5 text-sm transition-colors ${!todas ? 'bg-primary text-primary-foreground' : 'hover:bg-foreground/5'}`}>
            2+ inscrições
          </button>
          <button onClick={() => { setPage(0); setTodas(true); }}
            className={`px-3 py-1.5 text-sm transition-colors ${todas ? 'bg-primary text-primary-foreground' : 'hover:bg-foreground/5'}`}>
            Todas as pessoas
          </button>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {dados.total_pessoas} pessoas · {dados.total_inscricoes} inscrições no sistema
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <UserSearch className="h-3 w-3" /> Apenas para conferência — a pessoa é agrupada por cadastro, CPF, telefone ou nome; a operação continua no módulo de cada inscrição.
      </p>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : dados.items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {q ? 'Ninguém bate com a busca.' : todas ? 'Nenhuma inscrição no sistema.' : 'Ninguém com 2+ inscrições no recorte atual.'}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {dados.items.map((p: any) => (
              <div key={p.chave} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="font-semibold text-sm">{p.nome}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.total >= 2 ? 'bg-primary/15 text-primary' : 'bg-foreground/8 text-muted-foreground'}`}>
                      {p.total} {p.total === 1 ? 'inscrição' : 'inscrições'}
                    </span>
                    {p.areas.map((a: string) => (
                      <span key={a} className="rounded bg-foreground/8 px-1.5 py-0.5 text-[11px] text-muted-foreground">{a}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                    {p.cpf && <span className="tabular-nums">{fmtCpf(p.cpf)}</span>}
                    {p.telefone && <span className="tabular-nums">{fmtTel(p.telefone)}</span>}
                    {p.membro_id ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => navigate(`/ministerial/membresia?membro=${p.membro_id}`)} title="Ficha na Membresia">
                        <IdCard className="h-3 w-3 mr-1" /> Ficha
                      </Button>
                    ) : (
                      <span className="rounded-full bg-amber-500/15 text-amber-600 px-2 py-0.5 text-[11px]" title="Inscrição sem vínculo com um cadastro — conferir em Entradas">
                        sem cadastro
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {p.inscricoes.map((i: any, idx: number) => (
                    <button key={idx} onClick={() => i.rota_detalhe && navigate(i.rota_detalhe)}
                      title={`${STATUS_CANONICO[i.status_canonico]?.label || i.status_canonico} · abrir no módulo dono`}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] hover:border-primary/50 hover:bg-primary/5 transition-colors">
                      <span className="font-medium">{PORTA_LABEL[i.porta] || i.porta}</span>
                      {i.evento_rotulo && <span className="text-muted-foreground">· {i.evento_rotulo}</span>}
                      <span className="text-muted-foreground">· {fmtQuando(i.criado_em).slice(0, 8)}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CANONICO[i.status_canonico]?.cls.split(' ')[0] || 'bg-foreground/20'}`} />
                      {i.rota_detalhe && <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />}
                    </button>
                  ))}
                  {p.total > p.inscricoes.length && (
                    <span className="text-[11px] text-muted-foreground self-center">+{p.total - p.inscricoes.length} mais antigas</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>página {page + 1} de {ultimaPagina + 1}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={page >= ultimaPagina} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
