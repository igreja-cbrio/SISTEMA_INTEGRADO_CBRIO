// Todo gráfico do censo, gerado do próprio questionário.
//
// Nenhum gráfico aqui é escrito à mão. O backend devolve, na ORDEM DO
// QUESTIONÁRIO, a contagem por valor de cada pergunta com a base já calculada
// sem as neutras. Efeito prático: quando o Matheus adiciona uma pergunta no
// construtor, ela aparece como gráfico sozinha — ninguém precisa mexer aqui.
//
// Duas escolhas de leitura que o código sustenta:
//  · "Prefiro não dizer" aparece SEPARADO e em cinza, fora do 100%. Diluir a
//    escala com quem não quis responder faz o bloco sensível parecer melhor do
//    que é.
//  · Texto livre não vira barra. Vira volume + um empurrão para a Leitura da IA,
//    que é o lugar onde texto aberto é lido de verdade.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { censo } from '../../api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, BarChart3, Lock, Search, MessageSquareText } from 'lucide-react';
import EmptyState from '@/components/EmptyState';

type Valor = { valor: string; total: number; pct: number; neutra: boolean };
type Grafico = {
  tipo: string; id: string; texto: string; sensivel?: boolean;
  base?: number; neutras?: number; total?: number; media?: number | null;
  aberta?: boolean; valores?: Valor[];
};
type Perfil = {
  titulo: string; respondentes: number; graficos: Grafico[];
  demografia: Record<string, { valor: string; total: number }[]>;
};

/** Barras horizontais. Escolhi barra em vez de pizza de propósito: comparar
 *  comprimento é mais fácil que comparar ângulo, e várias perguntas têm 5+
 *  opções — pizza com 6 fatias não se lê. */
function Barras({ valores, base }: { valores: Valor[]; base: number }) {
  const maior = Math.max(1, ...valores.filter((v) => !v.neutra).map((v) => v.total));
  return (
    <div className="space-y-1.5">
      {valores.map((v) => (
        <div key={v.valor} className="flex items-center gap-2.5">
          <span className={`text-xs w-40 shrink-0 truncate ${v.neutra ? 'text-muted-foreground italic' : ''}`}
            title={v.valor}>
            {v.valor}
          </span>
          <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
            <div className={`h-full ${v.neutra ? 'bg-muted-foreground/30' : 'bg-primary/75'}`}
              style={{ width: `${v.neutra ? (v.pct) : (v.total / maior) * 100}%` }} />
          </div>
          <span className="text-xs w-24 text-right tabular-nums text-muted-foreground">
            {v.total} · {v.pct}%
          </span>
        </div>
      ))}
      {base > 0 && valores.some((v) => v.neutra) && (
        <p className="text-[11px] text-muted-foreground pt-1">
          Percentuais calculados sobre {base} respostas — quem marcou a opção neutra fica fora
          da base (o cinza é % do total).
        </p>
      )}
    </div>
  );
}

export default function AbaPerfil({ pesquisaId }: { pesquisaId: string | null }) {
  const [d, setD] = useState<Perfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    if (!pesquisaId) return;
    setD(null); setErro(null);
    try { setD(await censo.perfil(pesquisaId)); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  }, [pesquisaId]);
  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = useMemo(() => {
    if (!d) return [];
    const t = busca.trim().toLowerCase();
    if (!t) return d.graficos;
    // Filtrando, as seções saem: elas são só título e viram ruído na busca.
    return d.graficos.filter((g) => g.tipo !== 'secao' && g.texto.toLowerCase().includes(t));
  }, [d, busca]);

  if (!pesquisaId) {
    return <EmptyState icone={BarChart3} titulo="Escolha uma pesquisa"
      mensagem="Selecione a pesquisa acima para ver o perfil." />;
  }
  if (erro) return <p className="text-sm text-destructive py-6 text-center">{erro}</p>;
  if (!d) {
    return (
      <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando perfil…
      </div>
    );
  }
  if (!d.respondentes) {
    return <EmptyState icone={BarChart3} titulo="Sem respostas para agregar"
      mensagem="Os gráficos aparecem sozinhos assim que houver resposta concluída." />;
  }

  const demo: [string, string][] = [
    ['faixa_etaria', 'Faixa etária'], ['genero', 'Gênero'],
    ['estado_civil', 'Estado civil'], ['bairro', 'Bairro'], ['status_membro', 'Vínculo'],
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{d.respondentes}</span> respostas concluídas
        </p>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar uma pergunta" className="pl-8 h-9 text-sm" />
        </div>
      </div>

      {/* Demografia primeiro: é o "quem respondeu" que dá contexto a tudo que
          vem depois. Vem da view nominal, agregada no servidor — nenhum nome
          chega ao navegador. */}
      {!busca && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Quem respondeu</h3>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {demo.map(([k, label]) => (
                (d.demografia?.[k]?.length || 0) > 0 && (
                  <div key={k}>
                    <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
                    <Barras base={d.respondentes}
                      valores={(d.demografia[k] || []).map((v) => ({
                        ...v, neutra: false,
                        pct: d.respondentes ? Math.round((v.total / d.respondentes) * 1000) / 10 : 0,
                      }))} />
                  </div>
                )
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {visiveis.length === 0 && (
        <EmptyState icone={Search} titulo="Nenhuma pergunta com esse texto"
          mensagem="Tente outra palavra." />
      )}

      {visiveis.map((g) => (
        g.tipo === 'secao' ? (
          <h2 key={g.id} className="text-sm font-semibold text-primary pt-3 border-b border-border pb-1.5">
            {g.texto}
          </h2>
        ) : (
          <Card key={g.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-2 mb-3 flex-wrap">
                <h3 className="text-sm font-medium flex-1 min-w-0">{g.texto}</h3>
                {g.sensivel && (
                  <Badge variant="secondary" className="bg-rose-500/15 text-rose-600 shrink-0">
                    <Lock className="size-3 mr-1" /> sensível
                  </Badge>
                )}
                {g.media !== null && g.media !== undefined && (
                  <Badge variant="secondary" className="shrink-0">média {g.media}</Badge>
                )}
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {g.base} resposta{g.base === 1 ? '' : 's'}
                </span>
              </div>

              {g.aberta && !(g.valores?.length) ? (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <MessageSquareText className="size-3.5 mt-0.5 shrink-0" />
                  <p>
                    {g.total} resposta(s) em texto livre. Barra não diz nada sobre texto aberto —
                    a síntese está na aba <span className="font-medium">Leitura da IA</span>.
                  </p>
                </div>
              ) : (
                <Barras valores={g.valores || []} base={g.base || 0} />
              )}
            </CardContent>
          </Card>
        )
      ))}
    </div>
  );
}
