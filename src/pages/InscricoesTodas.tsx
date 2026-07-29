// Aba "Todas as inscrições" do /inscricoes (SPEC-03) — busca única sobre a
// vw_inscricoes_unificadas (10 portas): filtros porta/status-canônico/área/
// período, paginação server-side, deep-link pro módulo dono e export CSV
// (gated por pode_exportar). A operação continua em cada módulo — isto é
// espelho de leitura, não substituto.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { inscricoesApi as api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from 'sonner';
import { Loader2, Search, Download, ExternalLink, ChevronLeft, ChevronRight, FilterX } from 'lucide-react';

export const PORTA_LABEL: Record<string, string> = {
  inscricoes: 'Eventos',
  eventos_externos: 'Eventos (legado)',
  batismo: 'Batismo',
  apresentacao_criancas: 'Apresentação',
  apresentacao_bebes: 'Apresentação (bebês)',
  grupos: 'Grupos',
  grupos_lider: 'Líderes',
  next: 'Next',
  // `next_legado` SAIU daqui em 2026-07-30 junto com a porta. Este mapa não é só
  // rótulo: alimenta os SELECTS de filtro de porta (aqui e no Dashboard), então
  // uma chave que a view não emite mais viraria uma opção de filtro que devolve
  // zero pra sempre. Pra exibição não fazia falta — os 3 pontos de leitura já
  // caem em `|| i.porta`.
  voluntariado: 'Voluntariado',
};

export const STATUS_CANONICO: Record<string, { label: string; cls: string }> = {
  recebida: { label: 'Recebida', cls: 'bg-sky-500/15 text-sky-600' },
  em_tratamento: { label: 'Em tratamento', cls: 'bg-amber-500/15 text-amber-600' },
  confirmada: { label: 'Confirmada', cls: 'bg-emerald-500/15 text-emerald-600' },
  concluida: { label: 'Concluída', cls: 'bg-primary/15 text-primary' },
  nao_concluida: { label: 'Não concluída', cls: 'bg-foreground/10 text-muted-foreground' },
  recusada: { label: 'Recusada', cls: 'bg-red-500/10 text-red-600' },
  cancelada: { label: 'Cancelada', cls: 'bg-red-500/10 text-red-500' },
};

const AREAS_DERIVADAS = ['Sede', 'AMI', 'Bridge', 'Online', 'KIDS', 'Next', 'Grupos', 'Voluntariado'];

const FILTROS_VAZIOS = { q: '', porta: '', status: '', area: '', de: '', ate: '' };

