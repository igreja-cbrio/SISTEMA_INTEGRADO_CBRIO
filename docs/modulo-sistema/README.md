# Módulo Sistema

Documentação de arquitetura e execução do command center técnico do CBRio.

## Estado atual

| Etapa | Estado | Entrega |
|---|---|---|
| 0 · Contrato e inventário | concluída tecnicamente | fronteiras, mapa funcional, taxonomia, SLOs propostos, segurança e inventário |
| 1 · Fundação | concluída | acesso, catálogo, correlação, releases, execução canônica e adapters |
| 2 · Sistema v1 | concluída | visão geral, incidentes, automações e Web/API básico |
| 3 · Web completa | concluída | performance, segurança, releases e testes sintéticos |
| 4 · Android/iOS | concluída | telemetria segura, releases, falhas e operação por plataforma |
| 5 · Dados, facial e Wi-Fi | concluída | governança, integridade, consentimento, retenção e espelhos sanitizados |
| 6 · Custos e prestação de contas | concluída em código · publicação pendente | FinOps e relatórios executivos auditáveis |

## Automação de incidentes

| Etapa | Estado | Entrega |
|---|---|---|
| 1 · Triagem | publicada | agrupa erros e feedbacks, abre incidentes e inicia investigação sem ação corretiva |
| 2 · Diagnóstico consultivo | publicada | especialistas por fonte, evidências sanitizadas, hipótese estruturada e trilha auditável |
| 3 · Correção assistida | concluída em código · publicação pendente | elegibilidade restrita, aprovação humana, sandbox de escrita, PR e CI sem merge/deploy automático |

Detalhes e limites da etapa atual: [Agente de incidentes · Etapa 3](./agente-incidentes-etapa-3.md).

## Artefatos da Etapa 0

- [Contrato e arquitetura](./etapa-0-contrato-e-arquitetura.md)
- [Inventário operacional](./inventario-operacional.md)

## Artefatos da Etapa 1

- [Fundação e fronteira de migration](./etapa-1-fundacao.md)

## Artefatos da Etapa 2

- [Sistema v1 e ordem segura de ativação](./etapa-2-sistema-v1.md)

## Artefatos da Etapa 3

- [Web completa e ordem segura de ativação](./etapa-3-web-completa.md)
- [Agente de incidentes · correção assistida](./agente-incidentes-etapa-3.md)

## Artefatos da Etapa 4

- [Operação Mobile Android/iOS](./etapa-4-mobile.md)

## Artefatos da Etapa 5

- [Governança de dados, Wi-Fi e reconhecimento facial](./etapa-5-governanca-dados.md)

## Artefatos da Etapa 6

- [FinOps e relatórios executivos](./etapa-6-finops-relatorios.md)

## Convenção de migrations

Toda migration pendente de aplicação deve ter uma cópia idêntica em
`C:\Users\MarcosPauloAlmeida\Downloads`, com prefixo `CBRIO_APLICAR_`.
O arquivo dentro de `supabase/migrations` continua sendo a fonte versionada.

## Regra de progressão

Uma etapa só é marcada como concluída quando seus critérios de saída estão
registrados e verificados. Pendências organizacionais ficam explícitas; não são
tratadas como funcionalidades prontas.
