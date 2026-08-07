// A síntese das respostas ABERTAS — o que gráfico nenhum mostra.
//
// O censo tem ~10 campos de texto livre, e é neles que está a informação que
// ninguém pensou em perguntar. Centenas de textos é material que nenhuma equipe
// lê inteiro.
//
// Três coisas que esta tela faz de propósito:
//
//  · Mostra a DATA e o QUANTO foi lido, sempre. Uma síntese sem procedência é
//    opinião com cara de dado. Se chegaram muitas respostas depois da leitura,
//    a tela avisa que ela envelheceu em vez de deixar alguém decidir em cima de
//    uma conclusão vencida.
//  · Mostra as RESSALVAS com o mesmo destaque dos achados. O modelo é instruído
//    a dizer onde os dados não sustentam conclusão, e esconder isso num rodapé
//    anularia o cuidado.
//  · Marca tema "isolado" como isolado. Um comentário em 300 não é tendência —
//    mas pode ser importante, e as duas coisas cabem na mesma frase.
//
// Gerar é ação de nível 4: roda Opus 5 sobre centenas de textos, custa e leva
// minutos. Todos leem a MESMA leitura — se cada abertura gerasse uma nova, cinco
// pessoas na reunião veriam cinco conclusões diferentes.
import { useCallback, useEffect, useState } from 'react';
import { censo } from '../../api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2, Sparkles, AlertTriangle, ThumbsUp, Eye, HelpCircle, Quote, RefreshCw,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';

type Tema = { tema: string; peso: string; mencoes: number; sintese: string; citacao: string };
type PorPergunta = { pergunta_id: string; pergunta_texto: string; respostas_lidas: number; temas: Tema[] };
type Conteudo = {
  por_pergunta: PorPergunta[];
  leitura_geral: { pedindo: string[]; funcionando: string[]; atencao: string[]; ressalvas: string[] } | null;
  truncadas?: { pergunta_id: string; lidas: number; total: number }[];
};
type Estado = {
  leitura: { id: string; respostas_na_base: number; respostas_lidas: number; modelo: string;
    conteudo: Conteudo; gerada_em: string } | null;
  respostas_na_base: number; desatualizada: boolean; novas_desde: number;
  pode_gerar?: boolean; ia_configurada?: boolean;
};

