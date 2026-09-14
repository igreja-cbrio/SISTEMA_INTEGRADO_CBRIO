// O relatório analítico do censo — o que uma empresa de pesquisa entregaria.
//
// ⚠️⚠️ Irmão da Leitura da IA, de matéria-prima OPOSTA. Aquela lê o que as
// pessoas escreveram; esta lê as perguntas FECHADAS agregadas — que é o que
// este censo tem (medido em 13/09/2026: 34 perguntas, ZERO do tipo texto longo,
// zero resposta aberta entre as concluídas).
//
// Três escolhas que a tela sustenta:
//  · GERAR é um ato, não um efeito de abrir a aba. Roda Opus 5 sobre o censo
//    inteiro, custa e leva minutos — e todos precisam ler o MESMO relatório,
//    senão cinco pessoas na reunião discutem cinco conclusões.
//  · A RESSALVA de cada achado aparece junto dele, com o mesmo peso. Relatório
//    que empurra objeção para o rodapé é relatório que não foi conferido.
//  · O que foi DESCARTADO aparece. Recomendação sem número real é jogada fora
//    automaticamente; esconder isso faria o relatório parecer mais limpo do que
//    a geração foi.
import { useCallback, useEffect, useState } from 'react';
import { censo } from '../../api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2, FileText, Printer, RefreshCw, AlertTriangle, Lightbulb, HelpCircle, Sparkles,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import { imprimirRelatorioCenso, type RelatorioCenso } from '@/lib/imprimirRelatorioCenso';
import { toast } from 'sonner';

type Estado = {
  relatorio: (RelatorioCenso & { id: string; gerado_em: string; respostas_lidas: number; modelo: string }) | null;
  respostas_na_base: number; desatualizado: boolean; novas_desde: number;
  pode_gerar?: boolean; ia_configurada?: boolean;
};

const TIPO_ROTULO: Record<string, string> = {
  serie_pregacao: 'Série de pregação', evento: 'Evento', processo: 'Processo',
  comunicacao: 'Comunicação', cuidado: 'Cuidado',
};
const FORCA_COR: Record<string, string> = {
  forte: 'bg-primary/15 text-primary',
  moderado: 'bg-muted text-muted-foreground',
  sugestivo: 'bg-amber-500/15 text-amber-700 dark:text-amber-500',
};

