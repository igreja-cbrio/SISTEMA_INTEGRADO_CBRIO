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
  "as suas". Rosto vira **2ª chave de dedup**. **3 alavancas de confiabilidade (em
  ordem de impacto):** (1) **restringir o universo** — comparar só contra os
  **batizandos daquele dia** (~30 refs), não a igreja inteira [maior alavanca]; (2)
  guardar o **embedding** (vetor), não só a imagem — a "chave" é o vetor; (3) **limiar
  alto + margem** entre 1º e 2º melhor match → abaixo disso vai pra **fila de revisão**
  (Lorena), **nunca** libera no "achismo" (match errado = vazamento). + **gate de
  qualidade na captura** (rosto frontal/nítido/único, com devolutiva). Tudo **em casa**.
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

**Resolvidas nesta rodada (2026-06-19/20):** integração app Matheus (compartilha
Supabase · ele faz a tela) · walk-in (sim, até pós-batismo) · recuperação (Lorena
vê/reenisa · token não expira mas é revogável) · galeria Fase 1 (por data · já no ar)
· nº de quiosques (~3–5 · 2 exclusivos no batismo) · fotos de batismo (já existem · §14).

**Ainda abertas:**
- **Tela do app (Matheus):** alinhar o **contrato do token** (QR → sessão Supabase)
  e o cronograma da publicação nas lojas. Integração de código é mínima, mas a tela
  e o consumo do token são dele. **Conversa com o Matheus.**
- **Storage da selfie de referência + expurgo:** bucket próprio (ex.: `biometria`,
  privado) vs SharePoint · retenção do `embedding` e política de expurgo (LGPD).
- **Token de acesso:** tabela nova `membro_acesso_token` vs reuso de
  `vol_checkin_membro_token` — decidir na implementação.
- **`quiosque_estacoes`:** tabela própria (recomendado · isola do Kids) vs generalizar
  `kids_estacoes`.
- **Tecnologia de face (Fase 2):** InsightFace/ArcFace (recomendado) vs face-api ·
  limiar + margem · **infra do worker em casa** (PC da igreja vs Railway).
- **Faixa etária no batismo:** menor (Bridge) = consentimento do responsável no quiosque.

## 13. Decisões já travadas (resumo)

- CPF no check-in de batismo = **opcional** (o preço da foto).
- 2º pilar (voluntário) = **fase seguinte**, não na Fase 1.
- Operação do quiosque = **misto** (inscrições self-service · batismo assistido).
- Destino do acesso = **app do Matheus** (com fallback web).
- Consentimento biométrico presencial e voluntário; **foto não obrigatória**;
  **só na igreja, só no horário**; **nada de casa**.
- Acesso = **etiqueta (QR+código) = posse física**; sem página remota de CPF→senha.
- **App do Matheus** = integração **quase nula**: compartilha o **mesmo Supabase**; ele
  só faz a **tela** seguindo nossas regras (o QR/token vira sessão Supabase).
- **Walk-in:** pode se inscrever **na hora** (até depois do batismo, só pra pegar a foto).
- **Token de acesso NÃO expira**, mas é **revogável**; vinculado à pessoa/inscrição e
  **legível pela líder de Integração (Lorena)** — recuperação = ela vê/reenvia (WhatsApp).
- **Duas fotos no perfil:** foto de **perfil** (a pessoa troca à vontade = `mem_membros.foto_url`)
  × foto de **referência** **imutável** (a chave biométrica). O quiosque **avalia a foto e dá
  devolutiva na hora** (gate de qualidade).
- **~3–5 quiosques** no lounge (inscrição/info); **2 viram exclusivos de check-in** com
  impressora no dia do batismo; os outros não precisam de impressora.

### Parte 2 (2026-06-20)
- **Fluxo do código = PRIMEIRO ACESSO (não magic-link puro):** o link da etiqueta **abre o
  primeiro acesso → a pessoa troca a senha → vê as fotos**. Posse física da etiqueta = a
  verificação; sem página remota de CPF→senha.
- **O código vive na INSCRIÇÃO de batismo:** gerado **assim que a pessoa se inscreve** (campo
  da inscrição) e **impresso no check-in**. Recuperação = **Lorena abre a janela do batismo da
  pessoa, vê o código e repassa** (sem expirar · revogável).