export const fmtQuando = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export default function InscricoesTodas({ areas }: { areas: any[] }) {
  const navigate = useNavigate();
  const { modulePerms, profile } = useAuth();
  const podeExportar = ['admin', 'diretor'].includes(profile?.role)
    || !!modulePerms?.inscricoes?.pode_exportar;

  const [filtros, setFiltros] = useState({ ...FILTROS_VAZIOS });
  const [page, setPage] = useState(0);
  const [dados, setDados] = useState<{ items: any[]; total: number }>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const debounceRef = useRef<any>(null);

  const opcoesArea = useMemo(() => {
    const doCatalogo = (areas || []).map((a: any) => a.nome);
    return [...new Set([...AREAS_DERIVADAS, ...doCatalogo])];
  }, [areas]);

  function montarParams(pg: number, limit?: number) {
    const p = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => { if (v) p.set(k, v); });
    p.set('page', String(pg));
    if (limit) p.set('limit', String(limit));
    return p.toString();
  }

  useEffect(() => {
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      api.unificadas(montarParams(page))
        .then((r: any) => setDados({ items: r.items || [], total: r.total || 0 }))
        .catch(() => toast.error('Erro na busca unificada'))
        .finally(() => setLoading(false));
    }, filtros.q ? 400 : 0);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros), page]);

  const set = (k: string) => (e: any) => { setPage(0); setFiltros(f => ({ ...f, [k]: e?.target ? e.target.value : e })); };
  const temFiltro = Object.values(filtros).some(Boolean);

  async function exportarCsv() {
    setExportando(true);
    try {
      const linhas: any[] = [];
      for (let pg = 0; pg < 10; pg++) {
        const r: any = await api.unificadas(montarParams(pg, 1000));
        linhas.push(...(r.items || []));
        if (linhas.length >= (r.total || 0)) break;
      }
      const esc = (v: any) => `"${String(v ?? '').replaceAll('"', '""')}"`;
      const header = ['Quando', 'Nome', 'Telefone', 'CPF', 'E-mail', 'Porta', 'Inscrição', 'Área', 'Status', 'Origem', 'Série', 'Edição'];
      const csv = '﻿' + [header, ...linhas.map(i => [
        fmtQuando(i.criado_em), i.nome_display, i.telefone_norm || '', i.cpf_norm || '', i.email_norm || '',
        PORTA_LABEL[i.porta] || i.porta, i.evento_rotulo || '', i.area_display || '',
        STATUS_CANONICO[i.status_canonico]?.label || i.status_canonico, i.origem_norm || '',
        i.serie_chave || '', i.edicao_rotulo || '',
      ])].map(l => l.map(esc).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'inscricoes-unificadas.csv'; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${linhas.length} inscrições exportadas`);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao exportar');
    } finally { setExportando(false); }
  }

  const ultimaPagina = Math.max(0, Math.ceil(dados.total / 50) - 1);

  return (
    <Card className="glass-solid p-4 space-y-3">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Nome, CPF ou telefone — em todas as portas" value={filtros.q} onChange={set('q')} className="h-9 pl-8" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground block">Porta</label>
          <select value={filtros.porta} onChange={set('porta')} className="h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-2">
            <option value="">Todas</option>
            {Object.entries(PORTA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground block">Status</label>
          <select value={filtros.status} onChange={set('status')} className="h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-2">
            <option value="">Todos</option>
            {Object.entries(STATUS_CANONICO).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground block">Área</label>
          <select value={filtros.area} onChange={set('area')} className="h-9 rounded-md border border-border bg-[var(--cbrio-input-bg)] text-sm px-2">
            <option value="">Todas</option>
            {opcoesArea.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground block">De</label>
          <DatePicker value={filtros.de} onChange={v => set('de')(v)} className="h-9 w-36" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground block">Até</label>
          <DatePicker value={filtros.ate} onChange={v => set('ate')(v)} className="h-9 w-36" />
        </div>
        {temFiltro && (
          <Button size="sm" variant="ghost" className="h-9" onClick={() => { setPage(0); setFiltros({ ...FILTROS_VAZIOS }); }}>
            <FilterX className="h-3.5 w-3.5 mr-1" /> Limpar
          </Button>
        )}
        {podeExportar && (
          <Button size="sm" variant="outline" className="h-9 ml-auto" onClick={exportarCsv} disabled={exportando || !dados.total}
            title="Baixar o resultado filtrado em CSV (Excel)">
            {exportando ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />} Exportar CSV
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : dados.items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma inscrição bate com os filtros.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Quando</th>
                  <th className="py-2 pr-3 font-medium">Nome</th>
                  <th className="py-2 pr-3 font-medium">Contato</th>
                  <th className="py-2 pr-3 font-medium">Porta</th>
                  <th className="py-2 pr-3 font-medium">Inscrição</th>
                  <th className="py-2 pr-3 font-medium">Área</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {dados.items.map((i: any) => (
                  <tr key={`${i.porta}-${i.ref_id}`} className="border-b border-border/50 hover:bg-primary/5">
                    <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">{fmtQuando(i.criado_em)}</td>
                    <td className="py-2 pr-3 font-medium">{i.nome_display}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">{i.telefone_norm || i.email_norm || '—'}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-xs">{PORTA_LABEL[i.porta] || i.porta}</span>
                    </td>
                    <td className="py-2 pr-3 text-xs">{i.evento_rotulo || '—'}{i.edicao_rotulo ? <span className="text-muted-foreground"> · {i.edicao_rotulo}</span> : null}</td>
                    <td className="py-2 pr-3 text-xs whitespace-nowrap">{i.area_display || '—'}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CANONICO[i.status_canonico]?.cls || 'bg-foreground/10'}`}
                        title={`Status original: ${i.status_original}`}>
                        {STATUS_CANONICO[i.status_canonico]?.label || i.status_canonico}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {i.rota_detalhe && (
                        <button onClick={() => navigate(i.rota_detalhe)} title="Abrir no módulo dono"
                          className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{dados.total} inscrições · página {page + 1} de {ultimaPagina + 1}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={page >= ultimaPagina} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">A operação de cada inscrição continua no módulo dono (ícone ao lado) — esta aba é a visão unificada de leitura.</p>
        </>
      )}
    </Card>
  );
}
