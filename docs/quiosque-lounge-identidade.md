# Confiabilidade de dados na origem · Quiosque do Lounge + Funil de Entradas

> **Spec de entendimento — 2026-06-19.** Ainda **NÃO** em desenvolvimento (Marcos
> pediu pra fechar o escopo primeiro). Fecha o que Marcos + Claude desenharam pra
> **resolver duplicata na origem** e dar ao sistema uma **base de identidade
> precisa**. Companheiro de `docs/operacao-funil.md` (mapa processo→dono) e da
> memória `next-batismo-modulo-design`.

## 1. A tese (por quê)

- Dedup feito *depois* (Membresia/Entradas) é **limpeza**; a cura **definitiva** é
  **CPF na origem**. O matcher (`membroMatch.acharOuCriarGuardado`) é a **rede de
  segurança** da janela sem CPF; o **CPF no registro** mata a duplicata de vez
  (chave nacional única → todo toque futuro casa exato).
- CPF **não** entra na **conversão** (mão levantada = só nome + telefone). Logo, a
  estratégia é **capturar o CPF no próximo momento natural** usando um **ímã** pra
  a pessoa querer dar.
- Meta de confiabilidade: ter, por pessoa, idealmente **duas chaves únicas — CPF
  (documento) + rosto (biometria)**. Com isso "esse rosto = essa pessoa" fecha
  até os casos que chegaram sem CPF.

## 2. Os dois ímãs / pilares de base real

A precisão não vem de todo mundo de uma vez — vem de dois grupos onde existe um
**incentivo natural** pra dar CPF + foto. Eles viram a **base real** que ancora o
resto do dedup:

- **Batizandos** · ímã = **a foto do próprio batismo**.
- **Voluntários (servos)** · ímã = **o lanche** (já fazem check-in pra comer).

## 3. Política de CPF por estágio (operacionalizada pelo quiosque)

| Estágio | CPF |
|---|---|
| Conversão (mão levantada) | Não — nome + telefone |
| Next / 1º contato | Captura (form) |
| **Batismo (check-in)** | Captura — **opcional**, é o "preço da foto" |
| **Voluntário (check-in do lanche)** | Captura (fase seguinte) |
| Grupos | Leve — nome/e-mail/telefone (o matcher cobre) |

## 4. O quiosque do lounge

- **Hardware:** PC touch + webcam no lounge da igreja.
- **Quando:** presencial, **só na igreja**, **só no horário de check-in**. **Nada
  de casa** — reduz a superfície de biometria e dá consentimento supervisionado.
- **Pra quê:** inscrição self-service em **grupos / voluntário / Next** +
  **check-in de batismo**.
- **Operação (misto · decidido):** inscrições = **self-service**; **check-in de
  batismo = um voluntário ajuda** (orienta consentimento + foto).
- **Reuso (não é greenfield):** padrão de **totem/pareamento** (Totem Membro/Kids)
  · **impressão Brother QL + bwip-js** (etiqueta com QR — o Totem Kids já faz) ·
  **fotos de batismo já salvas** (`batismoFotos`) · **matcher**
  `acharOuCriarGuardado` · **magic-link / 1º-acesso** · helpers de **RLS**.

## 5. Fluxo do check-in de batismo (coração da Fase 1)

1. Tela lista os **batizandos do dia** (`batismo_inscricoes` · `data_batismo =
   hoje` · status pendente/confirmado).
2. A pessoa **se acha na lista e dá o check** (confirma que é ela).
3. Aparece **"Complete seus dados para receber sua foto"**: **CPF** (opcional) +
   **Foto** (botão · opcional) + **consentimento** (aceite voluntário, instruído).
4. Em ~30s: grava **deduplicado** (`acharOuCriarGuardado` · CPF → e-mail →
   telefone+nome) + **registra o aceite** (quando + o quê) + (se tirou) guarda a
   **selfie de referência**.
5. **Imprime a etiqueta**: **QR + código**. O QR abre **direto na tela das fotos**
   (já autenticado pelo token).

## 6. Modelo de acesso e segurança (resolvido)

- **CPF = identidade** (chave do *dado*, pro dedup). **Etiqueta (QR + código) =
  acesso** (auth). São separados — CPF **nunca** vira senha.
- **Não existe** página remota "digita CPF → ganha senha" → o vetor de
  account-takeover (enumeração de CPF) **não existe** (lição do fix de
  account-takeover · `senhas-account-takeover-fix`).
- **Verificação = presença física + entrega da etiqueta na mão**, no horário de
  check-in, com voluntário do lado.
- **Token** único, **com validade**, **aleatório** (≠ CPF, ≠ sequencial). Etiqueta
  perdida = raio de dano mínimo (RLS por pessoa + validade).
- **RLS:** cada um vê **só as próprias fotos/dados**.
- **Recuperação** (etiqueta perdida): link no **WhatsApp** do número em ficha —
  **rede de segurança**, não o caminho principal. *(decisão em aberto · §12)*

