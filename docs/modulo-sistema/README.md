# Módulo Sistema

Documentação de arquitetura e execução do command center técnico do CBRio.

## Estado atual

| Etapa | Estado | Entrega |
|---|---|---|
| 0 · Contrato e inventário | concluída tecnicamente | fronteiras, mapa funcional, taxonomia, SLOs propostos, segurança e inventário |
| 1 · Fundação | concluída em código · ativação pendente | acesso, catálogo, correlação, releases, execução canônica e adapters |
| 2 · Sistema v1 | migration aplicada · publicação pendente | visão geral, incidentes, automações e Web/API básico |
| 3 · Web completa | migration aplicada · publicação pendente | performance, segurança, releases e testes sintéticos |
| 4 · Android/iOS | implementada em código · migration pendente | telemetria segura, releases, falhas e operação por plataforma |
| 5 · Dados, facial e Wi-Fi | implementada em código · migration pendente | governança, integridade, consentimento, retenção e espelhos sanitizados |
| 6 · Custos e prestação de contas | não iniciada | FinOps e relatórios executivos |

## Artefatos da Etapa 0

- [Contrato e arquitetura](./etapa-0-contrato-e-arquitetura.md)
- [Inventário operacional](./inventario-operacional.md)

## Artefatos da Etapa 1

- [Fundação e fronteira de migration](./etapa-1-fundacao.md)

## Artefatos da Etapa 2

- [Sistema v1 e ordem segura de ativação](./etapa-2-sistema-v1.md)

## Artefatos da Etapa 3

- [Web completa e ordem segura de ativação](./etapa-3-web-completa.md)

## Artefatos da Etapa 4

- [Operação Mobile Android/iOS](./etapa-4-mobile.md)

## Artefatos da Etapa 5

- [Governança de dados, Wi-Fi e reconhecimento facial](./etapa-5-governanca-dados.md)

## Convenção de migrations

Toda migration pendente de aplicação deve ter uma cópia idêntica em
`C:\Users\MarcosPauloAlmeida\Downloads`, com prefixo `CBRIO_APLICAR_`.
O arquivo dentro de `supabase/migrations` continua sendo a fonte versionada.

## Regra de progressão

Uma etapa só é marcada como concluída quando seus critérios de saída estão
registrados e verificados. Pendências organizacionais ficam explícitas; não são
tratadas como funcionalidades prontas.
