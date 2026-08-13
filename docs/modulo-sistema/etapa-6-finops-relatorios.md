# Etapa 6 · FinOps e relatórios executivos

## Objetivo

Transformar custos técnicos e evidências operacionais em uma prestação de
contas verificável, exclusiva para superadmins e sem apresentar estimativas
como valores realizados.

## Contrato financeiro

Cada lançamento informa fornecedor, competência, tipo, moeda, cotação para
BRL, fonte e natureza do valor:

- `estimated`: previsão ainda não contratada ou faturada;
- `accrued`: custo provisionado para a competência;
- `actual`: valor realizado com origem identificada.

Créditos são lançados com direção própria e aparecem negativamente no valor
convertido. Evidências são apenas referências HTTPS autorizadas; faturas,
tokens e segredos não são copiados para o banco.

## Prestação de contas

O relatório executivo reúne, em um snapshot com checksum SHA-256:

- custos do período, preservando estimado, provisionado e realizado;
- catálogo e orçamento mensal dos fornecedores;
- release do sistema;
- execuções de automações, incidentes, erros e feedbacks observados;
- disponibilidade das fontes usadas na composição.

Relatórios nascem como rascunho. A publicação registra autor e data e não há
rota de edição para relatórios publicados. A exportação entrega o snapshot em
JSON para arquivamento ou tratamento externo.

## Segurança e auditoria

- todas as rotas usam autenticação e `requireSuperAdmin`;
- as tabelas não concedem acesso a `anon` ou `authenticated`;
- leituras sensíveis também entram no audit log geral;
- mudanças financeiras entram em `system_cost_events`, uma trilha append-only;
- os metadados de autoria usam e-mail e request ID, nunca token ou payload bruto.

## Critérios verificados

- migration aplicada antes da ativação da API;
- teste unitário de normalização e agregação FinOps;
- validação de sintaxe do backend;
- build de produção do frontend;
- separação visual explícita entre os três estados financeiros;
- fluxo de cadastro, orçamento, geração, publicação e exportação disponível na
  aba `Custos & relatórios` do módulo Sistema.
