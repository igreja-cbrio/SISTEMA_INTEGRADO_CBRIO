# Agente de incidentes · Etapa 2 · Diagnóstico consultivo

## Estado

Publicada em 2026-08-17. Não há migration nem variável obrigatória nova.

## Fluxo

1. o cron existente executa a triagem automática;
2. incidentes em estado investigando entram na fila de diagnóstico;
3. o serviço coleta somente evidências relacionadas à fonte:
   - erro de servidor/Sentry: amostras, release, request ID, stack sanitizada e
     pequenos trechos locais de código permitidos;
   - job: execuções recentes e efeito confirmado;
   - feedback: relato e contexto funcional sanitizados;
4. um especialista Haiku por tipo de incidente devolve diagnóstico estruturado;
5. início, sucesso ou falha ficam registrados em system_incident_events;
6. a execução completa fica auditável em agent_runs e agent_steps.

## Guardrails

- modo exclusivamente proposal_only;
- não altera código, banco, configuração, dados ou produção;
- mensagens de erro e feedback são tratadas como entrada não confiável;
- e-mail, CPF, telefone e tokens são removidos antes do envio;
- contexto de código fica restrito a arquivos JavaScript do backend e não segue
  links simbólicos para fora da árvore permitida;
- no máximo 2 diagnósticos por ciclo por padrão e teto absoluto de 5;
- resposta sem a ferramenta estruturada é falha, nunca diagnóstico concluído;
- falha do diagnóstico não interrompe a triagem e aparece como resultado
  parcial no monitoramento do job;
- diagnóstico concluído não é repetido; tentativa em andamento tem trava de
  10 minutos e falha respeita cooldown de 1 hora.

## Configuração opcional

- INCIDENT_AI_MODEL: modelo Anthropic; padrão claude-haiku-4-5-20251001;
- INCIDENT_AI_TOKEN_BUDGET: orçamento registrado por execução; padrão 6000;
- INCIDENT_AI_MAX_PER_RUN: diagnósticos por cron; padrão 2, teto 5.

ANTHROPIC_API_KEY já faz parte do ambiente do projeto. Sem ela, a triagem
continua funcionando e o diagnóstico informa que está desabilitado.

## Fora do escopo

A etapa 2 não corrige bugs. A continuação assistida, com aprovação humana e
limites explícitos, está documentada na
[Etapa 3](./agente-incidentes-etapa-3.md).

## Validação

- teste de seleção do especialista e normalização;
- teste de redação de PII/segredos;
- teste de contenção do contexto de código;
- teste de idempotência/cooldown por eventos;
- teste de que resposta sem saída estruturada falha;
- regressão da triagem, Sistema v1 e fundação do módulo.
