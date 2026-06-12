# Checklist — Proteção de IP e Preparação Whitelabel

> Roteiro operacional dos próximos 90 dias. Marca itens conforme conclui.

---

## Fase 1 — Decisões internas (semana 1-2, sem custo)

- [ ] **Reunião dos 2 co-titulares** para alinhar:
  - [ ] Confirmar 50/50 de participação
  - [ ] Confirmar que venda exige consenso dos dois
  - [ ] Direito de preferência mútuo em saída
  - [ ] Cláusula buy-out em caso de morte/sucessão (valor base: ex. múltiplo de MRR)
  - [ ] Decidir se vão criar PJ ou ficar PF mesmo (recomendação: PJ se for whitelabel)
  - [ ] Definir % de divisão de **receita futura** (igual à participação? ou outro?)
  - [ ] Definir como ficam contas/cartões/contratos no nome de quem

- [ ] **Decisão sobre Igreja CBRio**:
  - [ ] Igreja CBRio será cliente da PJ (licença paga? gratuita? simbólica?)
  - [ ] Há expectativa da diretoria da igreja de "ser dona"? (alinhar antes que vire conflito)
  - [ ] Documentar isso por escrito antes de seguir

- [ ] **Brainstorm e escolha do nome-produto**
  - [ ] Ler `02-brainstorm-nomes.md`
  - [ ] Eleger 3 finalistas
  - [ ] Validar com 5-10 líderes de outras igrejas (resposta visceral)
  - [ ] Decidir o vencedor

## Fase 2 — Pesquisas e validações (semana 2-3, custo ~R$ 0-300)

- [ ] **Anterioridade INPI** (do nome-produto escolhido):
  - [ ] Acessar https://busca.inpi.gov.br/pePI/
  - [ ] Buscar marca nas classes 9, 35, 41, 42
  - [ ] Documentar resultado (print)
  - [ ] Se conflitar, voltar pra escolha de outro nome

- [ ] **Verificar domínios disponíveis**:
  - [ ] `.com.br` em registro.br (custo R$ 40/ano)
  - [ ] `.com` em namecheap/google domains (custo ~US$ 10-50/ano)
  - [ ] `.app`, `.io` se for caso (custo US$ 15-50/ano)
  - [ ] Comprar TODOS para evitar squatting

- [ ] **Reservar handles em redes sociais**:
  - [ ] Instagram @nome
  - [ ] LinkedIn /company/nome
  - [ ] Twitter/X @nome
  - [ ] YouTube /@nome

- [ ] **Auditoria de licenças open-source** (proteção contra licenças virais):
  - [ ] Rodar `npx license-checker --production --summary` no frontend
  - [ ] Rodar mesmo no backend e agent-worker
  - [ ] Verificar se há **GPL** ou **AGPL** (problemas se houver — exige open-sourcing)
  - [ ] Garantir que tudo é MIT, BSD, Apache, ISC ou similar (permissivo)
  - [ ] Documentar todas as deps com suas licenças (anexo do contrato whitelabel)

## Fase 3 — Constituição da PJ (semana 3-6, custo R$ 1.500-3.000)

- [ ] **Contratar contador** (não tenta fazer sozinho — armadilhas de tributação)
  - [ ] Pedir indicação ou usar Contabilizei / Conta Azul / Agilize

- [ ] **Definir formato societário**:
  - [ ] **LTDA** com 2 sócios (você + Marcos Paulo, 50/50) — recomendado
  - [ ] Alternativa: 2 SLUs (uma de cada) que assinam contrato de parceria — mais flexível mas burocrático
  - [ ] **Não recomendado**: MEI (limite R$ 81k/ano + restrições)

- [ ] **Escolher CNAE**:
  - [ ] CNAE principal: **6201-5/01** — Desenvolvimento de programas de computador sob encomenda
  - [ ] CNAE secundário: **6202-3/00** — Desenvolvimento e licenciamento de programas customizáveis
  - [ ] CNAE secundário: **6209-1/00** — Suporte técnico, manutenção e outros serviços em TI
  - [ ] CNAE secundário: **6311-9/00** — Tratamento de dados, provedores de serviços de aplicação