- **Não misturar dados → a lógica do quiosque vai no módulo TOTEM MEMBRO** (`/totem`), **NÃO**
  no Totem Kids (dados de menor). *(varredura de prontidão do Totem Membro em curso.)*
- **Consentimento = modal PADRÃO pra todos** + legenda fixa: *"menores de 18 anos precisam de
  autorização do responsável, caso ele esteja, pode autorizar!"*. Sem ramificação por idade.
- **LGPD: encerrado** — basta o campo "consentiu" (data) no cadastro.
- **Face: PC da igreja + webcam local + InsightFace/ArcFace** (Claude cuida da validação ·
  universo só do dia + limiar/margem + fila da Lorena).

---

## 14. ⚠️ Premissa corrigida (2026-06-20 · auditoria do código vivo)

**As fotos de batismo JÁ existem em produção** — o desenho NÃO recria isso (uma
auditoria automática chegou a dizer "greenfield"; **verificado no arquivo, está errado**):
- Bucket Supabase Storage **`batismos`** · fotos por pasta de **data** (`YYYY-MM-DD/`).
- `backend/routes/batismoFotos.js` · upload em lote (admin/diretor), listar, deletar.
- Edge Function `notify-batismo-fotos` avisa os batizados quando o álbum chega.
- **O app do Matheus já tem aba Batismo** mostrando "cada pessoa vê só a pasta da data do
  próprio batismo" (`lib/batismo.ts` do app · repo separado).
- **Não há tabela de metadados de foto** — o vínculo é **pasta = data**. Por isso a entrega
  hoje é **por data** (todos do dia veem as fotos do dia · aceitável pra cerimônia pública),
  e a **Fase 2 (face)** é o que dá o salto **"da data" → "as suas"**.

Efeito no escopo: o quiosque **não constrói entrega de foto** — ele adiciona **captura de
identidade na origem** (CPF + selfie + consentimento) + **acesso por etiqueta**. Trabalho
muito menor do que parecia.

## 15. BLUEPRINT (ancorado no código vivo · 2026-06-20)

### 15.1 Modelo de dados
**Já existe (reusar, não recriar):**
- `batismo_inscricoes` — lista do dia por `data_batismo`/`status`; `membro_id`, `cpf` (a
  guarda #1193 já liga o membro na intake). Migration `20260417200000` + extensões.
- Bucket `batismos` + `batismoFotos.js` + Edge `notify-batismo-fotos`.
- `mem_membros.foto_url` (foto única hoje) ↔ `profiles.membro_id` ↔ `auth.users`; helper
  `current_user_membro_id()`.
- `mem_qrcodes` (token SHA256(salt+CPF)[:24] → CPF · QR de identidade · `/membresia/qr-lookup`).
- Magic link passwordless (voluntariado/devocional).
- Padrão `kids_estacoes` (pareamento por QR token timing-safe, regenerável, config de impressora).

**Novo (tudo aditivo):**
- `batismo_inscricoes` += `checkin_em`, `checkin_estacao_id` (marca presença no quiosque).
- `membro_biometria` (membro_id FK · `foto_referencia_path` · `embedding vector(512)` via
  **pgvector** · `consentimento_em` · `capturada_por_estacao` · `ativo`) — a referência
  **imutável** + o **vetor** (a chave). RLS: dono + super-admin + integração. Expurgo definido.
- `membro_acesso_token` (token **aleatório**, permanente, **revogável**, membro_id FK,
  `revogado_em`) — a etiqueta. Legível pela Integração (Lorena reenvia). ⓘ avaliar reuso de
  `vol_checkin_membro_token` (`20260603210000`) na implementação.
- `membro_consentimentos` (membro_id · `tipo='biometria_fotos'` · texto · `aceito_em` · escopo).
- `quiosque_estacoes` — espelha o padrão de `kids_estacoes` em **tabela própria** (lounge ≠
  Kids/LGPD-menor · zero acoplamento). [ou generalizar — decisão de implementação]

### 15.2 Telas
**Quiosque** (touch · modo kiosk sem login via token de estação · auto-reset por inatividade):
- Menu: **Batismo (check-in)** · Inscrever em grupo · Quero ser voluntário · Next · Saber mais.
- **Check-in batismo:** lista batizandos do dia → a pessoa se acha → "Complete seus dados pra
  receber sua foto": **CPF (opcional)** + **consentimento** + **selfie (opcional · gate de
  qualidade + devolutiva)** → **imprime etiqueta (QR + código)**.
