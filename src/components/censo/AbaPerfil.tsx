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
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { censo } from '../../api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, BarChart3, Lock, Search, MessageSquareText, MapPin, IdCard, AlertTriangle } from 'lucide-react';
import EmptyState from '@/components/EmptyState';

// ⚠️ LAZY é obrigatório: o maplibre é ~1MB e esta aba é importada
// ESTATICAMENTE em `src/pages/censo/Censo.tsx`. Import direto jogaria o mapa
// inteiro no chunk de quem abre o Censo só para ver a lista de pesquisas.
const MapaBairros = lazy(() => import('../membresia/MapaBairros'));

type Valor = { valor: string; total: number; pct: number; neutra: boolean };
type Grafico = {
  tipo: string; id: string; texto: string; sensivel?: boolean;
  base?: number; neutras?: number; total?: number; media?: number | null;
  aberta?: boolean; valores?: Valor[];
  valores_ocultos?: number; valores_ocultos_pessoas?: number;
};
type Identificacao = {
  id: string; texto: string; tipo: string; desconhecido?: boolean;
  // A pergunta de sexo: respondida, mas o resultado dela está no bloco "Quem
  // respondeu" em vez de virar uma segunda barra. Ver censo.js /perfil.
  no_bloco_demografico?: boolean;
};
/** De onde veio o sexo de cada respondente. Ver o comentário em censo.js. */
type FonteSexo = { declarado: number; cadastro: number; sem: number };
type Orfa = { id: string; texto: string; respostas: number };
type Mapa = {
  bairros: { bairro: string; norm: string; total: number; lat: number; lng: number }[];
  total: number; pessoas_no_mapa: number; pessoas_sem_bairro: number;
  pessoas_sem_coordenada: number; pessoas_sem_cadastro: number; pessoas_fora_da_base: number;
};
type Perfil = {
  titulo: string; respondentes: number; graficos: Grafico[];
  demografia: Record<string, { valor: string; total: number }[]>;
  sexo_fonte?: FonteSexo;
  // ⚠️ Opcionais: o mock do teste e um backend mais antigo não os mandam.
  identificacao?: Identificacao[]; orfas?: Orfa[]; leitura_incompleta?: boolean;
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
  // O mapa carrega SEPARADO do perfil: ele traz o maplibre junto e uma falha
  // aqui não pode derrubar os gráficos, que são o conteúdo principal da aba.
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [mapaErro, setMapaErro] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    if (!pesquisaId) return;
    setD(null); setErro(null);
    try { setD(await censo.perfil(pesquisaId)); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  }, [pesquisaId]);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!pesquisaId) return;
    let vivo = true;
    setMapa(null); setMapaErro(false);
    // ⚠️ `Promise.resolve().then` e não chamada direta: se o cliente da API não
    // tiver este método (bundle antigo em cache, mock de teste), a chamada
    // estoura SÍNCRONA e derruba a aba inteira — os gráficos junto com o mapa.
    Promise.resolve()
      .then(() => censo.perfilMapa(pesquisaId))
      .then((r: Mapa) => { if (vivo) setMapa(r); })
      // ⚠️ Erro do mapa NÃO vira mapa vazio: "ninguém tem bairro" e "a consulta
      // falhou" levam a decisões opostas. A tela declara qual dos dois é.
      .catch(() => { if (vivo) setMapaErro(true); });
    return () => { vivo = false; };
  }, [pesquisaId]);

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
    // ⚠️ "Sexo", não "Gênero" (14/09/2026 · pedido do Marcos): é o nome que a
    // igreja usa, era o nome da pergunta que saiu do questionário, e a
    // Membresia já chamava assim. Duas telas com nomes diferentes para o mesmo
    // campo fazem parecer que são dois dados.
    ['faixa_etaria', 'Faixa etária'], ['genero', 'Sexo'],
    ['estado_civil', 'Estado civil'], ['bairro', 'Bairro'], ['status_membro', 'Vínculo'],
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{d.respondentes}</span> respostas recebidas
          {d.leitura_incompleta && (
            <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
              <AlertTriangle className="size-3.5" /> leitura incompleta — recarregue
            </span>
          )}
        </p>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar uma pergunta" className="pl-8 h-9 text-sm" />
        </div>
      </div>

      {/* O MAPA antes da demografia: "de onde vem essa gente" é a primeira
          pergunta que alguém faz olhando um censo, e o bairro em barra não
          responde isso — 96 bairros numa lista não formam um lugar.
          ⚠️ Só aparece sem filtro de busca: pendurado enquanto a pessoa procura
          uma pergunta, ele viraria ruído. */}
      {!busca && (mapa || mapaErro) && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" /> De onde vêm
            </h3>
            {mapaErro ? (
              <p className="text-sm text-amber-600 dark:text-amber-500 flex items-center gap-1.5">
                <AlertTriangle className="size-4" />
                Não foi possível carregar o mapa. Os gráficos abaixo não dependem dele.
              </p>
            ) : mapa && mapa.bairros.length > 0 ? (
              <>
                <Suspense fallback={
                  <div className="h-[320px] grid place-items-center text-sm text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                  </div>
                }>
                  {/* Sem `onSelecionar`: clicar para filtrar os gráficos cruzaria
                      bairro com OPINIÃO, e há bairro com uma pessoa só — seria o
                      perfil de alguém identificável numa tela que promete ser
                      agregada, aberta a nível 1. É decisão, não falta. */}
                  <MapaBairros bairros={mapa.bairros} unidade="bairro" unidadePlural="bairros" />
                </Suspense>
                {/* ⚠️ O buraco vai DECLARADO, com número. Mapa que mostra 694 e
                    cala sobre os outros 155 parece completo e não é. */}
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  <span className="font-medium text-foreground">{mapa.pessoas_no_mapa}</span> de{' '}
                  {mapa.total} no mapa, em {mapa.bairros.length} bairros.
                  {mapa.pessoas_sem_coordenada > 0 && <> {mapa.pessoas_sem_coordenada} têm bairro que ainda não tem coordenada.</>}
                  {mapa.pessoas_sem_bairro > 0 && <> {mapa.pessoas_sem_bairro} não informaram bairro.</>}
                  {mapa.pessoas_sem_cadastro > 0 && <> {mapa.pessoas_sem_cadastro} responderam sem cadastro ligado.</>}
                  {mapa.pessoas_fora_da_base > 0 && <> {mapa.pessoas_fora_da_base} têm cadastro inativo.</>}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ninguém posicionado ainda — os bairros de quem respondeu ainda não têm coordenada.
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
                    {/* ⚠️ A linha de procedência do sexo ("N declararam nesta
                        pesquisa · N vieram do cadastro") foi RETIRADA a pedido
                        do Marcos em 16/09, depois que a auditoria daquele dia
                        fechou os 28 cadastros errados e ele passou a conhecer a
                        origem do número. NÃO recolocar achando que sumiu por
                        engano — `sexo_fonte` continua vindo do servidor e
                        rendê-lo de novo é uma linha, se um dia fizer falta. */}
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
                <>
                  <Barras valores={g.valores || []} base={g.base || 0} />
                  {(g.valores_ocultos || 0) > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      + {g.valores_ocultos} outras respostas ({g.valores_ocultos_pessoas} pessoas),
                      fora da lista para a tela continuar legível.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )
      ))}

      {/* ⚠️ DECLARADO, não escondido. Nome, CPF, telefone, e-mail e nascimento
          são cadastro, não opinião: cada resposta é um valor único, então
          "gráfico" seria a lista nominal — numa tela aberta a nível 1. O valor
          sequer é lido do banco. Mostrar a pergunta e dizer por que ela não tem
          barra é o que impede alguém concluir que a pergunta sumiu. */}
      {!busca && (d.identificacao?.length || 0) > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <IdCard className="size-4 text-muted-foreground" /> Campos de identificação
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Estas perguntas foram respondidas e ficam no cadastro da pessoa. Não viram gráfico
              porque cada resposta é única — a barra seria a lista de quem respondeu.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(d.identificacao || []).map((c) => (
                <Badge key={c.id} variant="secondary" className="font-normal">
                  {c.texto}{c.desconhecido && ' · tipo novo'}
                  {c.no_bloco_demografico && ' · está em "Quem respondeu"'}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Respostas de perguntas que saíram do questionário (removidas ou
          renomeadas depois de já terem resposta). O laço acima percorre o
          questionário ATUAL, então elas ficariam invisíveis para sempre. */}
      {!busca && (d.orfas?.length || 0) > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" /> Respostas de perguntas removidas
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Estas perguntas não estão mais no questionário, mas têm resposta guardada. Elas não
              aparecem nos gráficos acima porque a tela segue o questionário de hoje.
            </p>
            <div className="space-y-1.5">
              {(d.orfas || []).map((o) => (
                <div key={o.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-foreground truncate">{o.texto}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">{o.respostas}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