- [ ] **Definir nome da PJ**:
  - [ ] Razão social (oficial, ex: "Koinos Tecnologia Ltda")
  - [ ] Nome fantasia (comercial, ex: "Koinos")
  - [ ] **Pode ser igual ao nome-produto** ou diferente

- [ ] **Regime tributário**:
  - [ ] Simples Nacional (Anexo III ou V) — provavelmente o melhor abaixo de R$ 4.8M/ano
  - [ ] Confirmar com contador qual fator R aplica

- [ ] **Endereço da PJ**:
  - [ ] Casa de um dos sócios (cuidado com IPTU residencial)
  - [ ] Coworking com endereço fiscal (~R$ 100-300/mês, recomendado)
  - [ ] Endereço da igreja (precisa de autorização escrita)

- [ ] **Conta bancária PJ**:
  - [ ] Cora, Inter PJ, ou Nubank PJ (gratuitas)
  - [ ] Cartão de crédito empresarial para infraestrutura (Vercel, Railway, Anthropic, etc.)

## Fase 4 — Contratos jurídicos (semana 6-8, custo R$ 2.000-4.000)

- [ ] **Contratar advogado especializado em PI + SaaS**
  - [ ] Pedir indicação ou buscar OAB/escritórios com cases B2B SaaS
  - [ ] Pedir orçamento fechado (não por hora) para os 4 contratos abaixo

- [ ] **Contrato de Co-Titularidade Software (PF + PF)**:
  - [ ] Define 50/50, regras de venda, sucessão, buy-out
  - [ ] Assinado em cartório (reconhecimento de firma)
  - [ ] **Importante**: este contrato precisa ser assinado ANTES da cessão pra PJ

- [ ] **Contrato de Cessão de Direitos (PF → PJ)**:
  - [ ] Os 2 co-titulares cedem 100% dos direitos patrimoniais à PJ
  - [ ] Em troca, ganham participação societária (50% cada na PJ)
  - [ ] **CRÍTICO**: sem esse contrato, a PJ NÃO é dona do código mesmo sendo dos mesmos sócios

- [ ] **Contrato de Licença Igreja CBRio ↔ PJ**:
  - [ ] Define: o que a igreja pode usar, por quanto tempo, com que SLA
  - [ ] Define: valor (gratuito? simbólico? mercado?)
  - [ ] Cláusula de manutenção/suporte
  - [ ] Cláusula de exclusividade ou não (a PJ pode vender pra outras igrejas?)
  - [ ] Cláusula de dados (igreja é "controlador LGPD", PJ é "operador")

- [ ] **Modelo de Contrato Whitelabel** (para futuros clientes):
  - [ ] Licença de uso (não cessão)
  - [ ] Customização permitida (logo, cores, nome de exibição)
  - [ ] Customização proibida (código, arquitetura)
  - [ ] Cláusula anti-engenharia reversa
  - [ ] Cláusula de não-concorrência (cliente não pode revender)
  - [ ] SLA, suporte, prazos de bug fix
  - [ ] Reajuste anual (IPCA + X%)
  - [ ] Quebra contratual, foro, mediação

- [ ] **NDA padrão** (para conversas com prospects, contratação de freelancers)

## Fase 5 — Registros INPI (semana 8-12, custo R$ 1.000-2.000)

- [ ] **Registro de Programa de Computador** (em nome da PJ):
  - [ ] Custo: R$ 185 + R$ 50 hash
  - [ ] Documentos necessários:
    - [ ] Procuração ao advogado (se via terceiro)
    - [ ] Hash SHA-512 do código (gerar com tarball do repo)
    - [ ] Memorial descritivo (parte do `01-inventario-tecnico.md` serve)
    - [ ] Comprovante do CNPJ
    - [ ] Comprovante de pagamento GRU
  - [ ] **Validade**: 50 anos
  - [ ] **Vantagem**: sigiloso, não publica o código

