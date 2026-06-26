# Product

## Register

product

## Users

A equipe interna da **CBRio** (igreja de grande porte, Rio de Janeiro) — ninguém de fora usa o sistema.

- **Diretoria / estratégia** (Marcos, Matheus, Eduardo, conselho): leem a NSM, as mandalas por valor e a matriz 6 áreas × 5 valores; conduzem o ritual mensal de OKR.
- **Líderes de área / ministério** (Lorena · Integração, Mariane · Kids, Pr. Nélio · Grupos, Marcelo · Cuidados/Jornada, Renata · Online, Arthur/Lillian · AMI/Bridge): operam o dia a dia do seu ministério e lançam dado bruto.
- **Operação administrativa** (Yago · financeiro, Amaury/Pery · logística/compras, Pedro · marketing, RH): tocam solicitações, aprovações, DRE, escalas.
- **Assistentes e voluntários**: acessos pontuais (totem Kids, check-in, dados da própria área).

**Contexto de uso:** majoritariamente **desktop**, durante a semana e nos dias de culto, em sessões de trabalho real (não navegação casual). O totem Kids e alguns check-ins são touch/tablet. A pessoa está **no meio de uma tarefa** — registrar um culto, aprovar uma despesa, contatar um convertido, conferir um vínculo — e quer terminar rápido e com confiança.

**Job to be done:** rodar a operação da igreja num lugar só e fazer com que **a operação vire inteligência estratégica sozinha** — sem planilha, sem digitar duas vezes, sem relatório manual.

## Product Purpose

O **sistema operacional da CBRio**: um ERP ministerial onde cada módulo (integração, cuidados, grupos, voluntariado, kids, membresia, financeiro, RH, logística, marketing) **alimenta automaticamente a NSM e os ~150 KPIs** da matriz Valor × Área. Substitui planilhas, o Planning Center e relatórios manuais.

A tese é **"usar é medir"**: o dado nasce na operação do dia a dia e sobe pra diretoria em tempo real. O sucesso é a equipe **cuidar de gente, não de planilha** — e o número estratégico estar sempre vivo e honesto.

## Brand Personality

**Moderno, técnico, eficiente.** Parece um produto de software atual e bem feito (referência de qualidade: Linear, Vercel, Stripe, Raycast), não um sistema interno improvisado. Voz: clara, direta, em **português do Brasil correto** (acentuação impecável é regra do projeto). Confiança de quem domina o ofício, com um fundo de **cuidado** — é uma ferramenta de igreja, séria mas não fria. Sensação alvo: "isso é rápido, sólido e faz o trabalho pesado por mim".

## Anti-references

- **Planilha/Excel sem vida** — tabelão cru, tudo com o mesmo peso, sem hierarquia nem respiro.
- **Corporativo‑frio tipo SAP** — denso demais, datado, intimidador, cheio de ruído.
- **Startup genérica** — template de dashboard sem identidade, "mais um SaaS".
- **Infantil/colorido demais** — excesso de cores, emojis e enfeite. (**Exceção intencional: o módulo Kids**, que tem um fundo gradiente lúdico próprio — esse charme é exclusivo do Kids e não vaza pros outros módulos.)

## Design Principles

- **Usar é medir.** A interface tem que tornar o registro da operação tão fácil que medir KPI vira efeito colateral. Nada de tela só pra "preencher indicador".
- **Densidade a serviço da clareza.** Muito dado é esperado — mas com hierarquia tipográfica forte, espaçamento com ritmo e o olho sabendo pra onde ir. (A "regra de ouro" do tema: dado denso fica nítido, não envidraçado.)
- **Revisão antes de aplicar.** As automações/IA (bot, agente financeiro, convites) **propõem** — o humano decide. A UI sempre deixa claro o que é sugestão e o que já é fato.
- **Consistência entre módulos.** Um padrão de header, cards, abas e estados — a mesma língua visual em todo lugar. O nível do hub do Kids é a referência a alcançar.
- **Honestidade do número.** Mostrar 0 quando é 0, vazio quando é vazio, atrasado em vermelho. A interface nunca maquia o estado real da operação.

## Accessibility & Inclusion

- **Contraste WCAG AA**: corpo de texto ≥ 4.5:1, texto grande ≥ 3:1, placeholders no mesmo nível do corpo. Foco visível em todos os controles. (Evitar cinza claro "pra elegância" sobre fundo claro — principal causa de texto difícil de ler.)
- **Não depender só de cor**: status (atrasado/no prazo/feito, faltando, pendente) sempre com **ícone e/ou label** além da cor — para daltonismo e leitura rápida.
- **Movimento**: respeitar `prefers-reduced-motion` (o tema vidro já tem tokens pra isso); animação é tempero, nunca obstáculo.
- Sem meta formal além de AA — o norte é legibilidade e clareza em sessões longas de trabalho.
