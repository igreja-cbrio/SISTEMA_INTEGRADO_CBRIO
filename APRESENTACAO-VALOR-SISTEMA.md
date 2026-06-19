# Briefing para apresentação · Valor de mercado do Sistema Integrado CBRio

> **Como usar este arquivo:** cole este conteúdo no Claude (modo design / artifacts)
> e peça: *"Crie uma apresentação executiva a partir deste briefing."* Os números
> já estão prontos; o conteúdo está organizado slide a slide.

---

## Brief de design (ler antes de gerar os slides)

- **Objetivo da apresentação:** mostrar à diretoria o valor de mercado do sistema
  que a CBRio já possui — quanto uma empresa cobraria para construir algo
  equivalente, do zero, sob medida, e implementar.
- **Público:** diretoria da igreja (não-técnico). Linguagem clara, foco em valor,
  nada de jargão de programação sem explicação.
- **Tom:** confiante, executivo e honesto (mostrar as ressalvas, não inflar).
- **Identidade visual:**
  - Cor primária: **`#00B39D`** (verde-azulado CBRio). Usar em títulos, destaques e gráficos.
  - Fundo claro, layout limpo, bastante respiro, tipografia moderna sem serifa.
  - Destacar números grandes (os valores em R$ são o herói de cada slide).
- **Formato:** ~9 a 10 slides, 16:9. Cada slide com 1 ideia central.
- **Gráficos sugeridos:** barra horizontal para as faixas de preço; tabela limpa
  para a composição de custos; "cards" de número grande para a escala.
- **Rodapé recomendado em todos os slides:** *"Estimativa de mercado · valores em
  R$ (Brasil, 2026) · não é cotação formal."*

---

## Slide 1 — Capa

**Título:** Quanto vale o Sistema Integrado CBRio
**Subtítulo:** Valor de mercado de um ERP + BI + IA construído sob medida
**Apoio:** Estimativa de quanto uma empresa cobraria para construir e implementar algo equivalente

---

## Slide 2 — O que é este sistema

**Mensagem central (frase de impacto):**
> Isto não é um "sistema de igreja". É um **ERP + BI sob medida com camada de
> Inteligência Artificial** — o tipo de plataforma que grandes organizações
> contratam software houses para construir.

**Pontos de apoio (bullets):**
- Centraliza a operação inteira: ministérios, finanças, RH, eventos, voluntários,
  membresia, logística e patrimônio.
- Mede a estratégia automaticamente: usar o módulo já alimenta os indicadores.
- Possui automações de IA que outras instituições ainda nem têm.

---

## Slide 3 — A escala do que foi construído

**Título:** Não é um app — é uma plataforma

**Cards de número grande (destaque):**
- **~250.000** linhas de código
- **1.229** arquivos
- **~30** módulos funcionais
- **~150** indicadores (KPIs) com cálculo automático

**Detalhe (tabela ou barras menores):**
| Camada | Tamanho |
|---|---|
| Backend (servidor + serviços) | ~70.000 linhas |
| Frontend (telas / experiência) | ~126.200 linhas |
| Banco de dados (estrutura + segurança) | ~53.600 linhas |

**Nota de rodapé do slide:** medição real do código-fonte do sistema.

---

## Slide 4 — Os subsistemas de alto valor

**Título:** Cada um destes é, sozinho, um projeto inteiro

**Grid de 6 cards (ícone + título + 1 linha):**
1. **Motor de BI estratégico** — OKR/NSM + matriz de ~150 KPIs com cascata
   automática e mandalas por área.
2. **Segurança e LGPD** — 541 regras de acesso, trilha de auditoria e exclusão
   reversível de dados sensíveis.
3. **Bot de WhatsApp com IA** — líderes reportam números e o sistema interpreta
   texto, áudio e formulários.
4. **2 agentes de IA** — executor financeiro (propõe lançamentos) e "Cérebro"
   (organiza documentos automaticamente).
5. **App mobile de membros** — devocional, grupos, check-in kids, inscrições,
   avisos e notificações.
6. **Integrações reais** — banco (OFX/PIX), YouTube, Microsoft/SharePoint,
   leitura de notas fiscais.

---

## Slide 5 — Quanto custaria construir do zero

**Título:** O que o mercado cobraria

