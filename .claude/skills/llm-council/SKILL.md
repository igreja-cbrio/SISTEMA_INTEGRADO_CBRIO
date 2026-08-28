---
name: llm-council
description: >-
  Conselho deliberativo antes da resposta final: passa a pergunta por
  conselheiros (subagentes com lentes distintas), faz revisão por pares
  anonimizada e sintetiza. Use em decisões, análises, planos, arquitetura,
  trade-offs, escolhas de schema/segurança — ou quando o usuário pedir "passa
  pelos conselheiros / pelo conselho / council". Inspirado no projeto llm-council
  do Andrej Karpathy (adaptado de web app multi-modelo para subagentes do
  Claude Code).
---

# LLM Council — conselho deliberativo antes da resposta

Reproduz o fluxo do projeto `karpathy/llm-council` dentro do Claude Code: em vez
de responder direto, a pergunta passa por um **conselho** de conselheiros, há
**revisão por pares** e uma **síntese final**. Adaptação: os "modelos" do app
original viram **subagentes** (via a ferramenta Agent/Task), cada um com uma
lente distinta — sem precisar de OpenRouter nem chave paga.

## Honestidade sobre o que isto é (leia antes)

O valor do `llm-council` original vem da **diversidade de modelos** (GPT, Gemini,
Claude erram em pontos diferentes — a discordância é sinal). Aqui os
conselheiros são o **mesmo modelo base** com personas diferentes, então os erros
são **correlacionados**: se o Claude alucina algo, todas as lentes tendem a
alucinar junto. Portanto:

- Isto é **brainstorm estruturado / cobertura de raciocínio**, **não** um oráculo
  nem prova de verdade. Consenso entre conselheiros **não é evidência**.
- É ótimo para **decisões, design e trade-offs**; é fraco para **verificar
  fatos** (para fatos, valide contra o código/banco/fontes, não contra o
  "consenso").
- Para diversidade de modelos de verdade, veja "Upgrade opcional" no fim.

## Quando acionar (e quando NÃO)

**Acione** em: decisões, análises, planos, arquitetura, revisão de ideia,
trade-offs irreversíveis, escolhas de schema/segurança/RLS, recomendações — ou
sempre que o usuário pedir explicitamente o conselho.

**Pule** (responda direto, dizendo numa linha que pulou por ser trivial): tarefas
mecânicas e fatos únicos verificáveis — rodar um comando, renomear arquivo,
"qual o slug do módulo X", consultar uma linha de config.

⚠️ **O custo é real e vale saber a ordem de grandeza** (modelo, não fatura — não
há telemetria de tokens por convocação). Com 4 conselheiros em Opus 5
($5 entrada / $25 saída por 1M) e o contexto RECORTADO como manda a seção
seguinte, uma convocação fica na casa de **R$ 3 a 8**; com cada conselheiro
lendo o `CLAUDE.md` inteiro, sobe para **~R$ 24**. A operação inteira do sistema
(Supabase, Vercel, WhatsApp, domínio) custa **R$ 629/mês** — então o conselho
acionado em tudo, sem recorte, passa o custo do sistema em poucos dias. Daí a
regra de pular o trivial não ser etiqueta: é o que mantém o hábito vivo.

> O usuário pode pedir o modo **"sempre"** (conselho antes de toda resposta não
> trivial). Respeite, mas mantenha a regra de pular o trivial — senão vira
> fricção. Veja "Deixar sempre ligado".

## O fluxo (3 estágios)

### Estágio 1 — Respostas independentes (fan-out)

Dispare os conselheiros **em paralelo** (várias chamadas Agent numa única
mensagem). Padrão: **3-4** conselheiros com lentes **ortogonais** (suba a 5-6 só
em decisão de alto risco; caia a 2-3 em algo leve). Lentes sugeridas:

1. **Rigor técnico / cético** — caça erros, riscos, casos extremos, premissas
   frágeis. Pessimista construtivo.
2. **Pragmático / execução** — o que de fato fazer, com trade-offs e o caminho
   mais curto pro resultado.
3. **Primeiros princípios / visão ampla** — questiona o enquadramento e propõe
   alternativas que ninguém pediu.
4. **Especialista no contexto** — conhece o domínio/código do projeto.

**Sempre passe o contexto do repo aos conselheiros** — subagentes começam
"frescos", sem o `CLAUDE.md` nem o estado dos módulos. Sem contexto, dão conselho
genérico, desalinhado das leis do projeto (RLS, acentuação, cap de 1000 do
PostgREST etc.).

### ⚠️⚠️ Como passar contexto SEM mandar cada conselheiro ler o CLAUDE.md inteiro

**O `CLAUDE.md` deste repositório tem ~159 mil tokens** (medido em 12/08/2026:
636.311 bytes · 9.754 linhas). Mandar 4 conselheiros lerem o arquivo inteiro
custa ~800 mil tokens de entrada **por convocação** — mais caro que tudo que a
igreja paga de operação num mês. E é desperdício: nenhuma pergunta precisa das
9.754 linhas.

**A régua: o presidente RECORTA o contexto; o conselheiro CONSULTA sob demanda.**

1. **O presidente (você) já leu o `CLAUDE.md`** — ele está no seu system prompt.
   Antes do fan-out, **cole no prompt do conselheiro os 2-5 trechos que importam**
   (as leis e decisões que tocam a pergunta), com o título da seção. Isso troca
   159 mil tokens por ~3 mil, e entrega **exatamente** o que ele precisaria achar.
