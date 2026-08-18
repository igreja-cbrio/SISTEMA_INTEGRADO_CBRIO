# Agente de incidentes · Etapa 3 · Correção assistida

## Estado

Concluída em código em 2026-08-18. A publicação depende do fluxo normal de
branch, CI e deploy. Não há migration nem variável obrigatória nova.

## Fluxo

1. o cron executa triagem e diagnóstico da Etapa 2;
2. o planejador considera somente incidentes em investigação com diagnóstico
   concluído, evidência explícita e confiança média ou alta;
3. somente classificações de código ou experiência do usuário, com risco baixo
   ou médio e sem decisão de negócio pendente, são elegíveis;
4. uma tarefa determinística é criada com o mesmo ID do incidente e fica em
   `aguardando_aprovacao` no gate G1;
5. a aprovação humana coloca a tarefa na fila do Agente Dev;
6. o agente trabalha em clone e branch isolados, valida o diff e abre um PR;
7. CI e revisão humana continuam obrigatórios. O agente não faz merge nem deploy.

## Guardrails

- no máximo 3 propostas por ciclo por padrão, com teto absoluto de 5;
- proposta idempotente por incidente e registrada na timeline;
- no máximo 6 arquivos alterados por correção;
- escrita permitida somente em `backend/routes`, `backend/services`,
  `backend/utils`, `backend/config` e `src`;
- autenticação, middleware, financeiro, pagamentos, Santander, automação do
  módulo Sistema, infraestrutura, segredos e migrations são bloqueados;
- links simbólicos que escapem do workspace são bloqueados;
- o diff é staged antes da varredura de segredos e arquivos proibidos;
- a política é revalidada sobre os nomes reais do diff, não apenas sobre as
  ferramentas usadas pelo modelo;
- qualquer falha encerra a tarefa como falha e deixa trilha auditável;
- correção termina em PR aguardando revisão humana, sem merge/deploy automático.

## Configuração opcional

- `INCIDENT_CORRECTION_MAX_PER_RUN`: propostas por cron; padrão 3, teto 5.

## Fora do escopo

- mudanças de schema ou dados;
- autenticação e autorização;
- financeiro, pagamentos e integrações bancárias;
- infraestrutura, secrets e workflows;
- autocorreção do próprio agente ou do módulo de incidentes;
- merge, migration ou deploy automáticos.

## Validação

- testes da elegibilidade e da tarefa determinística;
- testes da allowlist, traversal e links simbólicos;
- typecheck do worker;
- testes de regressão do backend e build da aplicação;
- revisão humana do PR e CI como gate final.