- **Inscrições:** reusa as telas públicas (`InscricaoGrupos/Voluntariado/Next`) adaptadas a touch.

**App do Matheus** (ele faz a tela · regras nossas · mesmo Supabase):
- Primeiro acesso: **QR da etiqueta → troca token por sessão → galeria** (hoje por data; Fase 2
  por face). Aba Batismo já existe.

**ERP (admin / Lorena):**
- Gerir estações do quiosque (cadastrar/parear/regenerar token) — reusa o padrão Kids.
- Ver/reenviar o **código de acesso** da pessoa + **revogar** (ação autorizada e logada).
- Upload das fotos da cerimônia (`batismoFotos`, já existe).
- **Fila de revisão de face-match** (Fase 2).

### 15.3 Fluxos
1. **Check-in batismo** (voluntário assiste): seleciona da lista do dia → confirma → CPF →
   `acharOuCriarGuardado` (liga/cria deduplicado) → consentimento gravado → selfie → foto de
   referência (+ embedding na Fase 2) → marca `checkin_em` → gera `membro_acesso_token` →
   imprime etiqueta.
2. **Walk-in:** não está na lista (até pós-batismo) → inscreve na hora no quiosque (cria
   `batismo_inscricoes` + segue o fluxo 1).
3. **Acesso às fotos:** QR → app → sessão → galeria (por data hoje · "as suas" na Fase 2).
4. **Recuperação:** perdeu a etiqueta → Lorena abre a pessoa no ERP → vê/reenvia o código
   (WhatsApp do nº em ficha) ou **regenera**.
5. **Inscrição grupo/vol/next:** quiosque hospeda a tela pública → dedup na origem → cai no
   funil existente (Entradas pega o resíduo).
6. **Face-match (Fase 2):** fotógrafo sobe fotos da cerimônia → worker **em casa** detecta +
   gera embedding de cada rosto → compara **só contra os batizandos daquele dia** → match com
   **limiar alto + margem** → vincula foto↔pessoa; ambíguo → **fila de revisão da Lorena**.

