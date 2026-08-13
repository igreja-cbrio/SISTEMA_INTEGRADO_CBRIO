# Módulo Sistema · Etapa 1

## Estado

Implementação parcial concluída até a fronteira que exige migration.

## Entregue sem alteração de banco

- shell `/sistema`;
- `SuperAdminGuard` na rota frontend;
- `authenticate` + `requireSuperAdmin` na API;
- endpoint somente leitura `GET /api/sistema/fundacao`;
- catálogo canônico de 8 serviços;
- catálogo dos 45 crons do `vercel.json`;
- catálogo dos 10 workflows GitHub inventariados;
- catálogo de 25 integrações;
- identificação de ambiente, commit, branch, URL de deploy e região quando
  disponibilizados pelo provedor;
- middleware transversal de `request_id`;
- header `X-Request-ID` exposto por CORS;
- código de rastreio nas respostas globais 404/500 e nos erros do cliente;
- dashboard mínimo que diferencia catálogo, integração e saúde observada;
- testes unitários do catálogo, release e normalização de `request_id`.

## Guardrail aplicado

O dashboard não marca uma automação como saudável apenas porque ela existe.
Até haver registro canônico, os jobs aparecem como “execução pendente”.

## Fronteira de migration

O próximo incremento cria o registro canônico `system_job_runs`. Ele é
necessário para:

- início e fim de cada execução;
- estado (`running`, `success`, `warning`, `failed`, `skipped`);
- tentativa e duração;
- contadores de entrada, saída e descarte;
- erro sanitizado;
- correlação com `request_id`, release e ambiente;
- comprovação separada de execução e efeito.

Nenhuma migration foi criada nesta entrega.

## Critérios verificados antes da fronteira

- [x] rota frontend estrita;
- [x] endpoint backend estrito;
- [x] catálogo com contagens verificadas;
- [x] release sem exposição de secrets;
- [x] correlação HTTP;
- [x] dashboard responsivo e com estados honestos;
- [x] testes e build;
- [ ] registro persistente de execuções — depende de migration;
- [ ] adapters de execução — dependem do registro canônico;
- [ ] retenção de execuções — depende da tabela e política da migration.
