# Módulo Sistema · Etapa 5 · Governança de dados

## Resultado

O command center passa a reunir a governança técnica de Wi-Fi, reconhecimento
facial, integridade, retenção e auditoria. O console trabalha somente com
contagens, estados, metadados e links de evidência.

CPF, telefone, e-mail, IP, MAC, imagem facial, embedding, corpo de requisição e
segredos permanecem nas fontes autorizadas e não são devolvidos pelas APIs de
`/api/sistema`.

## Consolidação do menu

Para superadmins, os itens Feedback do piloto, Analytics do App, Wi-Fi e
Reconhecimento Facial deixam de aparecer espalhados no menu. Eles passam a ser
representados por:

- `Incidentes & feedback`;
- `Mobile`;
- `Governança > Wi-Fi`;
- `Governança > Facial`;
- `Governança > Dados e retenção`.

As rotas operacionais `/wifi` e `/ministerial/reconhecimento-facial` continuam
existindo para usuários dos módulos. Sistema governa a plataforma; não absorve
a operação ministerial nem amplia o acesso a dados pessoais.

## Controles persistidos

A migration cria `system_governance_controls` e o histórico append-only
`system_governance_control_events`. Estados aceitos:

- `implemented`;
- `monitoring`;
- `pending_decision`;
- `review_required`;
- `blocked`.

Uma mudança exige motivo. Aprovar o controle biométrico exige responsável e
URL HTTPS da evidência. A migration nasce com o portão biométrico bloqueado,
pois não existe parecer DPO versionado identificado no repositório.

## Leituras Wi-Fi

- recência e resultado da sincronização;
- volume do espelho e conexões dos últimos 30 dias;
- registros sem aceite LGPD;
- pessoas sem vínculo;
- conflitos de identidade pendentes.

Nenhuma dessas leituras devolve CPF, telefone, IP ou MAC.

## Leituras faciais

- cadastros biométricos e consentimentos agregados;
- descriptor presente sem consentimento;
- anônimos pendentes;
- expurgos vencidos e próximos sete dias;
- reconhecimentos agregados dos últimos 30 dias.

Imagens, caminhos assinados e vetores não atravessam a API de Sistema.

## Ativação

1. aplicar `20260731190000_sistema_etapa5_governanca_dados.sql`;
2. publicar backend e frontend consolidados;
3. entrar com conta ativa em `app_super_admins`;
4. validar `/sistema?view=governance`;
5. registrar decisões somente quando houver responsável e evidência;
6. manter o controle `facial_dpo_approval` bloqueado até parecer formal.

## Decisão externa ainda necessária

A implementação técnica da Etapa 5 não substitui decisão jurídica. O go-live ou
expansão de reconhecimento facial continua condicionado a DPO/jurídico,
finalidade, base legal, termo versionado, revogação, expurgo verificável e plano
de resposta a incidente biométrico.
