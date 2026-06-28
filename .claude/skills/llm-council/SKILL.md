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
"qual o slug do módulo X", consultar uma linha de config. Acionar o conselho em
tudo multiplica custo/latência por ~5-7× e o hábito é abandonado.

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
"frescos", sem o `CLAUDE.md` nem o estado dos módulos. Em pergunta sobre o
código, instrua-os a **ler o `CLAUDE.md` e pesquisar o repositório** antes de
opinar (eles têm ferramentas de leitura); senão dão conselho genérico,
desalinhado das leis do projeto (RLS, acentuação, cap de 1000 do PostgREST etc.).

Prompt para cada conselheiro (preencha `{lente}` e `{pergunta}`):

> Você é um conselheiro com a lente: **{lente}**. Responda de forma independente
> e honesta, do seu ponto de vista. Seja específico, aponte riscos, seja direto,
> não tente agradar. Se for sobre o código deste projeto, leia o `CLAUDE.md` e
> pesquise o repo antes. Pergunta:
>
> {pergunta}

Colete as respostas como `resposta_A`, `resposta_B`, `resposta_C`, `resposta_D`.

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