## 7. Destino do acesso · o app de jornada do Matheus

- **Decisão (Marcos):** o ideal é que a etiqueta/QR leve a pessoa pra **dentro do
  app de jornada que o Matheus já desenvolveu** (indo pra Play Store/App Store ·
  ligado ao Supabase · "ferramenta de jornada incrível"). As fotos viram **mais um
  motivo pra abrir o app** → adoção.
- **Dependência (alinhar com o Matheus):** o app precisa suportar **primeiro
  acesso por CPF/token** (consumir o token do quiosque — provavelmente via
  Supabase auth / magic-link) e ter uma **tela de fotos**. Como o app já usa
  Supabase, o token do quiosque pode **criar/vincular a sessão** ou ser um
  magic-link que o app consome.
- **Fallback** enquanto a integração não existe: o QR abre uma **página web** já
  autenticada com as fotos (zero instalação); o app entra quando estiver pronto.

## 8. LGPD / biometria

- Rosto = **dado sensível**. Base legal = **consentimento presencial, voluntário,
  instruído, com opção de recusar** (sem foto = sem face-match; ainda pode receber
  por sessão).
- **Template do rosto guardado em casa** (não sai pra terceiro).
- **Menor** (Bridge) = aceite do **responsável**.
- **Registrar o aceite** (timestamp + escopo). Foto **não obrigatória**.

## 9. Fases

- **Fase 1 — Quiosque/captura (batismo):** check-in de batismo + CPF (opcional) +
  selfie (opcional, consentida) + etiqueta/QR + acesso às fotos **por sessão/data**
  (sem face-match ainda). Entrega: **CPF limpo na origem + acesso seguro + o ímã da
  foto**.
- **Fase 2 — Reconhecimento facial:** match **rosto → fotos da cerimônia**, entrega
  "as suas". Rosto vira **2ª chave de dedup**. Exige consentimento biométrico
  formal + **pipeline de match em casa** (detecção + embedding + match · limiar de
  confiança **alto** · fallback manual). **Nunca** liberar foto no "achismo"
  (match errado = vazamento).
- **Fase 3 — 2º pilar (voluntário):** check-in do lanche captura **CPF + foto**
  (mesma infra).
- **Trilho paralelo — aba Entradas:** redesenho pra **2 abas** (Duplicatas com
  escopo funil/base · Resolver com tudo inline). Independente do quiosque.

## 10. Distinção importante (não confundir)

- **Selfie do check-in = a CHAVE do rosto** (referência pra *achar* as fotos
  depois). **Não** é a foto que a pessoa recebe.
- **Fotos entregues = as da cerimônia** (o fotógrafo sobe depois).
- Em Fase 1 (sem face), a selfie é **coletada e consentida** mas a entrega é **por
  sessão/data**; em Fase 2 a selfie **casa** com as fotos da cerimônia.

## 11. Reuso do que já existe (mapa)

Totem/pareamento de estação · Brother QL + bwip-js (etiqueta/QR) · `batismoFotos`
(fotos salvas) · `membroMatch.acharOuCriarGuardado` (dedup) · magic-link/1º-acesso
· RLS helpers · **app de jornada do Matheus** (destino do acesso).

## 12. Decisões em aberto (a esmiuçar)

- **Integração com o app do Matheus** *(item-chave)*: como o token do quiosque vira
  acesso no app dele (Supabase session / magic-link?) · tela de fotos no app ·
  cronograma da publicação nas lojas. **Exige conversa com o Matheus.**
- **Walk-in no batismo** (apareceu e não está na lista do dia): inscreve na hora no
  próprio quiosque? (provável que sim).
- **Recuperação de acesso** (etiqueta perdida): inclui o link por WhatsApp? token
  com qual validade?
- **Onde salvar a selfie de referência** (SharePoint, como Cérebro/Marketing, ou
  Supabase Storage?) + retenção/expurgo do template facial.
- **Quantos quiosques** + setup de pareamento/impressora (1 no lounge? mais?).
- **Tecnologia de face (Fase 2):** modelo em casa (InsightFace / face-api) · limiar
  · fallback manual.
- **Granularidade da galeria na Fase 1:** "por sessão/data" mostra todos do dia —
  ok pro batismo (cerimônia pública) ou apertar já?

## 13. Decisões já travadas (resumo)

- CPF no check-in de batismo = **opcional** (o preço da foto).
- 2º pilar (voluntário) = **fase seguinte**, não na Fase 1.
- Operação do quiosque = **misto** (inscrições self-service · batismo assistido).
- Destino do acesso = **app do Matheus** (com fallback web).
- Consentimento biométrico presencial e voluntário; **foto não obrigatória**;
  **só na igreja, só no horário**; **nada de casa**.
- Acesso = **etiqueta (QR+código) = posse física**; sem página remota de CPF→senha.