const PESO_COR: Record<string, string> = {
  maioria: 'bg-primary/15 text-primary',
  muitos: 'bg-primary/10 text-primary',
  alguns: 'bg-muted text-muted-foreground',
  poucos: 'bg-muted text-muted-foreground',
  isolado: 'bg-amber-500/15 text-amber-700 dark:text-amber-500',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function Lista({ icone: Icone, titulo, itens, tom }: {
  icone: typeof Eye; titulo: string; itens: string[]; tom: string;
}) {
  if (!itens?.length) return null;
  return (
    <div>
      <div className={`flex items-center gap-2 mb-2 ${tom}`}>
        <Icone className="size-4" />
        <h4 className="text-sm font-semibold">{titulo}</h4>
      </div>
      <ul className="space-y-1.5 pl-1">
        {itens.map((t, i) => (
          <li key={i} className="text-sm text-muted-foreground flex gap-2">
            <span className="text-muted-foreground/50 shrink-0">·</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AbaLeituraIA({ pesquisaId }: { pesquisaId: string | null }) {
  const [e, setE] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  const carregar = useCallback(async () => {
    if (!pesquisaId) return;
    setE(null); setErro(null);
    try { setE(await censo.ia.obter(pesquisaId)); }
    catch (er: unknown) { setErro(er instanceof Error ? er.message : 'Erro ao carregar'); }
  }, [pesquisaId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function gerar() {
    if (!pesquisaId) return;
    setGerando(true); setErro(null);
    try {
      const r = await censo.ia.gerar(pesquisaId);
      setE((atual) => ({ ...(atual || {} as Estado), ...r }));
    } catch (er: unknown) {
      setErro(er instanceof Error ? er.message : 'A leitura falhou');
    } finally { setGerando(false); }
  }

  if (!pesquisaId) {
    return <EmptyState icone={Sparkles} titulo="Escolha uma pesquisa"
      mensagem="Selecione a pesquisa acima para ler as respostas abertas." />;
  }
  if (!e && !erro) {
    return (
      <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const l = e?.leitura;
  const g = l?.conteudo?.leitura_geral;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {l ? (
            <p className="text-sm text-muted-foreground">
              Leitura de <span className="font-medium text-foreground">{fmt(l.gerada_em)}</span>
              {' · '}{l.respostas_lidas} respostas abertas lidas
              {' · '}<span className="font-mono text-[11px]">{l.modelo}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma leitura gerada ainda.
            </p>
          )}
        </div>
        {e?.pode_gerar && e?.ia_configurada !== false && (
          <Button onClick={gerar} disabled={gerando} variant={l ? 'outline' : 'default'} size="sm">
            {gerando ? <Loader2 className="size-4 mr-1.5 animate-spin" />
              : l ? <RefreshCw className="size-4 mr-1.5" /> : <Sparkles className="size-4 mr-1.5" />}
            {gerando ? 'Lendo as respostas…' : l ? 'Gerar leitura nova' : 'Gerar leitura'}
          </Button>
        )}
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {gerando && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Lendo as respostas abertas. Isso leva alguns minutos — o modelo lê cada texto antes de
            sintetizar, e não faz sentido apressar essa parte. Pode sair da aba: a leitura fica salva.
          </CardContent>
        </Card>
      )}

      {e?.ia_configurada === false && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm">
            A chave da Anthropic não está configurada no servidor, então a leitura não pode ser
            gerada. O resto do censo funciona normalmente — esta aba é análise, não coleta.
          </CardContent>
        </Card>
      )}

      {!l && !gerando && e?.ia_configurada !== false && (
        <EmptyState
          icone={Sparkles}
          titulo="As respostas abertas ainda não foram lidas"
          mensagem={e?.pode_gerar
            ? `Há ${e?.respostas_na_base || 0} resposta(s) concluída(s). A leitura sintetiza os campos de texto livre — o que as pessoas escreveram com as próprias palavras. O bloco sensível nunca entra nessa análise.`
            : 'Quando alguém com permissão de edição gerar a leitura, ela aparece aqui.'}
        />
      )}

      {/* Procedência antes de conclusão: se a base cresceu muito, a leitura não
          vale mais e dizer isso é mais útil que mostrá-la sem aviso. */}
      {l && e?.desatualizada && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm">
            <p className="font-medium mb-1">Esta leitura envelheceu.</p>
            <p className="text-muted-foreground">
              Chegaram {e.novas_desde} respostas desde que ela foi gerada
              ({l.respostas_na_base} → {e.respostas_na_base}). Vale gerar de novo antes de decidir
              qualquer coisa com base nela.
            </p>
          </CardContent>
        </Card>
      )}

      {g && (
        <Card>
          <CardContent className="p-5 space-y-5">
            <h3 className="text-sm font-semibold">Leitura geral</h3>
            <Lista icone={Eye} titulo="O que a comunidade está pedindo" itens={g.pedindo}
              tom="text-primary" />
            <Lista icone={ThumbsUp} titulo="O que já está funcionando" itens={g.funcionando}
              tom="text-emerald-600" />
            <Lista icone={AlertTriangle} titulo="O que merece atenção agora" itens={g.atencao}
              tom="text-amber-600" />
            {/* As ressalvas ficam aqui, com o mesmo peso visual dos achados. */}
            <Lista icone={HelpCircle} titulo="Onde os dados não sustentam conclusão"
              itens={g.ressalvas} tom="text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {(l?.conteudo?.truncadas?.length || 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          Em {l!.conteudo.truncadas!.length} pergunta(s) a leitura usou uma amostra em vez de todos
          os textos:{' '}
          {l!.conteudo.truncadas!.map((t) => `${t.pergunta_id} (${t.lidas} de ${t.total})`).join(', ')}.
        </p>
      )}

      {(l?.conteudo?.por_pergunta || []).map((p) => (
        <Card key={p.pergunta_id}>
          <CardContent className="p-4">
            <div className="flex items-start gap-2 mb-3 flex-wrap">
              <h3 className="text-sm font-medium flex-1 min-w-0">{p.pergunta_texto}</h3>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {p.respostas_lidas} textos
              </span>
            </div>
            <div className="space-y-3.5">
              {p.temas.map((t, i) => (
                <div key={i} className="border-l-2 border-border pl-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-medium">{t.tema}</span>
                    <Badge variant="secondary" className={PESO_COR[t.peso] || ''}>
                      {t.peso === 'isolado' ? 'menção isolada' : t.peso}
                      {' · '}{t.mencoes}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{t.sintese}</p>
                  {t.citacao && (
                    <p className="text-xs text-muted-foreground/80 italic mt-1.5 flex gap-1.5">
                      <Quote className="size-3 shrink-0 mt-0.5" />
                      <span>{t.citacao}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