### 15.4 "Não quebrar" (tudo aditivo)
- `batismo_inscricoes`: a guarda de CPF (#1193) já liga membro; quiosque só **adiciona** colunas
  de check-in. KPIs/cobertura que leem a tabela **não mudam**.
- Fotos: bucket/rota/Edge **intactos**; quiosque não toca o upload da cerimônia (segue
  admin/diretor); galeria do app por data **segue**; Fase 2 só **adiciona** o vínculo por face.
- Auth: padrão **passwordless** preservado; token **não seta senha** em conta existente (lição
  account-takeover · [[senhas-account-takeover-fix]]); RLS por dono via `current_user_membro_id()`.
- Totem Kids: clonamos o **código/padrão** com **tabela de estação própria** → **zero risco** ao
  Kids/LGPD-menor.
- **pgvector**: `CREATE EXTENSION` — aditivo.

### 15.5 Mapa de reuso
| Precisa | Reusa | Onde |
|---|---|---|
| Estação/pareamento/kiosk | padrão `kids_estacoes` | `totemKids.js` (1035–1160) · `TotemKidsParear.tsx` · `lib/estacaoPareada.ts` |
| Etiqueta QR | `bwip-js` + `window.print` | `totemKids/lib/imprimir.ts` |
| Dedup na origem | `acharOuCriarGuardado` | `services/membroMatch.js` |
| Fotos de batismo | bucket `batismos` + rota | `batismoFotos.js` + Edge `notify-batismo-fotos` |
| QR de identidade (achar a pessoa) | `mem_qrcodes` | `20260417000000` + `/membresia/qr-lookup` |
| Telas de inscrição | públicas | `InscricaoNext/Voluntariado/Grupos` |
| Login passwordless | magic link | `publicVoluntariado` / `publicDevocional` |
| RLS por dono | `current_user_membro_id` · `is_super_admin` | `20260521190000` |

## 16. Veredito de prontidão do TOTEM MEMBRO (2026-06-20 · varredura do código vivo)

**O quiosque mora no Totem Membro (`/totem` · `src/pages/TotemMembro.tsx` ~2046 linhas ·
`backend/routes/membresia.js:60-1386`). Módulo MADURO (~80% pronto), não esqueleto.** Decisão
do Marcos: não misturar com o Totem Kids (dados de menor).

**Já existe (reuso direto · não recriar):**
- **Modo kiosk real:** fullscreen, **fora do AppShell**, **auto-reset por inatividade (60s)**,
  touch-friendly, **teclado virtual numérico**, PIN local (localStorage). NÃO tem pareamento de
  estação (≠ Totem Kids) — roda numa aba logada (perm `isAdmin`) + PIN.
- **Identificação por CPF** (`CpfInputScreen`) **e QR** (scanner USB) → `cpf-lookup`/`qr-lookup`
  acham em `mem_membros`/`mem_cadastros_pendentes`.
- **Captura de foto por webcam** (`getUserMedia` + canvas) já no fluxo "Meus Dados"
  (`MeusDadosFlow` · TotemMembro.tsx:823-1022) → é a peça da **selfie**. (Inline · não há
  componente genérico, mas o padrão se repete em `VolMeuPerfil`/`FaceScanner`/`useVolFace`.)
- **Inscrição de batismo / Next / grupos / apresentação de bebê** já implementadas. O batismo
  vai por `kpisApi.batismos.create` → **já passa pela guarda de CPF #1193 (nasce deduplicado).**

**Falta (extensão pontual · NÃO reconstrução):**
1. **Fluxo de CHECK-IN de batismo** (≠ a inscrição que já existe): tela "batizandos **do dia**
   → a pessoa se acha → confirma → CPF + selfie + consentimento". Base (lista/lookup/câmera) já
   existe. [médio]
2. **Impressão de etiqueta:** Totem Membro **não imprime** hoje; `totemKids/lib/imprimir.ts`
   (Brother + bwip-js · interface genérica nome/código/barcode) é ~90% reusável. [médio]
3. **4 colunas aditivas em `batismo_inscricoes`:** `codigo_acesso`, `checkin_em`,
   `foto_referencia_url`, `consentimento_em`. [mínimo]
4. **Gerar o código:** clonar `fn_kids_gerar_codigo_seguranca()` → `fn_batismo_gerar_codigo_acesso()`. [mínimo]
5. **Acesso por link → 1º acesso → troca senha:** **JÁ EXISTE 100%** —
   `PrimeiroAcessoSenhaModal` dispara quando `profiles.password_changed_at IS NULL`; magic-link
   via `supabase.auth.admin.generateLink({type:'magiclink', redirectTo})` (padrão de
   voluntariado/devocional). Só plugar com `redirectTo` pras fotos. [quase zero]

**⚠️ Ressalva de segurança (Claude cuida · não é decisão do Marcos):** o código de **4 chars**
do Kids (~1M combinações) é ótimo presencial, mas **fraco** num link público de acesso a
conta/fotos (varrível). Desenho: a etiqueta carrega **um TOKEN FORTE no QR** (aleatório/longo =
o acesso real) **+ um código curto legível** (~6 chars) só pra **conferência humana** (a Lorena
vê na janela do batismo). Recuperação = Lorena **reenvia o link/QR** (token forte), não o número
curto. Mantém "permanente · não expira · Lorena vê e repassa" **sem ser adivinhável**. Nuance:
magic-link do Supabase EXPIRA (~1h) — então o QR aponta pra `/batismo/acesso?token=<forte>`
(token permanente em `batismo_inscricoes.codigo_acesso`), e o backend **gera o magic-link fresco
na hora** que a pessoa escaneia → 1º acesso → troca senha → fotos.

> **Supersede** as menções genéricas a `quiosque_estacoes` (§15.1) e `membro_acesso_token`: a
> casa é o **Totem Membro** (sem pareamento de estação · PIN local basta) e o token de acesso é
> **`batismo_inscricoes.codigo_acesso`** (campo na própria inscrição · gerado na inscrição ·
> impresso no check-in), como o Marcos definiu.

## 17. Infra do face-match (Fase 2)
PC/worker **em casa** (não roda no Vercel serverless) com **InsightFace/ArcFace** → embedding
512d → **pgvector** (cosine), comparando **só contra os batizandos do dia** → limiar alto +
margem → fila de revisão. Rosto **nunca sai** pra terceiro. Mesmo espírito do agente do
pager/Brother (processo local) ou do worker financeiro (Railway).