**Mensagem:** ninguém precifica por linha de código — precifica por **time × tempo
+ margem**. Um sistema desse escopo levaria **18 a 30 meses** com um time completo
(líder técnico + 2-3 desenvolvedores + design + gestão/qualidade).

**Gráfico de barras horizontais (faixas):**
| Perfil da empresa | Faixa (construção + implantação) |
|---|---|
| Profissional autônomo / shop pequeno | **R$ 800 mil – R$ 1,5 mi** |
| Software house mid-market (recomendado) | **R$ 1,5 mi – R$ 3,5 mi** |
| Consultoria premium / grande empresa | **R$ 4 mi – R$ 8 mi+** |

**Destaque grande:** Faixa realista para entrega completa e bem-feita:
**R$ 1,5 milhão a R$ 3,5 milhões.**

---

## Slide 6 — Conferência por dois caminhos

**Título:** Os números batem por onde quer que se calcule

**Dois blocos lado a lado:**

**Caminho A — por time e tempo**
Time completo × ~24 meses × custo de squad de software house
→ **~R$ 2,4 milhões** (centro da faixa).

**Caminho B — por módulo**
~30 módulos × ~R$ 70 mil/módulo em média
(painéis simples são baratos; financeiro, BI, WhatsApp, agentes de IA e app são
mini-projetos caros)
→ **~R$ 2,1 milhões.**

**Conclusão do slide:** dois métodos independentes chegam na mesma casa — em torno
de **R$ 2 milhões** como ponto central.

---

## Slide 7 — Composição de uma proposta real

**Título:** Como uma empresa montaria o orçamento

**Tabela:**
| Item | Peso / valor |
|---|---|
| Construção (engenharia) | ~70-75% do total |
| Implantação (migração de dados, treinamento, go-live) | +15% a 30% → R$ 250 mil – R$ 800 mil |
| Sustentação e evolução (mensal, depois de no ar) | R$ 15 mil – R$ 50 mil/mês |
| Infraestrutura (servidores + APIs de IA) | R$ 2 mil – R$ 8 mil/mês |

**Nota:** a infraestrutura é barata; o caro é a engenharia e o conhecimento de
negócio embutido no sistema.

---

## Slide 8 — Três leituras honestas do valor

**Título:** Para a diretoria entender o número com clareza

**Três cards:**
1. **Valor de reposição** — quanto custaria pagar uma empresa para refazer
   equivalente hoje: **R$ 1,5 a 3,5 milhões.**
2. **Custo real de construção (aqui)** — foi muito menor, porque foi construído
   com IA assistida. Essa é justamente a vantagem competitiva.
3. **Valor de ativo (potencial)** — se virar um produto vendido a outras igrejas
   (SaaS), passa a valer por receita recorrente, podendo superar o custo de
   construção.

---

## Slide 9 — Conclusão

**Título:** O que a CBRio tem nas mãos

**Mensagem central (número herói):**
> Um ativo de tecnologia avaliado, a preço de mercado, em
> **R$ 1,5 a R$ 3,5 milhões** — construído por uma fração disso.

**Bullets de fechamento:**
- Plataforma proprietária, sob medida, sem mensalidade de licença por usuário.
- Cresce com a igreja; cada módulo novo agrega valor ao ativo.
- Vantagem rara: poucas organizações do porte têm algo assim, e menos ainda com IA.

**Rodapé:** *Estimativa de mercado (Brasil, 2026). Não constitui cotação ou
avaliação contábil formal.*

---

## Slide 10 (opcional) — E se virar produto?

**Título:** Próxima fronteira: de sistema interno a produto

**Mensagem:** o mesmo sistema, adaptado para multi-igreja, vira um SaaS vendável.
Aí o valor deixa de ser "custo de construção" e passa a ser "quanto de receita
recorrente ele gera" — outra ordem de grandeza.

**Bullet único:** decisão estratégica futura — não precisa ser agora, mas o ativo
já está pronto para esse caminho.

---

### Anexo · dados de origem (não precisa virar slide)

- Medição feita sobre o código-fonte real do repositório do sistema.
- Faixas de preço baseadas em práticas de mercado de software houses brasileiras
  (squad mensal, fixed-bid e preço por módulo), 2026.
- Todos os valores são estimativas de faixa, não cotações formais.