2. **Para "quem depende de quem", o conselheiro usa o GRAFO, não o grep.** O
   `graphify` já está instalado (`graphify-out/` construído · ver a seção do
   `CLAUDE.md`): `graphify affected "<função>"` responde em 1 comando o que um
   grep + leitura de 19 arquivos responderia em dezenas de milhares de tokens.
3. **Ler o `CLAUDE.md` inteiro é a EXCEÇÃO**, não o padrão — só quando a pergunta
   é sobre a arquitetura do sistema como um todo, e aí **um** conselheiro lê (o
   "especialista no contexto"), não os quatro.

Prompt para cada conselheiro (preencha `{lente}`, `{trechos}` e `{pergunta}`):

> Você é um conselheiro com a lente: **{lente}**. Responda de forma independente
> e honesta, do seu ponto de vista. Seja específico, aponte riscos, seja direto,
> não tente agradar.
>
> **Contexto do projeto** (leis e decisões já vigentes que tocam esta pergunta —
> trate como verdade estabelecida, não re-derive):
>
> {trechos}
>
> Se precisar de MAIS contexto do código: use `graphify affected "<símbolo>"` /
> `graphify explain <id>` para dependências, e leia **arquivos específicos**. NÃO
> leia o `CLAUDE.md` inteiro (são ~159 mil tokens) — se sentir falta de alguma
> lei, diga qual na resposta e o presidente completa.
>
> Pergunta:
>
> {pergunta}

Colete as respostas como `resposta_A`, `resposta_B`, `resposta_C`, `resposta_D`.

⚠️ **Se um conselheiro disser que faltou contexto, isso é sinal ÚTIL** — significa
que o recorte do presidente errou. Complete o trecho e, se a lacuna for
recorrente, é indício de que aquela seção do `CLAUDE.md` merece estar no recorte
padrão daquele tipo de pergunta.

### Estágio 2 — Revisão por pares (anonimizada) — *opcional em decisões médias*

Em decisões de alto risco, dispare uma nova rodada: cada subagente recebe
**todas** as respostas do Estágio 1 **anonimizadas** (A/B/C/D, sem revelar a
lente) e deve ranquear por **precisão** e **insight**, justificar em 1-2 linhas e
apontar o que cada uma erra ou ignora. Anonimizar reduz viés (igual ao original).

Em decisões **médias**, pule este estágio: fan-out + síntese já captura a maior
parte do ganho a um terço do custo. Reserve os 3 estágios para o que é caro de
errar.

### Estágio 3 — Síntese do presidente (chairman)

Você (agente principal) recebe as respostas do Estágio 1 + rankings (se houve
Estágio 2) e produz a **resposta final única**:

- Combina o melhor de cada lente; resolve discordâncias **explicitamente**.
- **Não suavize o conselheiro cético** — o sinal mais útil costuma ser o aviso
  de risco. Se o presidente medeia tudo para agradar, o conselho perde a graça.
- Quando há divergência relevante, **diga ao usuário que houve e como você
  decidiu** — não esconda o desacordo.

## Formato da resposta ao usuário

Entregue a **resposta final sintetizada** primeiro e em destaque. Depois, um
bloco curto **"Bastidores do conselho"**:

- 1 linha por conselheiro (a posição de cada lente).
- Ranking resumido (se houve Estágio 2).
- Divergências relevantes e como o presidente decidiu.

Sintetize — não despeje as respostas brutas inteiras. O conselho serve para uma
resposta **melhor**, não mais longa.

## Deixar "sempre ligado"

⚠️ Uma skill **não dispara sozinha em toda resposta** — ela é invocada por
`/llm-council`, citada na conversa, ou auto-selecionada quando a `description`
casa com o pedido. Para o comportamento **"sempre antes de responder"**, o
mecanismo confiável é uma **instrução no `CLAUDE.md` do projeto**, por exemplo:

> Antes de responder qualquer pergunta deliberada (decisão, análise, plano,
> recomendação), acione a skill `llm-council`. Pule apenas tarefas triviais e
> mecânicas.

(Não há hook de "pré-resposta" que rode subagentes automaticamente; o
`UserPromptSubmit` injeta texto, não orquestra agentes. Por isso a instrução no
`CLAUDE.md` é o caminho.)

## Upgrade opcional — diversidade de modelos de verdade

Para recuperar o valor original (modelos com erros descorrelacionados), os
conselheiros podem rotear para modelos diferentes via API (OpenRouter:
Gemini, GPT, Grok + Claude). Isso exige **chave/credencial e env nova** — neste
repositório (ERP da CBRio), isso cai na regra de "parar e perguntar antes de
integração paga / env obrigatória nova". Só faça com aval explícito.

## Origem e atribuição

Inspirado em **`karpathy/llm-council`** (Andrej Karpathy) — web app local
(FastAPI + React) que consulta vários LLMs via OpenRouter, faz revisão por pares
e síntese do chairman. Esta skill é uma **adaptação para Claude Code**: o
conselho multi-modelo vira um conselho de subagentes do Claude com lentes
distintas, sem dependência de OpenRouter/chave paga.
https://github.com/karpathy/llm-council