const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function AbaRelatorio({ pesquisaId, titulo }: { pesquisaId: string | null; titulo?: string }) {
  const [e, setE] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  const carregar = useCallback(async () => {
    if (!pesquisaId) return;
    setE(null); setErro(null);
    try { setE(await censo.relatorio(pesquisaId)); }
    catch (er: unknown) { setErro(er instanceof Error ? er.message : 'Erro ao carregar'); }
  }, [pesquisaId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function gerar() {
    if (!pesquisaId) return;
    setGerando(true); setErro(null);
    try {
      const r = await censo.gerarRelatorio(pesquisaId);
      setE((atual) => ({ ...(atual || {} as Estado), ...r }));
    } catch (er: unknown) {
      setErro(er instanceof Error ? er.message : 'A geração falhou');
    } finally { setGerando(false); }
  }

  function imprimir() {
    const r = e?.relatorio;
    if (!r) return;
    // ⚠️ Bloqueador de pop-up recusa em silêncio — sem este aviso o botão
    // parece quebrado e a pessoa clica de novo.
    if (!imprimirRelatorioCenso(titulo || 'Censo', r)) {
      toast.error('O navegador bloqueou a janela de impressão. Libere o pop-up e tente de novo.');
    }
  }

  if (!pesquisaId) {
    return <EmptyState icone={FileText} titulo="Escolha uma pesquisa"
      mensagem="Selecione a pesquisa acima para gerar o relatório." />;
  }
  if (!e && !erro) {
    return (
      <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const r = e?.relatorio;
  const c = r?.conteudo;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {r ? (
            <p className="text-sm text-muted-foreground">
              Relatório de <span className="font-medium text-foreground">{fmt(r.gerado_em)}</span>
              {' · '}{r.respostas_lidas} respostas
              {' · '}<span className="font-mono text-[11px]">{r.modelo}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum relatório gerado ainda. A análise lê as perguntas fechadas do censo
              — perfil e cruzamentos — e escreve achados, recomendações e limites.
            </p>
          )}
          {/* Envelhecer é sobre quanta resposta nova entrou, não sobre o calendário. */}
          {e?.desatualizado && (
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0" />
              Chegaram {e.novas_desde} respostas depois deste relatório — vale gerar de novo.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {r && (
            <Button variant="outline" size="sm" onClick={imprimir}>
              <Printer className="size-4 mr-1.5" /> Baixar PDF
            </Button>
          )}
          {e?.pode_gerar && (
            <Button size="sm" onClick={gerar} disabled={gerando || e?.ia_configurada === false}>
              {gerando
                ? <><Loader2 className="size-4 mr-1.5 animate-spin" /> Analisando…</>
                : <>{r ? <RefreshCw className="size-4 mr-1.5" /> : <Sparkles className="size-4 mr-1.5" />}
                   {r ? 'Gerar de novo' : 'Gerar relatório'}</>}
            </Button>
          )}
        </div>
      </div>

      {e?.ia_configurada === false && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          A IA não está configurada neste servidor, então o relatório não pode ser gerado agora.
        </p>
      )}
      {erro && (
        <Card><CardContent className="p-4 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" /><span>{erro}</span>
        </CardContent></Card>
      )}
      {gerando && (
        <p className="text-xs text-muted-foreground">
          Lendo o censo inteiro e escrevendo o relatório. Leva alguns minutos — pode deixar a aba aberta.
        </p>
      )}

      {!r && !erro && !gerando && (
        <EmptyState icone={FileText} titulo="Sem relatório ainda"
          mensagem={e?.pode_gerar
            ? 'Clique em "Gerar relatório" para a IA analisar as respostas.'
            : 'Quem tem permissão de gerar pode criar o relatório — ele fica visível aqui para todos.'} />
      )}

      {c?.resumo_executivo && (
        <Card className="border-primary/40">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2">Resumo executivo</h3>
            <p className="text-sm mb-3">{c.resumo_executivo.paragrafo}</p>
            <ul className="space-y-1.5">
              {(c.resumo_executivo.pontos || []).map((p, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-primary shrink-0">·</span><span>{p}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {(c?.achados || []).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Achados</h3>
          {(c?.achados || []).map((a, i) => (
            <Card key={i}><CardContent className="p-4">
              <div className="flex items-start gap-2 mb-1.5 flex-wrap">
                <h4 className="text-sm font-medium flex-1 min-w-0">{a.titulo}</h4>
                <Badge variant="secondary" className={`shrink-0 ${FORCA_COR[a.forca] || ''}`}>{a.forca}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{a.o_que_os_dados_mostram}</p>
              {/* A ressalva fica DENTRO do achado, não num rodapé. */}
              <p className="text-xs text-muted-foreground mt-2 pl-2 border-l-2 border-border">
                <span className="font-medium text-foreground">Ressalva: </span>{a.ressalva}
              </p>
            </CardContent></Card>
          ))}
        </div>
      )}

      {(c?.recomendacoes || []).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Lightbulb className="size-4 text-muted-foreground" /> Recomendações
          </h3>
          <p className="text-xs text-muted-foreground -mt-1">
            Cada uma cita um número deste censo. As que não citavam foram descartadas automaticamente.
          </p>
          {(c?.recomendacoes || []).map((rec, i) => (
            <Card key={i}><CardContent className="p-4">
              <div className="flex items-start gap-2 mb-1.5 flex-wrap">
                <h4 className="text-sm font-medium flex-1 min-w-0">{rec.titulo}</h4>
                <Badge variant="secondary" className="shrink-0">{TIPO_ROTULO[rec.tipo] || rec.tipo}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{rec.porque}</p>
              <p className="text-xs text-muted-foreground mt-2">
                <span className="font-medium text-foreground">Como medir: </span>{rec.como_medir}
              </p>
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* ⚠️ O descarte é informação sobre a geração, não lixo a esconder: muito
          descarte significa que a régua está segurando conselho sem base. */}
      {(c?.recomendacoes_descartadas || []).length > 0 && (
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {c?.recomendacoes_descartadas?.length} recomendação(ões) descartada(s)
            </span>{' '}
            por não citarem nenhum número deste censo:{' '}
            {(c?.recomendacoes_descartadas || []).map((d) => d.titulo).join(' · ')}
          </p>
        </CardContent></Card>
      )}

      {(c?.o_que_o_censo_nao_responde || []).length > 0 && (
        <Card><CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <HelpCircle className="size-4 text-muted-foreground" /> O que este censo não responde
          </h3>
          <ul className="space-y-1.5">
            {(c?.o_que_o_censo_nao_responde || []).map((x, i) => (
              <li key={i} className="text-sm text-muted-foreground flex gap-2">
                <span className="text-muted-foreground/50 shrink-0">·</span><span>{x}</span>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      )}
    </div>
  );
}