- [ ] **Registro de Marca** (em nome da PJ):
  - [ ] Custo: R$ 355 por classe (3 classes recomendadas = R$ 1.065)
  - [ ] Classes alvo:
    - [ ] **Classe 9** — software como bem
    - [ ] **Classe 35** — gestão administrativa
    - [ ] **Classe 42** — serviços tecnológicos / SaaS
  - [ ] Logo profissional pronto (versão vetorial)
  - [ ] **Validade**: 10 anos, renovável

- [ ] **Acompanhamento INPI** (durante 6-12 meses):
  - [ ] Receber notificações no Diário Oficial INPI
  - [ ] Responder a eventuais oposições (até 60 dias)
  - [ ] Pagar 2ª GRU após aprovação

## Fase 6 — Preparação Comercial Whitelabel (semana 12+)

- [ ] **Identidade visual completa**:
  - [ ] Logo (vetorial, com variações)
  - [ ] Tipografia
  - [ ] Paleta de cores
  - [ ] Manual de marca
  - [ ] Templates (apresentação comercial, proposta, contrato)

- [ ] **Material comercial**:
  - [ ] Site institucional (`koinos.com.br` ou nome escolhido)
  - [ ] Apresentação comercial (slides)
  - [ ] Vídeo demo (~3 min) mostrando os módulos
  - [ ] Estudo de caso da Igreja CBRio (com autorização)
  - [ ] Tabela de preços (3 tiers: Pequena / Média / Grande)

- [ ] **Preparação técnica multi-tenant**:
  - [ ] Auditar se o sistema suporta múltiplos tenants (hoje só CBRio)
  - [ ] Definir estratégia: 1 DB por cliente vs DB compartilhado com `tenant_id`
  - [ ] Estrutura de subdomínios (`igreja-x.koinos.app`)
  - [ ] Sistema de billing (Stripe? Asaas? Iugu?)
  - [ ] Onboarding self-service vs assisted

- [ ] **Termos legais públicos**:
  - [ ] Política de Privacidade (LGPD)
  - [ ] Termos de Uso
  - [ ] Cookie consent (se site tiver tracking)
  - [ ] Aviso DPO (Data Protection Officer)

## Fase 7 — Lançamento (depende das anteriores)

- [ ] **Marketing inicial** (mínimo viável):
  - [ ] LinkedIn dos 2 sócios anunciando
  - [ ] Post em grupos de pastores/líderes
  - [ ] Indicação direta a 5-10 igrejas conhecidas
  - [ ] Webinar de demonstração

- [ ] **Primeiro cliente whitelabel pago** (meta: até mês 6 pós-lançamento)
  - [ ] Contrato whitelabel assinado
  - [ ] Onboarding documentado
  - [ ] Lições aprendidas para escalar

---

## Investimento total estimado (90 dias)

| Item | Custo |
|---|---|
| Constituição PJ + contador (ano 1) | R$ 2.500 |
| Advogado de PI (4 contratos) | R$ 3.000 |
| Registro INPI software | R$ 235 |
| Registro INPI marca (3 classes) | R$ 1.065 |
| Domínios + redes sociais | R$ 200 |
| Identidade visual (designer) | R$ 1.500-5.000 |
| **TOTAL** | **R$ 8.500-12.000** |

**Pagamento mensal recorrente** (a partir do mês 1 da PJ):
- Contador: R$ 200-400/mês
- Endereço fiscal (se coworking): R$ 100-300/mês
- Conta PJ: R$ 0 (Cora, Inter)
- Total: ~R$ 300-700/mês

**Break-even**: 1-2 clientes whitelabel pagantes (ticket médio estimado R$ 1.500-5.000/mês)

---

## Quem faz o quê

| Tarefa | Responsável sugerido |
|---|---|
| Decisões internas (Fase 1) | Os 2 co-titulares juntos |
| Pesquisas INPI (Fase 2) | Pode delegar a estagiário/admin |
| Constituição PJ (Fase 3) | Contador + 1 dos sócios |
| Contratos (Fase 4) | Advogado + 1 dos sócios |
| Registros INPI (Fase 5) | Advogado |
| Material comercial (Fase 6) | Designer + 1 dos sócios |
| Multi-tenancy técnica (Fase 6) | O dev (você + Marcos Paulo) |
| Vendas (Fase 7) | Um dos sócios assume |
