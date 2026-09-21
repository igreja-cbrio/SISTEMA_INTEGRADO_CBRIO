// Quem o censo revela que PODE ser convidado — as listas acionáveis.
//
// Pedido do Matheus (21/09/2026): *"queria analises potenciais... quantas
// criancas temos potencial de convidar para ir pro kids... tem pessoas que sao
// convertidas mas que nao sao batizadas, e aí queria uma lista dessas pessoas
// para que [a coordenadora] entre em contato com cada uma."*
//
// ⚠️⚠️ DOIS NÍVEIS NA MESMA ABA, e isso saiu de medição. 34 cargos têm censo
// nível >= 2 — entre eles "Membro" e "Voluntário". Então quem é nível 2 vê os
// NÚMEROS (`/potencial/resumo`) e quem é nível 4 vê a LISTA com nome e telefone
// (`/potencial`). A tela não esconde que existe mais: ela DIZ que a lista exige
// nível maior, senão quem tem acesso parcial acha que o recurso está quebrado.
//
// ⚠️ A unidade é FAMÍLIA, nunca criança: o censo pergunta faixas, não filhos.
// A ressalva fica colada no número, não em tooltip — número sem ressalva vira
// slide de reunião, e aí "161" já virou "161 crianças".
import { useCallback, useEffect, useMemo, useState } from 'react';
import { censo } from '../../api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2, Target, Download, MessageCircle, AlertTriangle, Search, Lock, Baby, Users, Droplets,
  HeartHandshake, Check, GraduationCap, HandHeart,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import { hrefWhatsapp } from '@/lib/conversas';
import { exportCSV } from '@/lib/export';
import { contemNormalizado } from '@/lib/busca';
import { toast } from 'sonner';

type Pessoa = {
  resposta_id: string; membro_id: string | null;
  nome: string | null; telefone: string | null; email: string | null;
  whatsapp: 'autorizou' | 'recusou' | 'nao_perguntado';
  filhos_quantos: number | null; faixas: string[]; consta_formado_next?: boolean;
};
type Dados = {
  kids_nao?: Pessoa[]; kids_parcial?: Pessoa[]; ami?: Pessoa[]; bridge?: Pessoa[]; convertidos?: Pessoa[];
  nao_fez_next?: Pessoa[]; nao_serve?: Pessoa[];
  totais: Record<string, number>; familias_distintas: number;
  base: number; esperado: number; truncado: boolean; pode_exportar?: boolean;
};

const SECOES = [
  {
    id: 'kids_nao', titulo: 'Potencial Kids', icone: Baby,
    sub: 'Tem filho de 6 meses a 12 anos e respondeu que NÃO frequenta o CBKids.',
  },
  {
    id: 'kids_parcial', titulo: 'Kids · frequenta em parte', icone: Baby,
    // ⚠️ Seção SEPARADA de propósito (decisão do Matheus): "Parcialmente" é
    // família que já está no Kids com algum filho. Ligar para ela com o mesmo
    // texto de quem nunca foi queima a credibilidade de quem liga.
    sub: 'Já leva algum filho ao CBKids, mas não todos. A conversa aqui é outra.',
  },
  {
    id: 'bridge', titulo: 'Potencial Bridge', icone: Users,
    sub: 'Tem filho de 13 a 17 anos.',
    // ⚠️ A ressalva é da FONTE, não da tela: o censo pergunta se os filhos
    // frequentam o CBKids e NÃO pergunta de AMI nem de Bridge. Declarar isso é
    // o que impede a lista ser lida como "estes não frequentam".
    ressalva: 'O censo não pergunta se eles já frequentam o Bridge — esta lista inclui quem já está lá.',
  },
  {
    id: 'ami', titulo: 'Potencial AMI', icone: Users,
    sub: 'Tem filho de 18 a 25 anos.',
    ressalva: 'O censo não pergunta se eles já frequentam o AMI — esta lista inclui quem já está lá.',
  },
  {
    id: 'convertidos', titulo: 'Convertidos não batizados', icone: Droplets,
    sub: 'Entregou a vida a Jesus e respondeu que ainda não foi batizado.',
    ressalva: 'É o que a pessoa declarou no censo. Quem foi batizado em outra igreja pode aparecer aqui.',
  },
  {
    id: 'nao_fez_next', titulo: 'Ainda não fizeram o Next', icone: GraduationCap,
    sub: 'Respondeu que ainda não fez o Next.',
    // ⚠️ A ressalva carrega o número REAL da discordância, não uma vaga. 22
    // pessoas desta lista constam como formadas no sistema, e elas aparecem
    // marcadas linha a linha.
    ressalva: 'É o que a pessoa declarou. Quem o sistema registra como formado aparece marcado — confira antes de ligar.',
  },
  {
    id: 'nao_serve', titulo: 'Ainda não servem', icone: HandHeart,
    sub: 'Respondeu que ainda não serve na CBRio.',
    ressalva: 'É o que a pessoa declarou no censo, não o que a escala registra.',
  },
] as const;

