# Módulo Sistema · Etapa 2

## Estado

Implementada em código. A ativação em ambiente depende de aplicar a migration e
publicar frontend/backend.

## Ordem segura de ativação

1. aplicar `20260729180000_sistema_v1_execucoes_incidentes.sql`;
2. publicar backend e frontend;
3. aguardar o primeiro ciclo dos crons;
4. validar `/sistema` com uma conta presente em `app_super_admins`;
5. conferir `X-Request-ID`, execuções, falhas e criação de incidente.

O backend possui fallback para continuar gravando o formato antigo de
`app_erros_servidor` se o código chegar antes da migration, mas a ordem acima é
a recomendada.

## Banco

### `system_job_runs`

- registro canônico de crons, workflows e workers;
- status da execução separado do status do efeito;
- tentativa, duração, contadores, erro sanitizado, release e ambiente;
- correlação por `request_id`;
- atualização permitida somente para finalizar uma execução `running`;
- exclusão proibida;
- leitura direta limitada a superadmins.

### `system_incidents`

- severidade e ciclo de vida aprovados na Etapa 0;
- vínculo à fonte sem copiar payload completo;
- impacto, superfície, responsável, release, ambiente e `request_id`;
- fonte única por incidente ativo.

### `system_incident_events`

- timeline append-only;
- criação, mudança de status, atribuição e notas;
- ator e correlação registrados.

### `app_erros_servidor`

Recebe colunas aditivas para `request_id`, release e ambiente.

## Backend

- tracking HTTP dos 45 endpoints catalogados;
- resposta HTTP 2xx sem prova de efeito entra como `warning/unknown`;
- falha HTTP entra como `failed/failed`;
- adapters tolerantes a fonte ou migration indisponível;
- visão agregada das últimas 24 horas;
- listagem de execuções;
- incidentes, transições e notas;
- falhas Web/API;
- feedbacks existentes;
- acesso estrito via `authenticate` + `requireSuperAdmin`.

## Frontend

- pulso operacional na visão geral;
- aba Web & API;
- conversão de erro ou feedback em incidente;
- aba Incidentes com criação, filtros e transições válidas;
- execuções recentes separadas do catálogo de automações;
- request ID mostrado em falhas e incidentes;
- estados desconhecidos não são exibidos como saudáveis.

## Retenção

Nenhum expurgo foi automatizado. Os prazos da Etapa 0 continuam propostas
dependentes de aprovação organizacional/DPO.

## Critérios de saída

- [x] migration aditiva e reversível por abandono;
- [x] execução canônica;
- [x] incidentes e timeline;
- [x] adapters das fontes atuais;
- [x] visão geral operacional;
- [x] Web/API básico;
- [x] automações básico;
- [x] autorização superadmin ponta a ponta;
- [x] sanitização e compatibilidade com schema antigo;
- [ ] migration aplicada no ambiente;
- [ ] frontend/backend publicados;
- [ ] smoke test autenticado em produção.