const WPP_ROTULO: Record<Pessoa['whatsapp'], string> = {
  autorizou: 'Autorizou WhatsApp',
  recusou: 'Pediu para não receber WhatsApp',
  nao_perguntado: 'Respondeu antes de a pergunta existir',
};

export default function AbaPotencial({ pesquisaId, nivel }: { pesquisaId: string | null; nivel: number }) {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>('kids_nao');
  // ⚠️ Marca só o que ESTA sessão encaminhou. O servidor é quem sabe de verdade
  // (e responde `ja_estava` quando alguém já mandou), mas recarregar a lista
  // inteira a cada clique tiraria a pessoa do lugar onde ela estava lendo.
  const [naFila, setNaFila] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState<string | null>(null);

  // ⚠️ Nível 4 pede a lista; nível 2 pede só o resumo. Pedir a lista sem ter
  // nível levaria 403 e a tela mostraria erro vermelho para uma pessoa que está
  // usando o sistema corretamente.
  const nominal = nivel >= 4;

  const carregar = useCallback(async () => {
    if (!pesquisaId) return;
    setCarregando(true); setErro(null);
    try {
      setD(await (nominal ? censo.potencial(pesquisaId) : censo.potencialResumo(pesquisaId)));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar');
    } finally { setCarregando(false); }
  }, [pesquisaId, nominal]);
  useEffect(() => { carregar(); }, [carregar]);

  const filtrar = useMemo(() => (lista: Pessoa[]) => (
    busca.trim()
      ? lista.filter((p) => contemNormalizado(p.nome || '', busca) || contemNormalizado(p.telefone || '', busca))
      : lista
  ), [busca]);

  function baixar(secaoId: string, titulo: string, lista: Pessoa[]) {
    // ⚠️ O CSV NÃO leva a coluna de convicção religiosa. Nome, telefone e o
    // motivo da lista bastam para o trabalho; repetir "entregou a vida: Sim /
    // batizado: Não" em texto plano num arquivo que vai parar no WhatsApp de
    // alguém é a pior linha possível para vazar, e não acrescenta nada.
    exportCSV(
      ['Nome', 'Telefone', 'E-mail', 'Filhos', 'Faixas', 'WhatsApp'],
      lista.map((p) => [
        p.nome || '', p.telefone || '', p.email || '',
        p.filhos_quantos ?? '', (p.faixas || []).join(' · '), WPP_ROTULO[p.whatsapp],
      ]),
      `censo_${secaoId}`,
    );
    toast.success(`${lista.length} linha(s) · ${titulo}`);
  }

  async function mandarParaCuidado(p: Pessoa, motivo: string) {
    setEnviando(p.resposta_id);
    try {
      const r = await censo.potencialParaCuidado(p.resposta_id, 'conversa', motivo);
      setNaFila((m) => ({ ...m, [p.resposta_id]: true }));
      // ⚠️ `ja_estava` NÃO é erro: é alguém (ou você mesmo) já ter encaminhado.
      // Mostrar vermelho aqui faria a pessoa tentar de novo e achar que quebrou.
      toast.success(r?.ja_estava ? `${p.nome || 'Pessoa'} já estava na fila` : `${p.nome || 'Pessoa'} foi para a fila de cuidado`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível encaminhar');
    } finally { setEnviando(null); }
  }

  if (!pesquisaId) {
    return <EmptyState icone={Target} titulo="Escolha uma pesquisa"
      mensagem="Selecione a pesquisa acima para ver as listas de potencial." />;
  }
  if (carregando) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
      <Loader2 className="size-4 animate-spin" /> Lendo as respostas…
    </div>;
  }
  if (erro || !d) {
    return <EmptyState icone={AlertTriangle} titulo="Não foi possível carregar"
      mensagem={erro || 'Tente de novo.'} />;
  }

  return (
    <div className="space-y-5">
      {/* ⚠️ O truncamento é DECLARADO. `fetchAllRows` degrada devolvendo o que
          acumulou, e sem este aviso a lista viria menor sem ninguém perceber —
          foi assim que a aba Perfil serviu 12 de 40 perguntas em silêncio. */}
      {d.truncado && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
          <span>
            <strong>Lista incompleta.</strong> Chegaram {d.base} de {d.esperado} respostas —
            não use estes números para decidir nada até recarregar.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{d.familias_distintas}</strong> famílias no total,
            sobre {d.base} respostas concluídas.
          </p>
          {/* ⚠️ As duas ressalvas que impedem o número de virar outra coisa. */}
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            São <strong>famílias a contatar</strong>, não crianças — o censo pergunta faixas de
            idade, não quantos filhos há em cada uma. A mesma família pode estar em mais de uma
            lista, por isso o total é menor que a soma. E a pesquisa <strong>continua aberta</strong>:
            estes números mudam a cada domingo.
          </p>
        </div>
        {nominal && !d.pode_exportar && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Lock className="size-3" /> exportar exige permissão
          </Badge>
        )}
      </div>

      {!nominal && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <Lock className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
          <span>
            Você vê os números. <strong>A lista com nome e telefone exige nível 4</strong> no
            censo — ela carrega dado pessoal sensível, então o acesso é mais estreito que o
            resto do módulo.
          </span>
        </div>
      )}

      {nominal && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por nome ou telefone…"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      )}

      {SECOES.map((s) => {
        const total = d.totais?.[s.id] ?? 0;
        const lista = filtrar((d as unknown as Record<string, Pessoa[]>)[s.id] || []);
        const Icone = s.icone;
        const abertaAgora = aberta === s.id;
        return (
          <Card key={s.id}>
            <CardContent className="p-4 space-y-3">
              <button type="button" className="w-full text-left"
                onClick={() => setAberta(abertaAgora ? null : s.id)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icone className="size-4 text-primary shrink-0" />
                    <span className="font-medium">{s.titulo}</span>
                  </div>
                  <Badge variant="secondary" className="tabular-nums">{total} famílias</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                {'ressalva' in s && s.ressalva && (
                  <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">⚠️ {s.ressalva}</p>
                )}
              </button>

              {nominal && abertaAgora && (
                <>
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" disabled={!d.pode_exportar || !lista.length}
                      onClick={() => baixar(s.id, s.titulo, lista)}>
                      <Download className="size-4 mr-1.5" /> Baixar CSV
                    </Button>
                  </div>
                  <div className="divide-y rounded-md border">
                    {lista.length === 0 && (
                      <p className="p-3 text-sm text-muted-foreground">
                        {busca ? 'Ninguém com esse nome nesta lista.' : 'Ninguém nesta lista.'}
                      </p>
                    )}
                    {lista.map((p) => {
                      // ⚠️⚠️ Quem escreveu "Não autorizo" NÃO ganha botão de
                      // WhatsApp — a recusa foi no MESMO formulário, oito dias
                      // atrás. Respeitar o opt-in só quando é caro (disparo) e
                      // ignorar quando é barato (link) destrói a confiança no
                      // opt-in inteiro. A pessoa CONTINUA na lista, com o
                      // telefone à vista: recusa de canal não é pessoa proibida
                      // de ser cuidada.
                      const href = p.whatsapp === 'recusou' ? null : hrefWhatsapp(p.telefone);
                      return (
                        <div key={p.resposta_id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{p.nome || 'Sem nome'}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.telefone || 'sem telefone'}
                              {p.filhos_quantos ? ` · ${p.filhos_quantos} filho(s)` : ''}
                              {p.faixas?.length ? ` · ${p.faixas.join(', ')}` : ''}
                            </p>
                          </div>
                          {p.consta_formado_next && (
                            <Badge variant="outline" className="text-xs text-amber-700 dark:text-amber-500">
                              consta como formado no Next
                            </Badge>
                          )}
                          {p.whatsapp === 'recusou' && (
                            <Badge variant="outline" className="text-xs">
                              pediu para não receber WhatsApp — ligue
                            </Badge>
                          )}
                          {p.whatsapp === 'nao_perguntado' && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              não foi perguntado
                            </Badge>
                          )}
                          {href && (
                            <Button asChild size="sm" variant="outline">
                              <a href={href} target="_blank" rel="noreferrer">
                                <MessageCircle className="size-4 mr-1.5" /> WhatsApp
                              </a>
                            </Button>
                          )}
                          {/* ⚠️ Vai para `cen_cuidado`, a fila DO CENSO — não
                              para a fila de batismo, que exige FK em
                              `cui_convertidos` (só 18 dos 178 existem lá) e
                              cujos KPIs contam por data de culto. */}
                          <Button size="sm" variant="ghost"
                            disabled={enviando === p.resposta_id || naFila[p.resposta_id]}
                            onClick={() => mandarParaCuidado(p, `Veio da lista "${s.titulo}" do censo.`)}>
                            {enviando === p.resposta_id
                              ? <Loader2 className="size-4 mr-1.5 animate-spin" />
                              : naFila[p.resposta_id]
                                ? <Check className="size-4 mr-1.5" />
                                : <HeartHandshake className="size-4 mr-1.5" />}
                            {naFila[p.resposta_id] ? 'na fila' : 'Cuidado'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
