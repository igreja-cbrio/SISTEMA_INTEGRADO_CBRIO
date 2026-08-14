# CLAUDE.md

Guia operacional para o Claude Code quando trabalhar neste repositório.

## Como este arquivo é mantido (auditoria 2026-06-10)

Este arquivo contém **leis do projeto + estado atual dos módulos + lições aprendidas**.
A narrativa histórica de implementação (diários de specs, ondas de migration já
concluídas, planos abandonados) vive em **`docs/CLAUDE-LEGADO.md`** — que NÃO é
carregado por sessão e NÃO é referência viva (consultar só pra arqueologia de
decisões/time-lapse do sistema). Regras de manutenção:

- Seção nova entra **datada**. Quando o assunto esfria (mergeado + validado em
  prod), condensar a seção pra estado final + decisões + lições e mover o texto
  longo pro legado.
- Módulo descontinuado vira 1-3 linhas: o que era, quando e por que mudou
  (anti-regressão), com ponteiro pro legado.
- Nunca condensar/remover uma seção marcada como **lei/regra** (segurança,
  acentuação, contábil, PostgREST, meta×periodicidade) — elas ficam íntegras.
- Antes de tratar qualquer afirmação como verdade, validar contra o código/banco
  vivo (lição `cui_atendimentos`: achado de auditoria baseado em arquivo de
  migration que nunca foi aplicado em prod).

## ⚠️ LEI · Contrato de porta — toda entrada de PESSOA no sistema (2026-07-17)

Decisão do Marcos: dados de pessoa entram IGUAIS em todas as portas (Kids,
batismo, Next, voluntários, decisões, grupos, wifi, censo, formulários novos).
O formulário de cada porta continua MÍNIMO (pede só o que precisa); quem é
padronizado é o FUNIL pós-submit. Toda porta nova/alterada DEVE:

1. **Normalizar** antes de gravar: CPF/telefone digits-only, e-mail lower/trim,
   DV de CPF no servidor (com grandfathering: valor idêntico ao já armazenado
   passa sem DV — legado não pode travar edição).
2. **Passar pelo matcher canônico** (`backend/services/membroMatch.js` no JS ·
   `fn_link_or_create_membro`/`tg_cultos_dec_pessoas_resolve_membro` no SQL):
   CPF → e-mail+NOME → telefone+NOME → nascimento+NOME. NUNCA ligar por sinal
   fraco sozinho (família compartilha telefone/e-mail).
3. **Acumular contato divergente** em `mem_contatos` (migration 20260717120000 ·
   `fn_registrar_contato`): telefone/e-mail diferente do principal NÃO é
   conflito nem sobrescreve — vira contato secundário com fonte+data. O
   principal (`mem_membros.telefone/email`) só muda por ação humana. O matcher
   busca candidatos também nos secundários (anti-duplicata).
4. **CPF que chega depois** → `reconciliarCpfTardio` (consolida no membro;
   `confianca: 'fraca'` quando o vínculo veio de match fraco).
5. **Conflito de identidade** (CPF divergente/em uso, nascimento divergente) →
   `identidade_pendencias` (fila humana em Entradas > Identidade). NUNCA
   auto-fundir nem auto-decidir.

Uma pessoa = um cadastro (`mem_membros`) = fonte única que todos os módulos
leem. Módulo NÃO tem "base local de pessoas" — linha-satélite aponta pro
membro via `membro_id`.

## ⚠️ Contrato de Inscrição · toda porta pública de inscrição (F3.1 · 2026-07-28)

Decisão do Marcos (specs completas em `docs/modulo-inscricoes/fase1-unificacao.md`
e `fase2-specs.md` · decisões D1–D9 + ajuste 28/07): as 7 portas de inscrição
(batismo, apresentação, grupos, líderes, next, voluntariado, eventos externos)
convergem pro mesmo contrato de campos padrão — **nome completo em campo único
sem abreviação** (split 1º token→nome, resto→sobrenome onde a tabela exige) ·
**telefone 10–11 dígitos** digits-only · **CPF com DV** · **e-mail** ·
**nascimento validado** · **sexo obrigatório (`masculino|feminino`, NUNCA
"outro")** · **endereço fixo-opcional** · **termos LGPD com snapshot** ·
**opt-in WhatsApp explícito default false**. Regras valem SÓ para inscrições
novas — **dado legado nunca é alterado nem re-validado** (inscrições antigas do
Celebra com só nome+telefone continuam válidas para sempre).

- **Usar SEMPRE** `backend/services/inscricaoContrato.js` (validações,
  `processarIdentidade` = matcher+observação, `registrarConsentimentos`,
  textos canônicos) e `src/lib/inscricao.js` (máscaras/validações client).
  NÃO recriar cópias locais de máscara/CPF — era assim que divergia.
  ⚠️ `validarNascimento`, `emailValido` e `tirarCodigoPaisTelefone` MORAM em
  `backend/utils/camposContato.js` (pra entrar no gate de deploy) e são
  **re-exportadas** pelo contrato — os imports das 7 portas não mudam.
- **Consentimentos** vão para a tabela `inscricao_consentimentos`
  (migration `20260728121000` · append-only via backend · tipos: termos_lgpd,
  imagem, menor_responsavel, whatsapp). O ESTADO do opt-in continua nas
  colunas `whatsapp_optin/_em` de cada tabela.

**Estado do rollout — CONCLUÍDO (narrativa PR a PR no legado):** as 7 portas
entraram no contrato em 28/07 (F3.1) e a **espinha `inscricoes` + módulo
`/inscricoes`** ficou completa no mesmo dia (F3.2 · 6 tabelas · 5 abas ·
`vw_inscricoes_unificadas` · virada do Eventos Externos pra espinha, com os QRs
antigos do Celebra intactos no MESMO `/evento/:slug`). A F3.4 acrescentou o
**check-in por QR** (token HMAC derivado do id da inscrição — vale retroativo,
sem backfill) e a **confirmação por WhatsApp** (gated por opt-in · kill-switch na
env do template). O que segue como referência viva está nas seções de Pagamentos,
Catálogo de portas, Fila de identidade e Totem.

⚠️ **O que NÃO regredir do rollout** (o resto é história):
- **`novaKeyCampo` NUNCA deriva a chave a partir do label** — ver a LEI própria
  ("trocar a KEY de um campo de formulário ORFANA resposta").
- **Porta pública fica FORA do `publicLimiter` global** (mount antes dele +
  entrada no `skip()`), com limiter próprio generoso. ⚠️ Limiter no `router.use`
  **e** na rota conta **2×** a mesma requisição.
- **`autorizado_buscar: false` SEMPRE** no vínculo Kids criado por porta pública
  — o default `true` da coluna dava direito de RETIRADA de criança a qualquer um
  com CPF válido + nome/nascimento de criança cadastrada.
- **Consentimento de menor não vive dentro do `.then()` do matcher**: falha de
  identidade não pode apagar prova legal.
- **`ja_inscrito`/`ja_inscritas`/`duplicado` são EXIBIDOS**, nunca engolidos como
  "Inscrição confirmada!".
- **O inventário de portas é 100% somente-leitura, nem super-admin escreve** —
  cada porta tem lógica-satélite no módulo dono, e um 2º caminho de escrita é a
  classe de bug que o desenho evita.
- Teste: `node backend/services/inscricaoContrato.test.js`.

## ⚠️ LEI · o gatilho de `auth.users` é a ÚNICA entrada de PESSOA fora do contrato (2026-08-04)

Marcos, ao ver cadastros recentes com nome errado: *"nós resolvemos as inscrições
padronizando entradas, porque estamos recebendo dados recentes errados?"*
Investigação a fundo (04/08). O Contrato de porta está **íntegro** — o furo é uma
entrada que ele nunca cobriu porque **não está no repositório**.

### O que foi medido

Inventário de TODOS os escritores de `mem_membros`: **um** em JS
(`services/membroMatch.js`, o matcher canônico) + 20 migrations (imports pontuais
e o matcher SQL). **`grep` exaustivo em `backend/`, `src/` e `supabase/`: nenhum
lugar do repo escreve `origem_cadastro='auth'`.** E o arquivo que o CLAUDE.md cita
como fonte (`supabase/handle_new_user_membro.sql`) **nunca foi commitado** — não
existe em nenhum commit de nenhuma branch (`git log --all --diff-filter=A`).

Origem: commit `04ce6ea2` (16/06, Matheus) — o app passou a mandar
`frequenta_area` por metadata e o gatilho foi estendido em prod pra criar
`mem_membros`. A migration daquele PR só criou a COLUNA; a mudança no gatilho
ficou fora do git.

O `handle_new_user` que ESTÁ no git (`20260410014723`) só escreve `profiles`:
`COALESCE(full_name, name, split_part(email,'@',1))`. A versão viva herdou esse
`COALESCE` e passou a aplicá-lo a `mem_membros.nome`.

### Por que isso viola o contrato inteiro

O gatilho **não** normaliza, **não** chama o matcher canônico (logo não deduplica),
**não** acumula contato em `mem_contatos`, **não** registra observação de
identidade e **não exige nenhum campo**. Medido nos 22 cadastros `origem='auth'`:
95% sem CPF, 95% sem telefone, 95% sem nascimento, 100% sem sexo, **15 com o nome
igual ao prefixo do e-mail**.

⚠️ **E já colidiu com uma porta correta.** Caso real de 02/08:

```
11:49  Maria Victória Lannes Campos → formulário público COM CPF  (mem_cadastros_pendentes)
11:57  "Victória Lannes"            → gatilho auth, sem chave     (mem_membros)
14:03  Maria Victória Lannes Campos → preencheu DE NOVO
```

O matcher teria ligado os dois por e-mail+nome. Ele não rodou. Ela preencheu duas
vezes porque nunca foi reconhecida.

⚠️ Sintoma que revela o estrago: `andre.texeira` e `kevyn.ricardo` têm o
**profile** com nome correto e o **membro** ainda com o prefixo — alguém corrigiu
na mão o lugar errado, e `mem_membros` é o que todo o sistema lê.

### Pior caso: Apple Sign-In com "Ocultar meu e-mail"

O relay (`sy9p84mryx@privaterelay.appleid.com`) tem prefixo aleatório, e a Apple só
manda o nome na **primeira** autorização. Resultado: pessoa cadastrada como
`sy9p84mryx`. Ritmo atual ~1/dia (`catiassgullo` 04/08, `juloora` 03/08,
`sy9p84mryx` 02/08).

### O que foi corrigido (sem tocar em auth)

1. **`membroMatch.ehNomeDerivadoDeEmail(nome, email)`** — irmã do
   `ehNomePlaceholder`. ⚠️ Exige o e-mail e compara com ele: **não** é heurística
   de "nome estranho", então não pega apelido nem nome curto legítimo. Contrato em
   `nomeDerivadoEmail.test.js` (**no gate de deploy**), com os casos reais de prod
   e mutation-test do falso positivo — trocar a igualdade por "contém" transforma
   a função numa máquina de sobrescrever nome de gente.
   ⚠️ Caso-limite documentado no teste: nome real IGUAL ao prefixo
   ("Marcelo Soares" × `marcelosoares@`) dá `true`. Aceitável porque o efeito é
   reescrever com o nome que a própria pessoa digitou + avisar humano — **nunca
   apagar**. Se um dia isso decidir algo destrutivo, a regra tem que mudar.
2. **`publicMembresia` manda `full_name` no `createUser`** — sem isso o gatilho
   gravava o prefixo do e-mail. E o ramo `else` (profile já existe, que é o caminho
   NORMAL porque o gatilho chega primeiro) passou a corrigir `profiles.name` **e** o
   `mem_membros.nome` que o gatilho criou, com guarda estreita
   (`ehNomeDerivadoDeEmail`) e `.eq('nome', valorAtual)` contra corrida.
3. **`origem_cadastro` no INSERT do matcher** — eram **2.163** cadastros com origem
   nula (o parâmetro `origem` só ia pra observação de identidade), e "de onde veio
   esse dado?" não tinha resposta. `'matcher'` genérico não é gravado.
4. **Aviso diário agregado** (`notificacaoGenerator`, tipo
   `cadastro_sem_nome_real`): 1 por dia, nunca 1 por pessoa (sem regra configurada
   o `notificar` cai no fallback de TODOS os admin/diretor). ⚠️ Isto **não conserta
   a causa** — existe pra o problema parar de crescer em silêncio enquanto o
   gatilho não é corrigido. A mensagem diz explicitamente **não apagar**.

### ✅ O gatilho ENTROU NO CONTRATO (migration `20260804140000`)

Marcos rodou o `pg_get_functiondef` em 04/08 e a definição viva foi commitada —
**este é o primeiro registro dele em git**. A migration substitui o corpo e:

- **normaliza** cpf/telefone (digits) e **valida o DV do CPF**: CPF inválido é
  DESCARTADO em vez de virar identidade errada. ⚠️ Antes entrava CRU do metadata,
  e CPF mascarado não casa com `uniq_mem_membros_cpf_ativo` (digits-only) nem com
  o lookup de dedup — fábrica silenciosa de duplicata.
- **delega o match a `fn_link_or_create_membro`** (canônico · CPF → telefone+NOME
  → e-mail+NOME): fecha o buraco do `email = new.email` sozinho (família
  compartilha endereço) e passa a **acumular contato divergente em
  `mem_contatos`**, que antes era descartado no ramo "membro já existe".
- ⚠️ Passa **`v_nome_meta` (o nome REAL, que pode ser NULL)** ao matcher, não o
  efetivo. Sem nome real ele cai no ramo legado de e-mail sozinho — seguro aqui,
  porque o e-mail É o da conta que autenticou — e então RECUSA criar, e o gatilho
  cria o stub. Passar o prefixo do e-mail como se fosse nome faria o ramo
  "e-mail + nome compatível" falhar contra o nome real já cadastrado e criar
  DUPLICATA: seria pior que o comportamento antigo.
- **completa só campo VAZIO** (nascimento, `frequenta_area`, `origem_cadastro`) —
  mesma política do censo e do CPF tardio. Sobrescrever é decisão humana.
- **liga cadastro pendente órfão**: CPF liga sozinho; por e-mail exige NOME
  compatível e respeita `nao_vincular_fraco`. É o conserto do caso da Maria
  Victória — a fila passa a mostrar "atualização cadastral" em vez de criar uma
  segunda pessoa.
- **melhora o nome** (no profile E no membro) quando o guardado é o prefixo do
  e-mail e chegou um real — era isso que deixava `andre.texeira`/`kevyn.ricardo`
  com profile certo e membro errado.

⚠️⚠️ **E desarma um risco que JÁ EXISTIA: o corpo antigo não tinha tratamento de
exceção.** Como o gatilho é AFTER INSERT em `auth.users`, qualquer erro ao gravar
`mem_membros`/`profiles` aborta o INSERT do usuário — **a pessoa não consegue
criar conta**. Duas pessoas com o mesmo CPF já bastavam (23505). Agora a
escrituração roda em bloco protegido: falha vira WARNING e o profile mínimo é
garantido. **Signup nunca deve falhar por causa da nossa escrituração.**

⚠️ **O que NÃO foi resolvido, e não é resolvível no banco:** sem nome do provedor,
o nome continua sendo o prefixo do e-mail — o banco não inventa nome de pessoa. O
conserto real é **o app pedir o nome na primeira tela** (repo do app, fora deste).
Até lá quem cobre é o aviso diário `cadastro_sem_nome_real`.

⚠️ Dependências conferidas AO VIVO antes de escrever (`fn_cpf_dv_valido`,
`fn_identidade_nomes_compativeis` chamadas por RPC; `fn_link_or_create_membro` e
`fn_registrar_contato` conferidos no catálogo do PostgREST — o matcher **não** foi
chamado em teste porque ele ESCREVE).

⚠️ **Teste funcional obrigatório após aplicar**: criar UMA conta nova e conferir
que (a) a conta é criada, (b) nasce 1 membro só, (c) o profile tem `membro_id`.
Rollback = colar a definição antiga (está no corpo do PR).

### ⚠️ O gatilho novo NÃO fecha o caso do nome ABREVIADO (05/08)

Aplicado e conferido ao vivo (o espelho SQL `fn_nome_derivado_de_email` bate com
o JS nos 8 casos, inclusive acento e relay da Apple). Mas sobra um furo que o
matcher não pode fechar: quando o provedor manda o nome **abreviado**, o ramo
"e-mail + NOME compatível" recusa e um fantasma nasce de novo.

Caso real medido: **Maria Victória existia DUAS vezes** —
`"Victória Lannes"` (auth, sem chave) e `"Maria Victória Lannes Campos"`
(`membresia_aprovacao`, com cpf+tel+nascimento). Os 2 pendentes dela foram
aprovados, então a aprovação criou um SEGUNDO membro em vez de ligar no fantasma.

⚠️ E a fila de Duplicatas **não enxergava o par**: `duplicidadePolicy` exige o
mesmo PRIMEIRO nome (`ta[0] !== tb[0]` → recusa), e o nome legal dela é *Maria*
enquanto ela usa *Victória*. Veredito medido antes do fix:
`{"incluir":false,"contradicoes":["Nomes incompatíveis"]}`.

**Ramo novo em `duplicidadePolicy`** (não afrouxei `nomesPodemSerMesmaPessoa`, que
tem casos-regressão documentados): e-mail EXATAMENTE igual + **exatamente um lado
é stub de login** (`origem_cadastro='auth'` sem cpf e sem telefone) + tokens do
nome menor **TODOS** contidos no maior → entra com prioridade **alta**.
⚠️ 100% de containment, não 75%: com 75% cônjuges no mesmo e-mail com sobrenome em
comum entrariam ("Ana Souza Lima" × "João Souza Lima" = 2 de 3 tokens). Está
mutation-testado. Aqui o e-mail não é o endereço da família — é a credencial que
autenticou, e é por isso que ele pesa mais que no caso geral.
⚠️ Os vetos de identidade (CPF/nascimento/gênero divergentes) rodam ANTES e
continuam mandando.

**`nomeEhEnderecoDeEmail`** — forma DIFERENTE do derivado-do-prefixo: o e-mail
está no campo do NOME (3 casos · 2 do `import_next_historico_2025_2026`, 1 do
wifi). Em 2 dos 3 a coluna `email` está VAZIA, então é também contato perdido. O
nome real não é derivável do endereço → aviso próprio pra humano, nunca exclusão.

**Cobertura do censo com DOIS recortes.** `/censo/cobertura` devolve `base` (todos
os ativos · inclui ~2.9 mil `visitante`) e `membros` (`status='membro_ativo'`), e o
painel virou um botão. ⚠️ Não é indecisão: "cobertura de quem?" é definição da
liderança, e escolher um faria o painel afirmar algo que não é nosso — além de
"quem falta" com 3 mil visitantes ser lista de cobrança inútil. `/censo/faltantes`
aceita `recorte=membros`.

**Testes no gate:** `test:duplicidade` (que existia e **não estava no gate**) e
`test:nome-email`.

### ✅ Pendências que a medição fechou (05/08)

- **pool-pg em `projects.js`/`patrimonio.js`**: `grep` não acha nenhum consumidor
  de `query()`/`pool` em `backend/` — `patrimonio.js:70` diz explicitamente que o
  fallback foi removido. A senha recusada do `DATABASE_URL` afeta **só script
  local**, nenhum endpoint de produção. Levantei como suspeita; a medição fechou.
- **Cadastros pendentes órfãos**: `status='pendente'` = **0** (a aprovação em lote
  de 04/08 drenou a fila). Não há backfill a fazer.
- **FKs pra `mem_membros`**: `profiles.membro_id`, `vol_profiles.membresia_id`,
  `next_matriculas.membro_id`, `mem_cadastros_pendentes.duplicado_de_id`,
  `mem_contribuicoes.membro_id`, `kids_responsaveis.membro_id` — **todas existem**
  (testadas pelo embed do PostgREST, que só funciona com FK) e **0 profiles
  apontando pra membro inexistente**. Fundir é seguro: `merge_membros` reaponta.
  ⚠️ Eu havia suspeitado do contrário pela lei nº 10; verifiquei em vez de assumir.

### ⏳ Em aberto, dependendo de DECISÃO (não de código)

- **`"22 pessoas -"`** — não é pessoa, é uma CONTAGEM: virou membro `membro_ativo`
  + batismo `realizado` de 26/01/2025 + trilha concluída. Apagar perde a
  informação de que 22 pessoas foram batizadas; manter infla membresia em 1 e
  sub-conta batismos em 21. Opções: (a) deixar e documentar; (b) soft-delete do
  membro + trilha, preservando o registro de batismo com observação.
- **O par da Maria Victória** — agora VISÍVEL na fila de Duplicatas com prioridade
  alta. Fundir é 1 clique da Naná (keep = o cadastro completo). Não fundi: hard
  delete de pessoa é "ok caso a caso".
- **Nome real da mãe do MURILO Mendes** (`Juliafuncionalfight@gmail.com`) — não
  vou adivinhar num registro de responsável Kids.
- **O app pedir o nome na primeira tela** — é o único conserto real do nome
  derivado do e-mail, e é no repo do app.

### Alarmes meus que NÃO se sustentaram (registrados de propósito)

- **`pco_import_2026` = 292 "nos últimos 30 dias"**: é **um import único de
  10/07**, dez dias antes da remoção do PCO. Artefato da minha janela, não
  vazamento.
- **`(null)` = 2.163 (649 recentes)**: não é porta sem controle — é o matcher
  canônico não preenchendo `origem_cadastro`. Os picos batem com dias reais de
  porta (23/06, 20-21/07, 02/08) e o dado é bom (CPF+telefone+nascimento).

Lição repetida 3× neste dia: **conferir o que a sonda devolveu, não a contagem.**

## ⚠️ Decisão · o voluntário lança NO CULTO, por link assinado (2026-08-14 · migration `20260814180000`)

Pergunta do Matheus: *"como vamos medir o track do novo convertido, se quando
coletamos os dados deles não pedimos o CPF?"*. A investigação mostrou que **o CPF
não é o problema** — o vínculo é por `membro_id` e já existe: `cui_convertidos`
tem 407/407 com membro, porque `tg_cultos_dec_pessoas_resolve_membro` roda o
Contrato de porta no BEFORE INSERT. O problema medido é outro.

### O que foi medido (14/08/2026)

- Cobertura nominal presencial na janela em que o registro nominal existe
  (20/05→13/08): **125 de 137 = 91,2%**. A coleta no papel FUNCIONA.
- Atraso papel→sistema: **média 3 dias, máximo 9**; 23 de 104 acima de 7 dias.
- SLA de 1º contato do módulo é **≤3 dias** → só **41,5%** cumprem (média real
  4,8 dias). **O convertido entra no sistema no dia em que o prazo dele venceu.**
- 12/07: culto das 19h com 9 declaradas e **0** nomes; o das 11h30 com 9
  declaradas e **19** nomes — lançado 9 dias depois, no culto errado.
- Online: 55 declaradas, **1** nome. `fonte='form_publico'` = **0** em 3 meses.

### O que entrou

- **`backend/utils/cultoToken.js`** — molde do `escalaToken` (namespace
  `culto-decisoes:`, `CULTO_TOKEN_SECRET || CRON_SECRET`, fail-closed,
  timing-safe). Link `/c/:token` → `src/pages/public/DecisaoCulto.tsx`, tela de
  LOTE (lança várias pessoas seguidas sem recarregar).
- ⚠️ **O `culto_id` vem do TOKEN, nunca do body** — é o que torna o bug de 12/07
  impossível por construção. Teste-mutante fixa isso (`src/test/cultoToken.test.ts`).
- Janela de lançamento de **2 dias**, reconferida no servidor a cada uso. Depois
  disso vai pro conferente — mata por desenho o caminho "lanço 9 dias depois".
- **Nenhum GET devolve lista de pessoas**, só contador agregado: link vaza
  (print, grupo de WhatsApp) e não pode virar janela pra base de gente.
- Formulário online: telefone virou **obrigatório**, checkbox de LGPD, e o
  backend **parou de descartar** — anexa ao culto ao vivo, ao do dia, ou ao
  último culto online em 7 dias (replay). Medido: em 120 dias houve culto online
  em 111, intervalo máximo de 3 dias, nenhum acima de 7.
- Card **"Nomes faltando"** em `VisualizacaoDecisoes.tsx`, reusando o `resumo`
  que a tela já buscava e jogava fora.

### ⚠️ O que NÃO fazer (decidido contra, com motivo)

- **NÃO usar login travado (trava-quiosque) pro voluntário.** O produto não sabe
  criar conta travada: `routes/voluntariado.js` grava `is_membro_only: false` e a
  trava exige `true` (as contas `voluntario-kids` foram feitas por SQL à mão).
  E `integracao` não está no `MODULO_ROTA_TRAVA`. Voluntário rotaciona semanalmente.
- **NÃO relaxar o `RETURN NEW` de `tg_cultos_dec_pessoas_to_cuidados`** quando
  `culto_id` é nulo. Tentador, mas: `v_area` cairia no `ELSE 'sede'` (chute
  gravado como fato, e a área decide roteamento pastoral e KPI), e usar
  `CURRENT_DATE` como `data_culto` faria o relógio do SLA contar do dia da
  DIGITAÇÃO — os 41,5% subiriam sem nada melhorar. A porta nova resolve na
  origem: o culto vem no token. ⚠️ `CURRENT_DATE` no Postgres é **UTC** e o banco
  roda em UTC — depois das 21h BRT o dia já virou (faixa do culto de domingo).
- **NÃO publicar percentual de cobertura.** N > D acontece de verdade: o culto de
  12/07 tem `sem_dados = -8` na `vw_nsm_sem_dados` e `gap_status = 'completo'`, e
  esse negativo CANCELA a falta de outro culto na soma. O card mostra **gap
  absoluto** + contagem de divergências, com a janela declarada no subtítulo
  (`nsmSemDados` é fixo em 365 dias; os 4 cards ao lado seguem o seletor).
- **NÃO criar colunas de consentimento** em `cultos_decisoes_pessoas` —
  `inscricao_consentimentos` (porta `decisao`) é o ledger único.
  ⚠️ As duas portas gravam textos DIFERENTES de propósito: no formulário público
  a própria pessoa marca a caixa; no link do voluntário quem preenche é um
  terceiro, e o texto diz `DECLARADO PELO VOLUNTARIO`. Gravar declaração de
  terceiro como consentimento do titular seria fabricar prova legal.
  Consentimento é gravado **ANTES** da decisão (id pré-gerado): órfão no ledger é
  inofensivo, dado de pessoa sem prova legal não é.
- **Criança não entra por esta porta** (LGPD art. 14, §1º) — fica no fluxo do
  Kids, com responsável.

### ⚠️ O que ficou medido e NÃO foi atacado (o gargalo real)

Captura não é a restrição do funil. Coortes com 60d fechados (n=307):
contato ≤3d → **13,8%** engajam · sem contato → 4,0%. **O teto de quem fez tudo
certo é 13,8%, contra meta de 50%.** Mais: **270 de 271** pessoas que atenderam e
responderam **nunca foram convidadas pro NEXT** (a máquina existe inteira em
`nextConvite.js`, com template aprovado, usada 1 vez); `cui_primeiro_contato_fila`
tem 39 itens, **todos `pendente`**; alargar a janela de 60→365 dias acrescenta só
10 pessoas (35→45), ou seja **~89% não engajam em janela nenhuma**; e
`mem_checkins` = **0**, então é impossível saber se o convertido voltou no
domingo seguinte.

⚠️ **Armadilha do denominador**: consertar a captura do online faz o NSM CAIR
(entra coorte com engajamento historicamente zero). Publicar sempre o
denominador junto, separar qualidade-de-dado de painel pastoral, e comparar por
coorte fechada. O número imune à mudança de captura — e portanto o que prova
discipulado — é o **13,9% da coorte "atendido e respondido"**.

## ⚠️ CENSO / recadastramento da membresia (2026-08-03 · migrations `20260803160000` + `20260803160100`)

Demanda do **Arthur Serpa**: por um mês, 1 minuto de cada culto pra igreja
escanear um QR e preencher o cadastro. Decisão do Marcos: **formulário ÚNICO**
(não dividir em duas etapas), então o censo é o próprio `/cadastro-membresia`,
com `?censo=1` no QR. Diário completo no legado.

**⚠️ Decisão de arquitetura: NÃO é evento no módulo de Inscrições.** `inscricoes`
é tronco PARALELO ao de pessoas — `membro_id` é nullable e nada o preenche, então
um "evento censo" daria milhares de linhas numa tabela que **não é a membresia**,
e a promoção inscrição→membro teria que ser construída do zero. O formulário de
membresia já escreve na espinha de identidade (matcher + `duplicado_de_id` +
observação segura + consentimento LGPD + fila de aprovação).

**⚠️ O censo é UPDATE pra maioria — e era aí que ele morria.** Toda pessoa que já
existe gerava linha `duplicado` pra resolver **UMA POR UMA**, e com base viva na
casa dos 3.900 isso é trabalho humano que ninguém vaza em um mês: a campanha
morreria na fila, não na coleta. **`services/censoReconciliar.js`** generaliza a
política do `cpfReconciliar` de um campo pra nove:

- campo **VAZIO** → **preenche** · valor **igual** (tolerando caixa/espaço/
  máscara) → no-op · valor **diferente** num campo que já tinha → **CONFLITO**:
  não grava, vai pra decisão humana com **os dois lados à vista** · sem conflito
  → `status='aplicado'` (sai da fila, continua existindo como prova do que a
  pessoa enviou e consentiu).
- ⚠️ **Telefone e e-mail divergentes NÃO são conflito** — a lei do Contrato de
  porta manda **ACUMULAR** em `mem_contatos` via `registrarContatoDaPorta` (a
  MESMA função do matcher, importada). Tratar contato como conflito jogaria na
  fila humana o caso mais comum do censo (trocou de número) e o principal
  continuaria velho.
- ⚠️⚠️ **Gate de confiança: só `matched_by='cpf'` (e `token_censo`) aplica
  sozinho.** Telefone+nome / e-mail+nome / nascimento+nome são sinais que a
  **família compartilha** — mãe e filha com o telefone da casa casam, e o único
  sinal de que erramos é o nascimento. Com sinal fraco só aplica se o nascimento
  confere **dos dois lados**. **O "sou eu" do lookup também é FRACO** (validado só
  contra o telefone: quem clica pode estar reconhecendo o cadastro do cônjuge).
- ⚠️ **Guarda de corrida tudo-ou-nada**: o UPDATE leva `.is(campo, null)` em cada
  coluna que escreve — **sobrescrever edição humana com dado de formulário é
  exatamente o que esta política existe pra não fazer**. 0 linhas → relê, reavalia,
  e o que foi preenchido vira conflito. UMA retentativa, sem laço.
- ⚠️ **O censo NÃO promove ninguém a membro**: `vinculo_declarado` é
  **autodeclarado** e nunca encosta em `mem_membros.status`. Quem é membro segue
  sendo decisão da igreja — e o QR do culto é escaneado por membro, congregado,
  visitante e pai de criança.

**⚠️ Lições que valem além do censo:**
- **Porta pública com autocomplete precisa de DOIS baldes de rate limit**
  (submissão × probing). A cota compartilhada de 10/15min quebrava o formulário
  **na 3ª pessoa**: cada pessoa gasta 3-5 requisições e no WiFi da igreja todas
  saem por 1 IP. ⚠️ Limiter fica **só nas rotas**, nunca em `router.use` **e** na
  rota (conta 2× a mesma requisição).
- **Contador sem paginação MENTE em silêncio**: `.select('status')` capa em 1000
  linhas server-side, então a partir da 1001ª submissão os KPIs **congelavam sem
  erro**. Virou COUNT no banco (`head: true`).
- **Submissão que o reconciliador RESOLVEU não notifica** — sem regra configurada
  o fallback é TODOS os admin/diretor, e 700 respostas × 16 admins ≈ 11 mil linhas
  por domingo. Aviso é pra trabalho PENDENTE.
- **⚠️ DUAS colagens, uma tabela cada (deadlock 40P01)**: DDL que trava duas
  tabelas vivas pode se abraçar com uma consulta de produção que as toca na ordem
  inversa, e a vítima é a migração. `mem_membros` é a tabela mais quente do
  sistema, por isso vai sozinha. ⚠️ Conferir no **catálogo**, nunca por
  `RAISE NOTICE` (o SQL Editor do Supabase não mostra notice).
- **Tolerância à migration ausente**: o insert tenta com as colunas do censo e,
  em `42703`, repete **sem elas** — a submissão é o que não pode se perder. O
  painel responde **aviso**, nunca 500, e cobre aplicação **parcial** (número
  errado é pior que número ausente).

**Cobertura** (`/censo/cobertura` nível 1 · `/censo/faltantes` nível 2, carrega
telefone) em bloco recolhível na aba Cadastros — não aba nova (a Caixa de entrada
dos Grupos já provou que separar em aba faz ninguém achar).
- ⚠️ **A JANELA vai colada no número**, no payload e no título. Reportar "176
  pessoas" sem dizer o período fez um número **correto** parecer errado.
- ⚠️ **Pedidos × PESSOAS**: quem responde 2× conta 1 pessoa. Repetir não é erro.
- ⚠️ **Nome-placeholder fica FORA do denominador** (espelha `ehNomePlaceholder`):
  descrição de extrato não é pessoa a censar.
- ⚠️ Dia da curva em **BRT** (às 21h do Rio o dia UTC já virou).
- **Coberta é quem RESPONDEU**, não quem teve os campos aplicados. Aprovar linha
  `aplicado` é **bloqueado** (400) — reaplicaria o formulário inteiro por cima de
  valor que a equipe corrigiu depois.

Teste: `npm run test:censo` (10 blocos · sem banco/rede/relógio · **no gate**).
Mutation-testados: tratar contato como conflito, e o gate de nascimento divergente
— é ele que impede o censo escrever o endereço de uma pessoa no cadastro de outra.

## ⚠️ Censo · convite de atualização cadastral p/ quem está SEM CPF (2026-08-04 · migration `20260804120000`)

Pedido do Matheus: disparar WhatsApp + e-mail pra quem não tem CPF cadastrado mas
tem celular ou e-mail, pedindo objetivamente pra atualizar os dados. ⚠️ **NÃO é
campanha nova — é o CANAL do censo que já existe**: o link é o mesmo
`/cadastro-membresia?censo=1` do QR impresso, então a resposta cai no
`censoReconciliar` e a cobertura conta sozinha. Criar formulário próprio daria
duas verdades sobre "quem respondeu o censo". Números e diário no legado.

**⚠️⚠️ A LEI: o teto da Meta manda no tamanho da rodada, e furá-lo DESCARTA
convite em silêncio.** A conta está em **TIER_250** (250 destinatários únicos/24h)
e a fila **desiste 36h depois** de criada a mensagem. Enfileirar 2.000 pessoas não
entrega 2.000 devagar: entrega ~250 e as outras ~1.750 **morrem na fila em dois
dias**, sem erro, e a pessoa nunca soube do censo. Por isso
`TETO_RODADA_WHATSAPP = 200` (folga pros avisos operacionais que dividem a cota),
reenvio é **rodada nova**, e o que ficou de fora é **declarado** (`adiados`) na
tela. Subir esse número sem o tier ter subido é regressão — o teste trava em 250.

- **`backend/utils/censoConvite.js`** = régua PURA (quem recebe, quantos saem), em
  `utils/` pra entrar no gate. O serviço lê o banco e envia; **não duplicar régua
  lá**.
- **`mem_censo_convites`** (1 linha por membro/canal/rodada, UNIQUE parcial) é o
  que faz o reenvio pegar **só quem não respondeu** — sem ela o 2º disparo manda
  de novo pra todo mundo, que é como campanha legítima vira spam e derruba a nota
  da conta. ⚠️ **Não guarda telefone nem e-mail**: o contato vive em `mem_membros`
  e muda quando a pessoa corrige; copiar aqui criaria uma segunda verdade que
  envelhece.
- **Default é `membro_ativo`, não a base toda.** Visitante entra só marcando o
  chip: são ~1.800 pessoas ⇒ 9 rodadas/dias no tier atual, e é gente que não pediu
  contato.
- **Disparo SEMPRE manual, sem cron**, com prévia + **confirmação digitando o
  número**. Rota do POST é **nível 4**, não 3: editar cadastro é uma coisa, falar
  com 200 pessoas no número institucional é outra.
- **Relay do "Entrar com Apple" (`@privaterelay.appleid.com`) NÃO recebe e-mail**
  — é caixa técnica que a pessoa não lê, e mandar ali a marcaria como convidada.
- ⚠️ **Orçamento de TEMPO além do teto de quantidade** (`ORCAMENTO_EMAIL_MS`): o
  `enviarEmail` faz 3 tentativas com backoff, então uma rodada com muitos
  endereços ruins passaria dos 300s de `maxDuration` — e **função morta no meio
  não registra o que já enviou**, fazendo a próxima rodada repetir.
- ⚠️ **Não editar template aprovado**: se precisar mudar texto, criar `_v2` —
  edição volta pra revisão da Meta e o envio para.

### ⚠️⚠️ "Aprovar o template" NÃO liga o canal — e a tela dizia que ligou (05/08)

O Matheus aprovou o template, apertou disparar **duas vezes** e veio perguntar
quem havia respondido. **Nada tinha saído** — a env não existia, então
`whatsappPronto()` mantinha o canal fechado. A guarda funcionou (zero linhas,
audiência intacta), mas a TELA mostrava caixa **verde** com "Rodada N disparada" e
o motivo real como **slug cru** no fim da linha.

- **Régua: envio que não enviou ninguém NÃO pode aparecer como sucesso.** Sem
  nenhum envio a caixa fica âmbar, diz "Nada foi enviado — nenhuma pessoa foi
  convidada" e o motivo vem como frase inteira (incluindo o lembrete de que **a
  Vercel só aplica env nova em deployment novo**).
- **Diagnóstico com evidência, não suposição**: as tabelas de convite e de envios,
  `vercel env ls` e os runtime logs. "Ele disse que disparou" não é dado.

### ⚠️⚠️ CANÁRIO · a env existir não prova que o template funciona

`whatsappPronto()` só olha se a env está **setada**. Nome com um caractere errado,
template não aprovado ou com nº de variáveis diferente **passa pela guarda** — e
`enfileirarLote` **INSERE sem tentar enviar**. O estrago: as ~200 pessoas viram
convidadas, a Meta recusa tudo depois (**132001 é falha PERMANENTE, sem retry**) e
a rodada seguinte as pula. **Convite perdido pra sempre.**

Agora a **primeira mensagem vai sozinha e SÍNCRONA**. Recusa **permanente** ⇒
rodada abortada, **ninguém registrado**. Falha **passageira** (teto do tier) segue
enfileirando normal — ali a fila é dona da entrega e o convite conta. Custo do
canário: 1 mensagem. ⚠️ A distinção usa o `permanente` que a fila já expõe, não
uma régua nova — duas réguas pra decidir "isso é definitivo?" divergiriam.

## ⚠️ Censo · o link do convite é PESSOAL, e é isso que dispensa o CPF (2026-08-04 · SEM migration)

Furo achado pelo Matheus horas depois do disparo entrar: *"se estou disparando mensagens para a
pessoa pedindo para ela completar o cadastro dela, como o sistema vai achar ela se ela não tiver
CPF cadastrado???"*. Não vai — e o link genérico `?censo=1` abria um **formulário em BRANCO de
cadastro novo**. Pedir "atualize seus dados" e entregar folha vazia não atualiza nada.

**A resposta: o sistema não precisa achar ninguém.** Quem manda a mensagem é ele, e ele já sabe
para quem está mandando. O link vai **pessoal**: `?censo=1&t=<token assinado com o membro_id>`.
Cobre as ~2.000 pessoas sem CPF — que são exatamente o público da campanha — com zero busca.

- **`backend/utils/censoToken.js`** — HMAC-SHA256 do `membro_id`, espelho da técnica do
  `inscricaoComprovante.js`. Segredo `CENSO_TOKEN_SECRET` com fallback no `CRON_SECRET`,
  **fail-closed**, **nunca literal** (lição do `MEM_QR_SALT`). **Namespace próprio**
  (`censo-atualizacao:`) — sem ele, um token do comprovante de inscrição (mesmo segredo!) seria
  aceito aqui e quem tem comprovante leria cadastro de membro. Há teste específico pra isso.
- **`GET /api/public/membresia/censo/meus-dados?t=`** é o **ÚNICO** endpoint público desta rota
  que devolve dado de pessoa. ⚠️ **Pode, porque a prova é o token ter chegado no contato DELA.**
  Os `lookup-cpf`/`lookup-nome-telefone` continuam devolvendo só primeiro nome + iniciais +
  telefone mascarado, e **é assim que tem que ficar**: CPF vaza e se compra, então CPF não é
  prova. ⚠️ **NUNCA aceitar `membro_id` cru na query** — seria enumerável (UUID vaza em log, em
  print, no histórico do navegador) e viraria extrator da base. Resposta de recusa é **neutra**:
  não distingue token malformado de segredo ausente de pessoa inexistente.
- **`token_censo` é chave FORTE no `censoReconciliar`** (entrou em `CHAVES_FORTES`, ao lado de
  `cpf`). Motivo diferente do CPF: não é dado que a pessoa digitou (e que poderia ser de outra
  pessoa da família) — é o link que o sistema emitiu e entregou. Tratá-lo como fraco jogaria na
  fila humana justamente o caminho criado pra resolver os cadastros sem CPF, e exigir CPF forte
  seria **circular** (é o CPF que eles estão vindo buscar).
- **Modo atualização no formulário**: abre preenchido, com `· falta preencher` **no próprio
  rótulo** dos campos incompletos (a lista vem do servidor pela MESMA
  `avaliarProntidao` da fila — a pessoa completa exatamente o que a equipe cobraria depois),
  tudo editável, foto. ⚠️ O formulário fica **escondido enquanto carrega**: renderizar vazio
  fazia a pessoa começar a digitar e o prefill sobrescrever o que ela escreveu.
- ⚠️ **Link ruim NÃO vira tela de erro** — degrada pro cadastro normal. E sem segredo o
  `montarLinkCenso` devolve o link genérico em vez de falhar: a campanha não para, só perde o
  preenchimento (a prévia avisa via `link_pessoal: false`).
- **O atalho "Já fiz meu cadastro e quero meu QR de membro" SAIU do formulário** (decisão dele):
  a carteirinha vive no app de membros, e numa página cuja tarefa é completar cadastro o atalho
  competia com a tarefa. `MemberWalletDialog` e as rotas `/wallet/*` **seguem existindo** (o app
  usa) — não apagar.

### ⚠️ O formulário de membresia não coletava SEXO — e isso travava a fila inteira

Achado ao construir a régua de obrigatórios: os 50 pendentes tinham `genero` preenchido (vêm de
outra porta), mas **`CadastroMembresia.jsx` nunca perguntou sexo** e o `POST /cadastro` nem
aceitava o campo. Consequência silenciosa: todo cadastro novo por essa porta nasce sem sexo, logo
**nunca fica "completo"** pela régua — ficaria na fila humana para sempre, e ninguém saberia por
quê. Contrato de Inscrição exige sexo em toda porta de pessoa; esta era a que faltava.
Corrigido nas 3 camadas: campo no form (`masculino|feminino`, **nunca "outro"**), whitelist no
backend, e `genero` entrou em `CAMPOS_CENSO` do reconciliador — sem isso o dado chegava do censo
e era **descartado em silêncio**.

## ⚠️⚠️ LEI · em operação LONGA, gravar o efeito DURANTE, não no fim (2026-08-04)

Três incidentes no mesmo dia, todos da mesma família. A lei que sai deles vale
pra qualquer coisa que faça N ações externas numa requisição:

**1 · Aprovação em massa (49 cadastros).** O servidor concluiu; o cliente abortou
em 30s (`request()` tem timeout padrão de 30s) e a tela disse *"Tempo esgotado ao
falar com o servidor. Recarregue a página ou tente de novo."* — para um trabalho
que **deu certo**. A lista continuou mostrando os 50 pendentes que já não
existiam. O caminho que a mensagem sugeria (tentar de novo) reprocessaria 49
cadastros. Correção: **pedaços de 8 com progresso real no botão**
("Aprovando 16 de 49…").

**2 · Disparo do censo (200 e-mails).** Mesma coisa, com prejuízo real: os 200
e-mails **saíram** e o registro em `mem_censo_convites` — que era **um único
insert no FIM** — falhou. Ninguém ficou marcado como convidado, e a rodada
seguinte teria reenviado pras mesmas 200 pessoas. Diagnóstico veio do
`get_runtime_logs` da Vercel (POST 200 + a mensagem do erro), **não** de
suposição: pelo que a tela mostrava, a conclusão natural era "nada saiu".

⇒ **A LEI: o registro do que já aconteceu vai em BLOCOS, durante o laço.** Morte
no meio (timeout da função, rede, deploy) deixa gravado o que já saiu, e a
próxima execução continua de onde parou em vez de duplicar. Registro no fim
transforma qualquer interrupção num bug com prejuízo externo.

⇒ **Corolário na UI: timeout de cliente NÃO é prova de que nada aconteceu.** A
mensagem nesses fluxos não pode dizer "tente de novo" — a do disparo agora diz
que o envio provavelmente continuou e manda conferir pela prévia. Em envio pra
fora, "tente de novo" é a instrução mais cara que a tela pode dar.

**3 · `ON CONFLICT` não usa índice PARCIAL.** A UNIQUE de `mem_censo_convites`
nasceu com `where membro_id is not null` e o upsert do PostgREST estourava
*"there is no unique or exclusion constraint matching the ON CONFLICT
specification"* — o Postgres exige que o statement repita o predicado do índice,
coisa que o `upsert()` do supabase-js não expressa. Índice recriado **sem
predicado** (`NULL` não conflita de qualquer forma: `NULLS DISTINCT` é o padrão).
Régua: **índice usado por `ON CONFLICT` nunca é parcial.**

⚠️ Os 200 convites foram **reconstruídos** com a MESMA ordem do disparo
(`created_at asc`, primeiros 200 elegíveis), com **deriva zero conferida** antes
(ninguém respondeu, ganhou CPF ou foi criado no intervalo). Verificação
independente que fechou: a prévia dizia "451 ficam para a próxima" e o sistema
recalculou **451** depois do reparo. Coluna `observacao` marca as linhas como
reconstrução — **não** usar `erro` pra isso (`erro` significa "o canal recusou",
e sujá-lo faz a contagem de falhas mentir).

## ⚠️ Censo · o CPF era DESCARTADO, e o painel dizia que estava tudo bem (2026-08-04)

O pior bug do dia, e o mais silencioso. `CAMPOS_CENSO` do `censoReconciliar`
exclui `cpf` **de propósito** (CPF tem serviço próprio, `cpfReconciliar`, que
trata conflito de identidade e CPF já pertencente a outro membro) — mas esse
serviço **nunca era chamado** no `publicMembresia.js`. Medido em produção: as
primeiras 4 pessoas do disparo preencheram o CPF, a submissão foi marcada
`aplicado` (sem conflito, tudo "certo"), e **o CPF não chegou a nenhum cadastro**.
A campanha existe pra coletar CPF de ~2.000 pessoas que não têm.

- Corrigido: o caminho do censo chama `reconciliarCpfTardio`, com `confianca`
  espelhando a força do vínculo — `cpf` e `token_censo` são fortes; sinal fraco
  exige nascimento conferível e vai pra fila humana se divergir (é o que impede
  gravar o CPF de uma pessoa no cadastro de outra da mesma família).
- Reparo: 4 CPFs consolidados. **2 casos NÃO foram gravados** porque o CPF
  informado já pertencia a outro cadastro — viraram `identidade_pendencias`
  (`cpf_conflito`). ⚠️ **Isso é GANHO, não erro:** é a pessoa duplicada se
  identificando: o convite foi pro cadastro sem CPF e ela respondeu com o CPF do
  outro. A campanha revela duplicata que ninguém achava.

**⚠️ A lição que passa do bug: o painel de cobertura NÃO mede a campanha.** Ele
tem a base inteira no denominador (200 convites com 8 respostas = "0,1%") e conta
**RESPOSTA, não CPF** — então as respostas subiam enquanto todos os CPFs eram
descartados, e **nada na tela denunciava**. Daí a `vw_censo_campanha` e o bloco
"O que as rodadas já trouxeram" no card: convidados → responderam → **passaram a
ter CPF** → viraram conflito. Métrica de campanha mede o OBJETIVO, não a
atividade; quando as duas divergem, é a atividade que engana.

## ⚠️ Censo · o OPT-IN também era descartado — e ele destrava o aniversário (2026-08-05)

Mesma família do bug do CPF, achado ao responder a pergunta do Matheus sobre o
disparo de aniversário dos voluntários. **Quem propaga consentimento é a
APROVAÇÃO** (`aprovarCadastroCore` / `promoverInscricaoLider`) — e a linha do
censo vira **`aplicado` e NUNCA é aprovada**, então o opt-in ficava só na
submissão. `CAMPOS_CENSO` não inclui `whatsapp_optin` (e não deve: consentimento
não é campo cadastral que se preenche por igualdade).

Medido em 05/08: **70 das 74 respostas marcaram a caixa (95%)** e só **13**
tinham chegado ao cadastro — **57 consentimentos válidos invisíveis** pra quem
decide se pode enviar. Corrigido no caminho do censo (`publicMembresia.js`) e os
57 reparados com a **data da submissão**, não a de hoje: `whatsapp_optin_em` é a
data da PROVA, e estampá-la com "agora" apagaria desde quando o consentimento
vale. Backup em `_bk_20260805_optin_censo`.

- ⚠️ **SÓ LIGA, NUNCA DESLIGA** (mesma política da aprovação): não marcar a caixa
  é ausência de consentimento NESTA submissão, não revogação do que a pessoa
  autorizou em outra porta. Revogar é ação dela.
- ⚠️ O UPDATE leva `.or('whatsapp_optin.is.null,whatsapp_optin.eq.false')` pra
  **preservar o `whatsapp_optin_em` de quem já havia consentido** — sobrescrever
  a data da prova é perder a informação, não atualizá-la.
- ⚠️ **O reparo pegou 58, não 57**: o Amaury respondeu o censo às 14:17 daquele
  dia, ENTRE o snapshot do backup e o UPDATE. Benigno (ele consentiu de fato) e
  é prova ao vivo de que o furo estava ativo até o commit. Régua: em reparo sobre
  porta pública VIVA, conferir quem entrou no alvo depois do backup em vez de
  tratar divergência de 1 como erro de contagem.

### A resposta sobre o aniversário dos voluntários: já está construído

Pergunta dele: *"agora todos os nossos formulários têm a checkbox — não podemos
usar isso para que a Meta não bloqueie o envio das mensagens de aniversário dos
voluntários?"* **Sim, e o raciocínio está certo: o impedimento nunca foi "a Meta
bloqueia Marketing", é que Marketing EXIGE opt-in.** Nada a construir — o
mecanismo existe ponta a ponta e está agendado:

- `vercel.json` → cron `/api/whatsapp-cron/aniversarios` (`0 12 * * *` = 9h BRT)
- `whatsappCron.js` filtra `whatsapp_optin = true` **e** vínculo de voluntário
  aberto (`mem_voluntarios.ate IS NULL`)
- `whatsappService.TEMPLATES_MARKETING = new Set(['aniversario'])` → o gate de
  opt-in do `notificarMembro` já vale exatamente pra este template
- templates `cbrio_aniversario` e `aniversario_voluntariado` **aprovados**, com
  `WHATSAPP_TEMPLATE_ANIVERSARIO2` setado em produção

**A única variável é o tamanho da audiência**, e ela cresce sozinha com a
campanha: de **178 voluntários** com nascimento + telefone, os que podem receber
foram de **21 → 36** só com o reparo acima. Nada enviado até 05/08 porque o cron
depende de cair no dia de alguém com opt-in.

## ⚠️ WhatsApp · falha de entrega AVISA GENTE, e o módulo vem do contexto (2026-08-05)

Autorizado pelo Matheus ao ligar o aniversário dos voluntários. Duas coisas
erradas no mesmo caminho, as duas silenciosas:

**1 · O `failed` do webhook não avisava ninguém.** A falha de entrega tem DOIS
caminhos e só um deles notificava:

| caminho | quando | antes |
|---|---|---|
| `whatsappFila.avisarFalhaTerminal` | a Meta **recusa na hora** (telefone inválido, código permanente) | ✅ notificava |
| `publicWhatsapp.processarStatuses` | a Meta **aceita** (200 + message_id) e depois reporta `failed` | 🔴 só gravava `failed_at` |

É no segundo que cai **"Message undeliverable" — número brasileiro válido SEM
WhatsApp**, o caso que o próprio CLAUDE.md registrava como "não avisa ninguém".

⚠️ **O `.select('id')` no UPDATE não é enfeite**: o `.is('failed_at', null)` faz
o UPDATE ser idempotente, mas sem saber **quantas linhas mudaram** a reentrega
da Meta (normal, e ela reentrega muitas vezes) avisaria de novo a cada entrega.
Mesma lição da guarda de idempotência: **o efeito colateral tem que estar
amarrado à transição real**, não à execução do handler.

⚠️ **Dedup por (MÓDULO, DIA)** neste caminho, diferente do por-envio da fila, e
de propósito: é aqui que caem os DISPAROS EM MASSA (aceito pra 200, `failed`
chegando um por um). Um aviso por mensagem × fallback de 16 admin/diretor =
centenas de linhas enterrando o sino — lição do censo e do lote de aprovação. O
detalhe fica em `whatsapp_envios.failed_at/erro_status`. E como o dedup do
`notificar` só vale enquanto **não lida**, falha nova depois de tratada volta a
avisar (desejado).

**2 · ⚠️ O PREFIXO DO CONTEXTO NÃO É UM MÓDULO.** `avisarFalhaTerminal` fazia
`contexto.split('.')[0]`, e o contexto do aniversário é **`app.aniversario`** —
o `app.` diz que o disparo nasceu de um evento do app, **não** que exista módulo
"app" (conferido no catálogo: não existe). Resultado: `resolverDestinatarios`
não achava regra e **todo** aviso de falha dos disparos do app caía no fallback
de TODOS os admin/diretor. Aviso que chega pra 16 pessoas e não é de nenhuma
não é tratado por ninguém.

- **`backend/utils/whatsappModulo.js`** = régua PURA (em `utils/` pra entrar no
  gate) mapeando contexto → `{modulo, link}`; `services/whatsappContexto.js` lê
  o banco e notifica. **Os dois caminhos usam a MESMA régua** — o mapa duplicado
  era garantia de divergirem.
- ⚠️ Os 9 slugs do mapa foram conferidos no catálogo `modulos` (todos existem e
  ativos). `voluntariado` tem 3 regras em `notificacao_regras`, então o aviso do
  aniversário vai pros responsáveis, não pro fallback.
- `src/test/whatsappModulo.test.ts` (9 casos · **no gate**) é **mutation-test da
  causa raiz**: voltar pro `split('.')[0]` fica vermelho, e há uma asserção de
  que todo módulo do mapa existe entre os slugs reais.
- O aviso **nomeia a pessoa** quando dá (`ref_id` é o membro nos contextos de
  `notificarMembro`) — "o telefone 21…" não diz a quem avisar.

## ⚠️ Wi-Fi · a COLETA AUTOMÁTICA foi DESLIGADA (2026-08-13 · SEM migration)

Pedido do Matheus: *"em relação à automação do wifi, pode desligar ela, pois fica
chegando notificação à toa, pois não estamos usando mais o wifi privado que pede
dados da pessoa."* Medido antes de tocar, e o barulho era real:

| sonda | resultado |
|---|---|
| última conexão em `wifi_conexoes` | **26/06/2026** (~48 dias antes) |
| alertas `automacao_sem_atualizar` (WiFi) | **619 · 515 não lidos** · 1/dia desde 03/07 · último **hoje 09:00** |
| execuções do cron `/api/wifi/cron/sync` | **falhando desde 02/08** (6 seguidas) |

**Eram TRÊS fontes de barulho, não uma**, e desligar só a que aparece no sino
deixaria as outras duas vivas:
1. `monitorAutomacoes.PIPELINES` → 1 aviso/dia de "automação parada" (o do sino);
2. o **cron falhando** → `system_job_runs` + 2 incidentes abertos ("Falhas
   consecutivas: cron · sync" e o HTTP 500), que viram **push no celular**;
3. `wifiSync` → `wifi_novos_visitantes` (parou sozinho em 22/06, sem gente nova).

⚠️ **A causa da falha do cron era o `ON CONFLICT` com índice PARCIAL, de novo**
(lei de 04/08): `fn_wifi_processar_vinculos` faz
`ON CONFLICT (tipo, membro_id, membro_conflito_id) WHERE status='pendente'`, e a
migration `20260731120000` acrescentou `AND tipo <> 'inscricao_sem_vinculo'` ao
índice `uniq_identidade_pendencia_aberta` → o Postgres deixou de inferir (42P10).
⚠️ **Conferido no catálogo que o estrago está CONTIDO**: aquela é a **única**
função viva com esse `ON CONFLICT` em `identidade_pendencias`, e nenhum `.upsert`
do JS toca a tabela — se `fn_link_or_create_membro` ou o gatilho do auth também
usassem, entrada de PESSOA estaria quebrada em produção, que é bem pior que o
WiFi. Por isso **não consertei a função**: ela morre com o cron, e reativar o
WiFi exige consertar o predicado ANTES de repor o cron.

**O que saiu:** a entrada `wifi` de `monitorAutomacoes.PIPELINES` · o cron do
`vercel.json` · o job do `systemCatalog` (46 → 45, com o teste
`systemFoundation` acompanhando na MESMA leva — número de cobertura que se mexe
sozinho é como o catálogo passa a declarar cron que não roda).

**O que FICA, de propósito:** os dados (**4.535 visitantes · 10.121 conexões**,
com `membro_id` ligado), as rotas de LEITURA (`/api/wifi/*`, a aba de histórico
na ficha do membro) e o `POST /api/wifi/sync` manual, que é a porta de
reativação. Nada foi apagado.

**Barulho acumulado limpo no banco:** 584 notificações marcadas como lidas
(backup dos ids em `_bk_20260813_notif_wifi`) e os 2 incidentes resolvidos com
o motivo escrito na descrição. ⚠️ Isso é **3,5% do sino** — as 16.675 não lidas
seguem lá, e a causa delas é a de 10/08 (38 módulos sem regra em
`notificacao_regras` → fallback de 16 admin/diretor).

⚠️ **Régua que fica: pipeline que NUNCA mais vai atualizar não é automação
vigiada, é alarme permanente.** Quando um sistema é desativado, tirá-lo do
monitor faz parte de desativá-lo — senão ele vira ruído que ninguém pode
resolver, e ruído assim treina a equipe a não ler o sino.

⚠️ **Follow-up (preexistente, não introduzido aqui):** `/api/notificacoes/cron`
está no `vercel.json` e **não** no `systemCatalog` — ou seja roda sem política de
alerta e sem abrir incidente, que é exatamente a armadilha que o catálogo
documenta. Não entrou nesta leva porque acrescentá-lo LIGA alarme novo, e o
pedido do dia era o contrário.

## Comunicação · aba "Automáticas" · quem recebe o que o sistema manda sozinho (2026-08-05)

Pedido do Matheus: *"queria conseguir saber quem são as pessoas que recebem as
mensagens automáticas."* Até aqui a resposta só existia LENDO CÓDIGO — cada
disparo tem a régua de público dentro do seu cron, e nada no sistema dizia quem
se encaixa nela hoje.

Aba nova em `/comunicacao?tab=automaticas` (`GET /comunicacao/automaticas` ·
`services/comunicacaoAutomaticas.js`). Por disparo: a regra em português,
**quantas pessoas se encaixam agora**, **os nomes**, o que saiu de fato em 30
dias, e — o que faz a tela não mentir — **as travas**.

- ⚠️ **100% SOMENTE LEITURA.** Descreve o que os crons disparam; não envia, não
  agenda, não desliga. Mesma decisão do inventário de portas do /inscricoes:
  cada disparo tem lógica-satélite no módulo dono, e um 2º caminho de escrita é
  a classe de bug que o desenho evita.
- ⚠️ **`?pessoas=1` exige nível 2**: a lista carrega nome + telefone. "Quantos
  recebem" é gestão; "quem recebe, com telefone" é cadastro de gente. Sem nível,
  a resposta traz `pessoas_ocultas: true` — dizer que não veio, porque "nenhuma
  pessoa" é a leitura errada de "sem permissão".
- ⚠️⚠️ **PÚBLICO SEM A TRAVA AO LADO É NÚMERO QUE MENTE.** A chamada do mês
  mostraria **"95 líderes recebem"** enquanto o **kill-switch central dos envios
  automáticos de grupos está DESLIGADO** (`whatsapp_config.grupos_auto_envios`,
  default false desde o susto de 20/07) e o envio real é ZERO. Com trava ativa o
  card troca o rótulo pra **"se encaixam na regra"**, apaga a cor do número e
  abre uma faixa âmbar dizendo *por que* nada sai. Travas espelhadas:
  kill-switch, temporada em curso, e template sem env.
- ⚠️ **Público × enviados medem coisas diferentes** e a divergência é o
  diagnóstico: público é quem se ENCAIXA hoje, enviados é o que SAIU. Foi assim
  que o devocional apareceu como 22 no público, 0 entregues e 187 erros.
- ⚠️ **A régua daqui é ESPELHO do cron, não a fonte** — se o cron mudar, esta
  tela passa a mentir. Cada item declara o `fonte` (arquivo/rota que manda de
  verdade) e o resolver diz de qual função é espelho. Disparo automático NOVO
  tem que entrar no `CATALOGO`: o que não está no inventário fica invisível, e
  mensagem automática invisível é a que ninguém descobre que está errada.
- Público que falha **não derruba o inventário** (o item mostra o erro e os
  outros aparecem): esconder 3 disparos por causa de 1 seria trocar informação
  por silêncio.

### ⚠️ Achado ao construir: o "Estudo da semana" NÃO é automático

O CLAUDE.md dizia que o cron diário manda o estudo no `WHATSAPP_ESTUDO_DIA`.
**Não manda:** `whatsappGrupos.enviarEstudoSemanal` **não tem nenhum chamador**
(`grep` em todo o backend) e `/whatsapp-grupos/cron/diario` só executa
`sincronizarLideresGrupos()`. Ele saiu do catálogo — listar ali um automático
que não existe é o oposto do propósito da aba. O envio do estudo é MANUAL.

### Estado medido em 05/08 (o que a aba mostra)

| Disparo | Público | Situação |
|---|---|---|
| Parabéns de aniversário | **36** de 178 voluntários | funcionando |
| Lembrete de batismo | 0 (sem batismo amanhã) | funcionando |
| Chamada do mês (grupos) | 95 líderes | **travado** · kill-switch desligado |
| Devocional do dia | 22 (14 sem opt-in) | **quebrado** · 187 erros, 0 entregas |

## ⚠️ Folha por pessoa · o coordenador estratégico VÊ (decisão de 2026-08-05)

Registrado pra não ser re-sinalizado como problema: **o coordenador estratégico
pode ver a folha de pagamento por pessoa** (decisão do Matheus). Então
`SAIDAS_ALLOWLIST` em `backend/routes/financeiroV2.js` e o espelho em
`src/pages/admin/financeiro/DashboardFinanceiroSemanal.jsx` **ficam como estão** —
não "corrigir" removendo esse acesso.

⚠️ Pela LEI de não nomear pessoa como dono de fluxo, o que vale aqui é o PAPEL.
Quem ocupa o papel vive no banco (`usuario_areas` / cargo), não neste arquivo.

## ⚠️⚠️ Voluntariado · o agente lia telefone da CÓPIA LOCAL (2026-08-13 · SEM migration)

Pergunta do Matheus: *"esse agente de voluntariado traz várias pessoas que não têm
número de celular, só que sempre reparo que são muitas, tá certo isso mesmo?"* —
**não estava**. E ele reparou de um jeito que o número mascarava: eram TODAS.

### O que foi medido em produção (13/08)

| tabela | telefone preenchido |
|---|---|
| `vol_profiles` | **8 de 930 (0,9%)** · 24 com CPF · 922 com `origem='planning_center'` |
| `mem_membros` | 3.587 de 3.995 (90%) |
| `vol_inscricoes` | 775 de 827 (94%) |

O agente lia SÓ `vol_profiles.phone`, e **o import do Planning Center nunca trouxe
telefone**. Resultado: das **87** escalas pendentes de confirmação, as **87**
apareciam como "sem telefone" — e **59 (68%)** tinham telefone no sistema (43 no
cadastro da pessoa via `membresia_id`, 16 no formulário público que a própria
pessoa preencheu). Só **28** realmente não têm telefone em lugar nenhum. O botão
"Lembrar todos" era, na prática, **inalcançável desde sempre** (0 com telefone).

⚠️ **É a LEI do Contrato de porta aplicada à LEITURA**: uma pessoa = um cadastro
(`mem_membros`) = fonte única. `vol_profiles` é linha-satélite e aponta pro membro
por `membresia_id`. Ler contato da satélite e concluir "não tem" confunde **"não
procurei no lugar certo"** com **"a pessoa não tem telefone"**. E o silêncio era o
pior: campo vazio PARECE dado, então ninguém investiga.

### A cadeia (régua PURA em `backend/utils/telefoneVoluntario.js`)

perfil → cadastro da pessoa (`membresia_id`) → cadastro por **CPF** → **formulário
de voluntariado** (e-mail + NOME) → contato secundário (`mem_contatos`). Primeira
fonte alcançável vence. Quem não resolve segue exibido como "sem telefone
cadastrado" — honesto.

- ⚠️⚠️ **A régua de nome é `duplicidadePolicy.nomesPodemSerMesmaPessoa`, NÃO
  `membroMatch.nomesMesmaPessoa`** — e a diferença decide **10 dos 16** casos. O
  Planning Center guarda o nome CURTO e o formulário tem o civil completo, então o
  Dice global desaba: `nomesMesmaPessoa` **recusa** "Eliane Santana" × "Eliane dos
  Santos Santana Sobrinho". A régua certa exige **mesmo primeiro nome + ≥75% dos
  tokens do nome menor**, que é o padrão "versão abreviada". Medida nos 16 pares
  reais: aceita 13/13 e recusa as 6 contraprovas de parentesco.
- ⚠️ **O canal do formulário casa por E-MAIL, e ali o nome é EXIGÊNCIA, não veto** —
  e-mail é o sinal que a família compartilha; sem o nome o lembrete de escala iria
  pro telefone do cônjuge.
- ⚠️ **VETO de nome nos canais fortes, rodando ANTES da evidência**: `membresia_id`
  **não é prova** — o backfill de 2026-06-10 ligou perfis órfãos a membros "por
  CPF/e-mail", e e-mail sozinho nunca identifica. Nome ausente de um lado **não é
  divergência** (é ausência de sinal, o caso comum do perfil do PCO).
  ⚠️ Veto disparado no canal do vínculo vai pro **log agregado**: significa perfil
  ligado ao cadastro de OUTRA pessoa, o que conta gente errada no valor **Servir** —
  não é só um telefone perdido.
- ⚠️ **Número alcançável é `contatoPessoa.telefoneAlcancavel`, reusado** (DDD real +
  o 9 do celular): número que o envio transforma em OUTRO número (o suíço
  `41765764538` → Curitiba) é **pior** que telefone ausente — a mensagem chega a um
  estranho.
- A tela **declara a origem** ("telefone do cadastro da pessoa"): número recuperado
  por caminho indireto é indistinguível de um digitado ali se a origem não aparecer.

### ⚠️⚠️ O conserto LIGOU um botão que estava desarmado — e o caminho de envio não estava pronto

`POST /lembrar` era `for` sequencial com `wpp.sendTemplate` e **nenhum registro do
que já havia saído**. Inofensivo enquanto o botão nunca aparecia; com 59
destinatários vira a armadilha da lei de 04/08 — cada envio tem timeout de 15s
contra `maxDuration` 300s, então a função **morre no meio com as mensagens
entregues e nada gravado**, e a próxima tentativa reenvia pra todos.

⇒ Passou pela **fila `whatsapp_envios`** (`enfileirarLote`): o INSERT do lote
acontece ANTES de qualquer envio, o cron horário drena com retry/backoff e falha
permanente avisa gente. Era o **único** disparo do sistema fora desse funil.
`contexto: 'voluntariado.escala_lembrete'` (o prefixo é lido por
`utils/whatsappModulo` pra decidir quem é avisado na falha · `voluntariado` tem
regra própria, não cai no fallback de 16 admins). Teto de rodada 200 com `adiados`
declarado. A tela diz **"na fila de envio"**, não "enviado" — a entrega é da fila.

⚠️ **RESÍDUO CONSCIENTE**: segue **sem gate de `whatsapp_optin`**, como antes.
Template é UTILITY sobre compromisso que a pessoa assumiu, mas quem marcou "não
quero receber" recebe. Ligar o gate é decisão de POLÍTICA do Marcos, não efeito
colateral de um conserto de leitura — e o caminho seria `notificarMembro` (que já
lê o opt-in), nunca uma 2ª régua no arquivo.

⚠️ Paginação: as 3 leituras de `vol_services`/`vol_schedules` eram `.in()` sem
lote nem `.range()` — cap de 1000 truncando em silêncio. Viraram `fetchAllRows` +
lotes de 200.

**A pedido dele, o painel nasce RECOLHIDO** (`AgenteVoluntariadoPainel.tsx`): o
cabeçalho já carrega total e resumo por categoria, então recolher não esconde que
existe trabalho pendente.

Teste: `src/test/telefoneVoluntario.test.ts` (30 casos, **no gate**), com os pares
REAIS de produção. **Mutation-testado de verdade** (4 mutantes rodados): voltar pro
Dice puro → 9 vermelhos · canal do formulário sem exigir nome → 6 · sem
`telefoneAlcancavel` → 3 · veto de nome desligado → 2.

⚠️ **Follow-up de CADASTRO, não de código**: os 28 sem telefone nenhum são 100%
`planning_center`; 10 deles têm vínculo com membro que também não tem telefone.
E `vol_inscricoes.vol_profile_id` está **100% vazio** (0 de 827) — o vínculo
perfil↔inscrição nunca foi preenchido, e é por isso que o canal do formulário
precisa casar por e-mail em vez de seguir a FK que existe no schema.

## ⚠️ Membresia · aprovação em massa da fila de cadastros (2026-08-04 · SEM migration)

Pedido do Matheus: selecionar alguns ou todos e aprovar de uma vez, *"mas o sistema deve ter uma
inteligência para ver se a pessoa está com esses dados obrigatórios preenchidos; se caso alguém
não estiver, não vai aprovar essas pessoas e fica para aprovação manual mesmo"*.

- **`backend/utils/prontidaoCadastro.js`** = régua PURA (testada no gate), espelhando o Contrato
  de Inscrição: nome completo **sem abreviação**, CPF com DV, telefone alcançável, e-mail,
  nascimento plausível (`hoje` injetado, parse local), sexo, e `aceita_termos` (a prova legal).
  Separa **`faltando`** (campo) de **`bloqueios`** (decisão humana). ⚠️ **Não inventar exigência
  aqui**: se o formulário público aceitou, a fila não pode exigir mais — senão o cadastro entra e
  nunca sai (foi exatamente o que o sexo ausente causava).
- **`aprovarCadastroCore()` foi EXTRAÍDO** do handler de 170 linhas, no padrão do
  `aprovarPedidoCore` dos Grupos; a rota individual virou casca fina. Duas cópias dessa lógica
  divergiriam, e o que ela faz é **criar pessoa** (matcher canônico, opt-in, histórico).
- **`POST /cadastros/aprovar-lote`** (teto 200): relê as linhas do banco e **reavalia a prontidão
  no SERVIDOR** — o payload diz *quais*, nunca *se pode*. ⚠️ **Sequencial de propósito**: cada
  aprovação passa pelo matcher e pode criar pessoa; em paralelo, dois cadastros da mesma família
  (telefone compartilhado) correriam no matcher ao mesmo tempo e poderiam gerar a duplicata que
  a fila de Entradas existe pra limpar.
- ⚠️ **`duplicado_de_id` preenchido NUNCA entra em lote**, mesmo com todos os dados: ali aprovar
  é o caminho de ATUALIZAÇÃO, que reaplica o formulário inteiro sobre o cadastro existente —
  inclusive por cima de valor que a equipe corrigiu depois (mesma razão pela qual o censo bloqueia
  reaprovar linha `aplicado`). É decisão humana, sempre.
- ⚠️ **O lote manda UM aviso com o resumo**, não um por pessoa: sem regra configurada o
  `notificar` cai no fallback de todos os admin/diretor (16), então 50 aprovações gerariam ~800
  linhas e enterrariam o sino. Lição do censo — aviso é pra trabalho PENDENTE, e lote aprovado é
  trabalho FEITO.
- **Não é mais permissivo que o manual**: o que o lote recusa continua aprovável na tela, com a
  pessoa vendo os dados. Nada fica inalcançável — fica pendente de gente, que era o pedido.
- Na tela: coluna de checkbox, "Selecionar os N completos", contagem de quantos precisam de
  aprovação manual, `Falta: CPF válido · sexo` **na linha da pessoa**, e diálogo de resultado com
  quem ficou de fora e por quê. `GET /cadastros` passou a anexar `prontidao` por linha
  (informativo — quem decide é o servidor).
- **Medição de 04/08**: os **50 pendentes estavam 100% completos** (CPF, telefone, e-mail,
  nascimento, sexo, termos, nome completo, nenhum duplicado) — o lote resolve os 50 num clique.

## Membresia · limpeza dos nomes que não são pessoa (2026-08-04 · SEM migration)

Pedido do Matheus: *"preciso fazer uma limpa nesses nomes, por exemplo ali que
está escrito nome riscado, claramente não é uma pessoa e veio de importação"*.
Medido antes de tocar: a base tinha **3.924 vivos** e o lixo era **24 nomes**,
dos quais **1** era lixo puro. A limpeza é pequena; o valor foi a triagem.

**⚠️ 5 dos 24 eram PESSOAS REAIS que o meu próprio padrão pegou** — o regex
`pessoa` casa com **sobrenome "Pessoa"**, comum no Brasil: `RENATA ANDRADE
PESSOA DE MIRANDA` (4 grupos, **69 contribuições**), `Carolina Pessoa`
(responsável por 4 crianças no Kids), `Maria Rosa De Oliveira pessoa`,
`Tatiana Pessoa`, e `Vivian … (certo)` (o "(certo)" é anotação da equipe, não
sujeira). **Régua: antes de apagar por padrão de nome, contar os vínculos
operacionais** (vol, next, grupos, batismo, contribuição, kids_resp) — foi isso
que separou pessoa de lixo, não a aparência do nome.

**8 são contas de sistema e NÃO foram apagadas** (decisão: esconder, não apagar):
`totem1-3` e `totem.kids1-4` têm **profile de login `@cbrio.org` apontando pra
elas** — apagar o cadastro quebra o vínculo do login do totem; e
`Apple Review (Demo)` é a conta proposital de revisão da App Store.
⚠️ **Follow-up em aberto**: elas contam como pessoa na lista de Membresia e nos
totais da base. O conserto certo é um filtro de exibição, não `deleted_at`.

**11 apagados** com `app_soft_delete` (backup em
`scratchpad/backup_membresia_sem_nome_20260804.json` · desfaz com
`app_restore`): `. f` · `Anônimo 1/2/3` · `(nome riscado - Guadelupe)` ·
`Josm... (ilegível)` · `Dianevieira26@gmail.com` (o nome era o e-mail) ·
`22 pessoas -` · e os 3 do app sem nome preenchido (`5rr9697fp4`,
`sy9p84mryx`, `pollyekley7788`).
- ⚠️ **Os 3 do app têm login e 2 têm push token ativo** (um criado no mesmo dia).
  O Matheus autorizou apagar sabendo disso; se alguém reclamar de acesso,
  `select app_restore('mem_membros','<id>')` resolve.
- ⚠️ **O histórico do Next sobreviveu de propósito**: `next_matriculas.nome` e
  `next_inscricoes.nome` são **NOT NULL**, então as 6 matrículas do backfill de
  listas manuscritas continuam existindo com o nome próprio. Apagar o cadastro
  **não** apagou a presença — conferido depois.
- ⚠️ **`22 pessoas -` era linha de planilha que o import virou pessoa**: ligada a
  um `batismo_inscricoes` cujo nome é literalmente "22 pessoas", realizado em
  26/01/2025. Decisão do Matheus: *"o número de batismo você mantém"* — então
  **só o cadastro de pessoa foi apagado** e a linha do batismo ficou intacta
  (`batismo_inscricoes.deleted_at` não foi tocado). Conferido: **226 batismos
  realizados em 2025**, o mesmo de antes. A contagem de batismo não faz join com
  `mem_membros`, então soft-delete de pessoa não a afeta.

## Cuidados · Visitas e Atendimentos ganhou visão POR PASTOR (2026-08-04 · SEM migration)

Pedido do Matheus: "clicar no pastor e ver os atendimentos dele" + melhorar o
filtro de data. Toggle **Por pessoa | Por pastor** no `TrilhaPessoas`; as duas
visões leem o MESMO `pessoas` já carregado (`GET /cuidados/trilha`), então trocar
não faz round-trip e as contagens não podem divergir — a condição de filtro virou
uma função só (`casaFiltros`), usada pelos dois lados.

- Na visão por pastor o filtro **"Quem atendeu" é escondido**: ali o recorte por
  responsável É a própria lista, e deixá-lo ligado mostraria um card só sem
  explicar por quê.
- **Visão por PASTOR é o DEFAULT da aba** (2ª rodada · 04/08): o uso real é a
  liderança olhando o próprio acompanhamento; achar uma pessoa específica tem o
  campo de busca, e a trilha dela fica a um clique dentro do card do pastor.
- **⚠️ Layout do período · foram DUAS causas, e a 1ª correção só pegou uma.**
  1. `Label` do shadcn é `<label>` (inline) e o `DatePicker` é um `Button`
     inline-flex — `space-y-1` não empilha dois inline, eles fluem na mesma linha.
     Daí as labels "De"/"Até" aparecerem COLADAS ao lado do calendário. Resolvido
     com `block` na label.
  2. **O que sobrou depois disso**: o Button do DatePicker tem `whitespace-nowrap`
     e o span do placeholder é `flex-1` **sem `truncate`**, então texto que não cabe
     **transborda pra fora do botão** e passa por cima do vizinho — o "até" ficava
     escrito por dentro do "Selecione a data". Com `w-[142px]`, sobravam ~94px de
     texto pra uma frase de ~110px.
  **Régua:** ao encaixar `DatePicker` em espaço estreito, encurtar o `placeholder`
  (aqui virou "Início"/"Fim", já que o grupo tem label própria) **e** medir a
  largura contra `w − px − (ícone + mr-2) − (X de limpar, quando há data)`. O
  `overflow-hidden` no botão é só cinto de segurança: ele CLIPA em vez de invadir o
  vizinho, mas não faz o texto caber.

⚠️ **`responsavel` é TEXTO LIVRE e isso limita a feature.** O form usa `<Input>`,
não select do catálogo `cui_responsaveis` — que EXISTE, é gerenciável na UI e tem
"Wesley Ramos" cadastrado. Resultado medido em 04/08: o mesmo pastor em **4
grafias** ("Pr. Wesley B. Ramos" 6 · "Pr. Wesley Barros" 2 · "Wesley Barros"
dentro de duplas · "Wesley Ramos" no catálogo), então a visão mostra **6 cards
para ~4 pessoas** e o total real dele (12) fica partido.
- **NÃO fundimos grafias** — casar "Wesley B. Ramos" com "Wesley Barros" é
  adivinhar identidade, o que a lei do Contrato de porta proíbe.
- O que É mecânico e foi feito: **separar DUPLA** (`X e Y`, `X, Y`, `X / Y`,
  `X & Y`) em pastores distintos. Visita conjunta conta pros dois, por isso o card
  diz **"participou de N"**, não "fez N" — e a soma dos cards (19) fica MAIOR que
  o total de atendimentos (15) de propósito. O dialog mostra "com: <campo
  original>" na linha do atendimento conjunto.
- **Correção de raiz FEITA no mesmo dia** (decisões do Matheus em 04/08):
  - **Campo virou seleção MÚLTIPLA do catálogo** (`RespSelector`, pílulas) — texto
    livre acabou, grafia nova não nasce mais. Marcar 2+ é suportado: visita em dupla
    conta pros dois. Guarda o NOME em lista `", "`-separada, **não id**: é o padrão
    do módulo (essas pessoas não logam, o catálogo é por nome, e renomear propaga).
    Trocar pra id exigiria satélite polimórfica (visita × acompanhamento) e deixaria
    os dois lados do módulo com réguas diferentes.
  - **Nome legado fora do catálogo é PRESERVADO** e aparece como pílula marcada com
    `*` (caso da "Léia Serpa"). Sumir com o nome de quem já atendeu seria perder
    histórico pra ganhar arrumação.
  - **Grafias do Wesley consolidadas** — "Sim, tudo Wesley Ramos", confirmado por
    ele; eu NÃO decidi isso. Resultado: de 6 cards pra **4 cards / 4 pessoas**, com
    os 12 atendimentos dele juntos. Backup em
    `scratchpad/backup_cui_visitas_responsavel_20260804.json`. "Marcelo Soares"
    entrou no catálogo (pessoa distinta e real — supervisor-jornada, não variação de
    grafia). **"Léia Serpa" NÃO foi tocada**: pode ou não ser a "Léia" inativa do
    catálogo, e isso é identidade — fica pendente de confirmação dele.
  - ⚠️ **Cascata de rename estendida a `cui_visitas`** (antes só `cui_convertidos`).
    Não dá pra usar `.eq()` como no convertido, porque o campo guarda LISTA: a troca
    é por **token exato**, read-modify-write. `replace()` de substring renomearia
    "Léia" dentro de "Léia Serpa", que é outra pessoa. É best-effort e devolve
    `renomeados_visitas` — o catálogo e os convertidos já foram renomeados com
    sucesso quando ela roda, então derrubar a resposta ali esconderia o trabalho
    feito.

## ⚠️ Entradas · ação de fila NÃO refaz a busca (2026-08-04 · SEM migration)

Reclamação do Matheus: "quando faço qualquer ação, demora pra atualizar, quero
algo fluido". Eram **~10s por clique** em Possíveis duplicidades.

**Causa:** cada ação (fundir / não é a mesma pessoa / adiar / reativar) chamava
`invalidateQueries` em `['next-batismo','duplicados']`, e o `GET /duplicados`
**RECALCULA a fila inteira** — pagina a base viva, forma candidatos por CPF,
telefone, e-mail, nascimento e blocos de nome, e aplica a `duplicidadePolicy`.
Pior: as ações de resolução invalidam também o **cache de 10 min do backend**,
então nem o `/resumo` voltava barato (ele recomputa `dup` também).

- **A régua:** a ação já foi confirmada pelo servidor — o par só precisa **SAIR da
  lista** (`setQueryData`) e o contador descer 1. **Nenhum refetch.** Recálculo de
  verdade continua no botão "Recarregar", que é explícito. De ~10s pra ~300ms.
- ⚠️ **Fundir remove MAIS de um par**: fundir A em B faz A deixar de existir, então
  todo outro par que cite A ficou órfão e sai junto — clicar num deles daria erro
  no servidor. Por isso `removerPares` filtra por `merge_ids`, não pelo `par_id`.
- ⚠️ **Fila oposta usa `refetchType: 'none'`**: marcar stale sem buscar. Recalcular
  a fila que a pessoa não está vendo pagaria exatamente os 10s que estamos
  evitando; ela recomputa quando a aba abrir.
- No `IdentidadePendenciasPanel` a mesma régua vale, com uma exceção: quando o
  `confirmarCpf` devolve conflito o servidor **abre uma pendência nova**, que a
  lista local não tem — só nesse caminho o refetch é necessário.
- **Filtro por CPF na fila de identidade** (pedido do mesmo dia): são chips
  separados de propósito, porque a distinção é de RISCO — `origem_id` começando
  com `cpf:` significa que a INSCRIÇÃO trouxe CPF (chave mais forte, ligar é
  seguro · 16 casos em 04/08); "só no cadastro" (~108) casou por telefone+nome, e
  telefone é compartilhado em família. Juntar os dois num "tem CPF" esconderia
  justamente a diferença que decide se pode ligar sem conferir.

## ⚠️ Entradas · "tem CPF" ≠ "achou PELO CPF" · e o lote (2026-08-05 · migration `20260805120000`)

Pedido do Matheus na aba **Conflitos de CPF**: *"gostaria que tivesse a
funcionalidade para eu marcar todos e aprovar, e ajeite esse bug, pois mesmo eu
marcando o filtro de mostrar só quem tem cpf preenchido, ele mostra pessoas que
não tem cpf preenchido. Pois quero ligar o cadastro em massa de todos aqueles
que tem cpf preenchido já."*

**O filtro não estava errado na conta — estava errado na PERGUNTA.** O chip lia
`origem_id`, que é a **chave da pessoa órfã** (`chavePessoa`: cpf > tel > nome).
`cpf:...` ali significa que **a INSCRIÇÃO trouxe CPF** — não que o candidato foi
achado por ele, e muito menos que o cadastro tem CPF. Caso do print (medido):
**Ana Luisa Dib Silvestre** — inscrição de batismo com CPF `194.117.357-89`,
candidato achado **por telefone+nome**, cadastro **sem CPF nenhum**. Ela entrava
em "Só com CPF" e o card mostrava `—`, porque **a tela só exibia o lado do
CADASTRO**: o CPF que a pessoa digitou não aparecia em lugar algum.
Das 7 pendências com chave `cpf:`, **4 casaram por telefone+nome/nome** — e a
tooltip prometia *"chave mais forte que existe, ligar é seguro sem conferir
nome"*. Era a tooltip a parte perigosa, não a contagem.

- **`avaliarForcaOrfa(insc, cad)`** (`services/inscricaoOrfas.js`) responde a
  pergunta certa: *este cadastro é essa pessoa?* Régua = os ramos do **matcher
  canônico**: CPF da inscrição igual ao do cadastro, ou **telefone igual +
  NOME COMPLETO idêntico**. ⚠️ Nada aqui é mais frouxo que o que já liga sozinho
  em toda porta; o que é mais frouxo — **primeiro nome igual + telefone**, que o
  enfileiramento aceita pra SUGERIR — fica fora, porque é exatamente mãe/filha
  no telefone da casa. Mutation-testado em `inscricaoOrfas.test.js`: afrouxar a
  comparação de nome deixa o gate vermelho.
- **2 VETOS, e vêm ANTES das evidências fortes**: nascimento conferível e
  divergente (contradição — nenhuma outra evidência compra de volta) e **CPF
  divergente dos dois lados**. Sem essa ordem, CPF diferente + telefone/nome
  batendo cairia no ramo forte, ou seja, escolheria a evidência que convém.
- **A tela mostra os DOIS lados** (`InscricaoBox` "O que a pessoa preencheu" ×
  "Cadastro candidato") + selo da força. É a correção de raiz do "mostra gente
  sem CPF": o CPF existe, é da inscrição, e agora aparece.
- **Chips**: rótulos passam a dizer de QUAL lado é o CPF ("CPF em algum lado" /
  "CPF na inscrição") e ganharam a ressalva na tooltip. Ficam porque servem aos
  **218 `cpf_para_confirmar`**; quem responde "dá pra ligar?" é o chip novo
  **"Pode ligar em lote"**.
- **`POST /identidade-pendencias/ligar-lote`** (nível 3 · teto 100): `ligarInscricaoCore`
  extraído (padrão `aprovarCadastroCore`) e o lote **REAVALIA a força no
  servidor** — o payload diz *quais*, nunca *se pode*. **Sequencial** (cada
  ligação passa pelo matcher e pode consolidar CPF tardio; em paralelo, duas
  pessoas da mesma família correriam no matcher juntas). `lerLinhasOrfas` roda
  **uma vez** pro lote. **UM aviso agregado** (lição do censo).
- ⚠️ **Chave morta é DECLARADA**: pendência cujas inscrições já foram ligadas
  mostra "Nada a ligar" em vez do botão que só devolveria 409. O Matheus passou
  **110 pendências na mão em 05/08** — clique que erra é caro.

**Cobertura honesta, medida em 05/08 (67 pendentes de `inscricao_sem_vinculo`):
20 vão em lote** (23 linhas de inscrição) · **40 seguem manuais** (a maioria
primeiro-nome-só + telefone) · **7 com chave morta**. Não são os 157 do chip
antigo — aquele número contava "CPF em algum lado", e CPF que não participou do
match não prova nada sobre ser a mesma pessoa.

### ⚠️ A trilha do "Ligar ao cadastro" nunca existiu (CHECK engolido)

Achado ao construir o lote: `entradas_resolucoes_acao_check` **não tinha**
`inscricao_vinculada`, então todo INSERT da trilha violava 23514 e o erro era
engolido pelo `console.warn` de `registrarResolucaoEntrada` (que só propaga se a
mensagem casar `/entradas_resolucoes|schema cache|does not exist/`).

Medido: **134 linhas** em `mem_identidade_observacoes` com origem
`fila_identidade%` (última 05/08 13:36) — as ligações **aconteceram de verdade**
— contra **ZERO** `acao='inscricao_vinculada'`. Ou seja: 134 vínculos de pessoa
criados por decisão humana, e a pergunta "quem ligou esta inscrição a este
cadastro?" sem resposta. Migration `20260805120000` acrescenta
`inscricao_vinculada` e `inscricao_vinculada_lote` (ação **própria** pro lote: a
decisão "ligou 20 confiando na régua" é diferente de "olhou os dois lados e
ligou", e compartilhar rótulo apaga a distinção). **Não reescreve o passado** —
as 134 seguem sem trilha, porque não há de onde tirar autor/momento.
⚠️ Régua que fica: **ação nova no backend precisa entrar nesse CHECK**, e
`registrarResolucaoEntrada` engolir erro significa que a falha aparece só quando
alguém for auditar.

## ⚠️ Totem · IDENTIDADE DE ESTAÇÃO (2026-08-05 · migrations `20260805130000` + `20260805130100` · PR #2291)

Fase 0 do pagamento presencial em inscrições (plano completo: totem com Pix →
provider TEF → agente com a DLL → conciliação → dinheiro em espécie). Esta leva
**não toca em dinheiro**: entrega só a identidade do equipamento, que é
pré-requisito de tudo o resto — o totem vai **receber dinheiro** e hoje não há
como saber QUAL totem cobrou.

**A troca:** a autenticação de totem era **conta de e-mail/senha por
computador** (`20260703160000_totem_membro_kiosk.sql`) — senha compartilhada num
PC de hall, sem revogação por dispositivo. Agora o totem de inscrições usa
credencial de EQUIPAMENTO: pareamento por código de uso único (8 caracteres,
alfabeto sem O/0/I/1, 15 min, queimado no 1º uso) → segredo `tk_<64 hex>`
guardado **só como sha256**, revogável individualmente.

- **`totem_estacoes`** (genérica: `finalidades text[]` serve inscrições agora e
  Kids/Membro/Voluntariado por adição) + **`totem_estacao_tokens`**
  (`tipo IN ('pareamento','dispositivo','agente')` · `linhagem` sobrevive à
  rotação e detecta clone). Campos de pinpad (`tef_*`) e impressora já na
  estação — a estação É o lugar físico com PC + pinpad + impressora, e com duas
  tabelas haveria duas verdades sobre "qual maquininha é essa".
- **Atribuição**: `pag_cobrancas.estacao_id`, `inscricoes.totem_estacao_id`,
  `inscricao_consentimentos.totem_estacao_id`. **Coluna, não `metadata` jsonb**
  — a conciliação do presencial é `GROUP BY estacao_id`, e em JSON isso é scan.
- Backend: `services/totemEstacao.js` · `middleware/totemEstacao.js` (header
  **dedicado `x-totem-token`**, NUNCA `Authorization`) · `routes/totem.js`
  (`/parear`, `/eu`) · gestão em `routes/inscricoes.js` (ver 1 · parear/revogar
  **4**). Front: `/inscricoes/totens` (link no cabeçalho do módulo) e
  `/totem/inscricoes` (**rota pública** · quem autentica é o equipamento).

⚠️ **NÃO generalizar `kids_estacoes` — e não "consertar" a inconsistência dela.**
Ela está amarrada ao Kids (`sala_id`, FKs vivas de check-in de MENOR) e o modelo
de token dela é o anti-padrão: UM token, em TEXTO PURO, na própria linha, numa
tabela cujo RLS deixa qualquer `authenticated` fazer SELECT — uma leitura
entrega a credencial de todos os totens. O pareamento planejado em
`20260521220000` **nunca foi implementado** (`grep parear` em `backend/` e `src/`
= zero; o front manda `estacao_id: null` e o backend engole o erro de FK
regravando null). A coluna ganhou COMMENT de depreciação; a adoção pelos outros
totens é fase futura (`kids_checkins.totem_estacao_id` nullable).
⚠️ `src/pages/atlas/atlas.html:418` e `docs/quiosque-lounge-identidade.md` §15.5
**descrevem como vivo** aquele pareamento inexistente — corrigir quando alguém
passar por lá.

⚠️ **Segurança, sem maquiagem: o token é bearer e extraível.** Fica no
`localStorage` de um PC de hall público; 20 segundos de acesso físico e alguém
sai com ele. O desenho faz o token roubado valer quase nada — autoriza 2
endpoints, **nunca** passa por `authorizeModule`, não popula `req.user`, não lê
lista de gente e não faz `cpf-lookup`. **É REDUÇÃO de risco**: a conta de
quiosque do `/totem` tem `membros-totem` no `ROUTE_MODULE_MAP` (`auth.js:56`),
ou seja uma sessão roubada de um PC do hall **hoje lê PII de membro**.
Mitigações: `ip_permitidos` (fail-closed), revogação em ≤60s (TTL do cache
espelhando `authUserCache`), e **nenhuma PII em storage em momento nenhum**.

⚠️ **NÃO expor `cpf-lookup` ao token de estação** (vai ser pedido, pra
pré-preencher membro): transforma token roubado num oráculo CPF → nome/telefone
da igreja inteira, de graça, e o ganho são 4 campos. Se for pedido, o caminho
seguro é POSSE FÍSICA (QR da carteirinha ou o reconhecimento facial que já
existe) devolvendo prefill one-shot amarrado à estação — com os consentimentos
recolhidos SEMPRE (consentimento anterior não é consentimento deste evento).

- **Régua PURA em `backend/utils/totemCerco.js`** (cerco de IP + alfabeto) pra
  entrar no gate. `src/test/totemCerco.test.ts` (16 casos) é **mutation-testado**:
  trocar o `return false` do IP incomparável por `return true` deixa 2 testes
  vermelhos — é essa mudança, de boa-fé, que transformaria o cerco num enfeite
  (bastaria o cliente chegar por IPv6). O cerco é **IPv4 e fail-closed** por
  decisão declarada.
- ⚠️ **Cerco de IP é conferido a CADA request, nunca no cache**: o cache guarda a
  linha do token, não a permissão daquele chamador.
- ⚠️ **Falha de INFRA na resolução do token devolve 503, não 401**: 401 fez o
  front apagar o pareamento, e desparear o totem por instabilidade de banco
  exigiria voluntário repareando no meio do culto. `ip_nao_permitido` também
  **não** limpa credencial (a credencial está boa; a rede é que está errada).
- ⚠️ **Queimar o código de pareamento vem ANTES de emitir**, condicionado
  (`.is('usado_em', null)`): é o UPDATE que serializa duas tentativas
  simultâneas. Emitir primeiro deixaria dois dispositivos pareados com um código
  de uso único. Conferido em transação revertida: 1ª tentativa 1 linha, 2ª **0**.
- Aplicadas e conferidas **no catálogo** (não no `success: true`): 3 FKs com
  `convalidated = true` · `totem_estacao_tokens` **sem nenhuma policy para
  `authenticated`** · 6 recusas de CHECK/UNIQUE validadas.

### ⚠️ O gate de deploy tem 8 passos, e o vitest é UM deles (lição de 05/08)

O deploy do #2291 **falhou** em `test:inscricao-portas` e travou a publicação
(inclusive de terceiros; produção seguiu no deployment anterior). Eu havia
rodado `npm test` (vitest · 341 verdes) e concluído que o gate estava coberto —
os outros **7 passos são scripts node** (`test:inscricao-contrato`,
`test:inscricao-portas`, `test:inscricao-orfas`, `test:inscricao-qr`,
`test:censo`, `test:nome-email`, `test:duplicidade`) e não passam pelo vitest.
**Rodar os 8 antes de mergear** (`.github/workflows/deploy-vercel.yml`).

O guarda que pegou foi o **App.tsx → catálogo** de `inscricaoPortas.test.js`,
que existe pra impedir porta de inscrição nova entrar sem registro: as rotas
casam com `inscri|inscrever|apresentacao`. Corrigido em #2293 —
`/totem/inscricoes` e `/inscricoes/totens` entraram em **`ROTAS_INTERNAS`**, não
no catálogo, porque `catalogoPublico()` alimenta o inventário **com link/QR pra
compartilhar** e o quiosque só funciona em dispositivo pareado (um "copiar link"
ali entregaria URL que não abre em lugar nenhum).
⚠️ **REVISITAR NA FASE 1**: quando o totem passar a inscrever de verdade, ele
vira porta (presencial) e precisa aparecer na view unificada e no inventário
como entrada própria em `PORTAS_INSCRICAO` (`escritores: ['inscricoes']`).

**Pendente da Fase 0** (não é código): pareamento exercitado ponta a ponta no
navegador — não há credencial de service role local pra subir o backend. Validar
cadastrando um totem em `/inscricoes/totens`, gerando o código e digitando em
`/totem/inscricoes`.

## ⚠️ Inscrições · `null` em coluna NOT NULL derruba o UPDATE inteiro (2026-08-04)

A Ariel não conseguia salvar edição de evento. Erro real no runtime da Vercel:
`null value in column "pagamento_expira_horas" violates not-null constraint`.
O form mandava `null` nesse campo sempre que o pagamento estava DESLIGADO — logo
**a edição de qualquer evento sem pagamento falhava com 500**, e levava embora
todos os outros campos que a pessoa havia editado (UPDATE é atômico).

- **A régua:** em coluna NOT NULL, `null` do cliente significa "não informado",
  **nunca "apagar"** — apagar é impossível. `CAMPOS_EVENTO_NAO_NULO` (6 colunas:
  `tem_sorteio`, `premios`, `checkin_ativo`, `pagamento_ativo`,
  `pagamento_expira_horas`, `juros_repassados`) descarta o null no POST e no PUT.
  Coluna nullable segue aceitando null, porque limpar é edição legítima.
- Lista conferida no catálogo (`is_nullable='NO'`), não decorada. Coluna NOT NULL
  nova entrando na whitelist tem que entrar nesse Set também.
- ⚠️ Diagnóstico veio do `get_runtime_errors` da Vercel, não de tentativa e erro:
  o handler devolve 500 genérico ("Erro ao atualizar evento") e o motivo real só
  existe no log. Para bug de save relatado por usuário, olhar lá primeiro.

## ⚠️ LEI · trocar a KEY de um campo de formulário ORFANA resposta (2026-08-03)

Incidente: o Matheus abriu uma inscrição do Patrocinadores do Celebra e o modal
mostrou **"—" em todas as 7 respostas**. O dado estava intacto em
`inscricoes.dados` — o que quebrou foi o VÍNCULO pergunta↔resposta.

**Causa:** `sanitizeCampos` (routes/inscricoes.js) testava
`/^c_[a-z0-9_]+$/` e, para toda chave que não casasse, chamava `novaKeyCampo()`.
Os eventos migrados do Celebra guardam a pergunta com chave em **formato slug do
rótulo** (`nome_da_empresa_negocio`), que não casa com aquele padrão. Então, na
PRIMEIRA vez que alguém abriu e **salvou** o evento no construtor (30/07 11:58),
as 7 chaves foram trocadas de uma vez e as 15 respostas ficaram órfãs.

⚠️ **O mesmo estava ARMADO para o "Celebra 2026"** (114 inscrições · evento em
29/08): a chave dele (`em_qual_ministerio_voce_serve`) também é slug, e as
respostas só continuavam casando porque **ninguém havia salvado aquele evento
pelo construtor**. Um clique em Salvar teria orfanado as 113.

- **A lei:** chave existente é **PRESERVADA byte a byte**. Chave nova só quando
  não existe nenhuma. **NUNCA derivar/normalizar a chave a partir do label** — o
  comentário do `novaKeyCampo` já dizia isso; a régua é que estava estreita demais
  e regenerava o que devia preservar.
- **`backend/utils/campoKey.js`** é a fonte única: `keyCampoPreservada()` aceita
  qualquer chave em `[a-z0-9_]{1,60}` (charset conferido contra o banco vivo — as
  **15** chaves de formulário de `insc_eventos`+`ext_eventos` e as **10** chaves
  presentes em respostas de `inscricoes`+`ext_inscricoes` passam todas).
  `src/test/campoKey.test.ts` (7 casos) é **mutation-test explícito**: voltar a
  exigir prefixo `c_` deixa o gate vermelho.
- **Reparo de dado aplicado** no evento Patrocinadores: as 7 chaves voltaram às
  ORIGINAIS, lidas de `ext_eventos.campos` (a tabela de origem NÃO foi dropada) e
  casadas por rótulo — derivado, não adivinhado. Dry-run antes: 7/7 acharam a
  original e 7/7 tinham resposta gravada. Depois: **15/15 inscrições casam** (era
  0/15). Backup do estado anterior em
  `scratchpad/backup_campos_patrocinadores_20260803.json` (não versionado).
- ⚠️ Se aparecer outro evento com respostas em "—", o diagnóstico é comparar
  `insc_eventos.campos->>'key'` com `jsonb_object_keys(inscricoes.dados)`; a cura
  é buscar a chave original em `ext_eventos`, nunca reescrever `dados`.

## ⚠️ Propostas · `/:id` engolia `/avaliar` e `/mural` (2026-08-03 · SEM migration)

As abas **Avaliar** e **Mural da reunião** não abriam: `GET /:id` é declarado na
linha ~248 de `routes/propostas.js` e as duas rotas LITERAIS vêm depois (~411 e
~468). No Express o primeiro match vence, então `GET /propostas/avaliar` caía no
handler de detalhe com `id='avaliar'`, o PostgREST recusava a comparação contra a
coluna `uuid` (22P02) e a resposta era **400**. Em cascata, nada chegava a
`APROVADO`/`CONSOLIDADO`, então **deliberação, ressalvas, recurso, pós-evento e a
consolidação do ciclo ficavam inalcançáveis** — com o backend inteiro pronto.
Mesma armadilha já registrada aqui para o Grupos ("rota `/kpis` declarada ANTES
de `/:id`").

- **Correção: guarda de UUID no `/:id`** (`if (!UUID_RE.test(id)) return next()`),
  não reordenação. Resolve E **previne recaída**: rota literal acrescentada depois
  passa a ser alcançada sozinha, sem depender de alguém lembrar de declará-la
  acima. Também evita mover um bloco de 60 linhas, que é onde o erro nasce.
- Comportamento provado em app Express mínimo (5.2.1): `/avaliar` → handler de
  avaliar · `/mural` → mural · uuid → detalhe · path desconhecido → 404.
- ⚠️ Só `GET /:id` tinha o problema. `PUT /:id` e `DELETE /:id` não têm rota
  literal declarada depois deles (`DELETE /anexos/:anexoId` vem ANTES).

## Kids · lista mensal de aniversariantes impressa (2026-08-03 · SEM migration)

`GET /totem-kids/aniversariantes?mes=1..12` + seletor de mês/agrupamento no
`KidsHub` + gerador A4 em `src/lib/imprimirAniversariantesKids.ts` (molde do
`imprimirListaPresencaBatismo`: thead repetido por folha, `page-break-inside`).

- **Agrupamento à escolha: por DIA ou por SALA** (decisão do Matheus). A sala é
  DERIVADA da idade em meses (`salaDaIdade`, mesma régua do `sugerirSala`), com o
  catálogo carregado 1× em vez de uma consulta por criança.
- ⚠️ **As faixas de `kids_salas` têm BURACOS** — Berçário acaba em 21 meses e
  Maternal começa em 24, e nada cobre 0–5. Medido em agosto/2026: 68
  aniversariantes, **5 sem sala nenhuma**. Por isso o agrupamento por sala tem o
  grupo "Sem sala definida pela idade" no fim: criança sem faixa não pode
  desaparecer da folha.
- **A lista impressa SAI COM TELEFONE** do responsável (decisão explícita dele —
  quem imprime vai ligar parabenizando). É a ÚNICA lista do sistema que imprime
  PII por padrão: a folha leva aviso âmbar pra não circular e descartar depois.
  Contraste proposital com `imprimirListaInscritos`, onde contato só sai marcando
  a caixa. Mudar isso é mexer só neste arquivo.
- **Idade que a criança COMPLETA**, não a idade de hoje: se o dia já passou no ano
  corrente, o próximo aniversário é no ano que vem. É o número que vai no bolo.
- ⚠️ **Bug de truncamento consertado junto**: o `/dashboard` lia as crianças com
  `.range(0, 999)` e a base passou de mil (**1.023 ativas com nascimento** em
  03/08) — **23 crianças ficavam de fora da lista da semana, em silêncio**. Virou
  `fetchCriancasPaginado`. É a lição do cap de 1000 do PostgREST outra vez: o
  código só quebra quando a base cresce, e sem aviso.
- Idade passou a aparecer **ao lado do nome** na lista de Crianças (antes estava
  na 2ª linha, misturada com o nome do responsável).

## ⚠️ App · entrada de PESSOA sob o Contrato de porta (2026-08-04 · migration `20260804200000`)

Decisão do Marcos: os LÍDERES de grupo são os primeiros a usar o app e é a
chance de fechar o cadastro de quem falta — então **entrar no app passa a
exigir cadastro de gente**, com um **caminho rápido por CPF** pra quem já está
na base. Fecha (na entrada do app) o furo do
`## ⚠️ LEI · o gatilho de auth.users`: medido em 04/08 · **21 cadastros**
`origem_cadastro='auth'` (20 sem CPF/telefone/nascimento · **13 com nome =
prefixo do e-mail** · **1 duplicata confirmada**: Victória Lannes × Maria
Victória Lannes Campos) e **26 das 43 contas do app** apontando pra cadastro
sem CPF.

**⚠️ LEI DESTE FLUXO · CPF IDENTIFICA, NÃO AUTENTICA.** CPF está em nota
fiscal, cadastro de loja, planilha — não é segredo. Vincular a conta só porque
alguém digitou um CPF entregaria a essa pessoa o grupo, os **filhos no Kids** e
o **histórico de contribuição** do dono do CPF. Então: CPF acha o cadastro → o
código vai pro **telefone QUE JÁ ESTÁ NO CADASTRO** (NUNCA pra número digitado
na hora) → quem prova posse é vinculado. Mesma régua de "prova de posse" dos
links do WhatsApp dos líderes.

- **`services/appIdentidade.js`** · `identificarPorCpf` (busca SÓ por CPF —
  aqui não vale o "achou por telefone/nome" do matcher, senão o CPF deixa de
  ser a régua) · `confirmarCodigo` · `completarCadastro` (formulário → matcher
  canônico `acharOuCriarGuardado`, origem `app_onboarding`).
- **Resposta MASCARADA** (`mascararNome`/`mascararTelefone`): quem digita um
  CPF vê "Marcos P. D. de A." e "(21) *****-8249" — nunca nome/telefone
  completo de terceiro. Guarda em `src/test/appIdentidade.test.ts` (8 casos):
  aumentar o que a máscara revela transforma o endpoint em coletor de dados
  com uma lista de CPFs.
- **Tetos**: `limiterStrict` (10/15min por IP) nas rotas de CPF/código +
  **5 envios por telefone/dia** no serviço (o dono do número não pediu nada) +
  6 tentativas de código + TTL 10 min + 1 verificação aberta por conta
  (UNIQUE parcial).
- **Código nunca em claro**: `app_verificacoes.codigo_hash` = sha256(código +
  id da linha como sal). Tabela **só service_role** (nenhuma policy pra
  authenticated — SELECT ali deixaria a anon key ler o alvo de vínculo alheio).
- **Envio direto, NÃO pela fila `whatsapp_envios`**: a fila guarda params em
  texto (código legível no banco) e faz retry/backoff — entrega atrasada de
  código de 10 min é inútil.
- **Fantasma é FUNDIDO**: se a conta estava pendurada num cadastro do gatilho
  (sem CPF/telefone/nascimento **e** nome placeholder/derivado do e-mail), o
  vínculo novo dispara `merge_membros` (⚠️ params com prefixo `p_`) e loga em
  `mem_merge_log`. Falha do merge não desfaz o vínculo — a duplicata sobra pra
  fila das Entradas, que é onde humano decide.
- **`GET /app/identidade/status`** diz o que falta; **`completo` ignora o CPF**
  (recomendado, não obrigatório — ninguém fica fora do app por não ter o
  documento em mãos). No app, `CadastroGate` só redireciona quando o servidor
  RESPONDE que falta algo: falha de rede não prende ninguém na tela.
- ⚠️⚠️ **O CÓDIGO VAI POR E-MAIL, não por WhatsApp** (migration
  `20260804210000`): a Meta **RECUSOU a categoria Autenticação** pra nossa
  conta do WhatsApp Business ("sua conta não pode usar esse tipo de mensagem")
  — e código de uso único NÃO pode ir em template utility (violação de política
  + derruba a nota de qualidade do número que fala com os 87 líderes). Canal =
  `services/email.js` (Graph; Resend só com `RESEND_FALLBACK=1`). Sem canal
  configurado o endpoint devolve `motivo:'sem_canal'` e a tela cai no
  formulário — nunca promete um código que não vai chegar.
  ⚠️ **E-mail COMPARTILHADO em família não serve de prova** (`motivo:
  'email_compartilhado'`): mãe e filho na mesma caixa significaria o filho
  digitar o CPF da mãe, ler o código e ver as CONTRIBUIÇÕES dela. Nesse caso o
  caminho rápido se recusa e a pessoa vai pro formulário, que resolve pelo
  matcher (nome+e-mail) e cai no cadastro DELA.
  ⚠️ Se algum dia a Meta liberar autenticação: o botão "Preenchimento
  automático" exige **nome do pacote + hash de assinatura de 11 chars**
  derivado do certificado do **Play App Signing** (não do keystore do EAS) —
  usar "Copiar código" evita isso e funciona no iOS também.
- ⚠️ Não substitui o gatilho de auth.users (que segue criando cadastro no
  signup) — este fluxo **reconcilia** depois. Trocar o gatilho continua
  dependendo da query no SQL Editor + alinhamento com o Matheus.

## Kids · idade exata, WhatsApp pessoal e gerencial dentro da trava (2026-08-03 · SEM migration)

Três pedidos do Matheus no mesmo dia, todos no Kids.

**1 · Filtro de idade EXATA** em `GestaoCriancas.tsx` (`/ministerial/totem-kids/criancas`).
Eram faixas fixas (`0-2 / 3-5 / 6-8 / 9-12`, em MESES), que não respondem "quantas
crianças de 4 anos eu tenho?". Agora o seletor lista as **idades que existem na
base**, com a contagem de cada uma, derivadas do `idade_meses` que o backend já
manda (`floor(meses/12)`).
- ⚠️ **Não recalcular a idade no cliente a partir de `data_nascimento`**: o filtro
  discordaria da coluna "Idade" da linha, e no dia do aniversário a diferença é de
  um ano inteiro. A fonte é `idade_meses` (`calcIdadeMeses` em routes/totemKids.js).
- ⚠️ Abaixo de 24 meses o `formatIdade` do backend mostra **meses** ("14 meses"),
  então filtrar "1 ano" traz linhas cuja coluna diz "12…23 meses". Está correto; é
  o único ponto em que rótulo do filtro e texto da linha não são idênticos.
- Criança **sem data de nascimento** ganhou opção PRÓPRIA no seletor. Antes ela
  desaparecia em silêncio de qualquer faixa — e é justamente a que a equipe precisa
  achar pra completar o cadastro.
- Segue 100% client-side (o único param que vai ao servidor é `ativo`).

**2 · O botão de WhatsApp da Apresentação de Crianças agora abre o WhatsApp DE QUEM
CLICA**, não o inbox institucional. Era `hrefConversa` (→ `/conversas`); virou
`hrefWhatsapp` (→ `wa.me`), helper NOVO no mesmo `src/lib/conversas.ts`. Decisão do
Matheus: quem fala com a família é a voluntária, pelo aparelho dela.
- ⚠️ **Isto é exceção consciente ao padrão da casa**, que é mandar pro inbox
  interno (`hrefConversa`, usado em Cuidados e afins). Só a Apresentação mudou —
  não replicar sem pedido, senão a conversa deixa de ficar registrada no
  /conversas.
- ⚠️ **`hrefWhatsapp` tem gap conhecido e DOCUMENTADO**: o `55` é condicional (≤11
  dígitos), então **estrangeiro de 11 dígitos leva 55** — o suíço `41765764538` do
  lançamento dos grupos vira `5541765764538`. **Nem lista de DDD desambigua**,
  porque `41` é DDD legítimo de Curitiba; resolver exige guardar o código de país
  separado na entrada. `src/test/hrefWhatsapp.test.ts` (10 casos) **fixa esse gap
  num teste** pra que mudá-lo seja consciente, não acidental.

**3 · Voluntário do Kids alcança o gerencial `/kids` dentro da trava de quiosque.**
`MODULO_TRAVA_PREFIXOS.kids` ganhou `/kids` (antes ficava fora de propósito) + card
"Indicadores e gestão" no `KidsHub`.
- ⚠️ **NÃO é mudança de permissão.** O cargo `voluntario-kids` já tinha `kids`
  nível 3, e `authorizeModule('painel-area', 1)` — o guard dos indicadores — usa
  `ROUTE_MODULE_MAP['painel-area'] = ['kids','ami','bridge','online','producao']`:
  **`painel-area` é routeKey, não slug de módulo** (não existe em `modulos`), então
  quem tem `kids` já passava. O que bloqueava era só a trava de rota.
- ⚠️ **O card no hub é obrigatório, não enfeite**: a trava esconde o menu inteiro
  (`AppShell` não renderiza MegaMenu nem MobileNavSheet quando `rotaTravada`), então
  sem ele o `/kids` fica inalcançável mesmo com permissão. De brinde, conserta o
  "Voltar ao Kids" do `ApresentacaoCriancas.tsx`, que já apontava pra `/kids` e
  ricocheteava em conta travada.
- ⚠️ **NÃO desligar `is_membro_only`** pra resolver isso. Além de derrubar a trava
  (que exige EXATAMENTE 1 módulo), faria aparecer o menu com **Painel CBRio e
  Dashboard Semanal**, que `menuAccess.PUBLICO_TODOS` marca como visíveis a
  qualquer logado. Voluntário do Kids passaria a ver os painéis macro da igreja.
- ⚠️ Corolário do mesmo mecanismo: **dar um 2º módulo a um cargo de quiosque
  DESLIGA a trava** (`slugsComAcesso.length === 1`). Quem precisar ampliar acesso
  de conta travada tem que mexer nos PREFIXOS, não na matriz.

## Dashboard Semanal · acumulado do ano até hoje × anos anteriores (2026-08-03 · SEM migration)

Pedido do Matheus na aba **Mensal**: *"quero ver o acumulado do ano até a data
atual, e comparar com os outros anos no mesmo período, a escolha dos indicadores
deve refletir"*. A aba só respondia "como foi **este mês**" e "mês a mês por
ano"; **nenhuma tela do sistema** respondia "como está o ano até aqui contra o
ano passado até aqui". Bloco novo (`YtdAcumuladoCard.jsx`) entre os filtros e o
gráfico mensal, seguindo Indicador / Culto / Anos comparados — o recorte de
**Meses não se aplica** (o período é sempre 1º de janeiro → hoje).

**⚠️ O corte é por DIA, não por mês fechado nem por ano inteiro.** Os cultos do
ano corrente nascem **pré-agendados até dezembro com frequência 0** (2026 tem 347
linhas em `cultos`, só ~199 até agosto). Somar "o ano" sem corte compararia 7
meses de 2026 com 12 de 2025 **e** inflaria o denominador de cultos — os dois
erros na mesma direção. Vale pra qualquer agregação "do ano" nova neste banco.

### ⚠️ O período é escolhido nos chips **Meses** · `resolverPeriodo` (2026-08-03)

Pedido do Matheus no mesmo dia: *"gostaria que eu pudesse escolher o filtro, para
filtrar o período específico que eu quisesse"*. **NÃO criei um segundo seletor de
período** — os chips **Meses** que já existiam passaram a valer também pro bloco
(antes ele os ignorava). Dois controles de período na mesma tela seriam duas
respostas pra "qual período estou vendo".

`resolverPeriodo({ meses, anos, hoje })` (puro, em `backend/utils/periodoYtd.js`)
traduz a seleção em UM período aplicado igual em todos os anos:

| meses marcados | anos comparados | período resolvido |
|---|---|---|
| jan…dez | inclui 2026 | 1º de jan a **3 de agosto** (parcial) |
| jan…jun | qualquer | 1º de jan a **30 de junho** (fechado) |
| jan…dez | **só 2024 × 2025** | 1º de jan a **31 de dezembro** (fechado) |
| mar, mai, jul | inclui 2026 | só esses 3 meses, somados |

⚠️ **A regra que preserva a comparação justa**: o período só é PARCIAL quando o
ano corrente está entre os comparados **E** os meses alcançam o mês de hoje. Sem
isso, "ano inteiro comparando 2024 × 2025" seria truncado em agosto e jogaria 5
meses de dado fora dos DOIS anos — e "ano inteiro incluindo 2026" compararia 12
meses de 2025 com 7 de 2026. Mês marcado depois do corte é **descartado** (não
há dado pra ele em ano nenhum do recorte).

⚠️ **Fevereiro fechado devolve `dia = 29` de propósito**: quem clampa 29→28 em ano
não bissexto é o `corteDoAno()`, que já é testado pra isso. Duplicar a regra no
`ULTIMO_DIA_DO_MES` daria duas réguas pra decidir a mesma coisa.

⚠️ **Seleção não-contígua (mar, mai, jul) tira o bloco de batismos do ar**, com
aviso: a contagem dele é por intervalo `gte/lte` de datas e incluiria abril e
junho. Total "quase certo" é pior que total ausente. O filtro por mês nos cultos
é conferido **linha a linha** (`mesesNoPeriodo.has(mes)`), porque a janela de datas
da query pega o intervalo inteiro.

⚠️ **Voluntariado só usa o corte por semana ISO quando o período é PARCIAL.**
Período fechado já termina no fim de um mês passado — cortar por semana ali
recortaria o último mês pela metade sem motivo.

**⚠️ Total absoluto e MÉDIA POR CULTO andam sempre juntos.** O nº de cultos no
mesmo período cresceu ano a ano porque a igreja abriu horários (154 em 2023 → 152
→ 186 → **199 em 2026**). Frequência até 03/08: 2024 **58.198** (383/culto) ·
2025 **65.097** (352/culto) · 2026 **63.235** (328/culto) — o total de 2026 quase
empata com 2025 **e a média por culto cai**, leitura que o total sozinho esconde.

- **`GET /dashboard-semanal/ytd?anos=&indicador=&culto=`** lê **`cultos` direto**:
  `vw_dashboard_semanal` perde `cultos.data` no `GROUP BY`, então "até hoje" não é
  filtrável nela (mesmo motivo do `/resumo-mes`). Reusa `colunasCultos()` /
  `somaColunas()` e a exclusão de `has_kids = false` pros indicadores de kids — a
  régua de `/yoy` e `/media-mes`, que **falta no `/mensal`**. Paginado pelo cap de
  1000 do PostgREST. Devolve total, cultos com dado, média por culto, Δ% do total
  E da média, curva acumulada mês a mês e batismos do mesmo período.
- **Voluntariado é a exceção do corte**: vem de `vw_dashboard_voluntariado`
  (check-ins reais), que agrega por semana ISO e **não tem coluna de data** →
  corte = **última semana ISO completa** (a corrente só fecha no domingo; incluí-la
  compararia 1 dia de agosto com 7 dias dos outros anos). Igual em todos os anos,
  então o YoY segue justo. ⚠️ O filtro de **culto não vale** ali: a view agrega por
  BLOCO (`b10c0000-…`), ids que não são os de `vol_service_types` — declarado em
  `avisos` em vez de devolver vazio em silêncio.
- **Ano sem dado é DECLARADO em `avisos`**, não escondido: os check-ins de
  voluntário só começam na **semana 16 de 2026** (zero histórico) e Online DS só
  existe a partir de 2024. Sem o aviso a tela pareceria quebrada.
- **⚠️ "Novos membros" ficou FORA do comparativo, de propósito**: `mem_membros`
  tem `created_at` mínimo em **2026-04-14** (base importada) e `data_membresia` /
  `data_batismo` / `data_conversao` estão **nulas nas 8.049 linhas** — não existe
  histórico pra comparar. O card mensal continua como está. Não "consertar"
  usando `created_at` como data de entrada: mediria o dia do import.
- Batismos entram por `batismo_inscricoes.data_batismo` (status `realizado`) e
  **não passam pelo filtro de culto** (batismo não acontece "num tipo de culto").
  YTD até 03/08: 2024 **143** · 2025 **134** · 2026 **89**.
- **`backend/utils/periodoYtd.js`** = helpers PUROS com o "agora" **injetado**
  (teste que lê o relógio da máquina é o que mordeu no `faixaEtaria.test.ts`).
  15 casos em `src/test/periodoYtd.test.ts`, guardas: (1) o dia vem do **fuso da
  igreja** — às 23h BRT o dia UTC já virou e o corte pegaria os cultos de AMANHÃ,
  que existem com valor 0; (2) **29/02 em ano não bissexto vira 28/02** —
  `'2025-02-29'` é data inexistente e o Postgres recusa a **query inteira**, não
  só a linha, então sem a guarda o comparativo quebraria por completo um dia a
  cada quatro anos; (3) semana corrente só conta quando fecha no domingo.

## Grupos · inscrição de CASAL numa tela só (2026-07-30 · migration 20260730140000)

Decisão do Marcos: em grupo com `mem_grupos.categoria = 'Casais'` (8 hoje,
inclusive o "CURSO ALIANÇA — CURSO DE CURA PARA CASAIS") o formulário público
`/inscricao-grupos` inscreve **os dois cônjuges de uma vez**, com **1 aviso de
WhatsApp pro líder** (os dois nomes) e **a aprovação pelo link decidindo o
casal junto** (idem recusa). A opção aparece **só** nessa categoria.

**Contrato de porta preservado:** cada cônjuge é UM cadastro próprio
(`mem_membros` ou `mem_cadastros_pendentes`) e UM pedido próprio em
`mem_grupo_pedidos` — nunca "dois nomes num campo de texto".

- **Migration `20260730140000_grupos_inscricao_casal.sql`** (aditiva ·
  idempotente): `mem_grupo_pedidos.casal_pedido_id uuid` auto-referência
  (`ON DELETE SET NULL`) + índice parcial + COMMENT. Os DOIS pedidos apontam um
  pro outro (vínculo **cruzado**) → qualquer um dos dois links de aprovação acha
  o par. Nenhuma tabela nova, nenhuma policy tocada.
- **Backend `publicGrupos.js` — extraído, NÃO duplicado:** o trecho
  "pessoa → pedido" do `POST /inscrever` virou a função pura
  **`processarPessoaPedido({ grupo, pessoa, contexto, principalId,
  principalMembroId })`**, que nunca escreve em `res` (devolve
  `{ok:true,pedido_id,…}` · `{ok:true,ja_membro|ja_pedido,…}` ·
  `{ok:false,status,codigo,campo,error}`). Titular e cônjuge usam a MESMA
  função. Ficam INLINE no handler as travas do GRUPO (fechado,
  `aceitando_inscricoes`, temporada, gênero × categoria) — são checadas uma
  vez, não por pessoa.
- **Regras do fluxo:** cônjuge validado com a MESMA régua
  (`services/inscricaoContrato.validarCamposPadrao`), erro volta com
  `campo:'conjuge.<campo>'`; **CPF igual ao do titular é 400** (é a mesma
  pessoa, não um casal — e é isso que torna seguro excluir o par do dedup);
  cônjuge em grupo não-casais é **ignorado em silêncio**; **se o cônjuge falha,
  o titular VALE** (201 com `conjuge:{ok:false,error}` — nunca desfaz o titular,
  nunca 500 com ele gravado).
- **Dedup:** `checarDuplicataInscricao` ganhou `ignorarMembroIds/
  ignorarPedidoIds` — marido e mulher compartilham telefone e e-mail (2 chaves
  fracas = dispara), então sem excluir o par o 2º cônjuge seria engolido como
  "já recebemos um pedido parecido".
- **Notificações:** UM `notificarLiderNovoPedido` com os dois nomes em `{{3}}` e
  os dois contatos em `{{4}}` (template `grupos_pedido_novo_lider_v2` já tinha
  as 5 variáveis · o service ganhou `pessoa.contato` opcional pra sobrescrever
  o {{4}}); `enviarInscricaoConfirmada` roda **por pessoa** (dois telefones,
  cada um gated pelo SEU opt-in · D4); notificação in-app diz "(casal)".
- **Aprovação (`/g/a/<token>`):** `GET /pedido/por-token` devolve `casal` (o
  pedido do cônjuge, só se no MESMO grupo) e a página mostra "X e Y querem
  entrar"; `POST /aprovar` aprova os dois pelo mesmo `aprovarPedidoCore`
  (idempotente: par já aprovado não quebra; par já rejeitado/devolvido/
  encaminhado NÃO é reaberto — aprova só este e informa) e a **recusa devolve
  os dois pra triagem**. Nenhuma validação de token afrouxada (segue amarrado
  ao líder atual + ao pedido).
- **Front `InscricaoGrupos.jsx`:** bloco "Inscrever meu cônjuge junto" no step
  1 quando `categoria === 'casais'` (reusa `Field`/`BirthDatePicker`/máscaras
  já existentes + `lib/inscricao`), erros nas chaves `conjuge.*`,
  **consentimento explícito** de que o cônjuge está ciente e concorda (LGPD ·
  vai como `consentimento_texto` dele) + opt-in próprio de WhatsApp, 1 POST só,
  tela de sucesso citando os dois e destaque honesto quando só a do cônjuge
  falhou.
- **Follow-ups conhecidos:** (1) a aprovação **logada** em `/grupos`
  (`aprovarPedidoCore` direto) decide **um pedido por vez** — o par junto só
  vale no link do WhatsApp; (2) a caixa de entrada não mostra selo de "casal"
  ainda.

## Grupos · busca sem acento + apelido do líder (2026-07-30 · migration 20260730170000)

Caso real: a Patrícia tentou se inscrever no grupo do "Antônio" no domingo e
**nenhum pedido dela existe no banco** — não conseguiu concluir. O líder está
cadastrado como **"ANTONIO MARCO PEREIRA"** (sem acento) e a busca era
acento-SENSÍVEL, então quem digitava a grafia correta não achava o grupo. Ele
também é conhecido como **"Tuninho"**, e não havia busca por apelido.

- **Régua ÚNICA de busca em 2 espelhos** (a filtragem acontece nos dois lados):
  `src/lib/busca.js` (cliente) e `backend/services/busca.js` (servidor) —
  `normalizarBusca` (NFD → tira diacrítico → lower → colapsa espaço → trim),
  `contemNormalizado(alvo, termo)` e `algumContemNormalizado(lista, termo)`.
  ⚠️ **Compara normalizado contra normalizado nos DOIS lados** (termo E alvo):
  normalizar só um não resolve nada. Mudou a regra num arquivo? Mudar no outro.
  Testes: `src/test/busca.test.ts` (acento nos 2 sentidos, cedilha, caixa,
  espaço, NFD×NFC · determinístico, sem depender de hora/locale).
  ⚠️ SÓ pra texto exibido — NUNCA em slug/enum/chave/coluna.
- **Onde já vale:** `publicGrupos.js` `GET /buscar` (filtros `lider_nome` e `q`)
  e `GET /lideres/buscar`; `GrupoSelector` (busca por grupo e por líder);
  `GruposMapView` (busca do mapa); lista de grupos do `/grupos` (admin).
  ⚠️ O filtro de `/lideres/buscar` **saiu do `ilike`** (que é acento-sensível e
  não alcança o apelido) pra JS — são dezenas de líderes por temporada.
- **`mem_membros.apelido`** = "como a pessoa é conhecida na igreja". Cadastrado
  pela equipe no form de edição do membro da **Membresia** (`PUT /membros/:id`
  grava `req.body` direto · o form manda `null` só quando havia apelido antes,
  pra permitir limpar). **Entra na BUSCA sem poluir a EXIBIÇÃO do nome real:**
  `lideres_nomes`/`lider_nome` seguem só com nomes reais; `lideres_busca` =
  nomes + apelidos (é nele que os filtros procuram, com fallback pros nomes pra
  bundle antigo/deploy em 2 etapas); `lideres_exibicao`/`lider_apelido` montam
  "Nome (Apelido)" no cartão do grupo, no balão do mapa e na confirmação do
  grupo escolhido (`InscricaoGrupos`) — é o "ah, é o Tuninho".
- ⚠️ **O `apelido` é selecionado em consulta ISOLADA e best-effort**
  (`buscarApelidos` em publicGrupos.js): se a migration não tiver sido aplicada,
  pedir a coluna faria o PostgREST recusar a query INTEIRA e derrubaria a busca
  de grupos pra todo mundo (lição do `parcelas_max`). Falha ali = "sem apelido
  nesta resposta", nunca busca quebrada.
- **Migration `20260730170000_membros_apelido.sql`** (aditiva/idempotente · sem
  FK/constraint/tabela nova) + seed do caso real (`apelido='Tuninho'` achando o
  id por `upper(btrim(nome))`, só quando `apelido IS NULL`). ⚠️ Numerada 170000
  porque **160000 já estava ocupado** (`..._next_dia_sessao_real_e_semana`).
  NÃO cadastrar outros apelidos por migration — é dado que a equipe preenche
  caso a caso na Membresia.
- **Limitações conhecidas:** o `/grupos/buscar` **autenticado** não devolve
  `lideres_busca`/apelido (a busca lá é acento-insensível, mas não acha por
  apelido); a ficha da pessoa da aba Pessoas do /grupos ainda não edita apelido;
  a Membresia não exibe o apelido no cabeçalho do membro (só no form).

## ⚠️ Página lida por verificador EXTERNO tem que ser HTML estático (2026-08-04)

A verificação da marca no **Google Auth Platform** (projeto `crm-cbrio` — o que
autoriza o "Entrar com Google" do app de membros) foi recusada com dois motivos,
ambos sobre a página inicial declarada no consentimento: *"your home page does
not explain the purpose of your app"* e *"the app name 'CBRio' does not match
the app name on your home page"*. **Verificada ✅ na tentativa seguinte**, com o
conserto abaixo (levou ~3h, não dias).

**A causa não era o texto — era o JavaScript.** O campo apontava para o ERP, que
é SPA: o verificador busca a página **sem executar JS**, recebe o shell vazio do
`index.html` e lê o `<title>` global (`CBRio · Comunidade Batista do Rio de
Janeiro`). Isso é, ao mesmo tempo, "não explica propósito" e "o nome não bate".

- **`public/aplicativo.html`** + rewrite em `vercel.json` (`/aplicativo →
  /aplicativo.html`, **antes** do catch-all do SPA) é a home page do app. Mesmo
  padrão do **`public/privacidade.html`**, que já existia e que o Google sempre
  aceitou — foi justamente essa diferença que revelou o mecanismo.
- ⚠️ **NÃO converter para rota React.** Já foi tentado (PR #2261) e é a versão
  que falha: o conteúdo precisa existir na resposta HTTP. Mesma régua vale para
  qualquer página que um robô de terceiro (Google, Apple, Meta) precise LER.
- ⚠️ **O `<title>` e o `<h1>` são exatamente `CBRio`** — o mesmo string do campo
  *App name* do consentimento e do `expo.name` do `app.json`. **Renomear o app no
  console exige renomear aqui**, senão o motivo 2 volta. O acoplamento está
  escrito no comentário do topo do arquivo.
- Rotas públicas servidas por rewrite estático hoje: `/privacidade`,
  `/aplicativo`. As por rota React: `/suporte`, `/politica-reembolso`.
- ⚠️ **Lição de método (erro meu, registrado):** procurei `"/privacidade"` no
  bundle de produção, não achei e concluí que a página não existia — ela existe,
  como arquivo estático. **Ausência de rota no bundle não prova ausência de
  página**: rewrite e arquivo em `public/` não passam pelo React Router. Para
  saber se uma URL pública existe, olhar `public/` e os `rewrites` do
  `vercel.json` também.
- Pendência conhecida (não bloqueou esta verificação): `cbrio.org`/`cbrio.com.br`
  estão verificados no **Search Console por outra conta Google** ("Play Console
  org"). Se uma verificação futura falhar por propriedade de domínio, é isso — e
  o conserto é adicionar a conta do console como proprietária, não é código.

## ⚠️ Google Tag Manager · SÓ no domínio público, nunca no ERP (2026-07-29)

Gustavo (tráfego pago, parceiro externo) precisava medir anúncio → o site não
tinha **nenhum** rastreamento (conferido no HTML e no bundle de prod: zero
Analytics, zero GTM, zero pixel). Container criado pelo Marcos:
**`GTM-M59RCB34`**, conta Google **`cblab@cbrio.com.br`** (endereço de função
do marketing, registrado como conta Google sem Gmail — a igreja é Microsoft
365). A igreja é dona; Gustavo entra como usuário com permissão *Publicar* no
container (não Admin).

**A LEI:** o GTM carrega **só** em `cbrio.com.br`/`www.cbrio.com.br`. **Nunca**
em `cbrio.org`. Motivo: este bundle serve os DOIS domínios (`SITE_PUBLICO_HOSTS`
em `src/App.tsx:549` → hostname público monta `SitePublicoRoutes`, o resto monta
o ERP). Um snippet solto no `index.html` carregaria o container em toda tela
logada — nome, CPF, telefone, contribuição, dado de menor no Kids indo pra
Google/Meta. Por isso o snippet em `index.html` tem **gate por hostname** antes
de injetar o `gtm.js`, espelhando a lista do `App.tsx`. **Mudou
`SITE_PUBLICO_HOSTS`? Muda a lista no `index.html` também.**

- **Sem `<noscript>` no ERP** (de propósito): o iframe do GTM só serve visitante
  com JS desligado e, sem JS, um SPA nem renderiza — não mediria nada e
  carregaria em `cbrio.org`, exatamente o vazamento que o gate evita. O site em
  Astro (HTML estático, renderiza sem JS) leva o noscript normal.
- **ID hardcoded, não env**: o liga/desliga de qualquer tag vive no painel do
  GTM (é o propósito da ferramenta) — env só somaria um ponto de falha na
  Vercel. Não trocar por `VITE_*` sem motivo novo.
- **SPA**: o GTM não detecta troca de rota sozinho. Contagem de navegação
  depende do gatilho *History Change* configurado pelo Gustavo no painel.
- **Site em Astro** (`~/cbrio-site`, repo `igreja-cbrio/site-cbrio`): mesmo
  container já instalado no `src/layouts/Base.astro` (sem gate — lá o app só é
  público). No cutover do DNS, o GTM sai daqui junto com o `SitePublicoRoutes`.

**Pendente (decisão do Marcos + Gustavo):** conversão de verdade (inscrição em
evento) acontece nas **portas públicas do ERP**, em `cbrio.org` — fora do
domínio público. Medir isso exige GTM nessas rotas específicas, com regra
explícita de não enviar dado pessoal. Não fazer por conta: cada porta pública é
um formulário com PII (ver as 2 LEIs de porta/inscrição acima). Também em
aberto: o domínio já tem **Search Console** verificado por outra conta Google
("Play Console org" · meta `google-site-verification` no `index.html`) e o canal
do YouTube usa uma terceira — consolidar identidade antes de ligar Ads↔YouTube.

## Sweep dos formulários de inscrição · achados e correções (2026-07-28)

Auditoria multi-agente das 7 portas pós-módulo de inscrições (pedido do Marcos).
**P0, P1, P2 e P3 estão TODOS FEITOS** — o diário onda a onda está no legado. O
que sobrou como regra viva:

- ⚠️ **Array de deps de hook avalia NO RENDER** (fix TDZ do reporte do Ariel ·
  PR #2113): const usada em `useMemo`/`useQuery` precisa estar declarada ANTES.
  Verificador determinístico: `npx tsc -p tsconfig.app.json --noEmit` filtrando
  TS2448/TS2454 — o `npx tsc --noEmit` cru **não checa nada** (o tsconfig raiz é
  só references). Padrão latente que sobrou: `publicNext.js` usa
  `turmaAbertaAtual()` antes da declaração, salvo por hoisting de `async
  function` — **não converter pra arrow const sem mover**.
- ⚠️ **Cópias de `cpfValido`/`emailValido` que FICARAM**: `publicDevocional.js`
  (módulo do Matheus — não mexer sem alinhar) e `utils/cpf`, cujo
  `normalizarCpf` **não valida DV** — armadilha pra código futuro. Consolidar
  exige sessão própria.
- ⚠️ **QR impresso vive pra sempre**: `?temporada=` antiga não vence a aberta (o
  form valida o param contra `inscricoes_abertas` e IGNORA temporada fechada).
- ⚠️ **Endereço de membro EXISTENTE não é sobrescrito por form de grupo** — muda
  na Membresia. Só cadastro pendente promovido copia endereço, e só onde vazio.
- ⚠️ O **e2e do Next** foi atualizado pro contrato mas **não foi EXECUTADO**
  (exige app rodando + cria inscrição real).

## ⚠️ Comunicação · os 5 críticos da revisão de 05/08 corrigidos (2026-08-12 · migration `20260812150000`)

Revisão profunda do módulo (05/08 · 3 agentes + verificação manual, achados com
file:line) apontou 5 críticos; Marcos aprovou corrigir. O que mudou:

1. **Leitura do módulo = nível 1** (`routes/comunicacao.js`): o `router.use`
   usava `authorizeModule('comunicacao')` → default **2** do middleware, e
   front/menu/RLS assumem leitura 1 — cargo com comunicacao=1 via as 9 abas em
   403. Escritas seguem com guard próprio (3/4/5).
2. **Aba Bot só aparece pra quem pode**: ela embute telas cujo backend exige
   `whatsapp-admin` (= integracao OU grupos ≥3) — usuário com comunicacao=5 sem
   isso via a aba inteira em 403. Fix é de EXIBIÇÃO (`podeBot` em
   `Comunicacao.tsx`); ampliar o mapa `whatsapp-admin` no auth.js pra incluir
   `comunicacao` é decisão pendente do Marcos (lei "parar e perguntar" de auth).
3. **Deep-link `?telefone=&texto=` ressuscitado**: os redirects de `/conversas`,
   `/admin/whatsapp` e `/admin/conversas-setores` viraram `RedirectComunicacao`
   (App.tsx · preserva a query); `Conversas.tsx` remove SÓ telefone/texto (o
   `setSearchParams({})` apagava o `?tab` e a página voltava pro dashboard);
   `hrefConversa` (usado em ~13 telas) aponta direto pra
   `/comunicacao?tab=conversas&…`; o link de transferência do waInbox idem.
4. **Multi-número (preparo do CBZap)**: o webhook lê
   `value.metadata.phone_number_id`. Número ≠ institucional → **`inboxDireto`**
   (nada de opt-out/triagem/coleta/institucional — personas são do número do
   bot; só pesquisa de satisfação, que é da CONVERSA, + inbox). A conversa
   grava `wa_conversas.phone_number_id` (migration `20260812150000` ·
   **best-effort/isolado** — o inbox funciona sem a coluna, lição do
   parcelas_max) e TODAS as respostas do inbox (`routes/waInbox.js` nova/
   responder/anexo/pesquisa) saem pelo número da conversa via
   `opts.phoneNumberId`, que agora atravessa `whatsappService`/`whatsappSend` →
   `waSender`. A pesquisa 0-5 virou função única `tratarPesquisaSatisfacao`
   (publicWhatsapp.js), usada pelo bot E pelo multi-número. ⚠️ Payload sem
   metadata conta como número do bot (comportamento histórico).
5. **Kill-switch não engole mais mensagem** (`whatsappFila.js`): com CREDENCIAL
   presente + `WHATSAPP_ENABLED` desligado, `enfileirar`/`enfileirarLote`
   REGISTRAM como `pendente` (sai quando religar — o contrato documentado do
   notificarMembro); sem credencial (dev/preview) segue não gravando nada, pra
   ambiente sem WhatsApp não encher a fila que o cron DE PROD drenaria. E o
   cron de agendamentos (`/comunicacao/cron/agendamentos`) só marca
   `ultimo_disparo`/desativa único quando `queued > 0` (antes consumia o
   disparo no vazio) + erro de consulta virou 500 (não mais `ok:true`).

### Lote 2 · médios do atendimento corrigidos (2026-08-12 · SEM migration)

Os médios que morderiam o atendimento real do CBZap, na mesma leva:

- **Thread mostra as 500 mais RECENTES** (`routes/waInbox.js` /mensagens):
  era `asc+limit` — conversa >500 mensagens nunca exibia a mensagem de hoje
  (a conversa é 1 por telefone PRA SEMPRE, então era inevitável). Virou
  `desc+limit+reverse`.
- **Nono dígito não duplica mais conversa**: `mesmoNumeroBR` em
  `services/waInbox.js` (pura · `src/test/waInboxMesmoNumero.test.ts`, 7 casos,
  mutation-testado) — antes de CRIAR conversa, reconcilia pelos 8 últimos
  dígitos (o wa_id da Meta pode vir SEM o 9; match exato criava 2 conversas e
  a janela de 24h abria na errada). ⚠️ Estrangeiro/ambíguo NÃO casa (lição do
  suíço `41765764538` × DDD 41 de Curitiba).
- **Pesquisa de satisfação com CLAIM atômico** (PATCH /conversas/:id): o
  UPDATE `resolvida=true` guardado por `.eq('resolvida', false)` decide QUEM
  transicionou — duplo-clique/2 atendentes não mandam mais a pesquisa 2×.
- **Corrida de criação não descarta mais a 1ª mensagem**: 23505 do
  UNIQUE(telefone) → relê e segue com a linha do vencedor (antes
  `registrarInbound` recebia null e a mensagem sumia).
- **`/comunicacao/custo` paginado com `.order()`** (criado_em + id): range sem
  ORDER BY duplicava/perdia linhas entre páginas.
- **Programadas: PUT valida como o POST** (estado final linha+patch — teto de
  500 telefones valia só na criação) e **reagendar única já disparada volta a
  disparar** (trocar `quando` zera `ultimo_disparo`; recorrente NÃO zera, senão
  dispararia 2× no mesmo dia).

### Lote 3 · mídia RECEBIDA em bucket privado + retenção (2026-08-12 · migration `20260812190000`)

Decisões do Marcos (12/08): mídia inbound privada = SIM · Realtime por área =
**NÃO MEXER ainda** · e a pergunta dele "existe política de apagar depois de um
tempo?" virou a retenção (não existia nenhuma — anexo vivia pra sempre).

- **Bucket `wa-inbox-privado`** (migration `20260812190000` · public=false ·
  nenhuma policy de propósito — só o backend/service_role toca): foto/documento
  que o MEMBRO manda deixa de ter URL pública permanente. A linha de
  `wa_mensagens` guarda o **PATH** (não URL); a thread assina em LOTE por 15
  min na leitura (`createSignedUrls`). ⚠️ **OUTBOUND continua no bucket público
  `wa-inbox` DE PROPÓSITO** — a Meta busca o anexo pelo link no envio; privar
  quebraria o envio de anexo. Histórico antigo (URL http) passa direto.
  Fallback de deploy em 2 etapas: bucket privado ausente → upload cai no
  público (comportamento histórico), nada quebra.
- **Retenção**: `limparMidiasAntigas` (services/waInbox.js) apaga do storage
  anexos com mais de `WA_INBOX_MEDIA_RETENCAO_DIAS` (default **90** · 0
  desliga) e zera `media_url` — **o TEXTO da conversa fica pra sempre; o que
  expira é o ARQUIVO** (o front já mostra o placeholder `[image]`/`[document]`).
  Vale pros DOIS buckets (privado + público). Ordem deliberada: arquivo
  primeiro, ponteiro depois (morrer no meio deixa ponteiro pra arquivo morto,
  que a assinatura trata como null — o inverso deixaria arquivo órfão eterno);
  efeito em blocos de 100 (lei de 04/08). `pathDoBucketPublico` só extrai path
  do NOSSO bucket — URL de outro bucket/externa devolve null e nunca é apagada
  (mutation-testado em `waInboxMesmoNumero.test.ts`).
- **Roda 1×/dia às ~4h05 BRT de CARONA no cron `/comunicacao/cron/agendamentos`**
  (horário) — sem slot novo no vercel.json (45 crons · lição dos pagamentos).
  Cap 400 anexos/dia (backlog drena em dias).

### Reorganização das abas · F1 (2026-08-13 · SEM migration · decisão do Marcos)

Pedido dele: otimizar o uso interno do módulo. 10 abas viraram **6**
(`Comunicacao.tsx` · deep-links antigos caem na aba nova via `TAB_LEGADO`):

- **Disparos** = Programadas ∪ Automáticas com UM filtro (chips Agendadas ×
  Automáticas) — os componentes internos são os mesmos; a fusão é de navegação.
- **Envios absorveu a aba Erros**: filtro de status ganhou `erro`/`falha_meta`
  (`falha_meta` no backend = `failed_at NOT NULL` — envio ACEITO que a Meta
  depois recusou, não é status da fila), Reenviar na própria linha (só
  `status='erro'`, mesma regra de sempre), tooltip do status mostra o motivo,
  e selo de órfãos quando > 0 (`/envios/resumo` ganhou `orfaos` — ⚠️ a coluna
  da tabela é `criado_em`, não `created_at`). O endpoint `GET /erros` segue
  existindo (compat), mas a UI antiga foi removida.
- **Configurações** = Templates · Números · Atendentes · **Tarifas** (o
  backend de tarifas existia desde julho SEM tela — o custo do Dashboard lê
  daqui; edição nível 5).

### Reorganização · F2 (2026-08-13 · SEM migration · decisões do Marcos)

- **COLETA DO BOT APOSENTADA** ("os líderes de integração não compraram a
  ideia — pode inclusive aposentar isso"): `podeColetar = false` no
  `publicWhatsapp.js` (todo mundo cai na persona 1 · o código da coleta —
  Flow do culto, parseConversa, relato de grupos por texto/áudio — fica
  DORMANTE abaixo do bloco; reativar = restaurar `lider && papel ===
  'coordenador'`); `processarFlowReply` registra e descarta reply de Flow
  antigo (`erro: 'coleta_aposentada'`). ⚠️ Os fluxos de grupos por LINK
  (/g/f, /g/c, /g/a, renovação) NÃO são a persona — seguem intactos.
- **AVISOS (broadcast) APOSENTADO**: nem persistia resultado; o caminho é
  Disparos→Agendadas. `admin/Whatsapp.jsx` ficou dormante como tela (header
  documenta); só a `AbaConfig` segue viva (export `WhatsappBotConfig`,
  montada na aba Bot).
- **Aba CONTATOS** (`ContatosTab.tsx` + `GET /comunicacao/contatos`): a
  audiência REAL — membros com `whatsapp_optin=true` + líderes do bot
  (papel implica aceite: líder aprova pedidos por WhatsApp), 1 linha por
  TELEFONE (quem é os dois aparece 1×), cada um com **DE ONDE VEIO** (porta
  do consentimento `inscricao_consentimentos` tipo whatsapp · ou vínculo de
  líder auto-sync com o nome do grupo). Busca acento-insensível
  (`contemNormalizado`), cap DECLARADO de 5k com aviso `truncado`. Gestão:
  toggle de lembretes do líder (endpoints `whatsapp-admin`, botão gated).
- Aba Bot enxugou: Menu do bot + Configuração (2 sub-abas).

### Reorganização · F3 — FLUXOS por opção do menu (2026-08-13 · migration `20260813150000`)

Diagnóstico que motivou (confirmado no código): escolher "1" ou "4" no menu
fazia A MESMA coisa — pede nome → grava área → notifica; a única diferença era
a etiqueta. Agora cada opção de `conversas_setores` carrega o CAMINHO:

- **Colunas novas**: `mensagem_resposta` (confirmação própria · NULL = padrão ·
  o protocolo é acrescentado no fim), `pedir_nome` (false = encaminha direto —
  ex.: oração), `destino_tipo` (`area` | `atendente`) e `atendente_id` (FK
  profiles · lei nº 10: CHECK/FK em bloco próprio, não no ADD COLUMN).
- **Motor** (`whatsappTriagem.js`): `concluirTriagem()` única pros 2 caminhos;
  destino atendente ⇒ a conversa NASCE atribuída (`atribuido_a`) e o aviso vai
  SÓ pro atendente (`targetIds`). ⚠️ `bot_area_pendente` passou a guardar o
  **ID da opção** (2 opções podem apontar pra mesma área com fluxos
  diferentes); conversa em andamento com a ÁREA antiga resolve por fallback.
  `setoresAtivos()` usa `select('*')` de propósito (tolera a migration
  ausente — lição do parcelas_max; sem as colunas, tudo cai no fluxo padrão).
- **Rotas** (`waInbox.js` setores): POST/PUT aceitam os campos de fluxo;
  destino atendente sem `atendente_id` = 400; pré-migration, salvar campos
  de fluxo AVISA e ignora (42703 → retry só com o básico + `aviso` na
  resposta) — nunca silêncio.
- **Tela** (`ConversasSetores.jsx` reescrita · "Fluxos do menu"): cada opção é
  um TRILHO de nós (pessoa escolhe → pede nome? → bot confirma → destino →
  aviso · linguagem do /atlas/fluxograma) + prévia do menu como a pessoa vê +
  editor com os passos na ordem do caminho e prévia ao vivo.
- V2 futura (combinada): sub-menus de 2 níveis, mensagem fora-de-horário
  (escala dos atendentes), opção que envia link/formulário.

### Recibos do CHAT · ✓✓ de verdade (2026-08-13 · migration `20260813190000` · caso da Júlia)

O 1º teste real do inbox (Marcos respondeu a Júlia) expôs a cadeia: a resposta
saiu e o sistema não sabia dizer se entregou/leu. DOIS furos consertados:

- **O chat não gravava o `wa_message_id` do que enviava** (`registrarOutbound`
  nem aceitava o campo) — o recibo da Meta não tinha onde pousar. Agora TODOS
  os outbounds registrados passam o id (respostas/nova/anexo/pesquisa do
  inbox · bot de triagem · agradecimento da pesquisa · institucional).
- **O webhook descartava recibo de mensagem do chat** — agora grava
  `delivered_at/read_at/failed_at/erro_status` em `wa_mensagens` (guardas
  `.is(col, null)` idempotentes · 42703 = migration ausente → vira órfão,
  comportamento antigo) e **`failed` de mensagem de ATENDENTE notifica** o
  módulo conversas (o ⚠ na thread só aparece quando alguém reabre).
- **Thread**: o ✓✓ era DECORATIVO (aparecia sempre). Agora: ✓ aceito ·
  ✓✓ entregue · ✓✓ azul lido · ⚠ não entregue com o motivo (`ReciboMsg`).
- ⚠️ Mensagens de ANTES da migration ficam sem recibo pra sempre (não têm
  wa_message_id gravado) — inclusive a da Júlia.
- ⚠️ Flake conhecido do gate LOCAL nesta máquina: sob carga, ConstrutorPerguntas/
  cronAlcancavel/rpcsCliente falham aleatoriamente e passam isolados — o
  veredito é o CI (runner limpo).

### Contexto completo na thread · citações + automáticas (2026-08-13 · migration `20260813210000` · caso da Júlia parte 2)

Ela respondeu "Esse aqui" + "Obrigada 😊" e o Marcos não entendeu — a tela
escondia o contexto DUAS vezes:

- **Citação (reply)**: ela citou o template com o nome do grupo e o webhook
  descartava `m.context`. Agora todo inbound grava `reply_to_wa_id` (UPDATE
  isolado best-effort — coluna nova NUNCA entra no INSERT da mensagem) e a
  thread resolve o trecho citado pelo wamid — **inclusive quando o alvo é um
  template da fila**. UI: bloco de citação estilo WhatsApp no balão.
- **Automáticas do sistema na thread**: template da fila (confirmação de
  inscrição, aprovação de grupo…) não aparecia na conversa. `GET
  /wa-inbox/conversas/:id/mensagens` intercala `whatsapp_envios` do telefone
  (últimos 60 · match pelos 8 últimos dígitos · corpo legível = `exemplo` de
  `wa_templates` com os `{{n}}` preenchidos pelos params) como mensagens
  sintéticas `tipo='automatica'` com recibos. ⚠️ **Merge SÓ NA LEITURA** —
  nada é gravado; registrar fila em wa_mensagens criaria conversa no inbox
  pra CADA disparo em massa (não fazer).

### Lote 4 · faxina dos médios restantes (2026-08-14 · migration `20260814120000`)

- **Órfãos deixaram de ser write-only**: `services/waStatusReconcile.js` roda
  1×/hora (carona no cron de agendamentos) — casa cada órfão com a fila OU o
  chat com as MESMAS guardas idempotentes do webhook; `failed` que casou
  tardiamente também avisa (`avisarNaoEntregue`); órfão >60 dias sem dono é
  descartado (declarado no retorno do cron).
- **`nao_lidas` atômico**: RPC `wa_conversa_inbound` (migration
  `20260814120000` · só função, não trava tabela) soma no banco — o
  read-modify-write perdia contagem quando 2 mensagens chegavam juntas (o
  download de mídia leva segundos entre o read e o write). RPC ausente →
  fallback no caminho antigo.
- **Busca do inbox com `escapePostgrestValue`** ("Silva, Maria" quebrava o
  `.or()` e virava inbox falsamente vazio).
- **Anexo com `fileFilter`** (o comentário prometia jpg/png/webp/pdf/doc/xls e
  nada filtrava — .exe subia pro bucket público antes de a Meta recusar);
  recusa vira 400 com o tipo no texto.
- **Sino do header gated pelo DESTINO** (`comunicacao`, pra onde ele navega —
  antes `conversas` podia ver o sino e ser quicado) e aponta direto pra
  `/comunicacao?tab=conversas`.
- **Dashboard ganhou "Respostas recebidas"** (inbound do chat na janela) —
  era o pedaço que faltava do requisito original "custo, envios e respostas".

### Lote 5 · C2 — os TEMPLATES que sobravam foram pra FILA (2026-08-14 · SEM migration)

Os envios de template (pagos, proativos) que ainda saíam DIRETO — sem registro,
sem retry no teto da Meta, sem recibo — migraram pra `whatsappFila.enfileirar`:

| Origem | Contexto na fila |
|---|---|
| Devocional diário (`devocionalSender`) | `cuidados.devocional_diario` (o ledger `devocional_envios` segue como DEDUP do item; a ENTREGA é da fila · motivo `na_fila` = sai depois) |
| Fallback de template dos grupos (`enviarComFallback`) | `grupos.fallback_template` (ok = aceito OU na fila) |
| Automáticas table-driven (`whatsappAuto` modo template) | `auto.<chave>` |
| Kids: resumo do dia + código de retirada ×2 (`totemKids`) | `kids.resumo_dia` · `kids.retirada_codigo` |
| Reenvio manual do cadastro (`membresia`) | `membresia.cadastro_confirmado` (na fila ≠ erro → não responde mais 502) |
| Aprovação fria de solicitação (`solicitacaoWpp` TEMPLATE_COLD) | `solicitacoes.aprovacao_cold` · ⚠️ `queued` TAMBÉM marca 'aguardando' — deixar 'na_fila' faria o próximo despacho enfileirar DE NOVO (2 templates na liberação da cota) |

`whatsappModulo.MAPA` ganhou os donos `cuidados`/`kids`/`solicitacoes` (falha
terminal/failed avisa o módulo certo). O que segue DIRETO de propósito: textos
de sessão do bot (grátis na janela · registrados em wa_mensagens com recibo) e
os envios do chat humano (o atendente vê o erro na hora · 502).

### Interruptor central + lei do template aprovado (2026-08-14 · migration `20260814150000`)

Decisões do Marcos ("na aba de disparos automáticos eu não consigo cancelar
isso" · "vamos trabalhar com todas que tem template aprovado"):

- **Interruptor central**: `whatsapp_config.disparos_off` (jsonb · ids do
  catálogo `comunicacaoAutomaticas`) + `services/comunicacaoDisparosOff.js`
  (cache 60s · **fail-open**: coluna ausente = tudo ligado). Os 4 crons
  consultam ANTES de montar público (aniversário, batismo-lembrete,
  frequência-mensal de grupos — 2º interruptor, o kill-switch de grupos segue
  — e devocional). `PATCH /comunicacao/automaticas/:id` (nível 3) + Switch nos
  cards da aba. ⚠️ Desligar NÃO é caminho de envio — a nota "100% leitura" do
  serviço vale pro ENVIO; o freio central é decisão do dono (14/08).
- **Lei do template aprovado (na FILA)**: `templateBloqueado()` em
  `whatsappFila` — bloqueia template com status **REJECTED/PAUSED/DISABLED**
  no espelho `wa_templates` (enfileirar recusa · lote conta
  `bloqueados_template` DECLARADO · pendente antigo vira erro permanente com
  aviso). ⚠️ **PENDING/ausente PASSA de propósito**: a medição de 14/08 pegou o
  espelho 2 SEMANAS velho (v2 dos grupos como PENDING, 2 templates nem
  constavam) — uma trava ingênua teria matado os fluxos dos grupos. Por isso o
  espelho agora **sincroniza de hora em hora** na carona do cron de
  agendamentos (best-effort).
- Executado direto em prod (14/08, registrado): sync do espelho (28 templates,
  v2 = APPROVED) e `whatsapp_auto_config.cuidados_aconselhamento` → ativo=false
  (era um TESTE ativo · reversível).
- Estado dos 3 dormentes que o Marcos pediu pra matar: **relatórios de culto**
  (persona aposentada 13/08) · **devocional** (guarda de template não-aprovado
  + interruptor) · **retirada kids** (template REJECTED → a fila bloqueia; pra
  ligar, criar `_v2` na Meta e trocar a env).

⚠️ Ficam da revisão (médios · ainda abertos):
**Realtime sem filtro por área —
decisão explícita do Marcos (12/08) de NÃO mexer por ora** · `nao_lidas`
read-modify-write · custo cego aos ~15 call sites fora da fila · 2 `is_default`
possíveis em wa_numeros (e nada lê a tabela) · aba Conversas exige módulo
`conversas` (matrizes editáveis separadamente) · badge do header gated por
`conversas` navegando pra rota gated por `comunicacao` · dashboard sem
"respostas recebidas". Lista completa com file:line na memória da sessão de
05/08 ("revisão da comunicação").

## ⚠️ Módulo de Comunicação (WhatsApp central) · handoff pro MATHEUS (2026-07-28)

Decisão do Marcos (bloco C da revisão estrutural): fundir Conversas + Menu das
Conversas + Bot WhatsApp num módulo central com números, templates, mensagens
automáticas/programadas, chat ao vivo, erros, atendentes e dashboard de
custo/envios/respostas. **Contexto COMPLETO (inventário verificado no código +
fases C0–C5 + decisões em aberto): `docs/modulo-comunicacao/contexto-e-plano.md`.**
Regra de ouro: começar pelo **C0** (capturar `value.statuses` no webhook — sem
isso não existe relatório) e NÃO reescrever o chat de /conversas.
- **Porta 5 · Next (2026-07-28 · migration `20260728230000` = M7):** nome vira
  campo único (split no server, tolera payload antigo); **nascimento
  obrigatório+validado SÓ em `POST /inscrever`** — o walk-in do totem
  (`/checkin/:token/walkin`) segue "nunca travar o atendimento"; sexo
  obrigatório liga o writer da coluna (canônico `masculino|feminino` + CHECK);
  endereço opcional (coluna nova); termos+optin na satélite + `GET /textos`;
  optin agora TAMBÉM persiste na matrícula (`whatsapp_optin/_em`);
  `ja_voluntario` passou a checar por membro além de CPF; **saiu o seletor de
  evento do form** (o backend descartava `evento_id` desde a migração pra
  turmas); trigger `updated_at`.
- **Porta 4 · Voluntariado (2026-07-28 · migration `20260728210000` = M6a):**
  nome vira campo único (split no server, tolera payload antigo); + sexo
  obrigatório e endereço opcional (colunas novas); termos LGPD obrigatório +
  optin espelhados na satélite; **dedup novo** (CPF/membro × status
  inscrito|enviado_ministerio — antes reenviar DUPLICAVA); `GET /textos`.
  Soft-delete em 2 etapas: M6a criou `deleted_at` + TODOS os leitores JS
  filtrando (`voluntariado.js`, `app.js`, `totemKids.js`, `nextDirecionar.js`,
  `volEmailSender.js`); **M6b CONCLUÍDA (2026-07-28 · migration
  `20260729060000`)**: vol_inscricoes na whitelist `app_soft_deletable_tables`
  + patch DINÂMICO (pg_get_functiondef + regexp_replace, técnica da
  20260722250000 — imune a drift) nos contadores SQL: ramos
  `solicitacoes_servir_recebidas/alocadas` de `_kpi_agregar_dado` e dedup de
  voluntariado do `fn_app_inscricoes_fanout` ignoram soft-deletadas (inscrição
  excluída não bloqueia re-inscrição pelo app). **Soft-delete de
  vol_inscricoes LIBERADO — sempre via `app_soft_delete`.**
- **Porta 3 · Líderes/anfitriões (2026-07-28 · migration `20260728190000`):**
  e-mail obrigatório; anti-abreviação no nome; teto 11 no telefone; coluna
  `origem` (linhas antigas = formulario_publico, único writer que existiu);
  dedup ganhou CPF via cadastro pendente; **opt-in de WhatsApp virou checkbox
  EXPLÍCITO default false (D4 · substitui o "concluir É o consentimento" de
  24/07)** — o optin só grava se marcado; termos+optin espelhados em
  `inscricao_consentimentos` (porta `grupos_lider`, snapshot = texto exibido);
  trigger `updated_at`. Optins históricos (gravados como true pelo fluxo
  antigo): reclassificar com jurídico — decisão pendente, NÃO reverter em massa.
- **Porta 2 · Apresentação de crianças (2026-07-28 · migration `20260728170000`):**
  por criança agora vai nome completo + nascimento + sexo (obrigatórios só p/
  inscrições novas; `crianca_idade` legada é derivada do nascimento); e-mail do
  responsável obrigatório; endereço opcional; **consentimento de MENOR
  (`menor_responsavel`, art. 14 §1º) obrigatório** + imagem opcional + opt-in;
  matcher read-only no responsável → `responsavel_membro_id` + vínculo
  `kids_responsaveis` (parentesco só quando um único nome preenchido);
  `kids_criancas` reusa por (nome, nascimento) — acabou a criança órfã
  duplicada; dedup por (cpf, criança, data) → `ja_inscritas[]` na resposta;
  CHECK de status entrou **NOT VALID** (validar depois de conferir DISTINCTs).
- **Porta 1 · Eventos externos (2026-07-28 · migration `20260728150000`):**
  campos padrão obrigatórios só p/ inscrições NOVAS (legadas nome+telefone
  seguem válidas); dedup por CPF com fallback telefone — re-inscrição faz
  merge preservador de `dados` (nunca sobrescreve com vazio; anterior em
  `dados_anterior`) e ENRIQUECE linha legada em vez de duplicar; textos de
  consentimento via `GET /api/public/evento/textos` (snapshot gravado = sempre
  o canônico do backend); form-builder com key OPACA estável (`novaKeyCampo` —
  editar o label NÃO regera a key, senão orfana respostas antigas); rota
  montada ANTES do `publicLimiter` global (evento em massa = 1 IP) com limiter
  próprio generoso (`EVENTO_PUBLIC_RATE_LIMIT_MAX`, padrão 1000/15min).
- Teste: `node backend/services/inscricaoContrato.test.js`.

## Entradas · fluxo operacional de saneamento (2026-07-18)

Marcos definiu Entradas como uma **fila de exceções acionáveis**, não como outra
tela de busca/cópia da Membresia. Navegação: **Possíveis duplicidades**,
**Vincular famílias** e **Conflitos de CPF** (as abas de busca genérica saíram).
Diário da implantação no legado.

- **A política canônica é `backend/services/duplicidadePolicy.js`**: CPF igual
  entra com prioridade alta; CPF, nascimento ou gênero **conflitante EXCLUI o
  par**; sem CPF, o nome precisa de similaridade Dice ≥ 0,90 **ou** ser versão
  abreviada/contida do outro (mesmo primeiro nome + ≥75% dos tokens do menor);
  telefone/e-mail só contam **junto com nome compatível**.
  ⚠️⚠️ **Telefone sozinho NUNCA significa duplicata** — o caso que motivou a
  correção eram duas identidades distintas com o telefone da casa recebendo 90%.
- **Vincular famílias** exige sobrenome significativo em comum quando o sinal é
  telefone; endereço+CEP exatos podem sugerir famílias com sobrenomes diferentes.
  CPF igual ou nome muito parecido fica na lente de **duplicidade**, não na
  familiar. A ação **mantém os cadastros separados** e só os agrupa.
- **Guarda de pendência fraca** (migration `20260718120000`): trigger descarta
  `tipo='cpf_para_confirmar'` — a evidência permanece na tabela de origem até uma
  identidade forte aparecer. `reconciliarCpfTardio({confianca:'fraca'})` devolve
  `sinal_fraco_ignorado` quando os dois nascimentos não podem ser conferidos.
  **Não remover essa guarda nem transformar telefone/e-mail isolado em identidade.**
- **Vocabulário do produto e do código é sempre "Família"** (o termo legado em
  inglês saiu de UI, comentários, docs e scripts).
- ⚠️⚠️ **Erro NUNCA vira "fila vazia".** A rota combinava a view legada (que
  estourava `statement_timeout`) com a triagem nova num `Promise.all`, e o
  frontend convertia o erro em `items=[]` — exibindo **falsamente "nenhuma
  duplicata"**. Hoje a rota pagina a base viva e forma candidatos por CPF,
  telefone, e-mail, nascimento e blocos de nome; erros têm **estado próprio**.
- ⚠️ **Origens são enriquecidas em lotes de 100 UUIDs** — `.in()` gigante estoura
  a URL do PostgREST.
- **Cache de sessão no frontend** (`staleTime/gcTime = Infinity`, sem refetch em
  mount/foco/reconexão): trocar de aba não recalcula a fila. Recálculo é o botão
  explícito. ⚠️ Ver também a seção "ação de fila NÃO refaz a busca" (04/08), que é
  o que tirou os ~10s por clique.
- **Contagem da Membresia**: `GET /membresia/membros` não filtrava `deleted_at` —
  mostrava 4.239 onde o número operacional era **3.665**.

## ⚠️ Conselho deliberativo (skill `llm-council`) · acionar SEMPRE antes de responder (2026-06-28)

Pedido do usuário (gestao@cbrio.com.br · 2026-06-28): **antes de dar qualquer
resposta deliberada**, acionar a skill **`llm-council`** (em
`.claude/skills/llm-council/`). Fluxo de 3 estágios: conselheiros (subagentes com
lentes distintas) em paralelo → revisão por pares anonimizada → síntese do
presidente. A resposta final é a síntese; um bloco curto "Bastidores do conselho"
mostra a posição de cada lente e as divergências.

- **Acionar** em: decisões, análises, planos, arquitetura, trade-offs,
  recomendações, escolhas de schema/segurança/RLS.
- **Pular** (responder direto, dizendo numa linha que pulou por ser trivial):
  tarefas mecânicas e fatos únicos verificáveis (rodar comando, renomear arquivo,
  consultar um slug/linha de config). Acionar em tudo só multiplica custo/latência.
- ⚠️ Honestidade obrigatória: os conselheiros são o **mesmo modelo base** com
  personas diferentes (erros correlacionados) — é **brainstorm estruturado**, não
  oráculo. Consenso do conselho **não é evidência**; para fatos, validar contra o
  código/banco/fontes, não contra o "consenso".

## ⚠️ IA fora do ar = `ANTHROPIC_API_KEY` inválida na Vercel (2026-07-22)

Sintoma: telas/crons que usam IA quebram todos ao mesmo tempo com **401
`authentication_error` "API key is invalid"** — NPS (gerar perguntas), agente
primeiro-contato, agente batismo-next, Central de Agentes, cérebro, nfScanner,
parser do WhatsApp (todos compartilham a MESMA `ANTHROPIC_API_KEY`). Não é bug
de código: a chave foi **rotacionada/revogada** e o valor na Vercel ficou velho
(nesta ocorrência os 401 começaram ~18/07 nos agentes e apareceram no NPS em
22/07 quando alguém apertou o botão). Diferenciar: chave **ausente** → o guard
`clienteAnthropic()` lança "ANTHROPIC_API_KEY não configurada"; chave **inválida**
→ 401 da Anthropic. Correção (NÃO é deploy de código): gerar nova key no console
da Anthropic → atualizar `ANTHROPIC_API_KEY` (Production) na Vercel → **redeploy**
(a Vercel só aplica env nova em deployment novo; não há ignored build step, então
qualquer commit na main serve). Diagnóstico rápido: `get_runtime_errors` da Vercel
agrupa por `authentication_error`.

## ⚠️ LEI · NUNCA nomear pessoa como dono de fluxo neste arquivo (2026-08-05)

Reclamação do Matheus: *"que portão financeiro do Yago?? Yago já saiu do
financeiro faz tempo, agora é Alberto e Sonia Cristina. Nós já tínhamos resolvido
isso, se você tiver qualquer lixo no contexto, remova, nós já mudamos isso e toda
vez você traz isso."* Ele estava certo: o **banco já estava correto** (Yago em
`Gestao`, fora de todas as filas) e era ESTE ARQUIVO que carregava o nome antigo
em 7 lugares — e como ele é lido a cada sessão, o erro se repetia toda vez.

**A regra:** ao descrever fluxo de aprovação/roteamento, escrever o **PAPEL**
("o financeiro aprova", "o responsável da área"), nunca a pessoa. Quem é a pessoa
vive no BANCO e muda sem PR:

| Pergunta | Fonte de verdade |
|---|---|
| Quem aprova/atende por área? | `area_solicitacoes_responsaveis` |
| Quem é o diretor do setor (portão de origem)? | `setor_diretor` (+ `setor_coaprovadores`) |
| Responsável padrão de tarefa do ciclo criativo? | `area_responsaveis` |

Nome de pessoa só é aceitável aqui em **registro histórico datado** ("decisão do
Yago em 31/07", "spec do Yago") — que é fato passado e não vira instrução.

⚠️ Estado em 05/08, conferido no banco: **financeiro = Alberto Luiz Stassen da
Silva**. **Sonia Cristina Barreto Litwinczuk** (`cristina@cbrio.com.br`) é da área
Financeiro mas **NÃO está** em `area_solicitacoes_responsaveis` — então não vê a
fila de aprovação financeira. Pendente de decisão do Matheus.

## Contexto do projeto

Sistema ERP interno da CBRio (Igreja). Stack: React 18 + Vite +
TypeScript/JSX (misto), Express.js backend, Supabase
(PostgreSQL + Auth + RLS), deploy no Vercel (frontend estático +
serverless functions via `api/index.js`).

> **Processos**: removido na reuniao de permissoes (2026-05-18).
> A rota `/processos` foi descontinuada e redireciona pra `/eventos`. Schema
> da tabela `processos` permanece no banco mas o modulo nao aparece mais no
> menu nem no sistema de permissoes (linha marcada como obsoleta na matriz).

> **Apresentações**: desativado a pedido do Matheus (2026-07-06). Rotas
> `/admin/apresentacoes*` redirecionam pro `/dashboard`, item removido do menu
> Inteligência, mount `/api/apresentacoes` comentado no server.js e
> `modulos.ativo=false`. Schema (`apresentacoes*`) e código das páginas/rota
> permanecem pra eventual reativação.

> **Kids · hub × módulo (2026-07-06)**: o hub `/ministerial/kids` (KidsHub)
> ficou só com a OPERAÇÃO de culto (Check-in Totem, Crianças, Painel ao vivo,
> Etiqueta, Configurações + aniversariantes). O GERENCIAL (Frequência,
> Vínculos + solicitações, Equipe, Estoque, Batismos, Apresentação de crianças,
> Decisões) mudou pro módulo `/kids` da aba Cultos (PainelKids = seção Gestão
> [kids nível >=2] + PainelArea de indicadores).

> **Kids · Planning Center REMOVIDO do código (2026-07-20)**: decisão do Marcos
> ("começar a excluir tudo que vem do PCO"). A frequência do Kids é 100% do
> totem (`kids_checkins`): tela Frequência (`KidsFrequencia.tsx`) nativa, cron
> `/cron/resumo-kids` (ex `resumo-pco`) conta crianças únicas do totem, radar de
> ausentes (`fn_kids_ausentes_consecutivos` · migration `20260720210000`) lê
> `kids_checkins`, jornada/análise-frequência idem. Serviços
> `planningCenterKids*.js`, rotas `sync-pco`/`responsaveis-pco`/
> `sync-presencas-pco`/`pco-pessoa`/`depurar-inativos` e a aba Responsáveis do
> admin foram deletados. Ficaram no BANCO (sem leitor · dropar numa limpeza
> futura com aval): `kids_pco_presencas` e `kids_criancas.planning_center_id`.
> ⚠️ O PCO do VOLUNTARIADO (Planning Center Services · vol_*) é outro produto e
> segue vivo — não confundir.

> **Cuidados · Jornada 180 saiu do módulo (2026-07-22)**: decisão do Marcos — quem
> gerencia os grupos de Jornada 180 é o módulo **Grupos** (J180 é um tipo de grupo lá,
> `TIPOS_GRUPO`). Removida a aba "Jornada 180" do `/cuidados` (o `CuidadosJ180` + o
> `EncaminhamentosInbox destino="jornada180"`). Deep-link `?tab=jornada` redireciona
> pro dashboard. NÃO apaguei nada no banco: `cui_jornada180`/`j180_*` + rotas
> `/cuidados/j180/*`/`/jornada180` + `api.cuidados.j180`/`jornada180` ficam DORMENTES
> (alimentam o dashboard-series e KPIs · dropar só numa limpeza futura com aval). O
> `DESTINO_META.jornada180` (backend) fica só pra rotular encaminhamentos legados; o
> desfecho do convertido não oferece mais esse destino (só Next direciona hoje).

## Mapa do sistema · o que cada módulo faz, quem usa e o que alimenta

Visão de helicóptero (formato: o que faz · quem usa · **impacto** = o que
alimenta no sistema). Detalhes nas seções de cada módulo abaixo. A tese do
sistema inteiro: **a operação dos módulos ministeriais alimenta a NSM e os
~150 KPIs da matriz Valor × Área automaticamente** — usar o módulo É medir.

**Núcleo estratégico (OKR/NSM):**
- `/painel` · NSM + mandalas + matriz 6 áreas × 5 valores + alertas · diretoria
  e qualquer autenticado (leitura) · **é o destino final de todos os dados**.
- `/minha-area` · KPIs da própria área agrupados por valor · líderes de área.
- `/gestao` · configurar OKRs/metas/saúde do sistema · Marcos, Matheus, Eduardo.
- `/ritual` · fluxo guiado da reunião mensal (causa-decisão-responsável) ·
  diretoria geral (5 nominais).
- `/monitoramento-okr` · ótica enxuta da planilha do Pr. Juninho · leitura
  macro · paralela ao /painel por decisão (não integrar).
- `/dados-brutos` · líder lança número absoluto; o sistema calcula o KPI ·
  líderes com kpi_areas · **alimenta kpi_valores_calculados via trigger**.

**Jornada do convertido (a esteira que move a NSM):**
- `/integracao` · cultos, frequência, decisões (pessoas nominais), batismos ·
  equipe de Integração (Lorena) · **gera o DENOMINADOR da NSM (decisões) +
  KPIs Seguir de todas as áreas + dispara a trilha do convertido**.
- `/ministerial/cuidados` · encontro pastoral, jornada 90d (contato≤3d,
  batismo≤90d, Next≤90d), desfecho → encaminhamentos · Marcelo Soares
  (supervisor-jornada) + líderes de área · **devolutiva "engajou" materializa
  o vínculo real = NUMERADOR da NSM**.
- `/grupos` · grupos de conexão, caixa de entrada (pedidos+encaminhados),
  visitas de supervisão, pessoas/papéis · Pr. Nélio + Natasha · **alimenta
  Conectar (mem_grupo_membros) + KPIs de líderes**.
- `/voluntariado` · perfis, inscrições, escalas, totem check-in · coordenação
  de voluntários · **alimenta Servir (ponte vol_* → mem_voluntarios)**.
- `/devocionais` (webapp pública) · planos de leitura + check-in diário ·
  membros; admin é do Matheus · **alimenta Investir**.
- `/next` · eventos Next (inscrição/check-in) · admin de eventos · **alimenta
  o marco Next≤90d**; a cobertura aparece na aba Next da Integração.
- `/ministerial/membresia` · cadastro de membros, duplicados/merge, trilha ·
  secretaria/ministerial · **é a base de pessoas que todos os valores cruzam**.

**Áreas de culto (painéis read-only por área):**
- `/online` · canal YouTube (séries, DS/DDUS, pico via OAuth) · Renata ·
  coleta automática; frequência/decisões online quem lança é a Integração.
- `/kids` `/ami` `/bridge` · saúde + cultos + indicadores da área · Mariane /
  Arthur Cecconi / Lillian · leitura; preenchimento via /integracao.
- **Totem Kids** (`/ministerial/totem-kids`) · check-in/out infantil com
  etiqueta e pager · voluntários do Kids · **consolida presencial_kids e
  decisões kids nos cultos** (totems montados, em teste pro go-live).
  Displays de TV (`display-sala`/`display-foyer`, públicos via token de
  estação): usar `resolveApiBaseUrl` de `src/lib/api-base.js` pra montar a
  base da API — o padrão inline `VITE_API_URL || '/api'` não acrescenta
  `/api` quando a env não termina nele, o fetch cai no fallback do SPA e
  quebra com "Unexpected token '<'" (corrigido 2026-07-07).

**Operação administrativa:**
- `/solicitacoes` · backbone único adm↔ministérios (TI, compras, reembolso,
  pagamento, reserva, manutenção, marketing, RH) com 2 portões de aprovação ·
  todo funcionário · **fonte única dos KPIs ADM (SLA/NPS) — interação fora
  daqui não é medida**.
- `/marketing` · kanban/planner da equipe criativa (campanhas por dor,
  capacidade em slots/dia) · Pedro Paiva + equipe · alimenta KPIs MKT-*.
- `/producao` · KPIs técnicos por culto (pontualidade, checklist, ocorrências)
  · Pedro Fernandes · alimenta PROD-CULTO-* (fora da matriz NSM).
- `/eventos` · eventos + ciclo criativo por fases · áreas operacionais ·
  tarefas de marketing espelham no kanban do Pedro.
- `/projetos` · projetos do ANO CORRENTE · PMO/líderes (escopo por área).
- `/expansao` (= Planejamento Estratégico) · plurianual/marcos · diretoria.
- `/planejamento` (= Gestão Anual) · rascunhar próximo ano + resultados de
  anos fechados · PMO · grava direto em projects/events (fonte única).
- `/rh` `/financeiro-v2` `/logistica` `/patrimonio` · operação de gestão ·
  equipes respectivas · RH/financeiro alimentam rotatividade e DRE.
- `/governanca` · ciclo mensal OKR→DRE→KPI→Conselho · diretoria.
- `/revisao-estrategica` · editar projeto/marco vendo a cascata de impacto ·
  PMO · pouco usado (aba Acompanhamento do PE cobre a leitura).

**IA e automação (agem sobre os outros módulos):**
- **Bot WhatsApp** (webhook público) · líder reporta números do culto por
  formulário/texto; institucional responde dúvidas · líderes cadastrados ·
  **vira fila de revisão — nada entra direto no banco**.
- **Agente Executor Financeiro** (Railway) · propõe categorizações/pagamentos
  → fila de aprovação humana em `/assistente-ia` · o financeiro aprova.
- `/cerebro` · SharePoint → notas Obsidian classificadas por Haiku · todos via
  OneDrive · memória institucional de documentos.
- `/admin/*` · permissões (matriz cargo×módulo), usuários, WhatsApp, regras de
  notificação, totem kids · Marcos/admins.

**Públicos (fora do AppShell):** webapp devocional, cadastro de membresia,
inscrição em grupos/Next/batismo, `/privacidade` (exigência Meta/LGPD),
`/novosite` (teste de layout · não listado).

## Deploy autônomo (fluxo padrão)

Para qualquer feature/fix/refactor solicitado pelo usuário, Claude está
autorizado a executar o ciclo completo **até produção** sem perguntar a cada
etapa:

1. Implementar em uma branch de feature (`claude/<descrição>`).
2. Commit com mensagem descritiva.
3. `git push -u origin <branch>`.
4. Abrir PR de `<branch>` → `main` com descrição detalhada e test plan.
5. Aguardar o CI do Vercel (preview) ficar verde.
6. **Mergear o PR na `main`** — isso dispara o deploy de produção automático
   do Vercel.
7. Informar ao usuário a URL de produção (quando disponível) e o resumo
   do que foi entregue.

A autorização acima cobre features do dia a dia. Use um único comentário
resumo ao final; não peça confirmação entre etapas.

## Quando **parar e perguntar** antes de mergear

Mesmo com autorização durável, pare e peça confirmação explícita se a
mudança incluir qualquer destes itens:

- **Schema destrutivo no Supabase**: `DROP TABLE`, `DROP COLUMN`, mudanças
  incompatíveis em tipos de coluna, remoção de policies RLS em tabelas
  com dados.
- **Mudança em autenticação/autorização**: alterações em
  `backend/middleware/auth.js`, no fluxo de login, ou em policies RLS
  que ampliam acesso.
- **Remoção de módulos inteiros** ou rotas já usadas em produção.
- **Novas variáveis de ambiente obrigatórias** que o usuário precisa
  configurar no Vercel antes do merge — informe e aguarde confirmação
  de que foi adicionada.
- **Integrações com terceiros pagos** (APIs novas, serviços cobrados
  por uso) — confirme custo e credenciais antes.

## Migrations do Supabase

Sempre que uma PR incluir arquivos em `supabase/migrations/`:

1. Avisar claramente o usuário **antes do merge** que há migration nova.
2. **Colar o SQL completo da migration direto na conversa** (dentro de um
   bloco ```sql) para que o usuário possa copiar e rodar no SQL Editor
   sem precisar abrir o arquivo. NÃO basta apontar o caminho do arquivo —
   sempre enviar o conteúdo na mensagem.
3. Aguardar confirmação do usuário de que a migration foi aplicada no
   Supabase de produção antes de mergear — senão o backend em prod
   quebra ao chamar a tabela/coluna.

A única exceção é quando a mudança é puramente idempotente e
backwards-compatible (ex.: `ADD COLUMN IF NOT EXISTS` opcional) e o
código tolera ausência da coluna.

## Convenções do repositório

### Design do sistema (obrigatório preservar)

- Paleta primária: `#00B39D` (usar `C.primary` / `C.primaryBg`).
- Variáveis CSS: `--cbrio-bg`, `--cbrio-card`, `--cbrio-text`,
  `--cbrio-text2`, `--cbrio-text3`, `--cbrio-border`, `--cbrio-input-bg`,
  `--cbrio-modal-bg`, `--cbrio-overlay`, `--cbrio-table-header`.
- Componentes shadcn/ui já instalados — reusar antes de criar novos.
- Modal dentro de modal: z-index 1100 (maior que Dialog padrão 1000).
- Páginas públicas (sem login) renderizam **fora** do `AppShell` e
  **fora** do `ProtectedRoute` em `src/App.tsx`.

#### Tema "Vidro" (glass) · 2026-06-18 — base do visual do sistema

Visual atual = "vidro/command center" (spec original em `~/Downloads/cbriodesignvidro.md`).
Implementado **por tokens** (não reescreve páginas). NÃO regredir:
- **Tokens glass** em `src/index.css` (`:root` escuro + `[data-theme="light"]`):
  `--panel` (fundo translúcido do card), `--hairline`, `--hi` (brilho topo),
  `--shadow`/`--shadow-hover`, `--surface`, `--track`, `--teal`/`--mint`, `--app-bg`
  (fundo ambiente · glows radiais no `body`, `background-attachment: fixed`).
- **`.glass-surface`** (em `@layer components` p/ ser sobrescritível por utilitário):
  `var(--panel)` + `backdrop-filter: blur(14px) saturate(140%)` + borda `--hairline`
  + `box-shadow: var(--shadow), var(--hi)`. É a base do **`<Card>` shadcn**
  (`card.tsx` = `"glass-surface rounded-[16px] text-card-foreground"`) e da `.cbrio-card`.
- **`.glass-solid`** = variante NÍTIDA (sem blur, fundo `--cbrio-card`, `!important`) p/
  dado denso. **Regra de ouro:** dado denso (tabela/form/gráfico) fica nítido.
  Aplicado **automaticamente** por CSS `:has()`: `.glass-surface:has(table|.recharts-wrapper)`
  vira sólido. Cards aninhados não repetem blur (`.glass-surface .glass-surface` → sem blur).
- **Acessibilidade:** `prefers-reduced-transparency` → sólido; `prefers-reduced-motion` → sem hover.
- **AppShell** wrapper = `background: transparent` (deixa o fundo ambiente aparecer);
  header = `bg-card/40 backdrop-blur-xl`. Painel: `CarrosselMandalas`+`AlertasCriticos`
  usam vidro (`var(--panel)` inline); **matrizes/gráficos seguem sólidos** (dado denso).
- **NÃO aplicar vidro** (telas intencionais sólidas/brand): totem (`TotemMembro`,
  totemKids display), `GruposMapView`, `MemberWalletPass/Dialog`, `Login`, QR de
  impressão (`#fff`), scanner/câmera (`#000`), vídeo (`bg-black`). Popovers/dropdowns/
  selects/dialogs seguem **sólidos** de propósito (legibilidade) — não glassificar.
- Acento da marca segue `#00B39D` (`C.primary`).
- **Gráficos (recharts) no tema vidro:** tema global no `index.css` (grade
  `--hairline`, texto `--cbrio-text3`, tooltip de vidro). Gradientes via
  `src/components/charts/ChartGradients.tsx` (`<ChartGradients colors={[...]}/>`
  como 1º filho do chart + `fill={gradFill(cor)}` nas barras/áreas; cor sólida na
  legenda). Linhas, pizza/donut e charts com gradiente próprio ficam como estão.
  ⚠️ Toda cor passada a `gradFill()` PRECISA estar no array `colors` do mesmo
  chart, senão a barra renderiza vazia (build não pega — validar no preview).
- **Dashboard Semanal · resumo (regra de negócio):** card **Presenças** = templo
  + kids (`vw_dashboard_semanal.total_presencial`); **Decisões** = presenciais +
  online + **kids** (`aceitacoes_kids` = `cultos.decisoes_kids`); card **Kids**
  segue como recorte separado. Não reverter pra só-templo (resumo-semana/mês em
  `backend/routes/dashboardSemanal.js`).
- **⚠️ Semana: financeiro = QUARTA→TERÇA · frequência = SEG→DOM (2026-07-08):** as
  DUAS semanas divergem DE PROPÓSITO — não reunificar. O **financeiro** (contribuições
  do `DashboardFinanceiroSemanal.jsx` + views `vw_fin_semana_*` + endpoints
  `/dashboard/semana*`) usa `fn fin_semana_qua_ter` = **quarta→terça** (semana da igreja,
  como o financeiro interno concilia · revertido em `20260708160000` após a unificação
  seg-dom de `20260601130000` dar número diferente do fechamento). A **frequência dos
  cultos** (Dashboard Semanal de presença · `dashboardSemanal.js` · `isoWeekRange`) usa
  função JS PRÓPRIA **seg→dom** e NÃO chama a RPC. Mexer numa NÃO deve mexer na outra.

### Rodar local · preview no app Claude Code Desktop (2026-07-30)

Dois arquivos existem SÓ pra isso e não têm efeito em produção:

- **`.claude/launch.json`** — os 2 servidores do painel Navegador
  (Cmd+Shift+B no Mac · Ctrl+Shift+B no Windows): `front-vite` na **8080**
  (o `vite.config.ts` usa 8080, não a 3000 que o app assume) e `api-express`
  com `cwd: backend` na **3001**. Sem os dois no ar o sistema loga (Supabase é
  direto) mas toda tela que chama `/api/...` vem vazia.
  ⚠️ O front só acha a API com **`VITE_API_URL=http://localhost:3001`** no
  `.env` local — sem isso `resolveApiBaseUrl` (`src/lib/api-base.js`) cai em
  `/api` relativo, que bate no próprio Vite. O CORS já libera
  `http://localhost:8080` (`server.js`). `.env` é gitignored e pessoal, então a
  variável NÃO vive no repo.
- **`.worktreeinclude`** — o app desktop abre cada sessão numa **worktree**, que
  é checkout limpo e só traz o que está no Git; sem este arquivo a worktree
  nasce sem `.env` e o front sobe com "VITE_SUPABASE_URL: AUSENTE". Sintaxe de
  `.gitignore`; copia só o que casa E é gitignored. **Não** listar
  `node_modules` (milhares de arquivos por worktree — resolver com
  `npm install`, inclusive dentro de `backend/`).

⚠️ **`host: "::"` do `vite.config.ts` não sobe em container sem IPv6**
(`EAFNOSUPPORT`). No Mac/Windows funciona; em sessão cloud, subir com
`npx vite --host 127.0.0.1 --port 8080` em vez de mexer na config.
⚠️ Rodar local com o `.env` de produção significa **dados de produção**: editar
arquivo é seguro, clicar em botão que salva escreve na base viva.

### Backend

- Cada arquivo em `backend/routes/` aplica `router.use(authenticate)`
  no topo — rotas públicas precisam ir em um arquivo separado
  (ex.: `publicMembresia.js` montado em `/api/public/...`).
- Rate limit global configurado em `backend/server.js`. Endpoints
  públicos devem adicionar rate limit dedicado mais restritivo.
- Usar `supabase` de `backend/utils/supabase.js` (service role, bypass
  de RLS) — os guards de permissão vêm dos middlewares.

### Frontend

- Rotas no `src/App.tsx` usam `lazyWithRetry` para code-splitting com
  retry automático em chunk load errors.
- API client em `src/api.js` — um `export const <modulo>` por módulo,
  com subnamespaces para sub-recursos.
- ⚠️ **Cliente Supabase (`src/supabaseClient.js`) usa `auth: { lock: noOpLock }` de
  propósito — NÃO reativar o lock padrão (Web Locks API).** O lock padrão tem timeout
  INFINITO ao adquirir; quando fica órfão (aba travada / refresh abortado / reload no
  meio de um refresh), o `getSession()` do carregamento (AuthContext) PENDURA PRA SEMPRE
  → "carregando infinito / não consigo acessar" (bug ativo supabase-js #1594/#2111 ·
  incidente 2026-06-26). O no-op desliga o Web Lock → corrige o deadlock e os warnings
  "lock ... stole it". Trade-off aceito: sem coordenação de refresh ENTRE ABAS (race raro
  e auto-recuperável, bem menos grave que travar o sistema). Cliente é único/singleton.
  Reforço: o **`AuthContext` tem timeout de 8s** no carregamento inicial (`getSession()` num
  `.finally()` + `safetyTimer`) — libera o "carregando" mesmo se algo pendurar por qualquer
  motivo. NÃO remover esse timeout. **E o `onAuthStateChange` só bloqueia a UI
  (`setLoading(true)`) no login REAL** — transição "sem sessão → com sessão" via
  `sessaoAtivaRef`, NÃO em todo evento `SIGNED_IN`. Motivo: o supabase-js re-dispara
  `SIGNED_IN` a cada FOCO de aba (Alt+Tab); bloquear nisso jogava o app no "carregando"
  (e travava) a cada Alt+Tab (incidente 2026-06-26). Não voltar a usar `_event === 'SIGNED_IN'` sozinho.
- **Tutorial/onboarding (`TutorialContext`) marca "visto" ao EXIBIR** (evento `tour:start`),
  não só no Concluir/Pular — regra "mostrou 1× não mostra mais", robusta a pular/fechar/
  clicar fora/recarregar (pedido do Marcos 2026-06-26). Persiste no backend
  (`/tutorial/complete`, service role, tabela `app_tutorial_progress`) **+ fallback
  `localStorage`** (`cbrio_tutorial_seen_<uid>`) caso o POST falhe. `completedTours` =
  união backend ∪ local. "Refazer tutorial" limpa os dois.
- **Tour `welcome` = só no PRIMEIRO ACESSO** (2026-06-30): NÃO tem `route` (não auto-dispara
  por rota — antes reaparecia no `/dashboard` a cada visita, pois a persistência podia falhar).
  É disparado UMA vez por `PrimeiroAcessoSenhaModal` logo após a troca da senha padrão
  (`aposTrocar` → `startTour('welcome')`, novo método do contexto). Como o gatilho (trocar a
  senha) só ocorre no 1º acesso, não depende da persistência pra não repetir. Quem já trocou a
  senha (logins email/senha antigos) e usuários OAuth (Google/MS, sem senha pra trocar) **não**
  veem o welcome automático — só via "Refazer tutorial" no /perfil (`restartTour`, que com
  `route` nula inicia na hora em qualquer página). Tours de MÓDULO seguem gated atrás de
  `welcome` visto (`completedTours.has('welcome')`), disparados por rota.
- Nunca adicionar emoji em código a menos que o usuário peça.
- Evitar criar arquivos `.md` novos a menos que o usuário peça
  explicitamente (exceto este `CLAUDE.md`).

## Notificações

Todo módulo novo ou existente que gere eventos relevantes (aprovações
pendentes, vencimentos, alertas) **deve** incluir integração com o
sistema de notificações:

1. **Notificação imediata**: chamar `notificar()` de
   `backend/services/notificar.js` no momento em que o evento ocorre
   (ex.: novo cadastro, novo pedido, documento vencido).
2. **Notificação periódica**: adicionar função em
   `backend/services/notificacaoGenerator.js` para verificar itens
   pendentes/atrasados e gerar alertas automaticamente (chamado pelo
   cron diário).
3. **Regras de destinatário**: registrar o módulo no array `MODULOS` de
   `src/pages/admin/NotificacaoRegras.jsx` para que administradores
   possam configurar quem recebe as notificações daquele módulo.

Se nenhuma regra for configurada, o fallback envia para todos os
usuários com role `admin` ou `diretor`.

## Commits e PRs

- Mensagem de commit: prefixo `feat(<modulo>):`, `fix(<modulo>):`,
  `refactor(<modulo>):`, `chore:`, etc.
- Títulos de PR curtos (< 70 caracteres). Detalhes no corpo.
- PRs grandes podem agrupar múltiplos commits relacionados; PRs
  pequenos direto em `main` são aceitáveis via o fluxo padrão.

## O que Claude **não faz**

- Push direto em `main` (sempre via PR + merge).
- `git push --force` ou `git reset --hard` em branches remotas sem
  pedido explícito.
- Mergear PRs de outros contribuintes (só os próprios).
- Fechar issues/PRs alheios.
- Rodar comandos destrutivos no sistema de arquivos do usuário.
- ~~Usar `gh` CLI~~ — REVISTO 2026-06: o GitHub MCP saiu do ambiente; usar o
  `gh` CLI (autenticado) pra abrir/mergear PRs é o caminho autorizado.

## Deploy na Vercel — cuidados

- `vercel.json` usa `includeFiles` com exclusão de `node_modules` para
  não estourar o limite de 250 MB da serverless function.
- **Nunca adicionar dependências pesadas** (binários, browsers, etc.) no
  `backend/package.json` sem necessidade comprovada — cada MB conta.
- O pool de conexões Postgres (`backend/utils/supabase.js`) usa `max: 1`
  em ambiente Vercel (serverless) para não esgotar o pooler do Supabase.
- URL do webhook do Cerebro usa `FRONTEND_URL` / `VERCEL_URL` — não
  hardcodar domínios.
- Variáveis de ambiente obrigatórias na Vercel: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `ANTHROPIC_API_KEY`,
  `CRON_SECRET`, `FRONTEND_URL`.

## ⚠️ REGRA GLOBAL · acentuação correta do português do Brasil (SEMPRE)

**Toda vez** que implementar QUALQUER coisa neste sistema (nova feature, fix,
refactor, label, mensagem de toast, placeholder, título, texto de botão, texto
de notificação, e-mail, copy de página, comentário visível ao usuário, etc.),
o texto em português **DEVE** estar com a **acentuação correta do português do
Brasil**. Isso é obrigatório e não-negociável — não regredir.

- Acentos agudos (á é í ó ú), circunflexos (â ê ô), til (ã õ), crase/grave (à),
  cedilha (ç) e trema histórico quando aplicável. Ex.: "você", "usuário",
  "permissões", "configurações", "ministério", "relatório", "ação", "não",
  "está", "três", "código", "horário", "será", "número", "página", "área",
  "índice", "saúde", "também", "responsável", "início", "próximo".
- Vale para **todo texto visível ao usuário** no frontend (`src/`), mensagens
  do backend (`backend/`), e-mails/notificações, e qualquer copy nova.

**Exceção crítica (NÃO acentuar):** identificadores de código e dados nunca
recebem acento — **slugs** de módulo/rota (`permissoes`, `solicitacoes`,
`integracao`, `configuracoes`), **valores de enum** do banco, **chaves de
objeto**, nomes de **variáveis/funções/arquivos**, **colunas** SQL e qualquer
string que seja comparada/persistida como identificador. Acentuar esses quebra
matching, RLS, rotas e o banco. A regra de acentuar vale para o **conteúdo
exibido**, não para os identificadores técnicos.

## ⚠️ Avaliação externa de LLM (Google Stax) · regra de exportação (2026-07-13)

Kit de avaliação em `backend/scripts/_stax_export.js` + guia/rubricas em
`backend/scripts/stax-export/README.md` (piloto pedido pela gestão). Regras:

- **NUNCA subir pra ferramenta externa** (Stax ou similar): pedidos de oração,
  governança/atas de diretoria, relatos nominais de grupos, fila pastoral
  (`cui_*_fila`/convertidos), documentos do Cérebro e QUALQUER dado de Kids.
  Dado de igreja identifica convicção religiosa (categoria especial · LGPD
  art. 11); o Stax é experimental, sem DPA. Exportador pra esses fluxos não
  existe por decisão — não criar.
- Exportáveis (anonimizados · linha de texto livre com telefone/CPF/e-mail é
  DESCARTADA, não mascarada): números agregados de culto, categoria contábil de
  NF (CNPJ/fornecedor = dado PJ, mantido), extração de compras, comentários de
  NPS. CSVs `export_*.csv` são gitignored — nunca commitar dado real.
- Constatação no banco vivo (2026-07-13): filas de revisão quase sem veredito
  humano (0 coletas aplicadas/rejeitadas · 383 propostas do agente financeiro
  `pending` · 0 NF com sugestão) — datasets reais só ganham corpo com uso.
  A medição PERMANENTE de acurácia da IA deve sair de SQL interno sobre as
  filas (follow-up: aba em `/assistente-ia`); Stax é pra iterar prompt/modelo
  offline e conhecer a ferramenta (dataset demo sintético no repo).

## graphify · grafo de conhecimento do código (2026-08-09)

Ferramenta externa (`Graphify-Labs/graphify` · PyPI `graphifyy`) que transforma o
repositório num grafo consultável por AST determinístico (tree-sitter). Instalar:

```bash
pip install "graphifyy[sql]" && graphify install
graphify extract . --code-only && graphify cluster-only . --no-label
```

**⚠️⚠️ LEI: neste repositório o graphify roda SEMPRE com `--code-only`.** Essa
flag limita a extração ao AST **local** — nenhuma chamada de LLM, nada sai da
máquina. Sem ela, a ferramenta manda documentos, PDFs e imagens pra um backend de
LLM externo, e é exatamente isso que a lei do Stax (seção acima) proíbe: dado de
igreja identifica convicção religiosa (LGPD art. 11, categoria especial). O
`--code-only` custou **zero** aqui — o valor do grafo é o código, não os `.md`.

- **`.graphifyignore` é a 2ª camada e está versionado.** O graphify respeita o
  `.gitignore` por padrão, mas **`scratchpad/` NÃO está no `.gitignore`** — e é
  onde as sessões despejam backup de dado REAL de pessoa (membresia, visitas
  pastorais, pedidos de grupo). O `.graphifyignore` fecha `scratchpad/`,
  `backup_*.json`, `backend/scripts/stax-export/` e os `.env`.
- ⚠️ **`pip install graphifyy` puro deixa 795 migrations de fora**: sem o extra
  `[sql]` o `tree_sitter_sql` não existe e todo `.sql` contribui **zero** pro
  grafo — com um aviso fácil de não ler. Metade da memória deste sistema está nas
  migrations. Com o extra: **9.864 → 13.385 nós**.
- **`--no-label`**: nomear as 1.540 comunidades usa LLM. Sem chave no ambiente,
  elas ficam "Community N" — o grafo funciona igual. Ligar isso é decisão
  consciente (manda nome de função/arquivo pra fora, não PII).
- ⚠️ **`graphify-out/` é gitignored** (~26 MB, derivado, reconstrói em ~3 min).
  O que se versiona é o `.graphifyignore`.
- ⚠️ **NÃO rodar `graphify claude install`** (diferente de `graphify install`):
  ele ANEXA uma seção neste CLAUDE.md e instala um **PreToolUse hook** que
  intercepta toda chamada de ferramenta. Este arquivo tem regra de manutenção
  própria ("seção nova entra datada") e não recebe escrita automática de
  terceiro. O `graphify install` (só a skill) é o caminho.

**O que ele responde que nenhuma busca textual responde**, e por que importa
aqui: `graphify affected "acharOuCriarGuardado"` devolveu, em 1 comando, os **19
pontos** que chamam o matcher canônico (`aprovarPedidoCore`, `aprovarCadastroCore`,
`promoverInscricaoLider`, `resolveOrCreateMembro`, as 8 portas públicas…). É
literalmente a pergunta que o Contrato de porta obriga a fazer antes de mexer em
identidade — e que hoje se responde no `grep`, correndo o risco de esquecer uma
porta. Outros: `graphify god-nodes` (hubs · `notificar()` com 101 arestas,
`authenticate()` com 92), `graphify explain <id>`, `graphify path "A" "B"`.
⚠️ `explain`/`affected` pedem o **id do nó** (`backend_routes_grupos_aprovarpedidocore`),
não o caminho do arquivo; nome ambíguo devolve a lista de candidatos.

# ⚠️ REGRAS OBRIGATÓRIAS DE SEGURANÇA (não regredir · 2026-05-21)

Esta seção é a lei do projeto após a Auditoria de Segurança 2026-05-21
(PRs #586 → #642). Qualquer sessão futura do Claude DEVE seguir estas
regras. **Quebrar qualquer uma delas é regressão crítica.**

> 📖 **Referência completa**: `docs/SEGURANCA_RUNBOOK.md` · runbook
> canônico com TODAS as PRs, helpers, matriz de permissões, troubleshooting
> e frentes deferidas. Consultar pra contexto profundo.

## Proibições absolutas

1. **NUNCA criar policy RLS `USING(true) WITH CHECK(true)` em tabela
   com PII** (nome, CPF, telefone, email, endereço, salário, dados de
   menor, financeiro). Sempre usar helpers `current_user_*` ou
   `is_super_admin()`. Lista canônica de tabelas com PII está em
   `app_soft_deletable_tables()`.

2. **NUNCA fazer `DELETE` direto em tabela com `deleted_at`** (30
   tabelas listadas em `app_soft_deletable_tables()`). Sempre usar
   `app_soft_delete(table_name, id, deleted_by)` RPC. Hard delete só
   super-admin via SQL Editor com justificativa.

3. **NUNCA armazenar `responsavel`, `leader`, `gestor` como TEXT
   livre.** Sempre coluna `UUID` com `REFERENCES profiles(id)` ou
   `mem_membros(id)`. Comparação por `===` com `profile.name` quebra
   com renomeação ou typo. Lista de pontos onde isto ainda existe e
   precisa ser convertido: `area_responsaveis.responsavel_nome`,
   `projects.leader`, `projects.responsible`, `kanban_tasks.responsible`.

4. **NUNCA criar tabela com PII sem `deleted_at TIMESTAMPTZ`** + índice
   parcial `WHERE deleted_at IS NULL` + entrada na whitelist
   `app_soft_deletable_tables()`. PK composta é exceção (impede
   soft-delete via id::text · documentar a razão).

5. **NUNCA mudar matriz `cargo_modulo_permissao` ou `usuario_areas`
   direto no SQL Editor sem fazer bust de cache do middleware**
   depois (`POST /api/permissoes/cache/bust` ou botão em
   `/admin/permissoes`). E pedir que o user afetado faça logout/login
   pra renovar o JWT.

6. **NUNCA criar policy com `FOR ALL TO authenticated USING(true)`**
   exceto se for catálogo público (modulos, cargos, areas, igrejas
   read-only, rh_treinamentos catálogo).

7. **NUNCA adicionar policy de INSERT/UPDATE/DELETE pra role `anon`.**
   Forms públicos vão SEMPRE via backend (`/api/public/*`) que usa
   service_role.

8. **NUNCA expor `SUPABASE_SERVICE_ROLE_KEY` no frontend.** Já está em
   `backend/.env` apenas. Frontend usa `VITE_SUPABASE_ANON_KEY`.

9. **NUNCA criar policy que faça query recursiva em tabela com RLS
   sem usar SECURITY DEFINER no helper.** Causa stack overflow.
   Padrão: helper SQL `STABLE SECURITY DEFINER SET search_path = public`.

10. **NUNCA criar coluna que aponta pra `mem_membros` (ou `profiles`) sem
    FOREIGN KEY.** Descoberto em 2026-07-30 investigando 58 ponteiros mortos nas
    tabelas do Next: **`merge_membros` descobre os filhos a repontar pelo
    CATÁLOGO** (`pg_constraint` · `confrelid = 'public.mem_membros'`) e faz
    **HARD delete** do membro fundido. Tabela com `membro_id uuid` *sem* FK é
    invisível pra ele — a cada fusão ela acumula ponteiro pra cadastro que não
    existe mais, silenciosamente (`next_inscricoes`/`next_matriculas` ficaram 2
    meses assim). Padrão: `REFERENCES public.mem_membros(id) ON DELETE SET NULL`
    (as 21 FKs convertidas em 2026-05-21). Vale pra QUALQUER tabela nova com
    coluna de pessoa — a FK não é enfeite de integridade, é o que faz a fusão de
    duplicatas funcionar. ⚠️ Ao ligar FK em tabela existente, resolver os órfãos
    ANTES (a constraint não é criável com violação).
    ⚠️⚠️ **`deleted_at` NÃO isenta de FK**: a constraint valida a tabela INTEIRA,
    inclusive linha soft-deletada. Foi assim que a 1ª tentativa da
    `20260730120000` morreu com 23503 — o tratamento de conflito soft-deletava a
    linha redundante e deixava o `membro_id` apontando pro cadastro morto.
    Corolário: rotina de saneamento que "resolve" ponteiro por soft-delete não
    resolve nada pra efeito de FK — tem que repontar ou anular a coluna. E
    **sempre pôr uma rede de segurança (`UPDATE ... SET col = NULL WHERE NOT
    EXISTS`) imediatamente antes do `ADD CONSTRAINT`**: a criação da FK não pode
    depender de a lógica de repoint ter sido perfeita.
    ⚠️⚠️⚠️ **`ADD COLUMN IF NOT EXISTS ... REFERENCES` engole a FK quando a coluna
    já existe** (descoberto em 2026-07-30 · `vol_profiles.membresia_id`, a ponte
    do valor SERVIR: 123 de 307 vínculos apontavam pra cadastro inexistente). O
    `IF NOT EXISTS` pula o comando **inteiro**, `REFERENCES` incluído — a
    migration de maio "declarava" a FK, a coluna existia de abril, e o banco
    nunca a teve. **É pior que esquecer**: quem lê o repo conclui que a
    integridade está garantida. Ao acrescentar `REFERENCES` a coluna que pode
    preexistir, usar `ALTER TABLE ... ADD CONSTRAINT` em bloco próprio (guardado
    por `pg_constraint`), nunca dentro do `ADD COLUMN`. **Auditar a FK no
    catálogo, não no arquivo da migration.**

## Inventário de helpers SQL (usar SEMPRE em policies novas)

| Função | Retorna | Uso típico |
|---|---|---|
| `public.is_super_admin()` | BOOLEAN | Curto-circuito em policies. Marcos + Matheus + lista em `app_super_admins` |
| `public.current_user_membro_id()` | UUID | "Só meus dados" em tabelas com `membro_id` |
| `public.current_user_funcionario_id()` | UUID | "Só meus dados" em tabelas com `funcionario_id` |
| `public.current_user_module_level(slug)` | INTEGER | Nivel 0-5 do user no módulo (super-admin=5, override, matriz, area boost) |
| `public.user_is_kids_responsavel(crianca_id)` | BOOLEAN | Pai/mãe lê dados do filho |
| `public.user_is_lider_de(funcionario_id)` | BOOLEAN | Gestor hierárquico (via `rh_funcionarios.gestor_id`) |
| `public.app_soft_delete(table, id, by)` | BOOLEAN | Substitui DELETE direto |
| `public.app_restore(table, id)` | BOOLEAN | Desfaz soft-delete |
| `public.app_soft_deletable_tables()` | TEXT[] | Whitelist de 30 tabelas com soft-delete |

## Audit log · mudanças em dados sensíveis (2026-05-21)

Migration `20260521230000_onda3_audit_log_pii.sql` cria sistema de
auditoria pra rastrear mudanças em colunas sensíveis.

**Postgres não tem trigger de SELECT** · auditamos só
INSERT/UPDATE/DELETE. Pra "quem leu CPF" precisaria de proxy de queries
(overkill por agora).

### Tabela `app_audit_log`

Colunas: `id, table_name, row_id, action, user_id, user_email,
changes (JSONB), created_at`.

Imutável: RLS bloqueia UPDATE/DELETE. Só super-admin lê via SELECT.

### Função genérica `audit_log_changes()`

Trigger AFTER INSERT/UPDATE/DELETE com argumento opcional `TG_ARGV[0]`
= CSV de colunas a auditar. Se vazio, audita todas exceto
`updated_at`/`created_at`. Salva diff `{col: {old, new}}` em JSONB.

### Triggers ativos (8 tabelas críticas)

| Tabela | Colunas auditadas |
|---|---|
| `rh_funcionarios` | salario, remuneracao_bruta, grau_id, status, data_demissao, cpf, email, deleted_at |
| `mem_membros` | cpf, status, deleted_at, nome, email, telefone |
| `mem_contribuicoes` | valor, tipo, membro_id, deleted_at |
| `pcs_progressoes` | salarios, graus, aprovado_por, deleted_at |
| `batismo_inscricoes` | cpf, status, membro_id, deleted_at |
| `cultos_decisoes_pessoas` | cpf, responsavel_cpf, telefones, membro_id, deleted_at |
| `cargo_modulo_permissao` | nivel, pode_exportar, pode_aprovar, escopo_proprio |
| `app_super_admins` | email, ativo, nome |

### Consultar audit log (super-admin)

```sql
-- Quem mudou o salário do funcionário X?
SELECT user_email, changes->'salario', created_at
FROM app_audit_log
WHERE table_name = 'rh_funcionarios' AND row_id = '<uuid>'
  AND changes ? 'salario'
ORDER BY created_at DESC;

-- Histórico de alterações na matriz de permissões
SELECT user_email, changes, created_at
FROM app_audit_log
WHERE table_name = 'cargo_modulo_permissao'
ORDER BY created_at DESC LIMIT 100;
```

### Adicionar audit a nova tabela

```sql
CREATE TRIGGER trg_audit_nova_tabela
AFTER INSERT OR UPDATE OR DELETE ON public.nova_tabela
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'col_sensivel1,col_sensivel2,deleted_at'  -- TG_ARGV opcional
);
```

## UUID FKs canônicos · responsável/líder (transição em curso · 2026-05-21)

Memória `feedback_responsible_by_uuid`: "Responsáveis por UUID · profiles.id".
Migration `20260521220000_onda3_uuid_fks_responsavel.sql` adiciona colunas
UUID em 5 tabelas (mantém TEXT antigas backward-compatible).

### Estado da transição

| Tabela | Coluna TEXT antiga | Coluna UUID nova | Status |
|---|---|---|---|
| `area_responsaveis` | `responsavel_nome` | `responsavel_id` | ⚠️ Coexistem |
| `projects` | `leader` | `leader_id` | ⚠️ Coexistem |
| `projects` | `responsible` | `responsible_id` | ⚠️ Coexistem |
| `event_tasks` | `responsible` | `responsible_id` | ⚠️ Coexistem |
| `cycle_phase_tasks` | `responsavel_nome` | `responsavel_id` | ⚠️ Coexistem |
| `project_tasks` | `responsible` | `responsible_id` | ⚠️ Coexistem |

### Regras durante a transição

1. **Código novo** · SEMPRE usar `*_id` (UUID FK pra profiles)
2. **Código legado** · pode ler tanto TEXT quanto UUID (`leader_id` ou `leader`)
3. **Backend update** · ao mudar `*_id`, também atualizar TEXT (snapshot)
   pra retrocompatibilidade · ou remover coluna TEXT no PR follow-up
4. **Frontend** · trocar autocomplete de TEXT pra select de profiles UUID

### Migração futura · dropar colunas TEXT (PR follow-up)

Quando backend + frontend estiverem 100% usando os `*_id`:

```sql
ALTER TABLE area_responsaveis  DROP COLUMN responsavel_nome;
ALTER TABLE projects           DROP COLUMN leader, DROP COLUMN responsible;
ALTER TABLE event_tasks        DROP COLUMN responsible;
ALTER TABLE cycle_phase_tasks  DROP COLUMN responsavel_nome;
ALTER TABLE project_tasks      DROP COLUMN responsible;
```

## Padrão · adicionar nova tabela com PII

```sql
-- 1. Schema com deleted_at
CREATE TABLE public.nova_tabela_pii (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  -- ... outras colunas ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 2. Índice parcial pra performance
CREATE INDEX idx_nova_tabela_pii_active
  ON public.nova_tabela_pii (id) WHERE deleted_at IS NULL;

-- 3. Adicionar à whitelist (NUNCA esquecer)
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'mem_membros', 'mem_familias', /* ... lista existente ... */,
    'nova_tabela_pii'  -- ← adicionar aqui
  ]::TEXT[]
$$;

-- 4. RLS obrigatório
ALTER TABLE public.nova_tabela_pii ENABLE ROW LEVEL SECURITY;

-- 5. Policies contextuais (5 mínimo)
CREATE POLICY nova_tabela_pii_select ON public.nova_tabela_pii
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('modulo_relevante') >= 1
  );

CREATE POLICY nova_tabela_pii_insert ON public.nova_tabela_pii
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('modulo_relevante') >= 2);

CREATE POLICY nova_tabela_pii_update ON public.nova_tabela_pii
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('modulo_relevante') >= 3)
  WITH CHECK (public.current_user_module_level('modulo_relevante') >= 3);

CREATE POLICY nova_tabela_pii_delete ON public.nova_tabela_pii
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY nova_tabela_pii_service ON public.nova_tabela_pii
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

## Padrão · adicionar novo módulo no menu/permissões

```sql
-- 1. INSERT no catálogo
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'novo-modulo', 'Nome Modulo', '/nova-rota', 'ministerial', 999,
       'descricao', true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'novo-modulo');

-- 2. Seed matriz default · copia de modulo similar
DO $$
DECLARE base_modulo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'modulo_similar';
  INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
    FROM public.cargo_modulo_permissao cmp
    CROSS JOIN public.modulos novo
   WHERE cmp.modulo_id = base_modulo_id
     AND novo.slug = 'novo-modulo'
  ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
END $$;

-- 3. Se tem boost por área · adicionar a AREA_MODULO_BOOST em
-- backend/middleware/auth.js E no array da função current_user_module_level
-- (se módulo segue o padrão "área = slug")
```

## Padrão · adicionar super-admin

```sql
INSERT INTO public.app_super_admins (email, nome, added_by, notes)
VALUES ('email@cbrio.com.br', 'Nome', 'marcos', 'motivo')
ON CONFLICT (email) DO NOTHING;
```

Match é por email LOWER contra `auth.users.email`.
Desativar (preserva histórico): `UPDATE app_super_admins SET ativo = false WHERE email = '...'`.

## Padrão · backend executar soft-delete

```js
// ❌ ERRADO · hard delete irreversível
await supabase.from('mem_membros').delete().eq('id', memberId);

// ✅ CERTO · soft delete reversível
await supabase.rpc('app_soft_delete', {
  p_table_name: 'mem_membros',
  p_row_id: memberId,
  p_deleted_by: req.user?.id ?? null
});

// ✅ Listar só ativos
await supabase.from('mem_membros').select('*').is('deleted_at', null);

// ✅ Restaurar
await supabase.rpc('app_restore', {
  p_table_name: 'mem_membros',
  p_row_id: memberId
});
```

## FKs CASCADE → SET NULL (Phase 1 · 21 FKs convertidas)

**Não converter de volta pra CASCADE** as FKs que apontam para:
- `mem_membros` (11 filhas: contribuições, trilha, histórico, voluntariado, escalas, checkins, devocionais, grupo_membros, devocional_envios, nsm_eventos, grupo_encontro_presencas)
- `rh_funcionarios` (6 filhas: documentos, treinamentos, ferias, avaliacoes, avaliacoes_legacy, progressoes, pontuacao_colaborador)
- `cultos` (2 filhas: decisoes_pessoas, kids_sessoes)
- `kpi_indicadores_taticos` (2 filhas: registros, trajetoria)

CASCADE mantido intencionalmente:
- `mem_duplicados_ignorados` (par de dedup · sem sentido sem o membro)
- `mem_grupo_pedidos` (transient)
- `rh_escalas_extras`, `rh_materiais_funcionarios` (operacional)
- `kpi_krs`, `okr_revisoes` (estrutura OKR · parent-child)
- `kpi_valores_calculados` (cache · `kpi_id` é parte da PK composta)

## Inventário · 65 tabelas com RLS contextual (Onda 2 + 3)

| Bloco | Tabelas | Padrão de acesso |
|---|---|---|
| **P0 Super-admin** | `cargo_modulo_permissao`, `igrejas`, `kpi_metas`, `app_super_admins` | Write só super-admin; read aberto |
| **Onda 3 Soft-delete** | 30 tabelas com `deleted_at` | Use `app_soft_delete()` no backend |
| **Onda 2 Kids (LGPD)** | `kids_criancas`, `kids_responsaveis`, `kids_checkins`, `kids_sessoes`, `kids_salas`, `kids_estacoes`, `kids_etiquetas_log` | Responsável + kids≥1/2/3 + super-admin |
| **Onda 2 Financeiro/RH** | `mem_contribuicoes`, `rh_funcionarios`, `rh_documentos`, `rh_avaliacoes`, `rh_avaliacao_fatores`, `rh_treinamentos`, `rh_treinamentos_funcionarios`, `rh_ferias_licencas`, `pcs_*` (8 tabelas) | Próprio funcionário + módulo rh/financeiro |
| **Onda 2 PII** | `mem_membros`, `cultos_decisoes_pessoas`, `batismo_inscricoes`, `nsm_eventos`, `int_visitantes`, `cui_acompanhamentos`, `cui_jornada180`, `cui_convertidos` | Próprio + módulos relevantes (membresia/integracao/cuidados/painel) |

## Quando precisar quebrar uma regra (raro · justificar)

Algumas situações legítimas pra exceção:
- Tabela de catálogo público (ex: `modulos`, `cargos`, `areas`)
  pode ter `FOR SELECT USING(true)` se não contém PII
- Migration de hotfix urgente (incidente em produção) pode usar
  service_role bypass diretamente · mas DEVE incluir comentário no
  arquivo justificando + criar issue follow-up pra normalizar
- `kpi_valores_calculados` e `cargo_modulo_permissao` não têm
  `deleted_at` porque têm PK composta · documentado nas migrations

Sempre justifique no arquivo da migration com `COMMENT ON ... IS '...'`
ou comentário SQL `-- NOTA: ...`.

---

## Histórico das ondas de lockdown RLS (maio/2026 · concluídas)

A Auditoria de Segurança 2026-05-21 (PRs #586→#642) rodou em ondas: P0
super-admin (`app_super_admins` + `is_super_admin()`), Onda 2 RLS contextual
(Kids/LGPD, Financeiro/RH, PII de membros/decisões/batismos/cuidados), Onda 3
soft-delete + FKs CASCADE→SET NULL, e o lockdown final de 2026-05-22. Estado
final: **541 policies, 0 `USING(true)` em writes**, 10 helpers SQL, 30 tabelas
com `deleted_at`, 8 tabelas com audit log, 21 FKs convertidas. As regras e
padrões resultantes estão nas seções acima (são a lei); a narrativa completa de
cada onda (matrizes tabela a tabela, decisões de cada PR) está em
`docs/CLAUDE-LEGADO.md`.

## ⚠️ Regra contábil · empréstimos NÃO são receita ordinária (2026-05-28)

Decisão do Marcos: em qualquer cálculo, agregação, KPI ou visualização de
**receita** da igreja, **empréstimos NÃO entram como receita ordinária**.

- Empréstimo é **entrada de caixa** (cashflow financiamento), não receita.
- Receita ordinária = dízimos, ofertas, contribuições, eventos pagos,
  campanhas, vendas. Origem operacional/ministerial.
- Receita extraordinária ≠ empréstimo. Doação grande extraordinária pode
  entrar como extraordinária; empréstimo segue como movimentação financeira
  separada (passivo a pagar).

Onde aplicar a regra:
- Dashboards/KPIs financeiros (DRE, "Receita total", "Receita do mês")
- Categorizações automáticas (`fin_padroes_classificacao`, agente
  executor financeiro)
- Relatórios de governança e dízimo/oferta
- Qualquer agregação `SUM(valor)` sobre lançamentos com tipo de
  receita: filtrar/excluir categoria de empréstimo

Quando criar nova view ou query de receita, garantir que a categoria
empréstimo (e tipos correlatos como "captação", "financiamento", "mútuo")
fique fora do total. Se houver dúvida sobre uma categoria nova, **perguntar
antes** de incluí-la em "receita".

## ⚠️ PostgREST do Supabase capa em 1000 linhas server-side (2026-05-25)

Bug pego em producao · cargo `supervisor-jornada` (cargo_id=63) criado,
matriz seedada com nivel 3 nos modulos da jornada, mas o Marcelo Soares
ficava com leitura=0 em tudo sem boost por area.

**Causa** · `supabase.from('cargo_modulo_permissao').select(...)`
retornava no maximo 1000 linhas. A matriz tinha ~1073 linhas. Os cargos
com id mais alto (incluindo supervisor-jornada=63) ficaram fora.

**Importante** · `.range(0, 19999)` no Supabase JS NAO contorna o limite.
O cap eh server-side no PostgREST (`db-max-rows` no projeto Supabase) e
vale pra qualquer cliente. Tentar passar do cap retorna ate o cap.

**Solucoes (em ordem de preferencia)**:

1. **Filtrar no DB** quando souber o filtro · ex: `.eq('cargo_id', X)`.
   Reduz pra ~30 linhas, longe do cap.
2. **Paginar com loop** quando precisar de tudo:
   ```js
   let all = [];
   let offset = 0;
   const pageSize = 1000;
   while (true) {
     const { data } = await supabase.from('tabela').select('*')
       .range(offset, offset + pageSize - 1);
     if (!data || data.length === 0) break;
     all = all.concat(data);
     if (data.length < pageSize) break;
     offset += pageSize;
   }
   ```
3. **RPC** com server-side aggregation quando precisar de stats.

**Aplicado em**:
- `getCargoMatrix(cargoId)` em `auth.js` · filtra por cargo (opcao 1)
- `GET /api/permissoes/matriz` · paginado (opcao 2)
- `GET /api/permissoes/diagnostico/:email` · paginado (opcao 2)

**Auditar quando crescer**:
- `mem_membros` (ja >1000), `mem_voluntarios`, `mem_contribuicoes`
- `cultos`, `mem_grupo_membros`, `nsm_eventos`
- Qualquer exports ou agg que `.select('*')` sem filtro/paginacao

Pra debug similar futuro · `/api/permissoes/diagnostico/:email` mostra
`matrix_stats.cargoMatrix_total_rows`. Se for exatamente 1000, sintoma
do cap presente.

### Varredura Onda 1 aplicada (2026-07-21 · auditoria de performance)

Todos os pontos mapeados pela auditoria de 08/07 que liam base inteira com
select cru foram corrigidos (números de prod do dia: 3.698 membros ativos ·
20.196 contribuições · 1.422 vínculos de grupo ativos · 1.196 check-ins de
voluntário/90d — tudo acima do cap):
- `membresia /contribuicoes/kpis`: totais do ano truncados em 1000 de 3.018 e
  `.in()` com a lista inteira de membros (3,6k UUIDs → URL estoura e falha
  SILENCIOSO · a classificação ativo/irregular/inativo saía do nada). Paginado
  + cruzamento em JS + filtro `deleted_at` que faltava nos membros.
- Séries do carrossel do `/painel`: Generosidade (dizimistas/ofertantes,
  doações R$, doadores únicos), `entradas_grupos` e devocionais →
  `fetchAllPaginado`.
- Coletores do cron (`kpiAutoCollector.js`): `cuidados.engajados_valor` (sem
  `.in()` gigante), `voluntariado.ativos_semanal/trimestral`,
  `generosidade.recorrencia`, `cuidados.devocional_membros`,
  `devocionais.familias`. Helper `fetchAll` promovido a módulo-level — TODO
  coletor novo que ler tabela grande usa ele.
- `notificacaoGenerator` membro-sem-grupo: lia só os 1000 primeiros
  `membro_ativo` (são 1.083) e o `.in()` gigante falhava silencioso — TODO
  MUNDO parecia sem grupo. Paginado + cruzamento por Set.
Já estavam corrigidos (semana de formulários 14–17/07, validado): diretório
da Membresia, `membros_count` de Grupos, snapshots Conectar do painel.
**Regra permanente:** leitura de tabela que passa (ou vai passar) de 1000
linhas usa `fetchAll`/`fetchAllPaginado`; `.in()` sempre em lotes ≤200.

### Onda 2 (2026-07-21 · migration `20260721150000` · ⚠️ aplicar antes do merge)

Matcher + NSM (idempotente · backwards-compatible · mesmos resultados, só
mais barato): (1) `fn_link_or_create_membro` filtrava CPF/telefone com
`coalesce(coluna,'')` — expressão ≠ da do índice único de CPF (20260715120000)
→ planner ignorava o índice e fazia seq scan a cada decisão/cadastro; os
predicados agora usam a coluna crua + `IS NOT NULL` explícito (casa o índice
parcial). ⚠️ Lição permanente: **índice funcional só funciona se a query usar
a expressão IDÊNTICA**. (2) Índices novos: telefone digits + e-mail
lower(trim) em `mem_membros` (ramos 2 e 3 do matcher varriam a tabela) +
`batismo_inscricoes(membro_id)` (EXISTS da NSM). (3) Guarda
`pg_trigger_depth() > 1` nas funções de recálculo da NSM disparadas por
`nsm_eventos` e `cui_convertidos` — a cascata de cada decisão recalculava a
NSM 2x+ na rajada de domingo; escrita em cascata agora conta com o trigger de
`cultos` (depth 0), o cron horário e o recálculo manual; escrita direta
(serviço/backfill) segue recalculando na hora.

## Jornada NSM · engajamento de verdade (2026-06-10)

Contexto: Marcos vai liberar os módulos ministeriais dos 4 primeiros valores
(hoje só Integração usa de verdade) e pediu números honestos ("precisa ser 0
mesmo, até que o convertido entre em outro valor"). Auditoria completa em
2026-06-10 achou os fios soltos; esta leva liga os de código:

- **Numerador do card NSM = engajamento REAL** (migration `20260610160000`):
  `recalcular_nsm()` v3 conta engajado = sinal real em ≥1 valor em
  [decisão, decisão+60d] via `fn_nsm_valores_engajados(membro, decisão, dias)`
  (helper SQL · critério ÚNICO, espelha a tela /painel/nsm/pessoas: trilha
  1º contato/batismo · batismo realizado · Next check-in · grupo · devocional ·
  jornada180 · aconselhamento · voluntário · dízimo/oferta). `por_valor` do
  nsm_estado agora tem chaves = 5 valores (antes eram etapas da trilha · nada
  no front consumia). Antes o numerador aceitava QUALQUER etapa da trilha — e
  a etapa 'conversao' nasce concluída no ato → media "% com cadastro" (21/240
  falsos). Efeito: card foi a 0% até a esteira rodar — decisão do Marcos.
  ⚠️ Sinais novos (entrar em grupo etc.) só refletem no card no cron horário
  da NSM ou recálculo manual (os triggers do recalc são em cultos/cdp).
- **"Engajou" fecha o loop** (`encaminhamentos.js` + `EncaminhamentosInbox.tsx`):
  devolutiva 'engajou' materializa o vínculo REAL — grupos→`mem_grupo_membros`
  (UI exige escolher o grupo · `GET /encaminhamentos/aux/grupos`),
  voluntarios→`mem_voluntarios` (ministério "Voluntariado (geral)"),
  jornada180→`cui_jornada180` (1º encontro na data do contato). Idempotente
  (vínculo ativo existente não duplica). Encaminhamento sem membro → registra
  devolutiva + aviso (não conta na NSM até vincular).
- **Ponte Servir** (migration `20260610150000`): trigger sync
  `vol_profiles.membresia_id` → `mem_voluntarios` (ministério guarda-chuva
  "Voluntariado (geral)" · desde = criação do perfil) + backfills: vincula
  `vol_profiles`/`vol_inscricoes` órfãos a membros EXISTENTES por CPF/e-mail
  (nunca cria membro) e materializa `mem_voluntarios` dos perfis vinculados.
  O voluntariado real vive em vol_* — sem a ponte, Servir nunca etiquetava.
- **`findMembroByCpf` consertado** (`cuidados.js`): buscava o CPF no campo
  TELEFONE (mem_membros TEM coluna cpf) → jornada180/aconselhamento nasciam
  sem membro_id. Agora `.eq('cpf', clean)` + `deleted_at IS NULL`.
- **Generosidade**: fica pra unificação futura com o sistema financeiro
  externo (decisão do Marcos · base com entradas/saídas/transações será
  unificada depois). O critério da NSM já lê mem_contribuicoes quando vier.
- **KPIs nativos dos 4 valores (leva aprovada · migration `20260610180000`)**:
  "usar o módulo preenche o KPI". 3 pernas:
  (1) **10 ramos nativos novos** no `_kpi_agregar_dado`: lideres_treinados
  (`mem_grupo_membros.funcao='lider_treinamento'` · snapshot fim do período),
  lideres_acompanhados (`grupo_supervisao_visitas`×`mem_grupos.lider_id`),
  voluntarios_checkin (% `vol_schedules` com `vol_check_ins` · igreja toda),
  solicitacoes_servir_recebidas/alocadas (`vol_inscricoes` · funil por área
  própria · alocada = enviado_ministerio/integrado/kids),
  solicitacoes_capelania*/aconselh* (`cui_acompanhamentos` · capelania = motivo
  ILIKE '%capelania%' · atendida = responsavel_id preenchido · ⚠️ sem fila
  própria o % tende a 100 — ganha sentido com canal de solicitação futuro),
  frequencia_next (`next_inscricoes` com check-in · igreja toda · sem área);
  o ramo `batismos` passou a respeitar `area_kpi`.
  (2) **Área do batismo herdada da conversão**: trigger
  `fn_batismo_area_da_conversao` (BEFORE INSERT/UPDATE de batismo_inscricoes ·
  area_kpi 'sede' default vira a área de `cui_convertidos` quando
  ami/bridge/online) + backfill → liga os coletores `batismos.{ami,bridge,online}`.
  (3) **Gatilhos de recálculo**: trigger genérico `tg_kpi_recalc_nativo`
  (statement-level · TG_ARGV = CSV de dado_tipos · pula depth>1) em 12 tabelas
  nativas (mem_grupos, mem_grupo_membros, mem_voluntarios, mem_devocionais,
  cui_jornada180, cui_acompanhamentos, cui_convertidos, next_inscricoes,
  vol_check_ins, vol_inscricoes, grupo_supervisao_visitas, batismo_inscricoes)
  + `kpi_recalcular_todos()` como rede de segurança no cron diário
  `/api/kpis/v2/cron/coletar` (que TAMBÉM não estava agendado — agora está no
  vercel.json `0 7 * * *` · coleta fonte_auto + recalcula tudo).
  **Fora da leva (por design/decisão)**: 19 KPIs de NPS aguardam o módulo NPS;
  voluntarios_treinamento (5) sem fonte no vol_*; AMI-06/SED-15 manuais a
  redefinir; limitação documentada: frequencia_next/voluntarios_checkin e os
  ramos antigos de grupos/devocionais/jornada são da igreja toda (KPIs por
  área repetem o valor global).
- **Mandalas · Servir e Generosidade cascateiam por área (2026-06-10 ·
  migration `20260610220000`)**: `mem_voluntarios.area` +
  `mem_contribuicoes.area` (kids/sede/ami/bridge/online · nullable). Backfill
  de voluntários em 2 passes: área da `vol_inscricoes` da pessoa → senão a
  área onde MAIS SERVE nas escalas (vol_schedules×vol_services · team "kid"→
  kids · AMI/Bridge/Domingo/Quarta). Sync vol_profiles e o "Engajou"
  (encaminhamentos) preenchem a área daqui pra frente (engajou usa a área da
  conversão). Mandala: pétalas de Servir = voluntários por área · Generosidade
  = dizimistas por área · **sem área conta no CENTRO mas não nas pétalas**
  (não chutamos área · soma das pétalas pode ser < centro). Ramos de
  voluntários/doações no `_kpi_agregar_dado` respeitam a área do registro →
  KPIs por área param de repetir o global. `mem_contribuicoes.area` é
  estrutura pronta pra unificação financeira. Conectar/Investir seguem "—"
  nas pétalas (grupos/devocionais não têm dimensão de área de culto).

## ⚠️ LEI · guarda de idempotência tem que ser na MESMA chave do índice único (2026-08-04)

Incidente: o Marcelo cadastrava os dados de um convertido na aba Decisões da
Integração, apertava **Registrar** e recebia erro do servidor
(`POST /api/kpis/cultos/:id/decisoes-pessoas 500` · 3 tentativas seguidas às
17:54/17:55/17:56 no culto de 02/08). Nos logs:
`duplicate key value violates unique constraint "nsm_eventos_pessoa_valor_uq"`.

`tg_cultos_dec_pessoas_jornada` (AFTER INSERT ROW em
`cultos_decisoes_pessoas`) guardava o insert com
`NOT EXISTS (origem='culto_decisao' AND origem_id = NEW.id)` — idempotência por
**DECISÃO**. Mas o índice é por **PESSOA**:
`nsm_eventos_pessoa_valor_uq ON (COALESCE(membro_id::text, visitante_id::text, cpf), valor_engajado)`.
Quem já tinha evento `'seguir'` (decidiu num culto anterior) passava pela guarda
— `NEW.id` é outro —, o INSERT violava o índice, e **exceção em trigger AFTER
aborta o statement inteiro**: a decisão não era gravada e a pessoa ficava fora
do sistema. Raio: **386 pessoas** já têm evento `'seguir'`, então toda
re-decisão de qualquer uma delas era um 500 sem saída pela tela.

Migration `20260804180000`: `ON CONFLICT ... DO NOTHING` com o **mesmo alvo** que
`nsm_inserir_evento` (o outro escritor da tabela) já usava — a semântica do
índice é "primeiro engajamento por valor conta". Validado em produção com
INSERT real dentro de transação revertida: decisão gravada, evento `'seguir'`
segue **1**, zero resíduo.

- ⚠️ **NÃO afrouxar o índice**: é ele que faz a NSM contar PESSOAS engajadas, e
  não eventos. Removê-lo duplicaria gente no numerador.
- ⚠️ **A expressão do `ON CONFLICT` tem que ser IDÊNTICA à do índice** (mesma
  lição do índice funcional da Onda 2), senão o Postgres recusa a inferência.
- ⚠️ A migration foi escrita sobre a definição **VIVA** do banco, não sobre o
  arquivo `20260518150000`: prod tinha um `SET search_path` que o arquivo não
  tem, e replicar do arquivo teria apagado essa proteção em silêncio.
- **Nenhum número mudou**: a linha duplicada que agora é ignorada nunca chegou a
  existir (o INSERT falhava). Resíduo consciente: re-decisão não atualiza
  `data_decisao` do evento já existente.
- Régua que fica: **guarda `NOT EXISTS` só protege se checar a mesma chave que o
  índice**. Guarda numa chave e UNIQUE em outra = 500 que ninguém entende, e no
  fluxo de pessoa isso significa cadastro perdido.

## Planejamento Estratégico × Gestão Anual · virada conceitual (2026-06-10)

Reorganização por **horizonte de tempo** (Marcos). Dois módulos distintos — não
confundir, não misturar estratégico com rotina:

- **`expansao` (rota `/expansao`) = "Planejamento Estratégico"** (era "Expansão"). É o
  **plurianual / macro‑eixo**. "Expansão" virou só o nome do **plano vigente** (Quadriênio
  2026–2029 · Pr. Pedrão), não do módulo. Marcos/tarefas/Gantt/Timeline seguem iguais. Ganhou
  a aba **Acompanhamento** (tabela `pe_planos` · migration `20260609130000`): planos **em
  execução** (progresso agregado dos marcos do período) e **já executados** (com **parecer
  documental** + avaliação · snapshot congelado no encerramento). Encerrar/Reabrir/Novo plano.
- **`planejamento` (rota `/planejamento`) = "Gestão Anual"** (era o painel PMO consolidado).
  Página `src/pages/GestaoAnual.jsx`. Hub do que está **fora do ano corrente**: aba **Próximo
  ano** (rascunhar projetos/eventos do ano seguinte · criação **direta, sem aprovação** · botão
  "Gerar litúrgicos" via `event_liturgia_templates`) + **Resultados** (anos fechados ·
  planejado×realizado, read‑only). **Fonte única, duas lentes:** grava nos próprios
  `projects`/`events` por `year`/`date` — sem tabela paralela, sem "aprovar e copiar".
- **Projetos / Eventos = só o ANO CORRENTE.** O seletor de ano saiu dos dois (virou chip "ano
  corrente"); planejar/revisar outros anos é na Gestão Anual. `projects.year` / `events.date`→ano
  continuam; o filtro fica travado no ano atual.

⚠️ **Slugs e rotas NÃO mudaram** (`expansao`/`planejamento`) — só o `modulos.nome` de exibição
(migrations `20260609120000` e `20260610120000`). Nunca renomear slug/rota (quebra
ROUTE_MODULE_MAP, matriz de permissões e bookmarks).

### Legado REMOVIDO (não funciona mais assim · não tratar como ativo)
O antigo **"Planejamento Anual"** (propostas → aprovação diretor→diretoria → materializa em
event/project) foi **aposentado** — nunca foi usado (0 propostas). Removidos: telas
`/planejamento/anual` (`AnualCiclos.jsx` + `AnualCicloDetalhe.jsx`) e `Planejamento.jsx` (PMO);
tabelas `planejamento_propostas`/`_audit`/`_setores`/`_areas_setor` **dropadas** (migration
`20260610130000`). **Mantidos:** `event_liturgia_templates` (o hub usa) e `planejamento_ciclos`
(dormente · pode virar portão "ano aberto/fechado"). As colunas `events.proposta_id`/
`projects.proposta_id` ficaram (só a FK saiu · inócuas).

### Dívida técnica (código morto · sem chamador · NÃO é referência viva)
Para não arriscar a liturgia (arquivo de 760 linhas), ficaram intactos mas **órfãos**: o
namespace `planejamento` em `api.js` (exceto `gerarLiturgia`, que o hub usa) e os endpoints de
propostas/setores/ciclos em `backend/routes/planejamento.js`. Só `/planejamento/liturgia/*` é
vivo. Aparar quando der.

PRs: #938 (rename PE), #944 (Acompanhamento), #948 (rename Gestão Anual), #951 (hub), #952
(recorte de ano), #954 (limpeza · DROP). Migrations aplicadas em prod por Marcos.

## Grupos · Log de alterações (2026-07-20)

Pedido do Marcos (com a Naná saneando a listagem de grupos): rastrear **o que
mudou e quando** em `mem_grupos`/`mem_grupo_membros` — `created_at` só data o
INSERT, `updated_at` é sobrescrito em massa e edição/remoção não deixava rastro.
Migration `20260720230000_grupos_audit_log.sql` (idempotente ·
backwards-compatible) liga o `audit_log_changes()` genérico (app_audit_log ·
20260521230000) nas 2 tabelas, todas as colunas. Leitura:
`GET /grupos/:id/historico-alteracoes` (guard grupos>=3 · service role lê o
app_audit_log e resolve o nome do participante) + card **"Log de alterações"**
na ficha do grupo em `Grupos.jsx` (`LogAlteracoesCard` · carrega sob demanda).
Limitação conhecida: escrita via backend (service role) fica **sem autor**
(`auth.uid()` nulo → exibe "sistema") — autoria por request é evolução futura.
O log só grava a partir da aplicação da migration (nada retroativo).

## Grupos · Renovação de temporada pelo líder (2026-07-21)

Pedido do Marcos: 1×/semestre, com a temporada fechada (antes de abrir as
inscrições da próxima), TODOS os líderes recebem WhatsApp perguntando se
continuam com o grupo. **Disparo SEMPRE manual** da coordenação (lei de 20/07 —
nada automático pro líder), no card "Renovação de temporada" em Config >
Temporadas (`TemporadasGrupos.jsx` · nível 5 · re-executar reenvia SÓ aos
sem-resposta). Fluxo do líder no link público `/g/r/<token>`
(`GrupoRenovacao.jsx` · token `renov` 30d · molde da frequência):
- **SIM** → checklist do roster DESMARCADO ("quem provavelmente continua" ·
  estimativa explícita) + selecionar todos + modal de confirmação **com os
  NOMES** de quem sai. Não-marcado → `saiu_em` + `renovacao_id` (coluna FK
  dedicada em `mem_grupo_membros` — NUNCA tag em texto) + motivo humano.
  Pessoa segue no sistema e pode se reinscrever na abertura. **Reedição
  permitida** (última vence): re-marcar reativa SÓ vínculos com
  `renovacao_id` da própria renovação e sem outro vínculo ativo.
- **NÃO** → motivo obrigatório → o grupo NÃO fecha: vira 4ª origem na Caixa
  de entrada (`ren_nao_continua`) pra triagem da Naná (`PainelRenovacao`:
  fechar grupo / buscar líder / manter · nota obrigatória) + `notificar()`.
- **Sem resposta → roster INTOCADO** (lei: nunca remover por omissão).

Segurança do submit (conselho 21/07): o POST carrega a lista **exibida** — o
servidor só age sobre `exibidos ∩ roster ativo atual` (quem entrou depois da
tela aberta nunca é removido por submit atrasado); token morre com: geração
antiga (`token_geracao` na linha · reenvio incrementa), liderança trocada,
linha triada ou **inscrições da temporada abertas**. Schema:
`mem_grupo_renovacoes` (UNIQUE grupo+temporada · snapshot do líder ·
contadores/ids jsonb como cache de exibição · triagem_*) + RLS molde
mem_lider_inscricoes + audit trigger + whitelist (migration `20260721170000`,
que também DROPa `uniq_mem_grupo_membros_ativo` — formaliza o multi-grupo que
já valia em prod). Template Meta `grupos_renovacao_temporada` (UTILITY · {{1}}
nome {{2}} temporada {{3}} grupo {{4}} link como variável de body · env
override `WHATSAPP_TEMPLATE_GRUPOS_RENOVACAO`) via fila `whatsapp_envios`.
A pessoa removida NÃO é notificada (decisão pastoral) — o caminho de volta é o
broadcast de abertura das inscrições.

## Grupos · "Confira a lista do seu grupo" (2026-07-31 · migration `20260731120000`)

**3º fluxo do líder**, irmão da renovação mas SEM a pergunta "vai continuar?" e
SEM a trava de temporada aberta. Problema real: o roster está poluído (gente que
saiu, cadastros de teste da varredura de julho, importados de 10/07 que talvez
nunca tenham frequentado) e a coordenação (Naná/Pr. Nélio) não tem como saber —
**o líder é a única fonte confiável**. Os 2 links que existiam não resolvem: a
**frequência** (`/g/f/`) só MARCA PRESENÇA (não remove ninguém) e a **renovação**
(`/g/r/`) é BLOQUEADA com as inscrições da temporada abertas e fala de "preparar
a próxima temporada" (confuso no meio da T2).

O líder abre `/g/c/<token>` (`GrupoConfiraLista.jsx`), vê a lista atual **toda
marcada** e **DESMARCA quem não faz mais parte**.

**Decisões de produto (fechadas · não reabrir):**
- **Marca quem SAI** — o OPOSTO da renovação (que vem desmarcada). Aqui o padrão
  esperado é "a lista está certa" e o atrito fica só em quem sai.
- **Confirmação com os NOMES** de quem vai sair antes de aplicar (o líder tem
  que ver quem está removendo).
- **Motivo NÃO é obrigatório por pessoa** (atrito demais): é UM só, do lote, e
  OPCIONAL (`mem_grupo_conferencias.observacao` · vai também pro `motivo_saida`).
- **Remoção soft e rastreável**: `mem_grupo_membros.saiu_em` +
  **`conferencia_id`** (coluna dedicada espelhando o `renovacao_id` — NUNCA tag
  em texto). Reedição permitida (última vence), reativando SÓ o que ESTA
  conferência removeu.
- **NUNCA remover por omissão** (líder que não responde = roster intocado) e a
  **pessoa removida NÃO é notificada** (decisão pastoral vigente na renovação) —
  quem é notificada é a COORDENAÇÃO, quando houve remoção.
- **Repetível na temporada** (diferente da renovação, 1×/semestre): 1 linha por
  **(grupo, rodada)**. `temporada_id` é só SNAPSHOT informativo — de propósito
  não trava nada.
- ⚠️ **LIDERANÇA (`funcao IN ('lider','co_lider')`) NÃO É REMOVÍVEL por aqui.**
  Cenário real: co-líder Ana no roster; o líder desmarca achando que é
  participante → `saiu_em` gravado → o `GET /public/grupos/buscar` (que monta
  `lideres_busca`/`lideres_exibicao` com `funcao IN ('lider','co_lider')` +
  `saiu_em IS NULL`) para de devolver a Ana e **o grupo deixa de ser encontrável
  pelo nome dela** na página pública e no mapa, sem ninguém ser avisado. O roster
  devolve `funcao`/`papel`/`protegido` (papel de MAIOR nível entre os vínculos —
  multi-vínculo é real), a tela mostra badge de papel + cadeado e o **SERVIDOR
  força liderança exibida como mantida** (payload é do cliente; a decisão é
  nossa). Trocar liderança é ato de gestão (aba Pessoas do /grupos ·
  `PUT /membros/:id/funcao`), nunca efeito colateral de conferir lista.
- ⚠️ **Contagem é de PESSOAS, não de vínculos** (régua de 23/07): o `{{3}}` do
  template e o `membros_ativos` do painel contam `Set` de `membro_id`
  (`comRoster` = Map de Set · `membrosPorGrupo` idem). A UNIQUE de vínculo ativo
  foi dropada (multi-grupo real), então contar LINHAS diria "são 12 pessoas" no
  WhatsApp e mostraria 10 na tela.

**Segurança do submit** (lição registrada da renovação): o servidor só age sobre
`exibidos ∩ roster ativo atual` — quem entrou depois da tela aberta nunca é
removido por submit atrasado. O UPDATE de remoção leva **`.is('saiu_em', null)`**:
fechamento concorrente da coordenação não é sobrescrito (senão a saída MANUAL
dela passaria a apontar pra esta conferência e viraria reversível pela reedição
do líder). Token `conf` = `{ p: grupoId, c: conferenciaId, g: geração,
l: liderId }` (30d), mas a validade REAL é decidida a cada uso: geração × linha,
liderança atual e linha não triada.

⚠️ **RODADA NOVA MATA O LINK DA ANTERIOR em 2 camadas.** `nova_rodada` faz INSERT
de linha nova, então (1) o disparo **incrementa o `token_geracao` da linha
antiga** (o mecanismo de revogação que já existe · feito ANTES do insert — se
falhar, não abrimos rodada nova com dois links vivos) e (2) `contextoConferencia`
recusa 403 quando existe linha viva do mesmo grupo com `rodada` maior. Sem isso o
líder podia clicar na mensagem VELHA e remover gente gravando o `conferencia_id`
da rodada 1 — o painel (que lê só a última rodada) não contaria essas saídas e
mostraria a rodada 2 como "não respondeu": a coordenação decidiria sobre um
painel que subestima o que aconteceu.
⚠️ `ultimasConferencias` é **paginado com `.range()`** (não `.limit(1000)`): o
`order('rodada')` é CROSS-GROUP e num truncamento quem cai fora é justamente o
grupo que só tem rodada 1 → seria classificado como 'nova' → INSERT com rodada 1
bate 23505 contra o UNIQUE parcial → erro engolido em `erros.linha` e **o líder
nunca recebe**. Por isso o toast do disparo soma `erros.linha + erros.montar` e
avisa em âmbar quando > 0 — falha silenciosa aqui é líder sem mensagem.

**Disparo SEMPRE manual** (lei de 20/07 · **sem cron**), no card "Confira a lista
do grupo" da aba **Envios** (`GruposEnvios.jsx`), no padrão dos outros disparos:
audiência líder/bairro/rede/todos → prévia (contagem + exemplo + quem NÃO recebe
+ quem é pulado) → **confirmação DIGITANDO o número** (freio mais forte que os
outros cards: é o único disparo que muda o roster). Reenvio manda só pra quem
**não respondeu**; grupo que já respondeu só volta com `nova_rodada=true`.
Respeita bloqueio geral, `whatsapp_lideres.recebe_lembretes` (opt-out) e exige
roster (grupo vazio não tem lista pra conferir). **Painel de triagem no mesmo
card** (não criei tela nova): quem respondeu, quantos saíram, quem não respondeu,
+ "Marcar tratada" (nota curta obrigatória → status `triada`, que mata o link).

Template Meta **`grupos_confira_lista`** (UTILITY pt_BR · 4 variáveis · {{1}} 1º
nome do líder · {{2}} grupo · {{3}} quantidade de pessoas na lista · {{4}} o link
como **variável de body**, não botão — é o que mantém a categoria UTILITY). Env
de override `WHATSAPP_TEMPLATE_GRUPOS_CONFIRA` (default `grupos_confira_lista`).
Sai pela fila `whatsapp_envios` (retry/backoff), como todos os outros.

**Arquivos:** migration `20260731120000_grupos_confira_lista.sql` ·
`services/gruposWhatsapp.js` (`montarEnvioConfira`) · `services/gruposEnvios.js`
(`previewConfira`/`dispararConfira`/`ultimasConferencias`) · `routes/grupos.js`
(`/confira/painel`, `/confira/preview`, `/confira/disparar`, `/confira/:id/triar`)
· `routes/publicGrupos.js` (GET/POST `/grupo/confira`) ·
`pages/public/GrupoConfiraLista.jsx` + rota `/g/c/:token` · `api.js`
(`grupos.confira.*` + `gruposPublic.confiraPorToken/responderConfira`).

### Confira v2 · 4 categorias + pedidos pendentes (2026-08-04 · SEM migration)

Decisão do Marcos (a Naná preferiu o link WhatsApp ao app): a tela `/g/c/`
passou a separar o roster em **4 situações** — **Liderança** 🔒 · **Inscritos
nesta temporada** 🔒 (vínculo `created_at >= data_inicio` da temporada com
`inscricoes_abertas`) · **Renovações confirmadas** 🔒 (vínculo com linha em
`inscricao_consentimentos` porta `grupos` e `ref_id` = id do VÍNCULO — só a
renovação grava assim; é a derivação-remendo do handoff, o campo "confirmado
pra temporada X" segue pendência estrutural) · **Sem confirmação** (o ÚNICO
removível pela tela). Travar inscrito/renovado protege a evidência de quem
acabou de entrar/renovar — **o POST re-deriva as categorias e blinda no
SERVIDOR** (payload é do cliente), então bundle antigo aberto não fura.

- **+ Aguardando aprovação**: os `mem_grupo_pedidos` pendentes do grupo entram
  na tela; desmarcar = **DEVOLVE pra triagem** (`status='devolvido'` · lei de
  14/07 · motivo fixo · `decidido_por_nome = "<líder> (confira a lista)"` ·
  `registrarEventoPedido('recusado_lider', {origem:'confira_lista',
  conferencia_id})` awaited). O ✓ NÃO aprova (aprovação segue no link
  individual /g/a/ — evita aprovação em massa acidental + gasto de tier).
  Devolução é **one-way** pela tela (reedição não re-pendentifica — a triagem
  pode já ter realocado; o GET lista os já-devolvidos read-only via evento
  `detalhe->>conferencia_id`). Guardas no UPDATE: `.eq(grupo_id)` +
  `.eq(status,'pendente')` (ids alheios no payload não fazem nada).
- Notificação à coordenação ganhou a contagem de devolvidos e aponta
  `?tab=entrada` quando houve devolução. Resposta do POST +=
  `pedidos_devolvidos`. GET += `temporada` (label), `pedidos_pendentes`,
  `pedidos_devolvidos`.
- ⚠️ Sem temporada aberta a categoria 'inscrito' não existe e o fluxo segue
  funcionando (desenho original). Template Meta continua o MESMO
  (`grupos_confira_lista` aprovado 03/08 — 1 template pras 2 ocasiões, o
  contexto vive na tela; o {{3}} segue contando pessoas do roster).
- **'Inscrito' inclui o PILOTO pré-abertura (Marcos · 05/08 · SEM migration):**
  vínculo criado até **30 dias ANTES** da `data_inicio` conta como 'inscrito'
  **se e só se** existe `mem_grupo_pedidos` **aprovado** do mesmo membro no
  mesmo grupo (`membrosInscritosPreAbertura` em publicGrupos.js · aplicada no
  GET **e** na re-derivação do POST). Caso real: Nathália Pigatti, pedido
  aprovado 28/07 no piloto de 26-28/07 com a T2 abrindo 01/08 — caía em "Sem
  confirmação" removível. Exigir o pedido aprovado é o que separa confirmação
  real do import de 10/07: medido em 05/08, **8 pessoas em 4 grupos** flipam
  pra 'inscrito'; os ~380 vínculos restantes da janela (import, sem pedido)
  seguem removíveis. O `aprovarPedidoCore` sempre grava `membro_id` no claim —
  é isso que torna a chave (grupo, membro, aprovado) confiável.
- ⚠️ **Renovação × Confira vão virar UM fluxo** (decisão do Marcos · 05/08):
  a ideia é um pedido só — "deseja continuar o grupo?" e em seguida "escreva
  quem fica". **Por enquanto NADA foi disparado nem alterado nos 2 fluxos**
  ("por enquanto deixa assim, nao dispara nada") — a renovação (`/g/r/`) segue
  nunca disparada nesta temporada (0 linhas em `mem_grupo_renovacoes`) e o
  template `grupos_renovacao_temporada` segue aprovado e ocioso.

**Feedback Naná/Nélio (04/08 · teste real — os 2 responderam em minutos):**
(1) intro da tela virou 2 parágrafos curtos, SEM a explicação "quem sair
continua cadastrado…" no topo (as instruções curtas vivem no título de cada
seção; o modal de confirmação mantém a explicação completa). (2) A caixa de
entrada (`GruposEntrada.jsx`) ganhou o bloco recolhível **"Líderes · quem
falta responder"**: conferência da lista (responderam × receberam-e-não ×
nunca receberam · reusa `GET /grupos/confira/painel`, o MESMO endpoint do
card da aba Envios — lazy ao abrir) + **"Aprovações paradas"** (pedidos
`pendente` agrupados por grupo/líder com idade do mais antigo, client-side
sobre as linhas já carregadas — o nome do líder vem no próprio pedido via
`mem_grupos → mem_membros!lider_id`; segue os filtros da tela). ⚠️
`aprovacoesParadas` é useMemo declarado DEPOIS de `rowsBase` (lição TDZ).

⚠️ **Aplicar a migration antes do merge.** O fluxo NOVO tolera a ausência dela
(`schemaAusente()` → **503 com aviso claro** no público, `{disponivel:false, aviso}`
no painel), e **nenhum fluxo existente lê a tabela/coluna nova** — frequência e
renovação não piscam sem a migration (lição `parcelas_max`).
⚠️ `montarDestinatariosFrequencia` passou a devolver `roster_count` por grupo
(`comRoster` virou Map pra alimentar o {{3}} do template) — `.has()` segue
idêntico pros chamadores antigos.

## Grupos · triagem aprova POR CIMA da recusa + troca o grupo ali (2026-08-05 · SEM migration)

Caso real: **4 mulheres do ONLINE - MULHER ÚNICA devolvidas por engano** pela
líder na "Confira a lista" de 04/08 — e a Caixa de entrada só oferecia «Sugerir
outro grupo» (depende de a pessoa aceitar pelo WhatsApp) ou «Rejeitar de vez»:
o botão Aprovar só existia pra `status='pendente'`. Decisão do Marcos: recusa
por engano é frequente; a triagem (Naná) decide por cima, inclusive movendo a
pessoa de grupo, **sem autorização do líder**.

- **`POST /grupos/pedidos/:pedidoId/aprovar-direto`** (nível 3 · body
  `{ grupo_id? }`): aceita pendente/devolvido/rejeitado/encaminhado (aprovado é
  409). Reabre pra `pendente` + realoca o `grupo_id` (validado contra grupo
  vivo/ativo) **num UPDATE só com guarda de corrida** no status atual, registra
  o evento `aprovado_triagem` ({status_anterior, realocado_para} · **awaited**,
  serverless descarta trabalho pós-res.json) e delega ao **`aprovarPedidoCore`
  canônico** — vínculo, WhatsApp ao líder e à pessoa (gate de opt-in), evento
  'aprovado', tudo pelo caminho único. NÃO é um 2º fluxo de aprovação.
- **UI (`GruposEntrada.jsx` · PainelPedido)**: botão primário **«Aprovar mesmo
  assim»** em devolvido/rejeitado/encaminhado + ghost **«Aprovar em outro
  grupo»** no pendente — os dois abrem o mesmo painel inline com select de
  grupo (default «Manter: <grupo do pedido>»). Hints de devolvido/rejeitado
  citam o caminho novo; `EVENTO_META.aprovado_triagem` na timeline.
- ⚠️ A realocação NÃO passa pela sugestão (`sugerido_grupo_id` fica intocado;
  link /g/s/ vivo de um encaminhado morre sozinho porque o pedido vira
  aprovado). `api.aprovarPedidoDireto(id, grupoId)`.
- Os 6 casos de 05/08 (4 do MULHER ÚNICA + Eliane Rangel Fonseca + Bruno de
  Mendonca Paiva) foram aprovados por script ANTES desta feature (reabertura +
  `aprovarPedidoCore` · backup em `scratchpad/backup_pedidos_aprovacao_20260805.json`;
  confirmação de aprovado enfileirada na `whatsapp_envios` pra quem tem opt-in —
  Rafaela ficou de fora por `whatsapp_optin=false`).

## ⚠️ Grupos · link de aprovação 7d → 30d + PRORROGAÇÃO dos já entregues (2026-08-12 · SEM migration)

Pedido da Natasha: *"o link de aprovação de pessoas em grupos fique válido por
mais de 7 dias, os líderes estão aprendendo e alguns deixaram muito tempo sem
aprovar; revalide o link novamente e renove ele até o fim do mês."*

**Medido em produção antes de mexer (12/08): dos 90 pedidos pendentes, 51 (57%)
já tinham passado dos 7 dias** — ou seja, o link mais cobrado era exatamente o
que não abria mais. 35 líderes, 36 grupos, **0 com opt-out**, 0 líder sem
telefone (1 pedido em grupo sem `lider_id`: JOVENS - GRUPO DE JIU-JITSU). O TTL
de 7 dias briga com o próprio fluxo que a casa adotou em 29/07 (o template v2
manda o líder **LIGAR** pra pessoa antes de aceitar).

### ⚠️⚠️ O `exp` vive DENTRO do token assinado — subir o TTL não revalida nada

Essa é a parte que engana: `APROV_TTL_MS` de 30 dias só vale pra link **NOVO**.
Os 51 já entregues continuariam mortos, e "revalidar" pareceria exigir
**reenviar ~90 mensagens** — 8 pra um mesmo líder (Cristiano), 7 pro Pr. Nélio,
6 pra Camila. É o padrão que a Meta lê como spam, e **a nota de qualidade é o
que decide a subida de tier** que a igreja quer.

⇒ Quem revalida é o **SERVIDOR**: `verificarToken` aceita token `'aprov'`
vencido **até uma data-limite**. O líder abre a mensagem que já está no WhatsApp
dele e funciona. **Zero envio, zero custo, nenhum líder incomodado.**

- ⚠️ **NÃO é afrouxamento geral**, e o teste existe pra que virar um seja
  decisão consciente: a assinatura HMAC continua obrigatória, vale **SÓ** pro
  tipo `'aprov'` (que dá acesso a UM pedido) e as duas travas de
  `publicGrupos.js` seguem mandando — pedido tem que estar **`pendente`** e
  `payload.l` tem que ser o **líder ATUAL** do grupo (trocou a liderança, o link
  morre na hora, prorrogado ou não). É a mesma tese já aplicada à renovação e à
  conferência: *"a validade real é decidida no servidor a cada uso"*.
- ⚠️ **Tem PRAZO e morre sozinha** (`2026-08-31T23:59:59-03:00` — o "fim do mês"
  que ela pediu): remendo datado, não porta permanente. Depois disso link
  vencido volta a ser recusado e o TTL de 30d passa a bastar. Env
  `GRUPOS_APROV_PRORROGADO_ATE` (ISO) estica sem deploy; **data inválida ou
  vazia DESLIGA** (fail-closed).
- ⚠️ **Data com fuso, não ingênua**: `'2026-08-31'` seria meia-noite UTC = 20h51
  do dia 30 no Rio, e a prorrogação morreria um dia antes do combinado. Tem
  teste em cima disso.
- ⚠️ **O default de 7 dias NÃO subiu junto** (`TOKEN_TTL_MS` intocado): sugestão
  (`/g/s/`) e chamada do mês (`/g/f/`) não foram pedidas, e subir o default
  esticaria TRÊS fluxos de uma vez sem ninguém pedir.
- `payload.prorrogado = true` marca quem entrou pela exceção (sem a marca, não
  há como distinguir depois o que passou pela tolerância).

**A régua saiu de `services/gruposWhatsapp.js` para `backend/utils/gruposToken.js`**
(pura: só `crypto` + env) — é o que a coloca no **gate de deploy**; o serviço
**re-exporta** `assinarToken`/`verificarToken`, então nenhum import mudou. NÃO
reimplementar assinatura/validade no serviço: duas cópias divergiriam.
`src/test/gruposToken.test.ts` (14 casos, `agora` **injetado**) é
**mutation-testado** — estender a tolerância a qualquer tipo, tirar a
data-limite ou deixar token sem `exp` passar deixa o gate vermelho.

### ⚠️ Quem NÃO tem mensagem antiga pra revalidar são 3, não 9 (alarme meu, medido de novo)

9 pendentes estavam sem envio PRÓPRIO e eu ia reportar isso como "9 líderes sem
aviso". **6 deles são o CÔNJUGE de uma inscrição de casal** — e ali o desenho é
mandar **UM aviso só**, no pedido do titular, com os dois nomes em `{{3}}`
(decisão de 30/07). O par foi avisado; o pedido do cônjuge nunca teria envio
próprio. Régua que fica: **ao auditar entrega de aviso de grupo, conferir
`casal_pedido_id` antes de contar** — senão todo grupo de casais aparece como
falha de entrega.

Sobram **3** (follow-up de gente · envio é ação externa, fica com a coordenação):
- **ROTEIRO DA MENSAGEM DE DOMINGO** (Rodrigo Paula Silva · líder Roberto da
  Silva Franco Neto) — pedido de 27/07, **nenhum envio**. Data anterior ao fix
  de 31/07 que passou o aviso ao líder a ser **awaited**; é o sintoma exato
  daquele bug (serverless congela na resposta e descarta o trabalho pendente).
- **JOVENS - GRUPO DE JIU-JITSU** (Rodrigo Costa) — o **grupo não tem
  `lider_id`**, então não há a quem avisar. É cadastro: resolver na aba Pessoas.
- **SER MULHER** (Mayla Marçal Portela Seoud · líder Márcia Trigo) — envio
  recusado com **`invalid_phone`**. Telefone da líder precisa ser corrigido na
  Membresia (a normalização da porta só vale pra dado novo).

## ⚠️ Grupos · membro existente ganha o que digitou no formulário (2026-08-06 · SEM migration)

Pedido do Marcos, depois da auditoria da temporada: *"recupere esses que já
foram e garanta que os próximos quando preencherem, já vir corretamente os
dados para os campos"*. O achado: quando o matcher liga a inscrição num
cadastro JÁ EXISTENTE (import antigo), o enriquecimento só-onde-vazio cobria
foto/sexo/nascimento — **CPF e e-mail digitados não chegavam ao cadastro**.
Medido em 06/08: 20 pessoas (aprovadas 26/07+ e pendentes) com cadastro de
import (13/05–23/06) sem CPF, e **os 20 CPFs digitados guardados em
`mem_identidade_observacoes`** — coletados e nunca aplicados. Mesma classe do
bug do CPF do censo (04/08), versão branda (evidência preservada).

- **`processarPessoaPedido` (publicGrupos.js)**, no ramo de membro existente:
  (1) o só-onde-vazio ganhou **e-mail e telefone** (política do censo: vazio
  preenche; divergente NUNCA sobrescreve — acumula em `mem_contatos` via
  `registrarContatoDaPorta`, a MESMA função do matcher); (2) depois do
  enriquecimento roda **`reconciliarCpfTardio`** com a confiança canônica do
  `_consolidarCpfNoMatch` ('forte' só em nome+nascimento; e-mail/telefone+nome
  = 'fraca'). Nascimento divergente ou CPF de outra pessoa segue virando
  `identidade_pendencias` — fila humana, nunca fusão. Best-effort: falha não
  derruba a porta.
- ⚠️ **A ordem (enriquecer ANTES de consolidar) é decisão, não descuido**: o
  formulário exige nascimento, o cadastro de import geralmente não tem — o
  gate 'fraca' do reconciliar exige nascimento dos 2 lados, e sem o
  preenchimento prévio quase nenhum CPF consolidaria (o pedido do Marcos é que
  os dados CHEGUEM). O caso perigoso (cadastro com nascimento DIFERENTE do
  digitado) continua barrado: só-onde-vazio não sobrescreve, e o reconciliar
  detecta a divergência e abre pendência.
- ⚠️ **`aprovarPedidoCore` NÃO enriquece pedido com `membro_id`** (só o ramo de
  cadastro pendente/promoção) — quem completa o cadastro agora é a INSCRIÇÃO.
  Registrado porque uma resposta anterior minha afirmou o contrário.
- **Reparo dos que já passaram** (script com dry-run + backup em
  `scratchpad/backup_reparo_cpf_email_grupos_20260806.json`): CPFs das
  observações consolidados via `reconciliarCpfTardio` + e-mails/telefones dos
  pedidos aplicados só-onde-vazio nos membros de pedidos aprovados (26/07+) e
  pendentes. Conflito de CPF virou pendência em Entradas, como manda o contrato.

## Grupos · Caixa de entrada ganhou o "Retrato do período" + contato impossível (2026-08-03 · SEM migration)

Depois da varredura do lançamento (domingo 02/08), o Marcos pediu: *"eu gostaria
de ter essa visualização dentro do sistema ali na aba de caixa de entrada"*. A
análise que eu fazia por script agora vive no módulo.

### ⚠️ O rótulo do período É parte do número (correção de 03/08 · mesmo dia)

O Marcos abriu o painel e perguntou: *"você me disse que tinham 176 pessoas
inscritas, mas agora diz 301 pedidos e 193 pessoas distintas, que números são
esses?"* **Nenhum estava errado** — o filtro padrão da aba é **180 dias** e somava
os **120 pedidos de julho** (demo, varredura da Nana, piloto de 26-28/07):
301 = 120 (julho) + 181 (agosto). O defeito era o título genérico "Retrato do
período", que não dizia QUAL período.

- O título passou a **nomear a janela**: "Retrato · temporada T2-2026 (01/08 a
  hoje)". Rótulo de agregado sem a janela ao lado é convite a ler o número errado.
- Opção **"Temporada atual"** (1ª do filtro): *"como foi a abertura?"* é a
  pergunta real e **nenhuma janela em DIAS a responde de forma estável** — hoje
  "7 dias" pega a abertura, em duas semanas não pega mais.
- Aviso âmbar quando a janela pega pedido de ANTES da temporada, com atalho pra
  trocar. É o caso que gerou a dúvida.
- **`src/lib/janelaPeriodo.js`** virou a fonte ÚNICA (lista + painel + rótulo).
  ⚠️ Antes `Date.now() - fPeriodo * 86400000` estava repetido em **3 lugares** — e
  com a opção nova (que não é número) cada um daria `NaN`; **NaN em comparação de
  data não filtra nada: mostraria tudo, em silêncio.**
  ⚠️ `data_inicio` é parseada com **`T12:00:00` local**: `new Date('2026-08-01')` é
  meia-noite UTC = 31/07 21h no Rio, e um pedido da véspera (temporada ANTERIOR)
  entraria como se fosse da nova. Guarda mutation-testada em
  `src/test/janelaPeriodo.test.ts` (7 casos, com `agora` injetado — teste que
  depende da hora da execução foi o que mordeu no `faixaEtaria.test.ts`).

**⚠️ NÃO virou sub-aba nem tela nova** — a Caixa de entrada é **lista única sem
sub-abas** por decisão dele (14/07). O retrato entrou como bloco recolhível
ACIMA da lista, e **derivado de `rowsBase`**, o mesmo objeto que já alimenta os
cards: segue origem/período/busca automaticamente. Se fosse um endpoint de
agregação próprio, a tela teria dois números para a mesma pergunta.

O painel mostra: **pedidos × PESSOAS distintas** (176 pedidos do domingo eram 160
pessoas — 14 pediram 2+ grupos, e um dos devolvidos foi exatamente alguém que se
inscreveu duas vezes sem perceber), novas × já cadastradas, "as mensagens
chegaram?" (líder avisado/falhou · pessoa avisada/falhou), por grupo + **quais
grupos não receberam nenhum pedido**, e barras por dia.

- `GET /grupos/entrada/cobertura?desde=` é o **único** dado que a lista não
  responde (grupos ativos sem pedido — 30 de 87 no lançamento). Ignora
  `modo_inscricao='fechado'`: grupo que não recebe inscrição pelo formulário não
  pode ser cobrado de divulgação. Carregado **lazy**, só quando o painel abre.
- `/grupos/pedidos/list` ganhou 3 campos por linha, em blocos **best-effort**
  (mesmo padrão dos que já existiam — falha loga e a lista segue de pé):
  `contato_status`, `avisos` (estado da entrega ao líder e à pessoa) e
  `pessoa_nova`. `pessoa_nova` = cadastro pendente, ou membro criado a menos de
  **10 min** do pedido (quem já existia tem `created_at` de dias/meses antes).

## ⚠️ Grupos · "dá pra falar com essa pessoa?" · services/contatoPessoa.js (2026-08-03)

Régua ÚNICA de contato, criada a partir de 2 casos reais do lançamento:

1. **Telefone que o nosso envio não alcança.** A Patricia Künzler digitou um
   número **suíço** (+41 76 576 45 38). O contrato de porta valida **quantidade
   de dígitos, não o DDD** — então passou: um pedido gravou `0765764538` (DDD
   "07" não existe) e outro `41765764538`. E `waSender.normalizarTelefone`
   **prefixa `55` em tudo que tem 10-11 dígitos**, então virou `5541765764538`,
   um número de Curitiba que não existe.
2. **Número brasileiro válido sem WhatsApp** — 2 receberam "Message
   undeliverable" da Meta.

**Decisões do Marcos (03/08):** telefone estrangeiro **deve poder se inscrever**,
só precisa gerar observação pra o líder procurar por e-mail; e *"número brasileiro
sem WhatsApp é a mesma coisa que estrangeiro: classifique como **número errado —
impossível contato**"* — daí o rótulo ser o MESMO nos dois casos.

- `telefoneAlcancavel()` espelha o normalizador do envio e acrescenta o que
  faltava: **DDD real** (lista da Anatel) e **o 9 do celular**.
  ⚠️ **DDD 55 é Santa Maria/RS e é legítimo** — mesma armadilha do
  `tirarCodigoPaisTelefone`; há teste dedicado pra isso.
- ⚠️ **NÃO bloqueia inscrição em lugar nenhum.** É classificação de LEITURA: pinta
  o selo na Caixa de entrada (número riscado, e-mail destacado, "Não recebe
  WhatsApp — fale por e-mail") e troca o `{{4}}` do template do líder, que antes
  entregava um número inexistente — o líder tentava, não conseguia, e concluía que
  a pessoa desistiu.
- ⚠️ **Sem coluna nova, de propósito**: o telefone É a evidência do caso 1 e
  `whatsapp_envios.failed_at` é a do caso 2. Coluna gravada ficaria velha quando a
  pessoa corrigisse o telefone.
- ⚠️ `whatsapp_envios.telefone` guarda **o que o chamador passou**, não uma forma
  canônica (grupos manda digits-only; `whatsapp_lideres` guarda com 55). O
  cruzamento usa os **8 últimos dígitos** — comparar cru dependeria de sorte.
- Testes: `src/test/contatoPessoa.test.ts` (14 casos, com os números reais do
  lançamento). Validado contra produção: dos 181 pedidos, **177 ok · 2
  numero_errado · 2 sem_whatsapp**, todos os 4 com e-mail disponível.

⚠️ **Follow-up conhecido (não feito)**: `41765764538` é um número suíço VÁLIDO e o
WhatsApp funciona internacionalmente — o que impede a entrega é o nosso envio
assumir Brasil e prefixar 55. Suportar internacional de verdade é mexer no funil
de envio (waSender) e vale sessão própria; hoje o caminho é o e-mail.

## ⚠️ Grupos · auditoria pré-abertura + 5 correções (2026-07-31 · PR #2209 · SEM migration)

Pedido do Marcos na véspera da abertura das inscrições (domingo 02/08). 5 agentes
em lentes distintas, cada achado **reconferido contra o banco vivo antes de virar
código** — dois se dissolveram na verificação. A narrativa completa (as medições
das 5 correções, os reparos de dado, a geocodificação dos 13 presenciais e o
espalhamento de pinos) está no legado. As regras que ficam:

1. ⚠️⚠️ **Em porta pública serverless, o que não pode se perder vai AWAITED.** O
   aviso ao líder rodava em `(async () => {…})()` **sem await**, com o
   `res.json()` logo abaixo — o container CONGELA ao responder e o trabalho
   pendente é descartado. Prova medida: um pedido de 30/07 com **0 envios e 0
   notificações**, e a líder sem receber nada. Fire-and-forget só pro que tem
   caminho alternativo garantido (a Caixa de entrada, no caso da coordenação).
2. ⚠️⚠️ **A ORDEM importa na máscara de telefone**: truncar em 11 dígitos ANTES
   de normalizar o prefixo gravava `55219999988` — **15 cadastros reais** assim.
   Helper único `tirarCodigoPais` (`src/lib/inscricao.js` + espelho no contrato),
   aplicado na máscara, na validação **e nos pontos de GRAVAÇÃO** (corrigir só a
   validação não basta). ⚠️ **DDD 55 é Santa Maria/RS**: só remove o `55` quando
   o resto AINDA é telefone completo (12–13 dígitos) — `replace(/^55/,'')`
   destruiria todo número legítimo de lá. Mutation-testado em
   `src/test/telefoneCodigoPais.test.ts`.
3. **Toda mensagem ao inscrito passa pelo gate de opt-in.**
   `notificarPessoaAprovada` era a única sem — e é a mais comum (3 pessoas que
   marcaram "não quero" receberam). O opt-in efetivo é lido **no ponto do envio**,
   nunca de variável de escopo anterior, que muda conforme o caminho da aprovação.
4. **Teto público = 10.000 requisições/15min por IP** (no culto a igreja sai por
   UM IP, subsolo sem 4G). E ⚠️ **erro nunca se disfarça de vazio**: o 429
   aparecia como "Nenhum grupo encontrado com esses filtros" — na renderização,
   **erro vem ANTES do vazio**.
5. **A fila da coordenação filtra `deleted_at`** (lista e as 2 contagens do
   badge) — pedido apagado aparecia clicável e a aprovação devolvia 404 seco.

⚠️ **Grupo online NÃO é identificado por coluna `modalidade` — ela não existe.** A
régua real (`grupos.js:3779`) é `bairro === 'Online'` OU `local` contendo
"online". Rotina nova de endereço que use outra régua vai "consertar" grupo online
que está certo do jeito que está.

⚠️ **`espalharPinosSobrepostos` (`src/lib/pinosMapa.ts`) é SÓ EXIBIÇÃO** —
`mem_grupos.lat/lng` não é tocado (eram 19 grupos empilhados em 5 coordenadas, a
maior pilha com 7 no mesmo ponto da Barra). Gravar precisão inventada faria o
levantamento cadastral futuro perder a distinção entre endereço real e chute.
**Determinístico por id**: pino que muda de lugar a cada refresh é pior que pino
empilhado. E a coordenada deslocada **nunca vaza do render** — `onGroupSelect`,
`onPinClick` e o "Como chegar" recebem sempre o grupo ORIGINAL.

⚠️ **Grupo presencial fora do RJ é ponto cego permanente do botão "Endereços"**: o
guard `inRJ` do endpoint recusa toda coordenada fora do RJ metropolitano (de
propósito, pra não casar bairro homônimo em outra cidade). O grupo de
Florianópolis exigiu script separado exigindo 3 evidências convergentes.

### ⚠️ Quem RECEBE a mensagem do grupo = `mem_grupos.lider_id`, e é UM só (2026-07-31)

Pergunta do Marcos na véspera: *"temos muitos líderes em um mesmo grupo, mas
devemos garantir que só um deles está recebendo mensagens a respeito daquele
grupo"*. **Isso já é garantido por construção** — conferido nos dois resolvedores:
`gruposWhatsapp.js` (novo pedido, frequência, renovação, confira, sugestão) e
`gruposEnvios.js` (`montarDestinatarios*`) leem **`grupo.lider_id`**, um único
`mem_membros`. Co-líder e `lider_treinamento` do roster **nunca** recebem. E medido:
**0 grupos com 2+ vínculos ativos em `whatsapp_lideres`** (o outro canal, do bot).

⚠️ **A régua frágil é outra: nada garante que o `lider_id` seja um líder do
roster** — e era exatamente aí que estava o problema. Medição de 31/07 nos 87
ativos: **3 grupos** cujo destinatário não estava entre os `funcao IN
('lider','co_lider')`, sendo 2 casos reais e graves:

- **CURSO ALIANÇA (00000057)**: recebia a **Desiree**, que no roster é
  **`frequentador`** (nem líder!) e cujo telefone tem 9 dígitos (`996013179` =
  inalcançável). Os 3 líderes de verdade (Carlos, Ester, **Paulo Pessanha**) não
  recebiam nada. Sintoma que confirma: o grupo tinha **0 vínculo no bot**, porque
  o auto-sync não cria vínculo com telefone inválido. → passou pro **Paulo**
  (`21999648788`), decisão do Marcos.
- **Cond. Península – JOVENS (T2-2026-005)**: recebia a **Marcella Martins Leta**,
  que **não tem vínculo nenhum no grupo**; o líder do roster é o **Vitor Leta**. →
  passou pro **Vitor** (`21994884484`), decisão do Marcos.

**Estado final (87 ativos): 0 destinatário com telefone inválido · 0 destinatário
que não é líder do roster · 0 grupo com 2+ vínculos no bot · 0 grupo sem
`lider_id`.** Isso também tirou o telefone da Desiree do caminho crítico do
lançamento (o grupo dela passou a ter destinatário alcançável) — o número dela
segue pendente como correção de CADASTRO, não de envio.

⚠️ **Trocar `lider_id` por UPDATE direto NÃO sincroniza o bot.** O
`syncWhatsappLideres` é hook do backend (POST/PUT de grupo); em script é preciso
chamar `sincronizarLideresGrupos()` na mão, senão os 2 canais discordam (o de
grupos manda pro novo líder e o bot continua no antigo). Foi o que aconteceu aqui
até rodar o sync (desativou o vínculo antigo e criou o novo).
⚠️ **O checkout principal está na branch `claude/poolpg-projects-patrimonio` e NEM
TEM `backend/services/whatsappGrupos.js`** — script que precise de serviço do
backend tem que resolver o require na **worktree de `origin/main`** (com
`node_modules`/`.env` do principal). É a lição de "ler da worktree, não do main",
agora com sintoma novo: `MODULE_NOT_FOUND` num arquivo que existe em produção.
⚠️ **Follow-up combinado (pós-domingo, decisão do Marcos):** criar verificação que
avise a coordenação quando o destinatário não for líder do roster. Sem ela, a
incoerência volta silenciosamente na próxima troca de liderança — porque a aba
Pessoas muda `mem_grupo_membros.funcao` e o `lider_id` do grupo é outro campo.

## ⚠️ Grupos × APP · temporada e lista de inscrição vêm do BACKEND (2026-08-04)

Item 1 da auditoria do app (03/08): o app mobile (`igreja-cbrio/Aplicativo-CBRio`)
lia DUAS fontes erradas — a tabela paralela **`app_grupos_temporada`** (1 linha ·
`aberta:false` desde 11/06 · nenhuma tela do web escrevia nela) pra decidir
"inscrições abertas?", e **`mem_grupos` cru** (só `ativo` + `deleted_at`) pra
listar grupos — ignorando `modo_inscricao='fechado'`, `aceitando_inscricoes`,
status e temporada. Resultado: o app dizia "temporada fechada" com a T2 aberta
e, se a flag paralela fosse virada, listaria grupo fechado/pausado.

- **`GET /api/public/grupos/app-inscricao`** (publicGrupos.js · sem auth, herda
  o limiter do router) devolve `{ aberta, titulo, grupos[] }`. `aberta` deriva
  da LISTA (`grupos.length > 0`), não de flag: grupo `sempre_aberto` mantém a
  inscrição possível mesmo fora de temporada. `titulo` = label da temporada com
  `inscricoes_abertas` (maior ano/numero).
- **Régua ÚNICA**: o filtro do `/buscar` virou o helper `buscarGruposInscriveis
  ({categoria, bairro, temporada})` e os DOIS endpoints o usam. Mudou a regra de
  "grupo inscritível"? Muda no helper — nunca criar cópia (foi a cópia que
  gerou a divergência app×web).
- ⚠️ A rota é declarada **ANTES de `GET /:id`** (Express casa na ordem — depois
  dela, `/app-inscricao` viraria `req.params.id`).
- **`app_grupos_temporada` ficou SEM leitor** (o app novo lê o endpoint) — não
  reintroduzir; dropar a tabela numa limpeza futura com aval do Marcos.
- No app: `lib/temporadaGrupos.ts` chama o endpoint (falha ⇒ `aberta:false`,
  fail-closed) e `inscricao-grupos.tsx` lista os grupos vindos dele.

**Item 2 (mesma leva) · recusa do líder pelo APP agora DEVOLVE (não rejeita):**
`POST /app/grupos/pedidos/:id/rejeitar` (app.js) gravava `rejeitado` (final) e
**notificava a pessoa** — aviso que o fluxo do líder deliberadamente não manda
(lei de 14/07: líder recusa → `devolvido`, triagem realoca; `rejeitado` é só da
equipe). Agora espelha o ramo de recusa do `POST /public/grupos/aprovar`:
`status='devolvido'` + motivo interno (trim/500) + `registrarEventoPedido
('recusado_lider', {origem:'app'})` **awaited** (serverless descarta trabalho
pendente pós-res.json; o serviço nunca lança) + notificação pra TRIAGEM
(`pedido_devolvido`, fire-and-forget — a Caixa de entrada é o caminho
garantido). A pessoa não recebe nada e continua na fila de realocação da Naná.
Medido antes do fix: **0 recusas reais** tinham passado pelo caminho errado
(os 16 `rejeitado` vivos eram teste de julho). A aprovação pelo app já era
correta (`aprovarPedidoCore` = regra única, registra evento).

## ⚠️⚠️ APP × ERP · varredura de tabelas e variáveis (2026-08-05)

Pedido do Marcos: *"quero que você avalie todas as variáveis e tabelas dentro do
nosso sistema mobile, pois algumas coisas acho que não fica alinhado — vi um caso
do next que diz que não tem turma aberta, mas tem no sistema"*. Tinha. Inventário:
**22 tabelas lidas DIRETO pelo app** (anon key + RLS) + ~30 pelas rotas
`/api/app/*`. Os achados medidos e a rodada de correções estão no legado.

**⚠️ LEI que sai daqui: quem decide o que é "válido" é o BACKEND, não o app.** O
app lê tabela direto pelo que é dado DELE (perfil, devocional, cartão). Régua de
negócio — o que está aberto, quem pode se inscrever, qual status vale — vem de
**endpoint**. O padrão de TODA divergência encontrada foi o mesmo: **o app
reproduz a régua do ERP em vez de consumi-la**, e quando a régua muda de um lado o
outro não sabe.

**As 5 classes de defeito que essa lei previne** (todas encontradas de verdade):

1. **Ler a camada APOSENTADA.** O NEXT do app lia `next_eventos` (morta no cutover
   de 17/06) enquanto o ERP já estava em turma→encontro→matrícula — "não há
   encontros agendados" com 2 turmas abertas e 38 matriculados. De brinde, o
   check-in pelo celular **não contava no KPI** desde 22/07.
2. **Comparar string contra enum do banco sem fonte única.** `grupo-detalhe.tsx`
   decidia com `status !== "recusado"` e **"recusado" nunca existiu** — quem levava
   recusa ficava em "aguardando aprovação" **pra sempre**. Régua: listar os status
   que valem e **comentar de onde vêm**.
3. **Achar que a RLS filtra o que ela não filtra.** `mem_grupos` é
   `FOR SELECT USING (true)` (catálogo): sem `deleted_at`/`ativo` no app, 137
   soft-deletados + 38 desativados abriam por deep link **com botão "Quero
   participar"**. Idem `mem_contribuicoes` e `vol_inscricoes` — hoje 0 apagadas,
   ou seja **gatilho armado**, e o filtro é o que impede o dia em que houver.
4. **Dia em UTC.** `toISOString()` sobre o agora dá o dia UTC, e das 21h BRT em
   diante ele já virou → **o culto de quarta saía de "próximos cultos" durante o
   próprio culto**. Toda data de operação da igreja é BRT (`lib/dataBRT.ts` no app
   é espelho do `hojeBRT()` daqui). ⚠️ O check-in do devocional segue em hora do
   APARELHO de propósito — o "hoje" de quem lê é o do lugar onde a pessoa está.
5. **Tratar N status como 3.** `vol_inscricoes` tem **7** e o app tratava 3: na
   MESMA abertura o hub dizia "Pendente" e a tela de Servir mostrava o
   FORMULÁRIO. Régua única em `lib/volStatus.ts`; status novo entra só ali, e
   desconhecido vira "nenhum" (deixa a pessoa agir), **nunca "pendente"** (fila que
   ninguém trata).

⚠️ **O SCHEMA DO APP VIVE NO REPO DO APP** (`Aplicativo-CBRio/supabase/*.sql`),
não nas migrations do ERP: `app_destaques`, `app_notificacoes`, `app_push_tokens`,
`app_grupos_temporada`, `app_solicitacoes_exclusao`, `handle_new_user_membro`. **É
por isso que a lei do gatilho de `auth.users` registrou "nunca foi commitado"** —
não estava neste repo. Auditoria de tabela `app_*` que só olhe
`supabase/migrations/` daqui conclui que a tabela não existe.

⚠️ **`resolveMembroApp` ignorava soft-delete no caminho do profile** — cadastro
que a equipe APAGOU continuava servindo o app inteiro. E `POST /app/inscricoes`
com `tipo:'next'` dizia "enviado" **sem inscrever ninguém** (ia pro ramo do fanout
que procura `next_eventos`); agora passa pela mesma régua do `/next/inscrever`.

**Auditoria automática que PASSOU** (registro pra não refazer): as **38 consultas
literais do app rodadas contra o schema de produção** — **0 erros de coluna**.
Isso importa porque select nomeando coluna inexistente faz o PostgREST recusar a
query INTEIRA e o app trata como "vazio".

**Alarmes que NÃO se sustentaram** (registrados de propósito): `app_destaques`
parece ignorar `ativo`/janela mas **a RLS filtra**; e o `sexo` do cadastro **não**
é descartado — o backend grava `mem_membros.genero`. Ia "consertar" o que funciona
nos dois casos.

## ⚠️ EVENTOS no app · a inscrição roda a MESMA função do site (2026-08-05)

Pedido do Marcos: *"ao clicar em inscrições, aparecem todos os eventos da igreja,
com um seletor de todos os eventos e eventos inscritos; nessa aba, ao clicar deve
aparecer minha inscrição naquele evento — e eu quero que os outros eventos tenham
inscrições PELO APP também, sem link externo como é o caso do celebra."*

**O que existia:** o app abria `cbrio.org/evento/<slug>` no navegador (WebBrowser)
e **não lia a tabela `inscricoes`** — então confirmar, cancelar, dar bolsa ou
marcar pago no web **não tinha onde aparecer**. Medido em 05/08: `GET /app/eventos`
devolvia só o CATÁLOGO.

**⚠️⚠️ LEI DESTE FLUXO: o app é um CLIENTE novo da porta, não uma porta nova.**
`POST /api/app/eventos/:id/inscrever` importa e executa **`inscreverEspinha`** de
`publicEventoExterno.js` — a mesma função do formulário público. Contrato de
campos (`validarCamposPadrao`), benefício pré-autorizado por CPF, **RPC atômica de
vaga** (`fn_insc_inscrever`, com o advisory lock), consentimentos
(`inscricao_consentimentos`), cobrança e WhatsApp rodam **idênticos**.
Reimplementar no app seria o "segundo caminho de escrita de pessoa" que o Contrato
de porta existe pra impedir. A única diferença é `p_origem`, que virou parâmetro:
`'app'` em vez de `'formulario_publico'` (a coluna é TEXT **sem CHECK**, conferido
no banco).

- **`GET /app/eventos`** ganhou `campos` (form-builder), `inscrito` (por pessoa) e
  os `textos` canônicos do consentimento — o app **exibe** o texto que o servidor
  manda; o snapshot gravado continua sendo o do servidor.
- **`GET /app/eventos/minhas`** = o que faltava: status, número da sorte, bolsa,
  respostas, **comprovante** (`/i/c/<token>` HMAC — o MESMO QR que a portaria lê)
  e o estado do pagamento pela `vw_insc_pagamento_estado`.
- **PAGAMENTO fica na página hospedada** (`/pagamento/<public_token>` da COBRANÇA,
  nunca o uuid): é lá que vivem Pix/boleto/cartão e o escopo PCI (lei nº 5 do
  núcleo de pagamentos). O app só abre o link que a resposta devolve.
- **Evento com campo `imagem` cai no form público** — o app não sobe arquivo pro
  pipeline daquele formulário, e é melhor mandar pro caminho que funciona do que
  mostrar um campo que não envia. Caso real: "Patrocinadores - Celebra 2026" (7
  campos, 1 deles `imagem`).

**⚠️ Dois erros meus que o probe pegou antes de subir** (e é por isso que a régua
é rodar a query contra produção, não ler o arquivo):
1. `vw_insc_pagamento_estado.status` **não existe** — a coluna é
   **`status_pagamento`** (a view também já entrega `checkout_url`, `pix_payload`
   e `boleto_linha_digitavel`). Pedir coluna inexistente faz o PostgREST recusar a
   query INTEIRA: o pagamento sairia **vazio em silêncio**.
2. `insc_pagamentos` **não tem `deleted_at`** (é razão financeira — "financeiro não
   se apaga", decisão da espinha) e eu havia filtrado por ele.
3. A resposta de `inscreverEspinha` tem **`pagamento` BOOLEAN**, não objeto: o link
   se monta do `public_token`. Eu havia tipado como objeto no app — a tela nunca
   acharia o link de pagamento.

**Conferido em produção antes do merge:** 3 eventos publicados (Celebra 2026 ·
Patrocinadores · RETIRO pago), `GET /eventos/minhas` devolvendo
`confirmada · Celebra 2026 · nº da sorte 1817 · comprovante` para um membro real.
As 2 inscrições pagas de "Retiro AMI 2027" **não** aparecem na view porque estão
soft-deletadas (teste de 30/07) — e o endpoint filtra `deleted_at` igual, então
os dois lados concordam. ⚠️ **Não há hoje nenhuma inscrição paga VIVA em
produção**, então o caminho "Pagar agora" não pôde ser exercitado com dado real —
ele usa a mesma view e o mesmo `public_token` do site, mas isso é construção, não
teste.

### Régua web × app · onde tinha que bater e não batia

- **`useAdminGrupo` do app decidia por `profiles.role`** (esquema APOSENTADO) +
  comparação com `lider_id` no cliente. Quem tem grupos ≥ 3 **pela matriz** (a
  coordenação de Grupos, por boost de área, tem role `assistente`) editava no web
  e **não** no app. Agora o app pergunta ao servidor: `GET /app/grupos/papel`, que
  já calcula `admin_grupos` pela matriz + `grupos_liderados`. Uma régua, no
  servidor — e mudança de cargo/área no web passa a valer na próxima abertura.
- **`resolveMembroApp`**: ver a rodada 2 acima (cadastro apagado servia o app).
- **6 telas do app passaram a recarregar ao FOCAR** (batismo, grupo-detalhe,
  buscador de grupos, devocional, culto-detalhe, escala do supervisor): o web e o
  app leem o MESMO banco, mas o que o web muda só aparecia se a tela fosse
  remontada. ⚠️ Formulário NÃO recarrega ao focar (perfil, grupo-editar,
  completar-cadastro) — refetch em cima do que a pessoa está digitando é pior que
  dado velho.

## ⚠️⚠️ GATE DA FICHA no app · entrar exige cadastro completo (2026-08-05)

Decisão do Marcos, depois de eu apontar o risco e ele reafirmar: *"o gate de CPF
precisa ter, todas as pessoas que entrarem no sistema devem pedir para
completarem o cadastro antes, após completar elas acessam normalmente."*

**Ligado.** `GET /app/identidade/status` passou a exigir a ficha FECHADA (nome de
gente + telefone + nascimento + **CPF** + **sexo**) e `completarCadastro` roda com
`exigirCpf: true, exigirSexo: true`. Antes o CPF era só informativo, e o efeito
medido era pior: a pessoa entrava "completa" e levava **400 na primeira
inscrição** (`POST /app/inscricoes` exige CPF) — 50 das 75 contas.

**Impacto medido em produção antes de subir** (88 contas do app): **12 entram
direto** · **71 vão ver a tela de cadastro** · 5 sem cadastro vivo (os
soft-deletados de 04/08 — o matcher cria/religa quando elas completarem). O que
falta nelas: **sexo em 70** (a coluna `genero` só começou a ser gravada hoje),
CPF em 49, nascimento em 44, telefone em 43.

### ⚠️ A ÚNICA isenção: contas de REVISÃO DE LOJA

`CONTAS_REVISAO_LOJA` em `services/appIdentidade.js` (3 e-mails declarados à
Apple/Google). Motivo: **o revisor não tem CPF brasileiro** — com o gate sem
isenção ele trava na tela de cadastro e o build é recusado com "não conseguimos
completar o registro", a rejeição mais comum de app com login. Isso não é bug de
usuário: **bloqueia o release inteiro**.

⚠️ **E por que não é só pôr um CPF nessas contas:** CPF com DV válido PERTENCE A
ALGUÉM REAL e é a chave mais forte do matcher — na primeira vez que essa pessoa
preenchesse um formulário, seria ligada à conta de revisão. Uma delas já teve um
CPF DV-válido, e ele foi anulado por isso.
⚠️ **Não acrescentar e-mail de gente nessa lista** — seria criar uma porta pra
entrar no app sem cadastro, exatamente o que o gate existe pra impedir.
✅ Conferido com a régua real: as 3 contas mostram `falta=[cpf]` e **PASSAM**.

### O app pergunta, não decide

`/identidade/status` devolve **`exige_cpf`** e a tela `completar-cadastro` só
bloqueia o CPF quando o servidor diz que sim. Falha de rede mantém o default
**true (fail-closed)**: sem isso, ficar offline viraria porta pra entrar sem
cadastro. É a mesma lei do resto — quem define o que é válido é o backend.

## 🔴 INCIDENTE · o portão do app trancou TODO MUNDO pra fora (2026-08-06)

O Marcos tentou entrar e não conseguiu: *"coloquei o CPF, recebi o e-mail de
confirmação, mas o app não entrou e voltou na primeira página"*. **O app ficou
inutilizável pra todas as contas** entre a aplicação da migration
`20260805150000` e este conserto. Causa: **duas falhas minhas somadas**, e
nenhuma delas apareceu antes porque **ninguém tinha concluído o cadastro pelo app
até hoje** (`mem_identidade_observacoes` com origem `app_onboarding` = **0**).

**Falha 1 · o caminho rápido não carimbava a confirmação.** Ao ligar o gate em
05/08, só o FORMULÁRIO marcava `app_ficha_confirmada_em`. Quem provava identidade
por CPF → código no e-mail ficava com a marca nula, `completo` seguia false e o
portão devolvia pra tela de cadastro. **Beco sem saída por construção.**
⇒ `confirmarCodigo` passa a carimbar. É legítimo: **ler o código enviado ao
e-mail DO CADASTRO é prova de POSSE** — mais forte que digitar um formulário, que
qualquer um digita. Não libera sozinho: `completo` continua exigindo a ficha
fechada; quem prova identidade com cadastro incompleto vai ao formulário, agora
**com os campos preenchidos** (a identidade deixou de ser palpite).

**Falha 2 · o portão perguntava ao servidor UMA vez e nunca mais.** `CadastroGate`
guardava `incompleto` da montagem; ao concluir, a tela navegava pra Home, o efeito
de rota via o valor velho e **devolvia pra tela de cadastro**. Laço infinito, por
QUALQUER caminho (formulário inclusive).
⇒ A tela chama `revalidarCadastro()` antes de navegar; o portão repergunta e só
então libera. ⚠️ A trava é um **ref** (`liberado`), não estado: `router.replace`
roda logo após o `setIncompleto(false)` e o commit do React pode não ter
acontecido — o ref fecha a janela de corrida.

### Lições (as duas valem além deste caso)

1. ⚠️⚠️ **Portão que decide com estado LIDO UMA VEZ vira armadilha quando a
   condição muda.** Qualquer gate assim precisa de um caminho explícito de
   revalidação — senão "resolver o problema" não tira a pessoa do bloqueio.
2. ⚠️⚠️ **Ligar uma exigência exige cobrir TODOS os caminhos que a satisfazem.**
   Eu liguei o gate cobrindo só um dos dois caminhos de conclusão. Régua: ao criar
   uma condição de acesso, listar quem pode satisfazê-la e conferir um a um.
3. **"Ninguém nunca fez isso" é sinal de alerta, não de segurança**: o zero em
   `app_onboarding` estava na minha frente desde 05/08 e eu o li como "recurso
   novo", quando era "caminho nunca exercitado".

## ⚠️⚠️ LEI · o LOGIN não liga ninguém a cadastro (2026-08-06 · migration `20260806120000`)

Fecha o desenho que o Marcos pediu em duas etapas. Palavras dele: *"sobre o
gatilho ligando o login, eu acho que deve ter, mas ele só deve ser acionado PÓS
PREENCHER TODOS OS DADOS, e todos que baixarem devem ser obrigados a preencher, e
somente após o preenchimento entrar no app; e com os dados completos, aí sim ir
para o módulo de duplicatas se houver algum matcher"*.

**O mecanismo de ligar continua existindo — mudou de MOMENTO.** `handle_new_user`
passa a criar **só a conta** (`profiles`, com `is_membro_only = true` e
`membro_id NULL`). Quem resolve identidade agora é
`POST /app/identidade/completar` → `acharOuCriarGuardado`, **com CPF na mão**; o
par duvidoso segue pra fila humana em /entradas.

- **Por que**: o gatilho ligava por **e-mail + nome** (sinal médio) e, com login
  do Google, é só isso que existe. A pessoa caía num cadastro que outra porta
  preencheu e **entrava no app herdando CPF, nascimento e sexo que nunca
  forneceu** — 9 de 89 contas, medido em 05/08. Caso concreto: o Pedro Paiva
  logou com o Gmail e foi ligado ao cadastro dele importado do Next.
- **Ritmo real**: ~2 logins de membro por dia (13 profiles em 7 dias). Desde o
  conserto de 04/08 o gatilho **não criava** cadastro (`origem='auth_signup'` = 0);
  ele vinha **ligando** — que é o que sai agora.
- ⚠️ **`is_membro_only = true` continua obrigatório** no INSERT: sem isso a pessoa
  cai no `/dashboard` do ERP em vez do app.
- ⚠️ **Os metadados não se perdem**: `cpf`, `telefone`, `nascimento` e
  `frequenta_area` ficam em `auth.users.raw_user_meta_data`.
  `appIdentidade.completarCadastro` aplica o `frequenta_area` (AMI/Bridge) ao
  concluir — sem isso a escolha da pessoa seria **descartada em silêncio**, que é
  o bug do CPF do censo se repetindo.
- ⚠️⚠️ **Consequência conhecida e aceita**: quem loga e ainda não preencheu fica
  **sem `mem_membros`**. No app é irrelevante (o portão bloqueia tudo até
  preencher). Fora dele — webapp do devocional — a pessoa vê "você não é membro"
  até completar. É honesto: ela ainda não é. A versão anterior criava um
  cadastro-fantasma só pra aquela tela não reclamar, e era esse o anti-padrão.
- ⚠️ **Não reescreve o passado**: os 24 cadastros `origem='auth'` e os vínculos já
  feitos ficam; o par duplicado deles vive na fila de /entradas. E
  `profiles.app_ficha_confirmada_em` (20260805150000) continua sendo o que fecha o
  furo das contas ANTIGAS, que já têm `membro_id` — as duas migrations são
  complementares, não alternativas.
- ⚠️ Staff (`rh_funcionarios` ativo) **nunca** teve cadastro criado pelo gatilho —
  esse ramo está intocado.

## ⚠️⚠️ LEI · no APP, dado HERDADO de vínculo não libera acesso (2026-08-05 · migration `20260805150000`)

Decisão do Marcos, ao ver que o login do Pedro Paiva não pediu cadastro:
*"qual CPF de Pedro Paiva que cadastrou no app? Data de nascimento, Sexo? Só tem
email e nome. Se ele pode preencher o cadastro, pra que fundir automaticamente
entende? O caso do app, mesmo que o sistema ache que alguém é igual, **NÃO deve
liberar acesso**; depois de preencher todos os dados aí sim pode se ter 100% de
certeza"*.

**O furo:** `GET /app/identidade/status` calculava o que "falta" **a partir do
cadastro que o vínculo encontrou**. Como o gatilho de `auth.users` liga por
e-mail + nome (sinal médio), quem caía num cadastro já completo **entrava no app
sem nunca ter provado nada** — herdando CPF, nascimento e sexo que um import
preencheu. **Medido antes de ligar: das 89 contas com cadastro vinculado, 9
passavam o gate — TODAS as 9 por herança** (confirmações reais pelo app: **0**).
Dois casos não-staff eram gente que logou com Gmail e caiu num cadastro do
`grupos_import_2026`.

- **`profiles.app_ficha_confirmada_em`** é a marca: `completo` exige ficha fechada
  **E** confirmação por ESTA conta. ⚠️ Fica em `profiles` (a CONTA), **não** em
  `mem_membros` — duas contas ligadas ao mesmo cadastro herdariam a confirmação
  uma da outra, que é o mesmo furo por outro caminho.
- **O app não pré-preenche dado herdado**: o status devolve
  `pode_preencher_com_vinculo`, e enquanto for false o formulário traz **só o
  nome** (o que veio do provedor do login). Pré-preencher CPF/nascimento seria
  fazer a pessoa "confirmar" o que ela não forneceu.
- ⚠️⚠️ **FAIL OPEN quando a coluna não existe** (deploy em 2 etapas): pedir coluna
  inexistente faz o PostgREST **recusar a query inteira**, e tratar isso como "não
  confirmou" prenderia TODO MUNDO na tela — inclusive depois de preencher, porque
  a gravação da marca falharia igual (**loop sem saída**). Sem a migration vale o
  comportamento antigo; com ela, o portão liga. Os dois lados degradam juntos, de
  propósito. O `select` da marca é **ISOLADO** pelo mesmo motivo.
- ⚠️ **O gatilho de `auth.users` NÃO foi alterado.** Ele continua ligando (CPF
  forte; e-mail+nome médio) — mudá-lo pra não ligar criaria duplicata em TODO
  login e inundaria a fila humana. O que mudou é que **o vínculo deixou de ser
  prova de acesso**; o par duplicado segue indo pra fila de /entradas, agora com
  CPF de verdade pra decidir. É exatamente o que ele pediu ("preencher tudo e
  depois vá para essa aba").
- ⚠️ **Efeito conhecido e correto**: as 9 contas (incluindo as do staff) veem a
  tela de cadastro **uma vez**. Régua aplicada a todo mundo, não regressão.
- ⚠️ Comentário desatualizado corrigido em `appIdentidade.completarCadastro`: ele
  dizia que CPF e sexo **não** eram exigidos (estado anterior a 05/08) enquanto o
  código exigia os dois — comentário que mente engana a próxima sessão.

## ⚠️⚠️ LEI · resposta de `/api/app` NUNCA é cacheável (2026-08-05 · PR #2313)

Incidente relatado pelo Matheus: *"Mesmo preenchendo tudo certo volto pra essa
tela e não consigo passar dela. Boto o cpf, recebo o código e volto pra ela."* A
tela é a de completar cadastro. A Joana Botafogo tentou **3× em dois minutos**.
Os dois com `profiles.membro_id` preenchido e a ficha COMPLETA no banco — ou
seja, **o servidor respondia `completo: true` e a pessoa não passava**.

**CAUSA: `res.json` do Express gera ETag e não manda `Cache-Control`.** O
`fetch` do React Native usa o cache HTTP do sistema (NSURLSession no iOS, OkHttp
no Android): guarda a resposta, revalida com `If-None-Match`, o Express responde
**304 sem corpo**, e a camada nativa entrega ao JS **a resposta ANTERIOR** — a
de antes de vincular, com `completo: false`. Medido nos runtime logs: **124 de
251** respostas de `/api/app/*` em 6h eram 304, e a sequência do Matheus aparece
literal (200 → 304 → confirma o código → 304).

- **A correção vale pro ROUTER INTEIRO** (`router.use` no topo de `app.js`):
  `Cache-Control: no-store` **+** `res.json` respondendo por
  `res.end(JSON.stringify(body))`. Assim GET novo do app nasce sem cache sem
  ninguém precisar lembrar.
- ⚠️ **`no-store` SOZINHO não resolve**: o `req.fresh` do Express compara o
  `If-None-Match` do REQUEST com o ETag da RESPOSTA e devolve 304 do mesmo
  jeito. Quem mata o 304 é **não emitir validador** — `res.end` não gera ETag.
- ⚠️ **Prova com `http.get` CRU, não `fetch`**: o `fetch` do Node (undici)
  injeta `Cache-Control: no-cache`, o que faz `fresh()` dar false e **mascara o
  304**. Minha 1ª tentativa de reproduzir falhou por isso. Antes → `304` corpo
  vazio; depois → `200` com o estado atual, `etag: undefined`.
- ⚠️ **Não "otimizar" devolvendo ETag em rota do app**: o corpo aqui é **estado
  da PESSOA** (o que falta no cadastro, meus grupos, meu perfil, minhas
  inscrições) e muda por ação dela na tela anterior — servir a versão anterior é
  sempre errado. Cache condicional é pra conteúdo, não pra estado.
- ⚠️ **Eram DUAS causas independentes** pro mesmo loop: esta (servidor) e a do
  app (`CadastroGate` nunca limpava o estado local `incompleto`, então rebatia
  mesmo depois de completar · PR #67 do Aplicativo-CBRio). Sem as duas, o loop
  volta.
- ⚠️ Descartado de propósito no cliente: `cache: "no-store"` no `apiGet` do app.
  O `fetch` do React Native é o polyfill `whatwg-fetch` sobre `XMLHttpRequest` e
  **ignora a opção `cache`** — seria decoração que se lê como proteção.

## ⚠️ GERENCIAR GRUPO pelo app · tudo do líder num lugar só (2026-08-05)

Pedido do Marcos: *"ao apertar gerenciar grupo, ali devem ter TODAS as opções
para se fazer em um grupo"* — e a lista dele: membros (com quem é líder ou em
treinamento), registro de frequência (com comentário do líder e pedido de ajuda),
aprovação de pedidos, saídas e transferências, estudos e editar o grupo.

**7 endpoints novos em `routes/app.js`**, todos com o MESMO gate do
`GET /grupos/:grupoId/membros` (helper `gateGrupoApp`: gere o grupo OU admin de
grupos), e reusando os escritores canônicos:

| endpoint | régua reusada |
|---|---|
| `PUT /grupos/:g/membros/:row/funcao` | — (whitelist própria, ver abaixo) |
| `POST /grupos/:g/membros/:row/sair` | soft (`saiu_em` + `motivo_saida`), como o "confira a lista" |
| `POST /grupos/:g/membros/:row/transferir` | cria **pedido** no destino (fila do outro líder) |
| `GET/POST /grupos/:g/encontros` | **RPC `registrar_encontro_grupo`** (o mesmo escritor do web e do WhatsApp) |
| `POST /grupos/:g/ajuda` | `notificar()` módulo grupos |
| `GET /grupos/:g/materiais` | `mem_grupo_documentos` (do grupo + os gerais) |

### ⚠️⚠️ O que o app NÃO pode fazer, e por quê

- ⚠️⚠️ **`funcao='lider'` é CADASTRO · `mem_grupos.lider_id` é a LÍDER
  PRINCIPAL** (corrigido 05/08 por esclarecimento do Marcos — eu tinha
  confundido as duas e bloqueado o app de marcar os outros líderes). Palavras
  dele: *"só o líder principal recebe mensagem e ele não pode remover a si
  mesmo, os outros seria apenas para sabermos no cadastro, mas não receberia
  mensagem nenhum"*. Então `FUNCOES_APP` é
  `frequentador · lider_treinamento · co_lider · **lider**`, e o que segue
  protegido é a **PESSOA** que é `lider_id`: o servidor recusa mudar a função
  dela e recusa registrar a saída dela (é ela que recebe o WhatsApp do grupo ·
  lei de 31/07: um destinatário só, e tem que ser líder do roster).
  ⚠️ `supervisor`/`coordenador` seguem FORA: são papéis da hierarquia de
  supervisão (`grupo_supervisao_*`), não do roster.
  ⚠️ O roster do app passou a devolver **`lider_id`** — sem ele a tela não
  distinguia as duas coisas e escondia o menu de ações de TODOS os líderes.
  A principal ganha badge "Líder principal" e é a única sem menu.
  ⚠️ Medido em 05/08: **30 dos 97 grupos ativos têm a principal FORA do roster
  ativo** — nesses ela não aparece na aba Membros (o bloqueio do servidor
  continua valendo). É o follow-up de 31/07 (avisar a coordenação quando o
  destinatário não é líder do roster), ainda aberto.
- **Transferência NÃO empurra ninguém pra dentro de outro grupo**: cria
  `mem_grupo_pedidos` no destino, `origem='app'`, pro líder de lá aprovar — o
  mesmo fluxo de quem se inscreve. E os destinos oferecidos são só os grupos que
  o próprio líder gerencia. A **saída** do grupo atual é um passo separado.
- **Presença só de quem está no roster ATIVO** (o servidor filtra a lista que o
  app manda) e **encontro no futuro é recusado**.
- **"Pedir ajuda" NÃO abre fila com "resolvido"** — chega como notificação
  persistida (`app_notificacoes`) + push pra quem cuida de Grupos. Fila com
  estado pediria tabela nova, e criar fila é decisão da coordenação. A tela diz
  "a coordenação recebe seu pedido", não "abrimos um ticket".

### ⚠️ Duas colunas que o probe pegou antes de subir

`mem_grupo_pedidos.observacoes` **não existe** — é **`observacao`** (singular). E
`mem_grupo_documentos` **não tem `url`**: os campos reais são `sharepoint_url` e
`storage_path` (o link é montado no backend). Nos dois casos, pedir coluna
inexistente faria o PostgREST recusar a operação INTEIRA — o INSERT da
transferência falharia e a aba de estudos apareceria vazia, em silêncio.

### Entradas e saídas · histórico discreto no web (2026-08-05 · SEM migration)

Pedido do Marcos sobre a transferência: *"ali eu pensei em ser apenas um
histórico de pessoas e no máximo um pedido que fica na tela do gerenciador do
sistema web pra aprovar — deve ser uma tela pequena, com pouco destaque, como se
fosse uma tela de histórico de entradas e saídas sem muita interação"*.

`GET /api/grupos/:id/entradas-saidas` (leitura pura · nível 1) devolve
`eventos[]` de entrada/saída derivados de `mem_grupo_membros` (a saída é soft, em
`saiu_em`, então a MESMA linha rende entrada e — se a pessoa saiu — saída, com
`motivo_saida`), ordenado desc e capado em 60. No `Grupos.jsx` é um bloco
**recolhido por padrão** logo acima de "Encontros recentes", sem nenhuma ação.

- ⚠️ **A transferência vinda do app NÃO aparece aqui como ação a aprovar** — ela
  entra como **PEDIDO na Caixa de entrada**, que é onde a triagem já decide. Duas
  portas pra aprovar a mesma coisa era o que fazia parecer que existiam dois
  lugares (a mesma razão pela qual "Inscrições do grupo" saiu do `/meu-grupo`).
- ⚠️ **Os relatórios de frequência do app JÁ aparecem no web** — o Marcos ofereceu
  construir a tela e não é preciso: `Grupos.jsx` tem "Encontros recentes" lendo
  `api.encontros(id, {limit:10})`, que mostra data, nº de presentes, tema e **o
  comentário do líder** (`observacoes`), porque o app grava pela RPC canônica
  `registrar_encontro_grupo`. A aba Relatórios agrega o resto.

**No app**: `grupo-membros.tsx` virou **Gerenciar grupo** com 4 abas (Membros ·
Frequência · Pedidos · Estudos) + **Editar** no cabeçalho (abre
`/grupo-editar`, que já existia). O botão **"Inscrições do grupo" SAIU do
`/meu-grupo`** — duas portas pra aprovar pedido era o que fazia parecer que
existiam dois lugares. A rota `/grupo-inscricoes` **continua viva** (link antigo
e push apontam pra ela).

## Grupos · contagens (vínculo × pessoa) + nova régua visitante/frequentador (2026-07-23)

Auditoria (4 agentes) das divergências que o Marcos pegou entre as abas. **Régua de
leitura (não regredir):** **Relatórios conta PARTICIPAÇÕES (vínculos · mem_grupo_membros ·
uma pessoa em N grupos conta N×)** · **Pessoas conta PESSOAS DISTINTAS (membro_id único,
papel de maior nível)**. Hoje 86 grupos ativos = 100% T2 → 999 participações = 749 pessoas
distintas (162 em >1 grupo). Duplicatas: aba Pessoas mostra N **pessoas**, aba Duplicatas
mostra M **pares** (N ≈ 2M). Nada disso era bug — só rótulo. Correções (PR
`claude/grupos-contagem-frequentador`): (1) BUG do "1067" — o gráfico "Composição" somava
Visitante/Frequentador (vínculos) + Líder=`num_lideres` (pessoas, nível grupo) → removida a
barra Líder (líder vive na rosca de Liderança ao lado), gráfico virou "Participações por
papel"; (2) rótulo "Membros"→"Participações" + nota explicando vínculo×pessoa; (3) aba
Pessoas ganhou filtro `deleted_at` que faltava (inflava +1) + legenda de status; (4)
duplicatas mostram pessoas E pares nas duas abas.

**⚠️ NOVA RÉGUA visitante/frequentador (Marcos 2026-07-23 · migration
`20260723210000`):** a régua antiga "3 presenças → frequentador" foi **abandonada** (com
frequência MENSAL e sem histórico das temporadas antigas). Agora: (a) one-time — TODO
visitante ativo virou **frequentador** (clima limpo); (b) novo entrante nasce **visitante**
(default da coluna) e vira **frequentador na 1ª presença** (`fn_grupo_auto_membro` ·
`presencas >= 1`, era `>3`). **Status de frequência** (aba Pessoas · `statusDe` no frontend,
não no banco): 🟢 em dia (≤30d) · 🟡 atenção (31–90d) · 🔴 ausente (>90d) · ⚪ sem chamada
ainda (nunca teve presença · NEUTRO — cobre o estado atual, já que a frequência nunca rodou).

## ⚠️ Grupos · Envios (barreiras anti-disparo-indevido) + console (2026-07-23)

Susto do Marcos (envios proativos a líderes). Auditoria do código vivo + barreiras
(PR da branch `claude/grupos-audit-msgs`). **Estado dos envios de grupos:**
- **2 mecanismos**: (a) **fila `whatsapp_envios` → só TEMPLATE aprovado** (seguro ·
  novo pedido→líder, inscrição→pessoa, aprovado→pessoa [eventos], frequência
  mensal [cron], renovação [manual], sugestão [manual]); (b) **`enviarComFallback`
  (whatsappGrupos) = texto-livre-primeiro** (o que a Meta bloqueava fora da janela
  24h) — usado só por webhook-reply (dentro da janela, ok) e pelo lembrete manual.
- **Incidente das ~40 msgs (20/07)** = cobrança automática de relato →
  **REMOVIDA** (#1865). **Estudo semanal automático** (cron, texto-livre, template
  inexistente) → **REMOVIDO 2026-07-23** (só manual pela aba de estudos agora; o
  `POST /whatsapp-grupos/enviar-estudo` e a chamada no cron/diario saíram).
- **Kill-switch central** `whatsapp_config.grupos_auto_envios` (migration
  `20260723180000` · **default false = SEGURO**): gateia o único cron proativo que
  sobra (frequência mensal em `publicGrupos`). Desligado = nenhum disparo
  automático sai. Envio MANUAL não depende dele.
- **Aba Envios** (`GruposEnvios.jsx` · PAGE_TAB `envios` · soEditor/nível 5):
  liga/desliga os automáticos + **disparo manual da chamada do mês** por
  líder/bairro/rede/todos (prévia com contagem + exemplo + quem não recebe +
  confirmação pelo número) + renovação + histórico (`whatsapp_envios`) + painel do
  que dispara sozinho. Backend `services/gruposEnvios.js` (`enviosAutomaticosAtivos`,
  resolver de audiência **respeitando `whatsapp_lideres.recebe_lembretes`** —
  corrige a lacuna do `renovacao/disparar` que lia `lider_id` direto) + rotas
  `/grupos/envios/*` em grupos.js. Só template (fila) — nada de texto livre proativo.
- ⚠️ Aplicar `20260723180000` antes do merge (aditiva/idempotente · código tolera
  ausência tratando como false).

## ⚠️ WhatsApp · link local NUNCA sai em mensagem (guarda · 2026-07-29)

Incidente: um redisparo manual do aviso de pedido, rodado numa máquina de dev,
montou o link de aprovação com `FRONTEND_URL=http://localhost:5173` do `.env`
local — a líder recebeu um link de localhost no WhatsApp. Proteção em 2 camadas
(não regredir):
- **`waSender.postMessages`** (funil ÚNICO de envio da Cloud API): payload que
  contenha URL local/privada (`localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`,
  `://10.*`, `://192.168.*`, `://172.16-31.*`) é BLOQUEADO com
  `reason:'link_local'` — nunca chega na Meta. Cobre qualquer template/texto
  de qualquer serviço, inclusive scripts manuais.
- **`gruposWhatsapp.baseUrl()`**: `FRONTEND_URL`/`VERCEL_URL` local é ignorada
  ao montar link de WhatsApp (warn + fallback `https://cbrio.org`) — a URL já
  nasce certa mesmo em dev.
- `whatsappFila.falhaPermanente` trata `link_local` como erro PERMANENTE (sem
  retry · notifica o módulo — reenviar nunca resolveria).
Regra pra scripts manuais de reenvio: SEMPRE sobrescrever `FRONTEND_URL` pra
produção antes de disparar (o `.env` de dev aponta pra localhost).

## Grupos · templates v2 do fluxo de aprovação (2026-07-29)

Pedido do Pr. Nélio: o fluxo correto do líder é LIGAR pra pessoa antes de
aceitar/recusar. Templates novos aprovados na Meta (UTILITY · pt_BR · mesmas
5 variáveis dos v1) e defaults trocados em `services/gruposWhatsapp.js`:
- `grupos_pedido_novo_lider_v2` — instrui ligar antes; explica que recusa não
  manda aviso automático (a recusa do líder devolve pra triagem, que decide a
  realocação — comportamento já existente, só ficou dito).
- `grupos_pedido_aprovado_v2` — sem o "o líder vai falar com você" (o contato
  já aconteceu antes da aprovação).
Estratégia (lição): NUNCA editar template aprovado em produção — edição volta
pra revisão da Meta e o envio para; criar `_v2`, aprovar em paralelo e trocar
o default/env. Os v1 (`grupos_pedido_novo_lider`/`grupos_pedido_aprovado`)
podem ser excluídos na Meta após confirmar envio real com os v2. Envs
`WHATSAPP_TEMPLATE_GRUPOS_PEDIDO_LIDER`/`_APROVADO` seguem como override.

## ⚠️ Fila WhatsApp · a fila NÃO PODE desistir antes da janela da Meta virar (2026-07-31)

Marcos, sobre o TIER_250 na véspera da abertura: *"quero que você analise isso
bem, para não dar problemas de travar inscrições, ou de mandar várias mensagens
em sequência no dia seguinte."* As duas coisas foram medidas:

**1 · Inscrição NÃO trava** ✅ — o bloco de WhatsApp do `POST /inscrever` está
dentro de `try/catch` que só loga, e `enfileirar` devolve objeto (nunca lança),
inclusive no teto. Teto estourado ⇒ a pessoa é inscrita e vê sucesso; só a
mensagem espera.

**2 · Mas a mensagem MORRIA antes de a cota liberar** 🔴 (corrigido aqui). O
backoff `[30m, 2h, 6h, 12h, 24h]` com `max_tentativas=5` coloca a 5ª e última
tentativa em **t+20,5h da 1ª falha** — e o teto do TIER_250 é uma janela **móvel
de 24h**. Cenário do domingo: teto estoura 11h (1ºs envios às 9h ⇒ cota só começa
a liberar 9h de segunda) → tentativas às 11:00, 11:30, 13:30, 19:30 e **07:30 de
segunda**, todas dentro do bloqueio → linha vira `erro` **1h30 antes de a cota
liberar**. Resultado: pessoa inscrita e **líder nunca recebe o link**. O plano
"estourou o dia, sai no dia seguinte" não se cumpria.
→ `decidirRetry` (função PURA, exportada e testada): **acabar as tentativas não é
motivo pra desistir** enquanto a linha for mais nova que `IDADE_MIN_DESISTIR_H`
(36h > 24h da Meta, com folga) — segue `pendente` tentando a cada hora. Erro
PERMANENTE continua desistindo na 1ª falha (não virou "tenta pra sempre").

**3 · Rajada por destinatário** — quando a cota libera, o cron drena tudo numa
rodada. Cada PESSOA recebe 1 mensagem, mas um LÍDER com N pedidos represados
receberia N templates idênticos em segundos, que é o padrão que a Meta lê como
spam e **derruba a nota de qualidade — a nota é o que decide a subida de tier que
a igreja quer**. `limitarPorTelefone` deixa **máx 2 por telefone por rodada** (8
pedidos drenam em 4h); quem sobra não perde a vez (segue pendente e vencido, e a
ordem é `criado_em` ASC). `processarFila` devolve `adiadosPorTelefone`.

⚠️ **Correção de conta sobre o TIER_250**: o limite da Meta é de **destinatários
ÚNICOS** por janela de 24h — mensagem repetida pro MESMO número dentro da janela
**não consome cota nova**. Então a capacidade não é "250 ÷ 2 = 125 inscrições"
(que assume 1 líder novo por inscrição): é ≈ `250 − (líderes distintos
contatados)` inscrições, e só conta pessoa com **opt-in** (quem recusou não gasta
cota). Com pedidos espalhados por ~60 grupos, dá ~190 inscrições/dia, não 125.
Não é motivo pra relaxar: é a ordem de grandeza certa pra decidir no domingo.

⚠️ Cron da fila = `0 * * * *` (horário) · cap 200/rodada · `maxDuration: 300`
(200 envios sequenciais ≈ 80s, cabe). Testes: `src/test/whatsappFilaRetry.test.ts`
(13 casos · a guarda das 36h é mutation-testada).

## Fila WhatsApp · política de reenvio + falha avisa gente (2026-07-27)

O teste de lançamento de grupos (26/07 · 34 inscrições ao vivo) expôs: erro
PERMANENTE (telefone corrompido de 21 dígitos de uma líder → `invalid_phone`)
era re-tentado 5× em silêncio e ninguém soube que ela ficou sem os links de
aprovação. Decisão do Marcos (27/07): "enviado 1 vez; reenvia só se deu
problema no envio — e problema definitivo avisa gente". Em
`services/whatsappFila.js` (sem migration):
- **`falhaPermanente()`**: `invalid_phone` (normalização local do
  whatsappService) e códigos Meta permanentes (100, 131026, 131030, 132000,
  132001, 132005, 132007, 132012) marcam `status='erro'` na PRIMEIRA falha,
  sem retry. Falha passageira (teto diário TIER_250, timeout, exception)
  mantém o retry com backoff — é o motivo de a fila existir. Envio com
  sucesso nunca foi re-enviado (`enviado` é terminal · sem mudança).
- **Falha TERMINAL (permanente ou esgotou) dispara `notificar()`** pro módulo
  do prefixo do `contexto` (`grupos.pedido_novo_lider` → grupos · sem regra
  configurada cai no fallback admin/diretor) com dedup
  `wpp_envio_falha_<id>` e link `/grupos` quando for de grupos.
- **Validação de telefone na porta** (`routes/membresia.js` ·
  `normalizarTelefonePayload`, espelho do `normalizarCpfPayload`): POST/PUT
  de membros e o PUT do totem normalizam pra digits-only e exigem 10-11
  dígitos (DDD+número · 55 na frente é removido), com grandfathering do
  legado (valor idêntico ao armazenado passa — senão telefone antigo inválido
  travaria qualquer edição). Contrato de porta aplicado ao canal que deixou o
  número corrompido entrar.

## Grupos × Bot WhatsApp · relato do encontro por texto/áudio/foto (2026-06-10)

O líder responde ao bot quantos foram, QUEM foi e um resumo (+ FOTO), por TEXTO ou
ÁUDIO, e isso vira encontro real + presenças nominais. Implementação no legado.

- **⚠️ Limitação da Meta**: a Cloud API **NÃO posta em grupo de WhatsApp** — o
  estudo vai 1:1 pro(s) vínculo(s) `papel='coordenador'` com "encaminhe no grupo
  dos líderes". Fora da janela de 24h exige TEMPLATE aprovado.
- **`aplicarColetaGrupoEncontro`** grava pela **RPC canônica
  `registrar_encontro_grupo`** (o mesmo escritor do web e do app) — é isso que faz
  o relato do WhatsApp aparecer em "Encontros recentes" sem tela nova.
- ⚠️ **Match nominal: o JS REVALIDA contra a lista.** O Haiku recebe os membros do
  grupo e devolve os nomes casados (apelido/typo ok), mas o que não casa vira
  `nao_reconhecidos` (provável visitante) — **não se confia 100% no modelo**, e a
  revisão-antes-de-aplicar continua na fila do `/admin/whatsapp`.
- **Auto-sync de líderes**: o vínculo no bot é automático a partir de
  `mem_grupos.lider_id` + telefone. ⚠️ O sync **só gerencia os `origem='auto'`** —
  vínculo manual é intocável. E **trocar `lider_id` por UPDATE direto não
  sincroniza**: em script é preciso chamar `sincronizarLideresGrupos()` na mão,
  senão os 2 canais discordam.
- **⚠️⚠️ LEI (20/07): líder NUNCA recebe cobrança/lembrete automático de relato —
  nem com temporada ativa.** A cobrança de 4 semanas foi **REMOVIDA do código**
  (em 20/07 ela disparou 40 mensagens indevidas). O que o líder recebe: **1×/mês**
  o pedido de chamada (cron gated por temporada EM CURSO, enfileirado em LOTE) e
  lembrete avulso **só por disparo manual da coordenação**. Não recriar.
- **Opt-out** pelo próprio WhatsApp (`recebe_lembretes=false`) — responder e
  registrar seguem funcionando; religar é ato do coordenador.
- Envs opcionais: `OPENAI_API_KEY` (transcrição de áudio · sem chave o bot pede
  texto) e os `WHATSAPP_TEMPLATE_*`.

## Grupos · aba Visitas + guards por módulo (2026-06-10)

Supervisores, coordenadores e os donos do módulo **programam** e registram visitas
aos grupos de conexão. **Reusa a infra da supervisão** (`grupo_supervisao_visitas`
+ `vw_grupos_supervisao`) — não criou tabela nova; ganhou `status`
(agendada|realizada|cancelada) e `responsavel_id`. Detalhes no legado.

- ⚠️ **A view conta `ultima_visita`/`visitas_mes_atual` só com
  `status='realizada'`** — visita agendada no futuro não pode zerar o semáforo.
- ⚠️⚠️ **Guards por MÓDULO, não por role** (achado de auditoria): rotas de escrita
  usavam `authorize('admin','diretor')` — que **bloqueava os donos do módulo** — e
  várias estavam **sem guard nenhum** (aprovar/rejeitar pedido, que CRIA MEMBRO;
  remover membro; encontros; materiais). Tudo virou `authorizeModule('grupos', N)`:
  CRUD/aprovações=3 · lançar encontro/material=2 · temporadas/supervisor=5.
- **`getMeuPerfilGrupo` dá papel `admin` a quem tem nível ≥3 no módulo** (boost de
  área) — a coordenação enxerga tudo sem precisar de função na hierarquia.
- **Consolidação de abas** (8 no total): **"Caixa de entrada"** = Pedidos +
  Encaminhados, com a distinção explícita que o Marcos pediu — *pedido* = a própria
  pessoa pediu · *encaminhado* = sugestão do cuidado pastoral (a pessoa NÃO pediu;
  precisa de contato explicando o que é grupo de conexão + devolutiva).
  **"Configurações"** = Temporadas + Endereços. Chaves antigas de URL seguem
  funcionando. Decisão: **NÃO juntar** Grupos/Relatórios/Mapa/Materiais/Visitas/QR.
- **Abas Endereços e Temporadas só aparecem pra quem edita**; **QR Inscrição fica
  visível a todos** (decisão do Marcos: qualquer um pode mandar o QR de um grupo).
- **Aba "Pessoas"** existe porque o papel vive em **3 lugares**
  (`mem_grupo_membros.funcao` · `mem_grupos.lider_id` · `mem_grupos.supervisor_id`)
  — `GET /grupos/pessoas/papeis` agrega 1 linha por pessoa com papel efetivo
  (rank coordenador>supervisor>líder>co-líder>treinamento>membro>visitante).
  ⚠️ **NÃO há histórico de quando a função mudou** (sem coluna `funcao_desde`):
  "tempo em treinamento" exigiria migration futura.
- ⚠️ Cards de resumo são **BOTÕES-FILTRO** (o Marcos não achava as pills).

## Devocionais · KPIs/OKR do app + histórico na Membresia (2026-06-12)

O devocional está NO AR via app (check-in grava `mem_devocionais` · 1 linha
por membro/dia). Esta leva liga a medição e dá visibilidade por pessoa:

- **KPIs DEV-01/02/03** (migration `20260612150000`): check-ins/mês, pessoas
  fazendo devocional/mês, famílias com devocional familiar/mês. Área `sede`
  (= igreja toda · devocional NÃO tem dimensão de área de culto — KRs filhos
  por área seguem sem fonte), `valores=['investir']`, objetivo `576c04ec`
  ("Aumentar Pessoas fazendo Devocionais"), `tipo_calculo='manual'` +
  coletores JS `devocionais.checkins`/`devocionais.pessoas` (novos ·
  `devocionais.familias` já existia — KID-04 segue dormente/inativo). Cron
  diário `0 7` já coleta (fonte_auto setado · sem mudança no vercel.json).
  **meta_valor=NULL** nos volumes (app novo, sem baseline 2025 · view trata
  como `sem_meta`, sem vermelho falso) — Marcos define meta no /gestao.
- **OKR ligado (padrão B1)**: KR geral "Crescimento >=50% no nº de
  devocionais/mes" ganhou `fonte_kpi_id='DEV-01'` → /gestao mostra realizado.
  KR de famílias (">=25% das famílias do CBKids") segue SEM fonte: o check-in
  do app é `tipo='pessoal'` (sem captura de devocional familiar ainda).
- **Aba "KPIs e OKR" no DevocionalAdmin** (dentro de Cuidados → Devocionais):
  `GET /devocionais/kpis` (paginado p/ cap 1000) → cards do mês em tempo
  real, série diária 30d, evolução mensal 6m, KPIs DEV-* com status da
  `vw_kpi_trajetoria_atual` e KRs do objetivo com realizado.
- **Membresia · aba "Devocional" no detalhe do membro**: histórico de
  check-ins do app por pessoa (sequência de dias, nº no mês, total, lista com
  título/passagem do plano). `GET /devocionais/membro/:id` ganhou join de
  `devocional_itens` + `resumo {total, streak, no_mes}`.
- **UX do detalhe do membro**: as abas de categoria não rolam mais na
  horizontal — `TabsList` virou `flex flex-wrap` (todas visíveis, quebram em
  2 linhas no mobile). Reclamação do Marcos: "arrastar pro lado é muito ruim".
- ⚠️ Pós-migration: rodar `POST /api/kpis/v2/coletar` body
  `{"fontes":["devocionais."]}` (ou esperar o cron diário) pra popular os
  primeiros registros.

## Compras · nota fiscal escaneada + ledger do Pery (2026-06-12/18)

Dois fluxos VIZINHOS que **não se confundem** — o diário de implementação dos dois
está no legado:

- **Aba Notas Fiscais** (Amaury → financeiro): scan da NF (foto/PDF) → Haiku com
  visão extrai emitente/CNPJ/valor/itens → sugere categoria contábil reusando o
  `financeiroClassificador` → compras revisa → "Enviar pro financeiro" → o
  financeiro **Lança**, o que **CRIA `fin_transacoes`** e concilia com o extrato
  (se existe exatamente 1 débito OFX não classificado com mesmo valor na janela).
- **Aba Compras** (`log_compras` · ledger do Pery, substitui a planilha "CONTROLE
  DE COMPRAS"): o registro operacional que **VINCULA com a saída que JÁ existe no
  balanço** — sentido inverso. Importação por xlsx com `import_chave` UNIQUE
  (reimportar não duplica), scan que nasce **pendente** pra aprovação humana, e
  sugestão de vínculo por valor+data+similaridade com **confirmação SEMPRE
  manual**.

**Regras que ficam:**
- **Review-before-apply nas 2 pontas**: compras revisa a extração, o financeiro
  confirma a categoria antes de virar transação. **Nada entra direto.**
- **Centro de custo e comprador vêm do financeiro/RH**, não de texto livre
  (`fin_centros_custo` · `rh_funcionarios`); vincular a saída do balanço
  **consolida** o centro de custo da transação na compra.
- **Fornecedor é find-or-create** (`resolverFornecedor`), e a aba sinaliza
  "Incompleto" quando falta CNPJ/endereço/telefone.
- **Nota fiscal por foto no WhatsApp**: qualquer número manda "nota fiscal", o bot
  aceita várias fotos e cria **uma compra pendente por nota**. Intercepta ANTES da
  checagem de líder, e só assume com sessão aberta ou gatilho explícito — senão
  devolve `false` e o fluxo normal segue. Usa **Opus** (melhor visão · decisão do
  Matheus, ciente do custo) enquanto a aba usa Haiku.
- ⚠️ **Limitação conhecida**: NF lançada como `pendente` (sem débito no extrato
  ainda) **não** é conciliada automaticamente quando o OFX chegar depois — o
  débito aparece na fila normal e, se aprovado lá, **duplica a despesa**. Hábito:
  ao reconhecer o débito de uma NF já lançada, **ignorar** o item da fila.
- ⚠️ **Drift git↔prod é real**: a tabela viva tinha colunas fora do git e faltava
  outras da migration original — o POST manual estava quebrado em prod por
  inserir `tipo`. Conferir o catálogo antes de assumir o schema do arquivo.

## Logística · aba Solicitações removida + fix de corte nos modais (2026-06-25)

Amaury reportou o **modal de Solicitações cortando** a visualização e Marcos
pediu pra **tirar a aba "Solicitações" de dentro de `/admin/logistica`** (o
fluxo vive só em `/solicitacoes`). PR `claude/logistica-remove-solic-modal-fix`:
- **Logística** (`Logistica.jsx`): removida a aba "Solicitações" (era índice 8)
  — import, entrada do `TABS`, render `{tab === 8 && <LogisticaSolicitacoes/>}`
  e o componente órfão `LogisticaSolicitacoes.jsx` (deletado · só era usado
  aqui). ⚠️ Histórico que confunde: a aba foi removida em 19/05, **reintroduzida**
  depois junto com Compras/Estoque, e agora saiu em definitivo. As demais abas
  (Dashboard/Fornecedores/Pedidos/Notas/Compras/Compras ML/Rastreio/Estoque ·
  índices 0-7) não mudaram. Backend e `api.js` de compras intactos.
- **Modais de `/solicitacoes`** (`Solicitacoes.jsx` · `DetailDialog` + "Nova
  Solicitação"): o `DialogContent` usava `max-h-[90vh] overflow-y-auto` sobre o
  `grid` do shadcn — conteúdo alto **cortava** em vez de rolar. Padrão correto e
  reusável: `DialogContent` vira `flex flex-col` (sem `overflow`) e o corpo
  ganha `flex-1 overflow-y-auto min-h-0` (header pinado, corpo rola). ⚠️ Ao criar
  modal com conteúdo potencialmente alto, usar SEMPRE esse padrão — NUNCA
  `overflow-y-auto` no container grid; `min-h-0` no corpo flex é obrigatório
  (sem ele o filho não encolhe abaixo do conteúdo e o corte volta).

## Eventos · update/delete resiliente + filtro Série por category_id (2026-06-09)

Sintoma recorrente: **"Erro ao atualizar/excluir evento"** mas a mudança
**persistia** (aparecia ao recarregar). Causa: `PUT /events/:id` e
`DELETE /events/:id` (`routes/events.js`) misturavam o **write primário** (que
já commita) com **operações secundárias** num único `try/catch` — uma falha
lateral retornava **500 com o dado já gravado**. Gatilho mais comum no PUT: o
`EventFormModal` sempre manda `date`, então diferença de formato dispara o
recálculo do ciclo, e um `new Date(prazo).toISOString()` numa fase/tarefa com
data inválida estoura `RangeError`. Mesma classe de bug já resolvida só no
`PATCH /:id/status` (tag `patch-status-resilient-v1`). **PR #940** estendeu o
padrão a update/delete:
- **PUT**: só o `update` primário pode retornar 500; recálculo de ciclo (com
  guarda `isNaN` contra data inválida), `audit_log`, `enqueueSync` e o `select`
  pós-update viram **best-effort** (só logam). Resposta = linha atualizada ou,
  se o select falhar, o próprio payload aplicado.
- **DELETE**: cascata de dependências best-effort via helper `safe()`; só o
  `delete` primário de `events` decide sucesso/erro.
- **Frontend** (`Eventos.jsx` `saveEvent`): em erro de servidor numa edição,
  refaz o `GET` e confirma se gravou antes de exibir erro (igual ao
  `toggleEventStatus`). **Regra do módulo**: write primário decide a resposta;
  o resto é best-effort.

**Filtro série vs evento robusto (`routes/cycles.js` `GET /kpis/cross`):** antes
discriminava por `event_categories.name === 'Série'` (string exata, por evento)
→ quebrava com acento/caixa e ao renomear a categoria. Agora resolve o
`category_id` da categoria "Série" **uma vez** (lookup tolerante · `unaccent` +
`lower` via `normalize('NFD')`) e compara por id; o filtro de `concluido` ficou
consistente nos 3 modos (todos/serie/evento). Renomear um **evento** nunca
afeta a classificação (sempre foi por UUID). ⚠️ Não há coluna `slug`/flag em
`event_categories` — a categoria "Série" segue identificada pelo nome
normalizado; renomeá-la pra algo sem relação com "serie" ainda mudaria o
conjunto (improvável · é categoria estrutural). Renomear séries/eventos é
seguro: nada no código depende do nome (tudo liga por `events.id`).

## Bot WhatsApp · Flows (formulário) · REPRESADO por integridade da Meta (2026-06-09)

**Root cause do `Integrity requirements not met`**: a WABA estava **BLOCKED por
falta de método de pagamento** (`error 141006`) — não era app não-publicado. O
Marcos adicionou cartão e a WABA virou AVAILABLE; resta a trava de integridade de
publicar/enviar Flow (139000/4233020), provável propagação pós-pagamento.
Diagnóstico e histórico das versões no legado. **Enquanto isso o bot já coleta por
TEXTO** (fallback conversacional), que é o caminho em uso.

**Decisões do redesenho (valem quando destravar):**
- **Cadastro de pessoa SAIU do WhatsApp.** O Flow coleta só os NÚMEROS
  (frequência + nº de decisões); o cadastro nominal é no **computador**, na aba
  Decisões→Pessoas do `/integracao`. `parsed.a_cadastrar` guarda quantas faltam.
- **1 Flow, 3 telas** (frequência → decisões → qual culto, com os cultos
  pré-carregados no envio): a navegação entre telas é local/instantânea, então 1
  Flow é melhor que 2 formulários, que pagariam a entrega da Meta 2×.
  ⚠️ Número encadeado entre telas exige `type:number`.
- **Frequência ONLINE saiu do form** (vem da API). **Decisões online** ficam no
  form mas vão pra OBSERVAÇÃO — `cultos_dados_submissoes.ambiente` só aceita
  templo/kids.
- **Mensagens padrão sem IA** (corta latência): saudação e confirmação
  personalizadas com o 1º nome + **FAQ institucional por palavra-chave**. O Haiku
  só entra em texto livre com números ou pergunta fora do padrão.

⚠️ **Pra ativar quando a Meta liberar, nesta ordem**: (1) subir o JSON novo no
flow existente; (2) publicar; (3) **remover `WHATSAPP_FLOW_MODE=draft` do
Vercel**; (4) redeploy; (5) testar com "quero lançar culto".

## OKR · KR medido pelo KPI (Frente B1 · 2026-06-03)

Marcos: "o KR é pra ser respondido pelo **KPI central** do indicador · **sem entrada manual**;
o que precisar de mais coisa pra preencher, **remove**". Diagnóstico (ao vivo): a cascata de KRs
está OK (1 geral + N área-específicos via `kr_pai_id`+`agregacao_cascata`, **sem duplicata real**),
MAS **0 KRs eram medidos** e só **5 de 29 objetivos** têm KPI com fonte → **83% dos KRs (428/513)**
estão sob objetivos **sem nenhuma medição** (voluntários, grupos, doadores, capelania, NPS…). Marcos
decidiu **NÃO apagar em massa**: ligar os medidos agora + roadmap de dar fonte ao resto.

**B1 (mecanismo · não-destrutivo · migration `20260603220000`):** `kpi_krs.fonte_kpi_id` (→ o KPI
tático que mede o KR). `estrategia.js` `enriquecerKrs()` anexa `realizado`/`kr_status`/`percentual_meta`
do **`vw_kpi_trajetoria_atual`** (cobre KPIs manual + calculado); **KR geral agrega dos filhos medidos**
(avg p/ %). `EstruturaOkr.jsx` mostra "realizado vs meta · no alvo/fora". **Ligados** (12 KRs específicos):
batismo-90d→`X-BAT90`, reunião→`AMI-21/SED-17/BRG-19/ONL-04`, Next-90d→`X-NEXT90` (criei os específicos
do Next nesta migration). ⚠️ Importante: a matriz/painel lê `vw_kpi_trajetoria_atual` (que pega
`kpi_registros` qd `tipo_calculo='manual'`), por isso os KPIs da Frente A aparecem lá.

**PRÓXIMO (B2/B3):** (1) ligar os KRs dos demais objetivos JÁ medidos (frequência cultos, batismo
crescimento…); (2) **triagem de remoção ✅ FEITA** (migration `20260603230000` · Marcos aprovou):
201 KRs não-mensuráveis-por-KPI desativados (`ativo=false`, reversível) — floor "0 X", contagem-de-meses,
processo/cadência e o vago "Make a Difference". Sobram ~316, todos "número vs meta". (3) **roadmap**: dar fonte/coletor aos 24 objetivos sem medição (voluntários,
grupos, doadores, capelania, aconselhamento, NPS…), aí seus KRs passam a ser respondidos. **NUNCA
entrada manual** (decisão do Marcos). Ver `project_okr_kr_medicao`.

## Jornada na NSM · 3 marcos medidos + KRs (Frente A · 2026-06-03)

Marcos: levar os 3 marcos pra matriz/mandala, medidos pela lógica de coorte do tracker.
Metas: **Batismo ≥30%/90d · Next ≥30%/90d · Reunião aceita ≥70%**. Contato (100%) fica no
operacional (não vira KPI · a escalação já existe).

**Achado do audit (consulta ao vivo):** os objetivos já existiam, mas o tático que os media
era **crescimento de volume**, não o % de coorte 90d. E os **KRs (`kpi_krs`) são só texto-alvo,
sem valor medido** e estão **duplicados** (~6-7 cópias/objetivo, resíduo da cascata) — Marcos
levantou isso → **Frente B**. Então, na Frente A:
- **Batismo (obj `ac906f19`) e Next (obj `68c17f72`):** CRIADOS táticos de coorte por área
  (`AMI/BRG/ONL/SED-BAT90` e `-NEXT90` · `valores=['seguir']` · mensal · meta 30 ·
  `tipo_calculo='manual'` · `fonte_auto` cuidados.batismo_90d_pct/next_90d_pct). O de crescimento
  CONTINUA (métrica diferente, não duplicata).
- **Atendidos (obj `5ffafa58`):** RELIGADOS os táticos existentes (`AMI-21/SED-17/BRG-19/ONL-04`)
  → "% que aceitou a reunião", `fonte_auto='cuidados.reuniao_aceita_pct'`, meta 70 (sem KPI novo).
- **KRs:** trocado "1 ciclo NEXT/trimestre" → "Next em ≤90d"; "contato ≤7d" → "aceita reunião".

**Coletores (`kpiAutoCollector.js`):** `cuidados.{reuniao_aceita_pct,batismo_90d_pct,next_90d_pct}`
(coorte mensal por área · helper `cohortNoPrazoPct` cruza `cui_convertidos` × `batismo_inscricoes`/
`next_inscricoes` por membro/cpf/nome, janela 90d). **`coletarTodos` agora passa `area: ind.area`**
ao coletor (retrocompatível) → 1 coletor serve N áreas (não precisa fonte por área).
`tipo_calculo='manual'` → a view lê de `kpi_registros` (que o coletor JS popula). `meta_valor_absoluto`
fica NULL nos %s (não normaliza por periodicidade · é %, não volume).

**Migration `20260603190000_jornada_nsm_kpis.sql`.** ⚠️ Aplicar antes do merge; depois rodar o
coletor: `POST /api/kpis/v2/coletar` body `{ fontes: ['cuidados.'] }` (ou esperar o cron diário).

**Frente B (A FAZER · Marcos pediu "rever a lógica dos KR"):** KRs hoje não têm valor/medição
(só texto) e estão duplicados. Projeto: deduplicar + dar fonte/medição a cada KR (ligar ao tático
que o mede via `kpi_krs.kpi_id`, ou marcar 'manual') + `estrategia.js`/gestão mostrar "% atingido
por KR". Começa por um diagnóstico dos 75 KRs (quais medem automático, quais são duplicata, quais
precisam de fonte).

## Jornada do novo convertido · 90 dias + responsabilidade por área (2026-06-03)

Marcos: medir 3 marcos por novo convertido a partir da conversão — **Contato pastoral ≤3d**,
**Batismo ≤90d**, **Next ≤90d** — com a responsabilidade seguindo a **ÁREA DE CULTO** da
conversão. Cadeia: Integração CONTA → Cuidados REÚNE no encontro e PONTUA o destino → **líder
da área** acompanha as fases → **Marcelo Soares** (`supervisor-jornada`) supervisiona de Cuidados
e **cobra** quem não fez o contato. Áreas→líder: AMI→Arthur · Online→Renata · Bridge→Lillian ·
Domingo/Sede→Marcelo. Kids fora (LGPD · não vira convertido).

**Migration `20260603160000_jornada_novos_convertidos.sql`** (aditiva): `cui_convertidos` +=
`area` (ami/bridge/online/sede), `primeiro_contato_em`, `primeiro_contato_por`. Trigger
`tg_cultos_dec_pessoas_to_cuidados` recriado pra gravar `area` (online se a decisão foi online;
senão pelo nome do tipo de culto). Backfill da `area` pelos cultos existentes (+ override 'online'
via `cultos_decisoes_pessoas`).

**Backend (`routes/cuidados.js`):**
- `agendar-encontro` e o novo `registrar-contato` carimbam `primeiro_contato_em` na 1ª vez (SLA 3d).
- `GET /cuidados/jornada-convertidos?area=` → convertidos com os 3 marcos (status semáforo:
  feito/no_prazo/vencendo/atrasado/inscrito) + resumo (% por marco). Cruza `batismo_inscricoes`
  + `next_inscricoes` por membro/cpf/nome (paginado p/ o cap de 1000).
- `registrar-contato` deixa o líder marcar o contato sem precisar agendar a reunião ainda.

**Escalação (`notificacaoGenerator.js` · `gerarNotificacoesJornadaConvertidos`):** sem contato
em ~2 dias → notifica o **módulo da área** (líder); >3 dias → também notifica **cuidados**
(Marcelo cobra). Dedup por convertido/dia. ⚠️ pra mirar Arthur/Renata/Lillian, configurar os
destinatários dos módulos `ami`/`bridge`/`online` em `/admin` (NotificacaoRegras) · senão cai
no fallback admin.

**Frontend — componente reusável `src/components/JornadaConvertidos.tsx`** (3 marcos semáforo +
% no topo + filtros + botão "marcar contato"), montado em:
- **Cuidados** aba **"Primeiros passos"** (cockpit do Marcelo · todas as áreas + filtro).
- **`/ami` e `/bridge`** (PainelArea) e **`/online`** (Online.tsx) → filtrado pela área
  (Arthur/Lillian/Renata veem só a sua gente).
- **Integração** aba **"Next"** (`view="next"` · cobertura do Next em 90d, todas as áreas).
- `api.js`: `cuidados.jornadaConvertidos` + `cuidados.convertidos.registrarContato`.

**Next em Integração:** decisão do Marcos = aba de **cobertura/funil** reusando `/api/next`
(o módulo `/next` standalone continua pro admin de eventos). **Fase 2:** formalizar os 3 marcos
como **KPIs na matriz/NSM** (hoje os % já aparecem no tracker, mas fora da matriz).

⚠️ **Aplicar a migration `20260603160000` antes do merge.**

## Cuidados · Encontro pastoral + Encaminhamento da jornada (2026-06-03)

Marcos: na aba **Convertidos** (`/ministerial/cuidados`), (1) filtro **"Já atendidas"**;
(2) o encontro pastoral vira registro real (data + **hora** + **quem vai atender** +
**compareceu**); (3) o **desfecho** encaminha a pessoa pros próximos valores
(**Jornada 180 / Grupos / Voluntários**) e cada área recebe numa **caixa de entrada**
onde registra contato + **devolutiva** (Pendente/Não respondeu/Em dúvida/Engajou/Sem
interesse). É a **amarração conversão→valores** que faltava (alimenta o NSM · ver
`project_jornada_gaps`).

**Decisões do Marcos (travadas):** SEM opção "não se converteu" (não interrompe o
fluxo, qualidade de entrada é da Integração · NÃO mexe em trilha/NSM); **sem rótulo de
dor** (guarda a *direção*, não o *diagnóstico* · motivo sensível só em observação
discreta); **toda pessoa sai com ≥1 encaminhamento**; o "primeiro contato" (encontro)
é o diferencial → continua sendo **agendado** (data/hora/quem). A tarefa-automática na
aba Tarefas + agenda-da-área foram **descartadas** em favor do registro de contato +
devolutiva na caixa de entrada da área.

**Migration `20260603120000_cuidados_encontro_encaminhamento.sql`** (aditiva · idempotente):
- `cui_convertidos` += `encontro_hora`, `encontro_responsavel_id/nome`, `encontro_status`
  (agendado/realizado/faltou/cancelado), `encontro_compareceu`, `desfecho_em/por/observacoes`.
- `jornada_encaminhamentos` (pessoa×destino · `destino` jornada180/grupos/voluntarios ·
  `valor_alvo` · `status`=devolutiva · encaminhado/recebido/resolvido) + filho
  `jornada_encaminhamento_contatos` (log: data_contato, canal, observacao, devolutiva,
  feito_por · CASCADE, sem soft-delete próprio). Padrão PII: `deleted_at` + whitelist
  `app_soft_deletable_tables()` + RLS contextual **por módulo do destino** (cuidados vê
  tudo; grupos/voluntariado veem o seu) + service_role.

**Backend:**
- `routes/cuidados.js`: `POST /convertidos/:id/agendar-encontro` (notifica o pastor via
  `targetIds`), `…/cancelar-encontro`, `…/desfecho` (cria os encaminhamentos só se
  compareceu + notifica as áreas). Mapa `DESTINO_META` (destino→valor+módulo notif+link).
- `routes/encaminhamentos.js` (`/api/encaminhamentos`, montado no `server.js`):
  `GET /` (?destino=&status=), `GET /resumo`, `GET /:id` (+ log de contatos),
  `POST /:id/contato` (insere + atualiza pai: status=devolutiva, recebido_em na 1ª vez,
  resolvido em engajou/sem_interesse), `PATCH /:id`. Auth **in-handler por módulo do
  destino** (`req.user.granular.modulePerms` · admin/diretor=5) — não usa authorizeModule.

**Frontend:**
- `Cuidados.tsx`: filtros "Já atendidas"/"Aguardando desfecho"; modais
  `AgendarEncontroModal` (data/hora/quem · select de `users`) e `DesfechoModal`
  (compareceu? + destinos `DESTINOS_ENC` + observação discreta); ficha do convertido
  mostra o encontro (data/hora/quem/status) + botões Agendar/Reagendar/Desfecho;
  botões na linha da tabela. Bloco de encontro saiu do `ConvertidoModal` (virou fluxo
  dedicado). Aba **Jornada 180** recebe `<EncaminhamentosInbox destino="jornada180">`.
- **Componente reusável** `src/components/EncaminhamentosInbox.tsx` (lista + dialog com
  log de contato + form de devolutiva) usado nos 3 destinos. Filtros: **A contatar /
  Já atendidos** (recebido_em set · já houve contato) **/ Engajaram / Todos** + contagem no topo.
- **Grupos.jsx**: aba **"Encaminhados"** (`pageTab='encaminhados'` · `destino=grupos`).
- **Voluntariado**: `VolEncaminhados.tsx` + rota `encaminhados` no `index.tsx` + item no
  `VolNavBar` (`destino=voluntarios`).
- `api.js`: `cuidados.convertidos.{agendarEncontro,cancelarEncontro,desfecho}` + namespace
  `encaminhamentos.{list,resumo,get,contato,updateStatus}`.

**Cobertura de batismo (Integração · mesma PR · SEM migration):** trilho **universal** —
todo convertido deve ser chamado pro batismo, a Integração acompanha independente do
Cuidados. `GET /kpis/batismos/cobertura-convertidos` cruza `cui_convertidos` ×
`batismo_inscricoes` (por `membro_id`, CPF ou nome · **paginado** p/ o cap de 1000 do
PostgREST) → card **"Convertidos chamados pro batismo"** na aba Batismos (`Batismos.tsx`):
% batizados + nº inscritos + nº não inscritos + botão "Ver quem falta" (lista dos
pendentes). `api.kpis.batismos.coberturaConvertidos()`.

⚠️ **Aplicar a migration `20260603120000` antes do merge** (APLICADA em prod 2026-06-03).
Follow-ups (próximas PRs): "engajou" cruzar com o sinal real do valor (grupo/voluntário),
fechar-o-loop (aceite na área cria o pedido de grupo / inscrição de voluntário nativos),
funil de analytics encaminhados→aderiram.

## Cuidados · Caixa de entrada (intake de pedidos) (2026-07-22)

A aba **"Aconselhamento" virou "Caixa de entrada"**: fila única de triagem de
todo pedido de cuidado (aconselhamento, capelania, oração, SOS, visita), no
estilo da caixa de entrada do Grupos. Ponte com a trilha: ao **Atender**, o líder
escolhe o TIPO de atendimento/visita → cria o atendimento na trilha da pessoa
(aba Visitas e Atendimentos).
- **Migration `20260722190000`**: tabela **canônica `cui_pedidos`** (canal
  app|whatsapp|plataforma|manual · tipo aconselhamento|capelania|oracao|sos|visita|
  outro · status pendente|em_andamento|concluido · membro/nome/telefone/email ·
  mensagem · atribuido_a · `origem_ref` · `atendimento_ref`) + RLS módulo cuidados.
  Soft-delete via UPDATE `deleted_at` (padrão do módulo · sem whitelist).
- **Contrato** = `backend/services/cuidadosPedidos.js` `registrarPedidoCuidado({canal,
  tipo,membro_id,nome,telefone,email,mensagem,origem_ref})` — **alvo único pro
  WhatsApp do Matheus e pra plataforma/app** plugarem (normaliza telefone/e-mail +
  notifica). O canal `app` já entra por `app_inscricoes` (a Caixa lê de lá também
  via `/pedidos-app`) — não precisa chamar o contrato. ⚠️ Ligar o canal WhatsApp em
  si é do lado do Matheus (ele chama `registrarPedidoCuidado`) — alinhar a forma
  com ele; o resto funciona sem depender disso.
- **Multi-fonte por decisão** (não trigger-espelho): a Caixa lê `cui_pedidos`
  (whatsapp/plataforma/manual) + `app_inscricoes` (canal app · endpoints
  `/pedidos-app` já existentes) e mescla numa fila só. `cui_pedidos` é a canônica
  pros canais novos; o app segue na sua tabela (fluxo/push intactos). Consolidar o
  app em `cui_pedidos` por trigger fica pra uma futura, se quisermos tabela física
  única.
- **Backend** (`routes/cuidados.js`): `GET /cuidados/pedidos` (fila cui_pedidos +
  nome de quem atribuiu) · `POST /cuidados/pedidos` (manual) · `PATCH
  /cuidados/pedidos/:id` (status/atribuir) · `DELETE` (soft) · **`POST
  /cuidados/pedidos/atender`** (`{fonte:'cui'|'app', id, atendimento:{tipo,...}}` →
  roteia por tipo: aconselhamento/capelania → `cui_acompanhamentos` (mantém os KPIs
  de capelania/aconselhamento) · demais → `cui_visitas` · marca o pedido
  em_andamento + guarda `atendimento_ref`). `/pedidos-app` (canal app) intocado.
- **Frontend** (`Cuidados.tsx`): `CaixaEntrada` (filtros canal/tipo/status + busca ·
  cards de pedido com telefone + botão **"Conversas"** (link `hrefConversa` → o pastor
  vê/responde no módulo Conversas, NÃO gerencia aqui) · status inline · "Atender" ·
  "Registrar pedido" manual) + `AtenderPedidoModal` + `RegistrarPedidoModal`. Badge de
  pendentes na aba. `api.js`: `cuidados.pedidos.{list,create,update,remove,atender}`.
  ⚠️ **Insights de oração + config de WhatsApp SAÍRAM da Caixa de entrada (2026-07-22)** —
  aquele bloco `<details>` (OracaoPanel + WhatsappAutoConfig) foi removido: gerenciamento
  de WhatsApp é do módulo de WhatsApp/Conversas (do Matheus). Cada pedido tem só o link
  pro Conversas. Componentes `OracaoPanel`/`WhatsappAutoConfig` seguem no repo (usados
  em outro lugar), só não são mais montados no Cuidados.
- **`AcompanhamentoModal` ficou dormente** (sem render) — criar aconselhamento/
  capelania novo agora é pelo fluxo "Atender" (ou registrar pedido manual + atender).
  A tabela `cui_acompanhamentos` segue viva (KPIs + trilha).
- ⚠️ Aplicar a migration `20260722190000` antes do merge.

## Cuidados · trilha por pessoa na aba "Visitas e Atendimentos" (2026-07-22)

Parte do redesenho do Cuidados (aprovado pelo Marcos). A aba deixou de ser uma
lista solta de atendimentos independentes e virou uma **trilha por PESSOA**: o
histórico de cada pessoa vira um fio contínuo, com **comentários por atendimento**.
- **Migration `20260722180000`**: `cui_atendimento_comentarios` (comentário
  polimórfico · `ref_tipo` visita|acompanhamento + `ref_id`) + RLS módulo cuidados +
  service_role. Soft-delete via UPDATE `deleted_at` no backend (mesmo padrão do
  `cui_visitas` · não usa `app_soft_delete`/whitelist).
- **A trilha JUNTA na leitura `cui_visitas` (visitas/atendimentos) +
  `cui_acompanhamentos` (aconselhamento/capelania)** — decisão consciente de **NÃO
  migrar/mexer no `cui_acompanhamentos`**: ele alimenta 6 leitores (KPIs de
  capelania/aconselhamento em `kpiAutoCollector`, `painel.js`, `notificacaoGenerator`,
  `agentContext`, `cerebroSync`, `lgpd`). Unificar por leitura preserva os KPIs e evita
  a armadilha "não é swap de 1 linha".
- **Âncora da pessoa** (chave): `membro_id` > telefone (só dígitos, ≥10) > nome
  normalizado (sem acento/caixa). Contrato de porta.
- **Backend** (`routes/cuidados.js`): `GET /cuidados/trilha` (pessoas agrupadas ·
  cada uma com `atendimentos[]` já ordenados + `comentarios_count`; helper
  `carregarAtendimentosTrilha` + `_fetchTudoCui` paginado p/ o cap de 1000) ·
  `GET/POST /cuidados/atendimentos/:refTipo/:refId/comentarios` ·
  `DELETE /cuidados/atendimento-comentarios/:id`.
- **Filtros da aba (2026-07-22 · client-side, sem backend/migration):** `TrilhaPessoas`
  tem filtros por **tipo**, **status**, **quem atendeu** (`responsavel`) e **período**
  (De/Até por `data` do atendimento). As opções de tipo/status/responsável são
  derivadas dos atendimentos JÁ carregados por `trilha()` (distinct no `useMemo`), então
  não precisou de endpoint novo. Regra de match: a pessoa aparece se tiver **≥1
  atendimento** que casa TODOS os filtros ativos (busca por nome/telefone continua no
  nível da pessoa). Botão "Limpar filtros" some quando nada está ativo. O
  `TrilhaPessoaDialog` segue mostrando o histórico completo da pessoa (filtro serve pra
  ACHAR, não pra recortar a timeline).
- **Frontend** (`Cuidados.tsx`): `TrilhaPessoas` (cards de pessoa · busca · filtros · paginação)
  → `TrilhaPessoaDialog` (timeline) → `ComentariosAtendimento` (lazy). "Registrar
  atendimento" reusa o `VisitaModal` (cui_visitas); editar/prefill por pessoa idem.
  Capelania só é EXIBIDA na trilha (vem de `cui_acompanhamentos`) — criar capelania/
  aconselhamento novo segue na aba Aconselhamento (até a Caixa de entrada ligar a
  ponte "atender → cria atendimento na trilha", próxima PR). `api.js`:
  `cuidados.trilha()` + `cuidados.atendimentoComentarios.{list,create,remove}`.
- ⚠️ Aplicar a migration `20260722180000` antes do merge.

## Cuidados · responsáveis do atendimento gerenciáveis (2026-07-21)

Pedido do Marcos: a lista de responsáveis da aba **Próximos passos** do
`/ministerial/cuidados` (quem atende os convertidos) deixou de ser constante no
front (`RESPONSAVEIS_ATENDIMENTO`/`RESPONSAVEIS_ANTIGOS` em `Cuidados.tsx`) e
virou a tabela **`cui_responsaveis`** (nome + ativo · migration
`20260721160000` · seed = 4 ativos + 13 antigos inativos · RLS padrão do
módulo). A própria equipe gerencia pelo botão **"Gerenciar responsáveis"**
(ao lado de "Novo convertido" · só `podeEditarCuidados`): modal com switch
disponível/indisponível + adicionar nome (nome repetido inativo é REATIVADO,
não duplica). **Excluir só quem NUNCA foi usado** (follow-up 2026-07-21 ·
lixeira no modal): o DELETE conta `cui_convertidos.responsavel_atendimento`
pelo nome (incluindo soft-deletados) e responde 409 orientando a desativar se
houver uso — hard delete ok (catálogo de config, não-PII, fora da whitelist).
**Renomear PROPAGA** (follow-up 2026-07-21 · lápis no modal): o PATCH aceita
`{nome}` e atualiza `cui_convertidos.responsavel_atendimento` em cascata
(incluindo soft-deletados · devolve `renomeados`; conflito com nome existente
→ 409 orientando consolidar; falha na propagação reverte o nome no catálogo).
O vínculo é por NOME (texto · essas pessoas não logam no sistema), então
inativar preserva o histórico: inativo aparece desabilitado no dropdown da
tabela (só exibível no registro que já o tem).
Backend: `GET/POST/PATCH/DELETE /cuidados/responsaveis` (leitura nível 1 ·
escrita/exclusão 3). Front: constantes viraram FALLBACK (se a API falhar, vale
a lista antiga). `api.js`: `cuidados.responsaveis.{list,create,update,remove}`.
**Dedup dos nomes da planilha antiga** (migration `20260721190000` · pedido do
Marcos 2026-07-21): `cui_convertidos.responsavel_atendimento` consolidado —
Kevin/Arthur + Arthur/Kevin → Arthur Cecconi · Naná → Natasha · Mari → Mariane ·
Carmet/Arthur → Carmet — e os 5 nomes duplicados removidos de
`cui_responsaveis` (com guarda: só sai quem ficou sem registro). Fallback do
front espelha o pós-dedup (8 antigos).

## Auditoria do sistema (2026-06-08) · correção dos 4 CRÍTICOS

Auditoria ampla do ERP (workflow multi-agente · find → verificação adversarial →
síntese): **29 achados confirmados** (4 críticos · 13 altos · 8 médios · 4
baixos). Fio condutor: o backend roda com `service_role` (bem guardado), mas o
**frontend usa a anon key** e várias tabelas escaparam das ondas de lockdown de
RLS. **Levas 1–5 + o fix da chave da API.Bible estão MERGEADAS** — o diário de
cada leva está no legado. O que fica:

- ⚠️⚠️ **Lição de método (a mais citada desde então):** validar o achado contra o
  **schema/uso VIVO**, nunca contra o arquivo da migration. O caso
  `cui_atendimentos` virou o exemplo da casa — a auditoria leu `USING(true)` num
  arquivo cuja parte **nunca foi aplicada em prod** (a tabela não existe lá).
- ⚠️⚠️ **O pool pg direto (`utils/db`) NÃO conecta no serverless do Vercel.** Foi
  o que deixou `agents.js` e `meetings.js` respondendo **500 em produção** até a
  leva 5 migrá-los pro cliente REST. Rota nova NUNCA usa `query()`.
- ⚠️ **A "família de hard-deletes" NÃO é troca mecânica** (e segue PENDENTE):
  `cultos`, `kpi_indicadores_taticos`, `cultos_decisoes_pessoas`,
  `mem_grupo_encontros`, `mem_devocionais` e `mem_familias` são **agregados em
  KPI/NSM** — soft-delete ingênuo deixa a linha "deletada" CONTINUANDO A CONTAR,
  pior que hard-delete. Converter exige varrer o filtro `deleted_at IS NULL` em
  todos os read-sites **e** nas funções SQL.
- **Demais pendentes**: RLS de `mem_cadastros_pendentes` (form público com anon
  insert · exige mover o form pro backend `/api/public/*`); `_kpi_agregar_dado`
  ignora o parâmetro de área no baseline de `batismos`/`novos_convertidos_atend`;
  pool-pg residual em `projects.js` (/views, /workload) e `patrimonio.js`
  (/dashboard); `MEM_QR_SALT` com fallback literal; cron não-timing-safe em
  `voluntariado-sync.js`.

# Estado atual dos módulos (condensado · histórico completo em docs/CLAUDE-LEGADO.md)

## Bot WhatsApp · estado consolidado (2026-05-27 → 2026-06-09)

Número do bot: **21 99907-9031**. Webhook público `routes/publicWhatsapp.js`
(montado em `/api/whatsapp/webhook`, fora do publicLimiter): responde 200
imediato e processa async · HMAC fail-closed em prod (`WHATSAPP_APP_SECRET`) ·
dedup por `whatsapp_message_id` · cap 20 msgs/evento · toggle global
`whatsapp_config.ia_ativa`. Admin em `/admin/whatsapp` (abas Coletas, Líderes,
Configuração) · auth `authorizeModule('whatsapp-admin', 3)` = integracao OU
grupos ≥3. **Nada é aplicado automaticamente** — toda coleta vira `parseado` e
espera o coordenador aplicar (review-before-apply).

- **Tabelas**: `whatsapp_lideres` (telefone E.164 → profile + `escopo[]`
  grupos/integracao + `papel` display), `whatsapp_coletas` (raw + `parsed`
  jsonb + status recebido→parseado→aplicado/rejeitado/ignorado/aguardando_info),
  `whatsapp_config` (singleton · `ia_ativa` + `institucional` jsonb).
- **2 personas** (`services/whatsappParser.js` · Claude Haiku): número
  desconhecido → assistente INSTITUCIONAL (só conteúdo de `whatsapp_config` ·
  não coleta); líder → coleta multi-turno (sessão `aguardando_info` por 7 dias ·
  `JANELA_CONVERSA_MIN`). FAQ institucional por palavra-chave responde sem LLM;
  Haiku só entra em texto livre com números ou pergunta fora do padrão.
- **Coleta por formulário (WhatsApp Flows)** — caminho principal do líder de
  integração: 1 Flow **culto** (3 telas · frequência → decisões → qual culto,
  cultos pré-carregados, navegação local). O Flow **pessoa** foi REMOVIDO no
  redesenho de 2026-06-09 (cadastro nominal é no desktop · aba Decisões→Pessoas);
  `parsed.a_cadastrar` guarda o nº de decisões a cadastrar.
  `flowsConfigurados()` exige só `WHATSAPP_FLOW_CULTO_ID`. Estado vive em
  `whatsapp_coletas.parsed` (`fonte:'flow'`) · sem migration. `flow_token`
  correlaciona a resposta (`nfm_reply`). Roteamento `pedeFormulario` é
  heurístico sem LLM: líder sem números soltos → oferece o formulário na hora;
  só-grupos → orientação por texto (grupos não tem formulário · encontro exige
  lista nominal).
- **Aplicar coleta**: integração cria `cultos_dados_submissoes` pendente (fila
  `/integracao?tab=pendentes`); flow usa `aplicarColetaFlow` (cria submissões
  templo/kids; decisões online vão na observação); grupos só marca aplicado.
- **Envs (Vercel)**: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_FLOW_CULTO_ID`,
  `WHATSAPP_FLOW_MODE=draft` (remover quando o app Meta for Live),
  `WHATSAPP_BUSINESS_ACCOUNT_ID` (só script de publish). Flow id (draft):
  culto `1163668689265932`. `services/whatsappService.js` é OUTRO componente
  (templates transacionais) · não é o webhook.
- Estado do bloqueio Meta + passos de ativação: ver a seção "Bot WhatsApp ·
  Flows — REDESENHO" acima. Diários das PRs anteriores: legado.

## Marketing · DASHBOARD é a abertura do módulo (2026-08-14 · SEM migration)

Pedido do Pedro Paiva, trazido pelo Marcos: *"dar uma nova cara à tela do
marketing"* com 3 blocos — as próximas entregas internas de quem está vendo · o
pulso das solicitações (feitas × resolvidas) + as próximas por prazo · e um
**calendário SEMANAL do ciclo criativo**, mostrando por semana em que fase cada
evento/série está, com o pendente de Marketing ao clicar.

**`/marketing` agora abre o Dashboard; o Kanban virou `/marketing/kanban`** (a
TELA do Kanban não mudou — só o endereço). `/marketing/dashboard`,
`/marketing/calendario|fila|ciclo-criativo|triagem` redirecionam.

### ⚠️ A régua do calendário é PURA e mora em `backend/utils/marketingSemanas.js`

A pergunta "em que fase o ciclo está NESTA semana" não tinha resposta em lugar
nenhum: o `/eventos` mostra o ciclo **por evento** (fases em lista) e o
`/marketing` mostrava **por fase** (aba Épicos). Nada atravessava os eventos por
semana, que é como a equipe criativa planeja a semana dela.

- **Semana SEG→DOM** (a mesma da frequência de cultos · **não** a financeira).
- **A fase da semana é a que OCUPA MAIS DIAS dela.** ⚠️ As fases
  **compartilham o dia de fronteira** no banco (a fase 2 termina no MESMO dia em
  que a 3 começa), então a soma das sobreposições de uma semana passa de 7 — é da
  natureza do dado e não afeta a comparação, que é relativa dentro da semana.
- **Empate → vence a fase de número MAIOR** (a mais adiantada): calendário serve
  pra planejar o que vem.
- **A VIRADA de fase dentro da semana é declarada** (`→ F9`): sem isso a semana em
  que o ciclo troca de fase pareceria uma semana comum, e é justamente a que
  importa. ⚠️ A transição olha **só pra frente** — apontar uma fase de número
  MENOR mandaria a equipe pra trás no ciclo.
- ⚠️ **Toda conta é em STRING `'YYYY-MM-DD'`** (as colunas de fase são DATE).
  `new Date('2026-08-14').getDate()` cairia no fuso local — o bug que já mordeu o
  censo, o totem Kids e o "culto de agora". O `hoje` é **BRT** com o agora
  INJETADO.
- **Evento sem NENHUMA fase na janela fica FORA da grade** (hoje há **7 ciclos
  ativos** e 3 só começam em setembro; ocupar linha com sete traços faria a tela
  parecer cheia de nada) — e quantos ficaram de fora é **DECLARADO**. Fase sem
  data entra em `sem_data`, nunca é descartada em silêncio.

**⚠️⚠️ O contrato central: `src/test/marketingSemanas.test.ts` (28 casos · no
gate) reproduz os 4 casos que o Pedro descreveu DE CABEÇA** para a semana de
17–23/08 (O Mundo→F8 Finalizações · Divertidamente→F5 Aprovação · Parábolas→F3
Brainstorming · Reforma→F3 Brainstorming). Bateu **4/4** contra o endpoint real
em produção. Se esse bloco ficar vermelho, a tela passou a discordar de quem
opera o ciclo. **5 mutantes RODADOS** (ordem do array decidindo a fase → 2
vermelhos · hoje em UTC → 1 · linha vazia entrando na grade → 1 · empate pela
fase menor → 1 · transição incluindo fase anterior → 1, este último só depois de
eu **reescrever o teste**: a 1ª versão da guarda não a exercitava e o mutante
sobreviveu).

### ⚠️ `parseInt(x) ?? padrão` devolve NaN — e o calendário voltava VAZIO

`??` só pega `null`/`undefined`, e **NaN não é nenhum dos dois**. O NaN
atravessava até `for (i = NaN; NaN <= 6)`, o laço não rodava, `semanas: []` e a
tela dizia *"nenhum ciclo ativo"* com **7 ciclos ativos no banco** — erro
perfeitamente silencioso, sem 500 e sem log. Corrigido com `limitarInteiro()` no
handler **e** saneamento na régua pura (defesa em profundidade: com data válida
`montarSemanas` NUNCA devolve lista vazia), com teste em cima.
⚠️ Só apareceu porque o endpoint foi **exercitado de verdade** contra produção —
o vitest e o build estavam verdes.

### Régua dos 3 blocos

1. **Minhas entregas** = cards `origem != 'evento'` atribuídos a mim, não
   concluídos. Ciclo criativo fica FORA por pedido explícito (ele tem o bloco 3).
   Prazo = `prazo_producao || prazo_confirmado || data_fim` (a precedência do
   coletor do MKT-PRAZO); **com prazo primeiro**, sem prazo depois na ordem da
   fila — e o "sem prazo" é DECLARADO, nunca a ordem da fila fingindo ser data.
   ⚠️ **`prazo_producao` não estava na whitelist do `PATCH /cards/:id`**, então
   não havia caminho de UI pra preenchê-lo e as **7 tarefas internas estavam
   TODAS sem prazo**. Entrou na whitelist e o box grava (nível 5).
   ⚠️ **O COORDENADOR não pega tarefa interna** — a caixa dele nasceria vazia
   justamente pra quem pediu o dashboard. Daí o seletor de equipe (só coord ·
   muda o RECORTE, não a régua). Não ser membro do Marketing é **declarado**, não
   devolvido como lista vazia (que se lê como "não tenho nada a fazer").
2. **Solicitações** = `categoria='marketing'`, `deleted_at IS NULL`.
   ⚠️ **`concluido`+`avaliado` = ENTREGUE; `cancelado`/`rejeitado` saem da fila
   mas NÃO contam como resolvidas** (senão a linha viraria "encerradas", que é
   outra pergunta). ⚠️ **Quem ORDENA é a `data_necessaria`** (o combinado com
   quem pediu); o `sla_resolucao_deadline` é o relógio interno e **já venceu em
   todas as 6 abertas** — ordenar por ele mostraria tudo igualmente atrasado. Sem
   data pedida cai no SLA, e a **ORIGEM do prazo vai na tela** (`(pedida)` ×
   `(SLA)`): o mesmo número significando duas coisas de linha para linha engana.
   A janela ("últimos 6 meses") vai colada no número.
3. **Ciclo** = ciclos `ativo` com evento não-concluído. Só tarefas
   `area='marketing'`. ⚠️ **Quem decide "está feito" é o CARD quando ele existe**
   (é a verdade do Marketing); sem card, o status da tarefa no /eventos — e o
   detalhe da fase mostra os **DOIS lados**, então a divergência fica visível em
   vez de escondida numa média. Espelho ausente é declarado ("sem card no
   Kanban").
   **Fase sem tarefa de marketing devolve `vazio:true` com o MOTIVO** (pedido
   nominal do Pedro): "a fase é de produção" × "a fase é de marketing mas
   ninguém cadastrou tarefa" mudam o que a pessoa faz a seguir. As `entregas_padrao`
   do template entram como contexto — o que a fase normalmente entrega.

⚠️ **Cada bloco falha SOZINHO** (`avisos[]` → faixa âmbar): um evento sem ciclo
não pode apagar a lista de tarefas, e **erro nunca se disfarça de tela vazia**.

### Cores do gráfico · `#00897B` + `#8b5cf6`

**Validadas pelo script de paleta** (`validate_palette.js`): passam as 6
checagens (banda de luminosidade, croma, separação para daltonismo, piso de visão
normal, contraste) nos **DOIS temas com as MESMAS duas cores** — o `#00B39D` da
marca reprova a banda no tema escuro (L 0.687) e tem contraste 2,65:1 no claro.
As duas já estão em `GRADIENT_PALETTE`, então `gradFill` funciona. **Não trocar
sem revalidar.**

### Medições de 14/08 (o estado que a tela mostra)

7 ciclos ativos · 77 fases (0 sem data) · 49 tarefas de marketing ↔ 49 cards
(espelho 1:1, **0 órfãos**) · tarefas de marketing existem só nas fases
**2,3,4,6,7,8,9** (1, 5, 10 e 11 nunca têm — a mensagem de vazio é frequente e
correta) · 8 solicitações vivas (2 entregues, 6 abertas, **4 já passaram da data
pedida** e as 6 furaram o SLA) · **`marketing_campanhas` = 0** (o fluxo
dor→campanha→entregáveis nunca foi usado em produção, então as 6 aprovadas não
viraram card — é o bloco 2 que as torna visíveis).

⚠️ **Alarme falso MEU, registrado de propósito:** reportei que os 105 cards de
evento eram órfãos. Eram 0 — meu `.in()` com 105 ids falhou e eu **não li o
`error`**, então o `data` vazio se leu como "não existe". Daí `lerEmLotes()` no
endpoint fazer lotes de ≤200 **e lançar** no erro. Lição repetida: *conferir o
que a sonda devolveu, não a contagem*.

⏳ **Follow-up de DADO (não de código):** 1 card `origem='solicitacao'` ("fazer
arte evento") está vivo na fila do Cauã com a solicitação **soft-deletada** — o
soft-delete da solicitação não propagou pro card. Aparece no Kanban desde antes
disto; a tela não o esconde de propósito (esconder criaria duas verdades entre
dashboard e Kanban).

## Marketing · estado final (specs maio + redesenho 2026-05-30/31 · NO AR)

O módulo nasceu em 24 specs (maio/2026) como "balcão" e foi **redesenhado** pra
"mesa de comando do Pedro" (sistema assiste, não decide). Diário completo das
specs e fases no legado. Estado vigente:

- **Fluxo**: solicitante pede por **DOR** em `/solicitacoes` (categoria
  marketing · sem tipo/estimativa no intake) → diretor de origem aprova → vira
  **campanha em `triagem`** (`marketing_campanhas` · trigger
  `fn_marketing_cards_solicitacao_sync`) → Pedro define solução e cria os
  **entregáveis** (cards · dono + início/fim + paralela/foco) → produção →
  revisão → **aprovação da DEMANDA COMPLETA** pelo solicitante
  (`POST /campanhas/:id/aprovar` · revisão 1x via `/revisar`) → NPS.
  "Tudo é campanha" (1 peça = campanha de 1 entregável).
- **Nav final: Kanban · Planner · Analytics · Admin** (+ toggle Quadro/Épicos).
  Kanban com 6 colunas (triagem/backlog/pesquisa/producao/revisao/concluido ·
  CHECK ainda aceita os legados fila/em_producao/aguardando_solicitante — o
  Select normaliza); coluna Triagem lista campanhas (`MarketingTriagemSheet`).
  Épicos = campanhas/eventos expansíveis com subdemandas (cards reais) + %.
  Telas órfãs (Triagem/Fila/Calendario/CicloCriativo standalone) deletadas.
- **Capacidade em SLOTS/DIA** (não horas): `marketing_membros.slots_dia`
  (default 3) · só dias úteis seg–sex · paralela conta 1/dia, foco enche o dia ·
  Pedro (`habilidade='coordenador'`) fica FORA das raias e do DEM-CAP.
  Planner Gantt mensal arrastável (`/marketing/planner` · HTML5 drag).
- **2 prazos**: entrega ao solicitante (campanha · `prazo_entrega`) × produção
  interna (card · `prazo_producao`/`data_fim`). Mudança de prazo notifica o
  solicitante.
- **Etiquetas**: 16 entregas concretas com `esforco_max_h` (SLA acordado, não
  média) + coluna `grupo` (rede_social/video_foto/artes); eixo destino =
  etiqueta interna do Pedro. Badge de SLA individual no card em produção.
- **Cards de evento**: `cycle_phase_tasks` com `area='marketing'` materializa
  card espelho (trigger `fn_marketing_cards_cycle_phase_sync` · estado sincroniza
  do Eventos; atribuição/etiqueta são locais do Marketing) + padrões por
  (categoria × fase) em `marketing_ciclo_padroes`.
- **Entregáveis** via SharePoint/Graph (`services/sharepointMarketing.js` ·
  biblioteca Criativo · `tipo='referencia'` pra inputs) + checklist por card.
- **KPIs**: MKT-PRAZO / MKT-LEAD / MKT-THROUGHPUT / MKT-DEM-CAP (semanais ·
  DEM-CAP em slots). `fn_marketing_estimar_prazo` e `/estimar` @deprecated;
  `fn_marketing_calcular_capacidade_semana` antiga DROPADA (20260531120000).
- **Permissões**: boost por área Marketing → equipe nível 5; diretores nível 1
  read. Solicitante acompanha por `MarketingCampanhaBlock` em `/solicitacoes`
  (busca campanha por `solicitacao_id` + entregáveis por `campanha_id` —
  lição: cards triados não têm `solicitacao_id`).
- **Resta (menor)**: reordenar-arrastando vertical no Kanban; Analytics vazio
  até juntar histórico.

## Solicitações · backbone administrativo (estado consolidado)

Fonte única dos KPIs administrativos (SLA, NPS, throughput, urgência). Schema:
`sla_definicoes` (prazos por área/subcategoria), `area_alcadas`,
`solicitacoes_eventos` (audit), views `vw_solicitacoes_sla` (alimenta os KPIs ADM
em `painel.js`) e `vw_reserva_espacos`. Triggers calculam SLA e decidem aprovação
financeira por alçada. O diário das decisões de form (dualidades, fotos,
co-aprovadores) está no legado.

- **Dois portões em sequência**: (1) **aprovação de origem** — toda solicitação
  passa pelo **diretor do SETOR do solicitante** (`setor_diretor` +
  `setor_coaprovadores` · `fn_normalizar_setor()`); diretores/diretoria geral/
  service_role dispensam; rejeitada é **IMUTÁVEL** (cria nova). (2) **aprovação
  financeira**: compras/reembolso/pagamento SEMPRE, sem bypass por valor.
- ⚠️⚠️ **Lição (service_role × trigger)**: o backend insere com `auth.uid()=NULL`,
  então **regra de roteamento NÃO pode viver só em trigger que lê `auth.uid()`** —
  o POST chama `fn_solicitacoes_rotear_origem(uuid)` via RPC e grava o resultado;
  o trigger fica de rede de segurança. (Foi o bug que marcava tudo `dispensada` e
  esvaziava a aba Aprovar.)
- **Form de criação é COMPONENTE reusável**
  (`src/components/solicitacoes/NovaSolicitacaoForm.jsx`): ponto de entrada novo
  **reusa** o componente, nunca duplica intake — aprovação/SLA/roteamento/KPI
  ficam 100% no backend, iguais pra qualquer host. A ocorrência do culto na
  Produção é o consumidor nº 2.
- ⚠️⚠️ **Compras: `solicitacao_itens.valor_estimado` guarda SEMPRE o total da
  LINHA**, e a soma do pedido NUNCA multiplica de novo. Caso real: 30 coletes ×
  R$ 1.000 viraram um pedido de **R$ 60.000**. O item tem seletor explícito
  "R$ total | R$ por unid." (`valor_tipo`, default `total`) e o servidor
  normaliza. **Total de compras é CALCULADO, não digitável.**
- **`area_cliente` é TEXT derivada de quem preenche** (kpi_areas → usuario_areas →
  profile.area · **ignora o body**). ⚠️ Lições de CHECK: a constraint de
  `categoria` precisa acompanhar `ALLOWED_CATEGORIES`, e `area_cliente` era enum
  de 6 áreas de culto e estourava com as 21 sub-áreas (virou text).
- **Urgente automático pela data**: `data_necessaria` mais curta que o
  `sla_resolucao_horas` padrão da categoria marca `eh_urgente` sozinho, com aviso.
  Marketing fica fora (prazo é da triagem). **Justificativa é única** — urgente
  não abre 2ª caixa.
- **Kanban agrupa os 10 status reais em 5 colunas** via `match[]`;
  `aguardando_aprovacao_origem` tem **coluna própria read-only** (o responsável da
  área vê que está vindo mas não pode mover — quem aprova é o diretor na aba
  Aprovar). NPS pós-conclusão alimenta os 11 KPIs `ADM-*-Q` automaticamente.
- ⚠️ **Fotos anexadas** (`solicitacoes.imagens_url` jsonb) só em Serviços/Serviço
  externo — Compras já tem foto POR ITEM. O backend **só inclui a coluna no insert
  quando há foto**, então flow antigo não a toca (tolera migration não aplicada).
- **E-mail das aprovações**: `notificar({..., email:true})` · canal em
  `services/email.js` com **Microsoft Graph primário** e Resend de fallback;
  no-op gracioso se nenhum estiver configurado.
- ⚠️ **Padrão de modal alto** (vale pra todo o sistema): `DialogContent` vira
  `flex flex-col` **sem** `overflow`, e o corpo ganha `flex-1 overflow-y-auto
  min-h-0`. NUNCA `overflow-y-auto` no container grid do shadcn — sem `min-h-0` o
  filho não encolhe e o conteúdo **corta em vez de rolar**.
- **Follow-ups válidos**: expor subcategorias de RH no form, calendário visual de
  reservas, dashboard de urgência frequente, painéis solicitante × responsável.

## ⚠️ Solicitações · compra de até R$ 1.000 · SÃO DUAS RÉGUAS (2026-08-12/14 · migration `20260812210000`)

Decisão do Matheus: quem atende a área compra até R$ 1.000 sem depender do
financeiro. **Duas implementações nasceram em paralelo no mesmo dia** (sessões
diferentes) e **as duas ficaram**, porque agem em MOMENTOS diferentes do mesmo
fluxo — não são cópias. Confundi-las é o erro que este bloco existe pra evitar:

| arquivo | quando age | o que decide |
|---|---|---|
| **`utils/alcadaCompra.js`** (singular) | no **envio da cotação** (`POST /:id/enviar-cotacoes-financeiro`) | a compra precisa ir ao financeiro? Dentro do teto, **nem vai** — volta pra `logistica_compras` com `status='pendente'` |
| **`utils/alcadaCompras.js`** (plural) | com a compra **já no portão** (`POST /:id/aprovar-financeiro`) | quem atende a área pode aprovar **sem esperar** o financeiro? |

A plural é a **rede** pro que chegou ao portão por outro caminho (compra antiga,
cotação enviada antes da regra). Cada uma tem teste próprio no gate
(`alcadaCompra.test.ts` 17 · `alcadaCompras.test.ts` 15).

⚠️ **Medição de 14/08 que enquadra o problema**: as **19 compras vivas estavam
TODAS em `em_cotacao`, zero cotadas**, e o portão financeiro tinha **1** linha —
de categoria `pagamento`, fora da alçada. Ou seja, a régua PLURAL sozinha é
**correta e inerte**: ela só age no portão, e não há nada lá. É a SINGULAR que
alcança a fila real. Régua de leitura: **antes de dizer "a alçada não está
funcionando", conferir em que ESTÁGIO estão as compras** — a plural é calculada
na LEITURA, então não existe backfill a fazer, e sim compra que ainda não chegou.

⚠️ **`area_alcadas` NÃO governa esta regra** (medido): ela só tem linha pras 6
áreas de CULTO, e `area_cliente` das compras é a área ADMINISTRATIVA — o teto
ficaria calado em ~76% dos casos. A plural a consulta como teto opcional
(fallback 1.000); a singular usa a cifra fixa, a MESMA que já dispensa o portão
de origem (dois "mil reais" diferentes é como a operação passa a discordar do
sistema).

**Guardas que não regridem:**
- ⚠️ **O valor que decide é o COTADO, nunca o estimado.** O estimado é palpite de
  quem pediu. `Number(null) === 0` é barrado ANTES da conversão nas duas réguas —
  sem isso, "sem valor" vira "compra de R$ 0,00 liberada sozinha".
- **Tudo fail-closed**: categoria fora, valor ilegível, teto inválido → financeiro.
- **Só a PRIMEIRA ida dispensa** (`status = 'em_cotacao'`). Reenvio do que já está
  na fila do financeiro **não some de lá** — aprovador que perde pedido da tela
  para de confiar na fila.
- ⚠️ **Carimbo PRÓPRIO `financeiro_dispensado_em`, NUNCA reusar
  `aprovado_financeiro_em`** — seria gravar que o financeiro aprovou algo que ele
  nunca viu. Invariante: as duas colunas **nunca** preenchidas na mesma linha.
- **`financeiro_dispensa_limite` congela o teto vigente**: subir o limite depois
  não pode reescrever a leitura das compras já executadas.
- **Sem a migration, o UPDATE cai pro comportamento antigo** em vez de derrubar o
  envio da cotação (lição do `parcelas_max`).
- ⚠️ **`registrar-cotacao` é DORMENTE** (nenhum chamador na UI). Se alguém o ligar
  numa tela, tem que trazer `decidirDestinoCotacao` junto — senão a compra pequena
  volta a cair na fila do financeiro sem ninguém entender por quê.

⚠️ **Duas divergências CONHECIDAS entre as réguas, pendentes de decisão:**
1. **`servico`**: a singular inclui, a plural exclui de propósito ("contratar
   terceiro tem contrato/nota no caminho"). No envio da cotação vale a singular.
2. A válvula **"prefiro enviar ao financeiro mesmo assim"** manda a compra pro
   portão — e lá a plural deixa a própria área aprovar, esvaziando a válvula que a
   pessoa acabou de escolher. Não é furo (a autoridade é a mesma nos dois
   caminhos); o conserto, se incomodar, é **persistir o `forcar_financeiro`**, que
   hoje só existe no corpo do POST.

**Kanban virou a abertura padrão das 3 abas** de `/solicitacoes` (14/08). Na aba
Aprovar o Kanban usa o MESMO card do Foco (`AprovacaoOrigemCard`), só agrupado por
categoria — o aprovar/rejeitar de um clique **não** se perde.

## NPS · pesquisas de satisfação (estado consolidado · 2026-07-04)

Módulo `/nps` (`src/pages/Nps.jsx` + `src/components/nps/NpsForm.jsx` +
`backend/routes/nps.js` · resposta pública em `publicNps.js` ·
`/nps/publica/:token`). Pesquisa = `nps_pesquisas` (coluna `perguntas` jsonb:
`{descricao_curta, pergunta_nps, perguntas_extras[]}` · tipos que o NpsForm
renderiza: `secao` (cabeçalho, sem resposta), `texto_curto`, `texto_longo`,
`escala_5` (number 1-5), `sim_nao` ('Sim'/'Não'), `opcao_unica` e `multipla`
(usam `opcoes: string[]` · múltipla responde array). Resposta = `nps_respostas`:
`score` 0-10 (a métrica, sempre existe) + `respostas` jsonb keyed pelo id da
pergunta + `comentario`. Stats de score na view `vw_nps_pesquisa_stats`.

- **Detalhe da pesquisa · 4 abas**: **Resumo** (default · PR #1530 · relatório
  estatístico determinístico estilo Google Forms — histograma 0-10 com faixa
  detratores/neutros/promotores, média + distribuição por pergunta, barras por
  opção **semeadas com `opcoes[]` ∪ valores observados** fora do catálogo,
  textos/comentários em lista rolável, respostas por dia · agregação
  client-side em `computarResumo` sobre as respostas que o modal já carrega) ·
  Respostas (individuais) · Perguntas · **Análise IA** (qualitativo sob
  demanda: temas/sentimento/ações · rate limit 30/h). Divisão de trabalho
  (decisão do Marcos): **números por aritmética, IA só pro texto livre**.
- ⚠️ **Editor de pergunta preserva o objeto INTEIRO** (lição do bug
  #1488→#1495: um editor que reduzia cada pergunta a `{id,tipo,texto}` apagou
  `opcoes[]` de perguntas já respondidas — irrecuperável). Nunca reduzir a
  subset de campos; manter o id (respostas ligam por id); só descartar linha
  realmente vazia.
- **Leitura de respostas é PAGINADA** (`listarRespostasCompletas` em `nps.js` ·
  PR #1530): o PostgREST capa em 1000 linhas e um culto de domingo já rende
  ~700 respostas — sem o loop, a lista, o Resumo e a análise IA truncavam em
  silêncio. Não regredir pra select único.
- **Permissão** (#1483): cargos `coordenador-ami/kids/bridge/online` têm nps=3
  → list/create/edit/analisar/respostas escopados pela área (`podeNaArea`);
  admin/diretor veem tudo. `GET /:id` fica **aberto de propósito** (fluxo de
  responder de qualquer colaborador); o dado sensível vive em `/:id/respostas`.
- **Pico/público**: o caminho público aguenta multidão no WiFi da igreja
  (1 IP só · subsolo sem 4G): `trust proxy` + limiter dedicado 10000/15min +
  bypass no Vercel Firewall (rule "NPS público") + retry com backoff no api.js
  + fila offline em localStorage com sendBeacon (PRs #1503/#1506/#1509/#1510).
  ⚠️ Testar com curl em rajada re-flaga o IP no challenge do Vercel — validação
  fiel só com celulares reais.
- **KPI**: resposta sincroniza `dados_brutos` via `services/npsKpiSync.js`
  (#1522 · upsert com contexto estável `{pesquisa_id}` · pesquisa arquivada
  remove a linha) → alimenta os tipos `nps_*` e os KPIs ligados.

## Monitoramento OKR · aba /monitoramento-okr (2026-06-02/03)

Reproduz a planilha "CBRio_cabeca_Juninho" (1 NSM → 9 OKRs em 3 blocos:
Ministerial · Criativo · Operações). **Decisão do Marcos: NÃO integrar à lógica
dos 25 OKRs/150 KPIs do `/painel`** — é ótica paralela, só exibir. Estrutura
fixa vive no frontend (`MonitoramentoOkr.jsx` · consts `NSM`/`BLOCOS`); o
backend devolve só valores vivos via `supabase.rpc('fn_monitoramento_okr_raw')`
(1 query JSONB · cache 5 min). Distinção de exibição pedida pelo Marcos:
**número (incl. 0)** = o sistema já mede · **"—" + bloco "preciso de"** =
automação a criar (NPS culto, YouTube, Q12, treinamentos, expansão…).
`online_engajamento` (tabela mensal) deixou a estrutura pronta pros 3 táticos
de YouTube — a API NÃO foi ligada (coletor futuro faz UPSERT por mês).
⚠️ Base dos % = membros ativos (provisório · confirmar "total da igreja" quando
grupos/voluntários/dízimos popularem). Histórico de versões v1→v3 no legado.

## Produção de Culto · /producao (2026-06-02 · cronograma 2026-06-16 · preview por culto + gráfico no Detalhado 2026-06-25)

Módulo `producao` (matriz copiada de kids · boost de área pro Pedro Fernandes).
KPIs técnicos POR CULTO em satélite 1:1 de `cultos` (`culto_producao` + log
unificado `culto_producao_ocorrencias` + checklist itemizado). Os 4 KPIs
`PROD-CULTO-*` são **específicos, não cascateiam** (`is_okr=false`,
`valores='{}'`, fora da matriz NSM) · ⚠️ `tipo_kpi` só aceita
`qualitativo|quantitativo|operacional`. SLA/NPS gerais já existiam
(`ADM-C-G/Q-PRODUCAO`). Categoria `producao` no form de Solicitações roteia
`area_responsavel='producao'`. **4 sub-abas** em `Producao.jsx`: Preenchimento ·
Detalhado · Modelos · Desempenho. (A aba "Solicitações" foi removida em #1364 — era só
um espelho filtrado do `/solicitacoes`; o Pedro usa o módulo Solicitações direto. Pra ele
ver a fila de Produção lá, a área **Produção** foi adicionada ao `/admin/solicitacoes-responsaveis`
(`AREAS` em `SolicitacoesResponsaveis.jsx`) e o Pedro Fernandes cadastrado em
`area_solicitacoes_responsaveis` (`area='producao'`) — a fila "Atender" filtra POR ESSA
tabela, não pelo cargo/boost; isso também faz a notificação de ocorrência crítica chegar nele.)

**Ocorrência → "Fazer solicitação" (2026-07-03 · ideia do Pedro Fernandes):** na
linha da ocorrência do `ModalProducao`, o link sublinhado **"Fazer solicitação"**
abre um modal (z 1100 · convenção modal-sobre-modal · ⚠️ os SelectContent do form usam z-[1200], senão o portal Radix z-50 abre ATRÁS do overlay e o dropdown "trava") com o `NovaSolicitacaoForm`
prefillado (contexto do culto + tipo/severidade/momento · categorias
`infraestrutura`/`ti`/`compras` **sem default — a pessoa escolhe ativamente**
quem resolve · urgente pré-marcado SÓ na severidade crítica, sempre desmarcável). Ao criar, `PATCH
/producao/ocorrencias/:id/solicitacao` grava
`culto_producao_ocorrencias.solicitacao_id` (migration `20260703150000` ·
**máx. 1 por ocorrência** · FK SET NULL · só vincula solicitação do próprio
usuário) e o link vira **chip com o status vivo** da solicitação (o GET
`/culto/:id` enriquece com `{status, titulo}`). O pedido segue o fluxo oficial
inteiro (aprovação de origem → área) — nenhum bypass.

**Cronograma por etapas (2026-06-16):** a equipe lança o tempo POR MOMENTO em
mm:ss; a soma dos executados da seção 'culto' é a duração total
(`culto_producao.duracao_minutos` segue derivada disso → KPI/trigger de
pontualidade intactos). `producao_roteiro_etapas` = roteiro/preview padrão por
tipo (aba Modelos · `service_type_id` NULL = geral · seed Música 1/2/3 +
Intercessão + Pregação + … = 60:00). `culto_producao_etapas` = etapas por culto
(pré-carregam do roteiro · `previsto_seg`/`executado_seg`/`secao` culto|pos_culto
+ atividades especiais ceia/batismo). A análise previsto×executado / estouro por
etapa é computada no `/acumulado` (NÃO mexe em `kpi_calcular_valor_auto`). ⚠️ **Culto com
executado 0 = NÃO preenchido** (teste/pendente) → fica de fora de TODAS as médias do Detalhado
(duração média, pontualidade, aderência, desvio, por-etapa, gráfico) via `cultoTemExec` +
`duracao_minutos/segundos > 0`. Senão um culto vazio (prev 60:00 / exec 0 = desvio −60:00) afunda
a média (bug pego 2026-06-26: a "Quarta teste" puxava o "Culto inteiro" pra −3:43 com 78% estourando).

**Aba Preenchimento · seletor Semana/Pendentes (2026-06-26 · só código, sem migration):**
`AbaSemana` tem um seletor **Semana | Pendentes** (estilo `vistaBtn` da aba Cultos da Integração ·
`CalendarioCultos.jsx`), com badge de contagem no Pendentes. **Semana** = o calendário de cultos.
**Pendentes** = 2 cards (`CardPendencia`): **Cultos pendentes** (vermelho) + **Cultos incompletos**
(âmbar), cada um listando os cultos no estilo `LinhaPendenciaProd` (bloco data + nome/hora + badge),
clicáveis → abrem o `ModalProducao` (mantido — é o modal de cronograma; NÃO trocar pelo `ModalCulto`
da Integração, que é de frequência/decisões). `GET /producao/pendencias` (varre 07/06→hoje, paginado)
classifica: **não preenchido** = `culto_producao.duracao_segundos` null/0 (nada lançado ou teste
zerado); **incompleto** = executado real mas ≥1 etapa com `executado_seg IS NULL`; **completo** =
todas lançadas. Recarrega ao salvar. `prodApi.pendencias()`. Cultos < 07/06 ficam fora (sem etapas).
Quando zero, mostra "✓ Tudo preenchido desde 07/06".

**Preview editável por culto + Louvor no Detalhado (2026-06-25 · só código, sem migration):**
- O `Previsto` de cada momento virou input mm:ss no modal de preenchimento
  (`EtapasEditor` · era um `<span>` travado no roteiro). O roteiro em Modelos
  segue como BASE/default; ajustar por culto só grava `culto_producao_etapas.previsto_seg`
  (já persistido pelo `PUT /culto/:id/etapas`) e flui automático pra "Prev.
  média"/"Aderência" do Detalhado. Atividade especial continua sem previsto (—).
- No `por_etapa` do `/acumulado`, as músicas NUMERADAS do louvor (nome casa
  `/^m[uú]sica\s*\d/i` → Música 1/2/3) colapsam num único momento **"Louvor"**:
  rollup por (culto × grupo) somando previsto+executado, depois média entre cultos
  (desvio = média de exec−prev por culto; % que estourou idem). Uma música maior
  compensa outra menor → sem falso "estourou" quando o tempo só se deslocou entre
  elas. **Só as numeradas** — "Música Dízimo"/"Música Ceia" são momentos próprios
  (atrelados a dízimo/ceia) e ficam separados. NÃO altera o tempo total nem os
  outros momentos. Agrupamento por nome (não por coluna) · decisão do Marcos (2026-06-25).

**Carga do cronograma real de 2026-06-07 (migration `20260625150000_producao_cronograma_07jun.sql`):**
Carrega as etapas dos 4 cultos de domingo 07/06 (08:30/10:00/11:30/19:00) da planilha
"Cronograma Culto 07.06.2026" (espelha a carga de 14/06). Casa o culto por
(`data` × `vol_service_types.recurrence_time`), REPLACE idempotente das etapas +
recomputa os totais do satélite `culto_producao`. Momentos reais incluem "Música
Dízimo"/"Música Ceia" (separados do Louvor pela regra acima) e "Intercessão"/"Avisos"
com executado 0 (feitos dentro da música / junto da generosidade). Carga só de dados ·
o código não depende dela. Aplicar no SQL Editor (RAISE NOTICE confirma os 4 cultos).

**Consolidação dos momentos do 07/06 (migration `20260626120000` · pedido do Marcos 2026-06-26):**
Os 4 cultos de 07/06 tinham os momentos "crus" da planilha; consolidados pra forma
canônica do roteiro (o 14/06 já estava assim via 20260616190000): Generosidade + Música
Dízimo → **"Dízimos e Ofertas"**, Vídeo Testemunho + Vídeo Pré-Pregação → **"Vídeo
Pré-Pregação"**, Avisos + Benção → **"Avisos / Benção"** (os três somando previsto +
executado), e Música Ceia → **"Ceia"** (`tipo='especial'`, `categoria_especial='ceia'`,
segue na seção 'culto' → entra no tempo total, como a "Apresentação de Criança" do 14/06).
**Totais do culto inalterados** (só junta linhas). REPLACE idempotente + recomputa o
satélite `culto_producao` (totais derivados das etapas).
- **Follow-up (`20260626130000`):** removida a **Intercessão** dos 4 cultos (ficava com
  executado 0:00 — a intercessão rolava DENTRO da Música 2). O previsto dela (3:00) foi
  **somado na Música 2** → previsto total do culto **inalterado** (~60min), corrige o falso
  "estouro" da música e o falso "-3:00" da intercessão. 10 → **9 momentos/culto**.

**Gráfico de tempo de culto + total do estouro no Detalhado (2026-06-25 · só código, sem migration):**
- O `/acumulado` ganhou 2 campos: `serie` (1 ponto por culto preenchido ·
  `{data, tipo, duracao_min, previsto_min}` ordenado por data) e `por_etapa_total`
  (resumo do culto INTEIRO: previsto/executado médios, desvio e % que estourou ·
  sobre os cultos com ambos lançados). NÃO mexe em `kpi_calcular_valor_auto`.
- A aba **Detalhado** (`Producao.jsx`) abre com um **gráfico de linhas** (recharts):
  **1 linha por tipo de culto** (Domingo 08:30/10:00/11:30/19:00, Quarta, AMI, Bridge),
  duração executada (min) ao longo do tempo — pivot por data (`linhasChart`/`tiposChart`,
  cada tipo vira uma coluna). Alvo 60 min via `ReferenceLine`; **eixo Y começa em 40**
  (`domain={[40,'auto']}`) pra destacar as variações; **cultos não preenchidos (0 min)
  ficam fora** (filtro `duracao_min > 0`). **Legenda clicável · multi-seleção** (`cultosSel`
  Set + `Legend onClick` toggle → `Line hide`): clicar 1 culto isola só ele, clicar outros
  soma à seleção, clicar de novo tira; Set vazio = todos (1ª seleção a partir do vazio = isolar). A tabela
  "Estouro por etapa" ganhou uma faixa-resumo do culto inteiro (`por_etapa_total`) no rodapé (abaixo da tabela). Recharts
  herda o tema vidro do `index.css`; linhas NÃO usam gradiente (regra da casa); cores em `CORES_CULTO`.
  (Ajustes 2026-06-25/26, pedidos do Marcos: era executado×previsto numa linha só → 1 linha
  por culto → eixo 40 + esconde não-preenchidos + legenda isola culto.)
- **Métricas do Detalhado (definições · NÃO confundir) + tooltips:** **Pontualidade** = % de
  cultos ≤ ALVO (`meta_duracao_min`, default 60) = "estourou o tempo?". **Aderência** = fidelidade
  ao PREVISTO (`100 − média(|exec−prev|/prev)`, desvio ABSOLUTO, relativo ao previsto de cada culto,
  NÃO a 60) = "executou perto do planejado?". Os cabeçalhos das tabelas do Detalhado têm `title`
  (tooltip nativo no hover · sublinhado pontilhado + cursor help) explicando cada coluna.

## Grupos · aba Relatórios de KPIs (2026-06-02)

Aba Relatórios em `/grupos` (estilo Integração): nº grupos/líderes, líderes em
treinamento (nominal), satisfação (`nps_lideres` em dados_brutos), frequência
(encontros+presenças). Agregação via RPC `fn_grupos_kpis_relatorio(temporada,
meses)` — RPC e não query porque encontros×presenças estouram o cap de 1000 do
PostgREST. **Modelo de líder**: líder = `mem_grupos.lider_id`; única outra
função relevante é `lider_treinamento` (toggle na coluna Treino · `PUT
/membros/:rowId/funcao` aceita grupos≥3). ⚠️ Rota `/kpis/...` declarada ANTES
de `/:id` no Express (senão `/kpis` casa como id). Abas de junho (Visitas,
Pessoas, Caixa de entrada) na seção própria no topo deste arquivo.

## Integração · ajustes pontuais (2026-06-02)

- **% ocupação de assentos** (aba Frequência): card com toggle Templo/Kids +
  seletor por culto. Capacidades constantes no código: Templo **1200** · Kids
  **250**. Templo = `presencial_adulto` de Domingo+Quarta+**AMI** (decisão do
  Marcos · exclui Bridge/Online por regex no nome). 100% client-side (reusa
  `cultos.list` da aba).
- **Tempo conversão→batismo** (aba Batismos): `mem_trilha_valores` etapa
  'conversao' × `batismo_inscricoes.data_batismo` · média geral (só realizados,
  ignora negativos) + bloco por membro no modal. Campos aditivos no
  `GET /batismos`.

## Totem Kids · check-in infantil (estado consolidado · aguardando hardware)

Substitui o Planning Center: a mãe dá o nome no totem, o voluntário imprime 2
etiquetas (criança + recibo) com código de segurança de 4 chars; no checkout o
código libera a saída; TVs nas salas chamam o pickup. Plano completo em
`docs/checkin-kids-plano.md`; o diário de implantação (pagers LRS, pré-check-in
pelo app, vínculo por documento, modo totem, saneamento de 17/07, ajustes
pós-culto de 26/07) está no legado. Schema: `kids_criancas`/`responsaveis`/
`salas`/`sessoes`/`estacoes`/`checkins`/`etiquetas_log` + trigger que consolida
`cultos.presencial_kids`/`decisoes_kids` ao encerrar a sessão. Permissão: boost
da área KIDS + "líder Kids do dia" dinâmico via `vol_check_ins`.

**⚠️ LEIS deste módulo (não regredir):**

- ⚠️⚠️ **Check-in só é REAL se o dia (BRT) do check-in for o dia do culto**
  (v5 · 22/07 · migration `20260722120000`, validada por conselho deliberativo).
  3 camadas: a TELA mostra sempre o chip "Registrando em: <culto>" e só lista
  cultos de HOJE do período atual; o SERVIDOR recusa 409 sessão de culto futuro
  quando há culto de hoje aberto; os DADOS ganham sweep que soft-deleta check-in
  de ensaio. Sessão de culto FUTURO destrava a tela em **MODO ENSAIO** explícito
  (banner âmbar + faixa TESTE na etiqueta e no recibo). Residual documentado:
  ensaio no MESMO dia do culto conta como real até o Encerrar perguntar — ensaie
  com culto de outro dia.
- ⚠️⚠️ **Criança nova NUNCA entra em família existente automaticamente** (caso
  Benjamin/Mariane Gaia · 22/07): o fluxo normal **sempre cria `mem_familias`
  nova**; juntar núcleos é ato explícito (botão "Cadastrar criança na família" ou
  Gestão/Entradas). Efeito colateral aceito: irmão cadastrado pela via errada
  nasce em família separada — o inverso (criança na família alheia) é que é
  irreversível de detectar.
- ⚠️⚠️ **Limpeza/soft-delete em massa de `mem_membros` DEVE checar
  `kids_responsaveis` antes** (incidente 22/07): a rotina "depurar inativos" da
  era PCO soft-deletou **129 responsáveis ATIVOS**, e o sintoma era 500 genérico
  em TODA edição — o embed não filtra `deleted_at`, mas o PATCH filtra. Repontar
  ou poupar quem é responsável ativo.
- ⚠️ **Pager de INCLUSÃO é OBRIGATÓRIO** (`tem_espectro` ou
  `tem_limitacao_fisica`): sem a válvula "imprimir mesmo assim" e sem fechar por
  fora/Esc. Menores de 4 anos sem inclusão mantêm a válvula.
- ⚠️ **Devolução do pager = CHECK-OUT, e vice-versa** (03/08) — os dois registros
  andavam desacoplados. A **baixa em massa** (`checkout_forcado`) NÃO carimba
  devolução DE PROPÓSITO: é o que sustenta o alerta "foi pra casa" da conferência.
- ⚠️ **`ehNomePlaceholder` protege contra o fantasma do financeiro** (incidente
  26/07 · "Contribuinte NNN" saindo como mãe na etiqueta): match por CPF em
  registro-placeholder **renomeia o registro** em vez de roubar a identidade, e
  no check-in `transferirCpfDePlaceholder` migra o CPF pro cadastro real. Nenhum
  fluxo de PESSOAS deve exibir nem preferir placeholder.
- **Foto da criança exige consentimento explícito** (ECA arts. 17/18 + LGPD art.
  14 · versão em `foto_consentimento_versao`), bucket **privado** e exibição só
  por signed URL — `fotoVisivelCrianca()` e `anexarFotosEmLote` são os
  resolvedores. Vínculo criança↔responsável **nunca é automático**: pede
  documento e passa por aprovação da equipe Kids.
- **Sem checkout remoto pelo app** (decisão de segurança): o pré-check-in prepara
  e gera código/QR; entrada e retirada continuam presenciais.

**Pendências operacionais**: aplicar
`20260522300000_totem_kids_chamadas_display.sql`; Brother no Windows do totem
(`docs/totem-kids-setup-brother.md`); comprar/parear 6 Fire TV Sticks;
`PAGER_BRIDGE_TOKEN` no Vercel + `.env` do agente; confirmar porta TCP/NetPage
com a LRS. Dados: 660 famílias + 894 crianças importadas (56% com responsável).

## Next · renomear turma pelo lápis (2026-08-03 · SEM migration)

Pedido do Marcos: lápis pra mudar o nome de uma turma do Next. Edição inline no
título do modal da turma (`TurmaDetalheModal` em `NextTurmas.tsx`): lápis →
`Input` + Salvar/Cancelar (Enter salva · Esc cancela). Grava por
`nextApi.turmas.update(id, { nome })` — **o `PATCH /next/turmas/:id` já aceitava
`nome`** na whitelist `['nome','status','responsavel_id','observacoes']`; só não
havia caminho na UI (a tela nascia com o nome sugerido `nomeMesAtual()` e ele
ficava imutável). Sem backend, sem migration, sem endpoint novo.

- Atualização otimista do nome no `det` + `onChanged()` → o card da grade reflete
  na hora, sem refetch do detalhe inteiro.
- ⚠️ **O lápis fica SÓ no modal, não no card da grade**: o card é um `<button>`
  (abre o detalhe) e botão dentro de botão é HTML inválido — o clique no lápis
  seria capturado pelo card em parte dos navegadores.
- ⚠️ **Não mexe em `next_turmas.origem_mes`**, que é a chave real usada pela
  série derivada da view unificada (`serie_chave`/`edicao_rotulo`) e pelo
  `origem_mes_key` do espelho de matrícula. Renomear é rótulo de exibição; a
  identidade da turma segue sendo `origem_mes`. Não "melhorar" isso derivando
  `origem_mes` do nome novo — o UNIQUE dela quebraria as turmas "/02" do mesmo mês.
- Sem gate de permissão próprio, igual a Encerrar/Reabrir que já existiam ali (a
  rota é `authenticate` + `ModuleGuard` do módulo `next` na tela).

## ⚠️ Next · backfill de 13/05, contagem dupla e identidades (2026-07-29)

Investigação a pedido do Marcos ("Kelly Veiga com 24 inscrições, 23 do Next").
**Nada disso era import repetido** — é o desenho de duas camadas somadas sem
dedup. As medições, o caso Kelly e o diário das correções estão no legado. Estado
e regras que ficam:

**As duas camadas carregam fatos DIFERENTES e nenhuma se apaga.**
`next_matriculas` = inscrição/estado do MÊS · `next_inscricoes` = **presença por
encontro** — e é dela que o KPI `frequencia_next` lê. ⚠️ **NÃO apagar nem
desligar `next_inscricoes`.** A porta `next_legado` da view unificada MORREU
(migration `20260730120000`): as aparições sem matrícula viraram matrícula e o
ramo saiu — a view tem **9 fontes**, não 10.

⚠️ **Lista impressa é ROSTER, não chamada.** O backfill de 13/05 digitalizou 56
listas de presença e criou 1 linha por NOME POR LISTA; o nome segue impresso nas
sessões seguintes, então **762 pessoas viraram 2.423 linhas** (mediana 3, máx 17).
Quem ler aquela tabela como "inscrições" conta a mesma pessoa várias vezes.

**`fn_next_data_fato(created_at, origem_mes, primeira_sessao, id)`** é a fonte
única do dia de uma matrícula, em 3 níveis do mais verdadeiro pro menos:
(1) registrada durante/antes da própria turma → `created_at`; (2) backfill com
aparição → **dia da 1ª sessão do mês** (`vw_next_primeira_sessao_mes`) — dado
REAL, estava no PDF e não estava sendo lido; (3) backfill sem aparição → dia
1/8/15/22 pelo hash do id, **estimativa declarada**.
- O padrão 1/8/15/22 é **visivelmente sintético de propósito** — escolher "13/04
  porque teve sessão nesse dia" seria fingir precisão.
- ⚠️ `(h % 4 + 4) % 4`, nunca `abs(h) % 4`: `hashtext` pode devolver `INT_MIN` e
  `abs(INT_MIN)` estoura com 22003, derrubando a leitura da linha inteira.
- ⚠️ A view derivada é **view, não coluna materializada**: dado derivado de
  presença não pode ficar velho, e corrigir uma presença corrige a data sozinha.
- ✅ **A comparação YoY por semana é confiável**: 2025 é 100% data real; as
  estimativas se concentram em 2024, que ninguém compara.

**`criado_em` da view unificada = DATA DO FATO, não data do import** (migration
`20260730130000`): voluntariado usa `coalesce(data_inscricao, created_at)` ·
batismo usa **`least(data_batismo, created_at)`** — ⚠️ `least`, não `coalesce`:
batismo AGENDADO tem `data_batismo` no FUTURO, e `coalesce` colocaria inscrição
no futuro · next usa o mês da turma **só quando a linha foi registrada DEPOIS do
mês** (sem essa guarda, matrícula real de 20/07 seria empurrada pro dia 1º,
estragando justamente o dado NOVO). ⚠️ Converter DATE→timestamptz usa **meio-dia
em BRT**: meia-noite UTC é 21h do dia ANTERIOR no fuso da igreja.
⚠️ **`created_at` de toda tabela fica INTACTO** — o que muda é a LEITURA.

⚠️ **PENDENTE**: os coletores `next.batismos`/`voluntarios`/`dizimo` ainda janelam
por `next_matriculas.created_at`, então maio/2026 continua recebendo o backfill
nesses 3 KPIs. Consertar muda valores de períodos JÁ FECHADOS e pede recoleta —
passo separado, combinado com o Marcos.

⚠️ **Identidades do backfill**: `membro_id` determinístico (UUID v5 de
nome+telefone) sobre lista manuscrita produziu vínculo divergente (21 enfileiradas
em `identidade_pendencias`), pares de duplicata que a fila já calcula, e órfãos.
O script `backend/scripts/_next_identidades_pendencias.cjs` (dry-run por padrão)
**nunca** funde, religa ou apaga — só enfileira pra decisão humana.

### Next · as 4 decisões do Marcos sobre o legado (2026-07-29/30)

Mandato dado por ele: *"o importante não é ter os dados certos de 2 anos atrás,
é a garantia de que daqui pra frente teremos dados sérios, corretos e
auditáveis; se um cadastro antigo atrapalhar, prefiro remover e me justificar
com a liderança — mas não quero um frankenstein, porque daqui a 5 anos isso dá
um problema que não é simples."* As decisões, caso a caso:

1. **Os 865 `formado` do backfill FICAM como formado** (277 deles sem nenhuma
   presença registrada). Decisão do Marcos: *"antes eles usavam folhas de papel
   e o controle era limitado"* — o status reflete o julgamento de quem conduzia
   o Next no papel; reescrever hoje trocaria um dado impreciso por outro. **NÃO
   reabrir sem ele.** Ressalva registrada: **maio/2026 não tem NENHUMA matrícula
   real fora do backfill**, então os KPIs NEXT-01/02/03 daquele mês (janela por
   `created_at`) são 100% roster de 2025. É um mês fechado e não se repete —
   decidimos NÃO reescrever `created_at` (destruiria o fato auditável "entrou no
   import de 13/05") nem criar coluna `matriculado_em` só por isso.
2. **A porta `next_legado` MORREU** (migration `20260730120000`): as 131
   aparições sem matrícula viraram matrícula (datadas no mês do ENCONTRO, não no
   dia do import; `formado` só onde há presença) e o ramo saiu da view. A view
   tem **9 fontes**, não 10. `next_inscricoes` não é porta de inscrição — é
   **presença por encontro**. Um modelo de inscrição (turma/matrícula), um de
   presença. Era essa competição entre as duas tabelas que era o frankenstein.
3. **Os 93 cadastros "vazios" do import NÃO foram apagados.** Marcos perguntou
   se valia deixá-los como "não sei" pra reconciliar caso a pessoa preencha um
   formulário no futuro. Vale — e não precisa de estado novo, porque **o matcher
   canônico filtra `deleted_at` e NUNCA `active`**: o cadastro fantasma com
   nome+telefone é reencontrado e ENRIQUECIDO no próximo formulário, em vez de
   nascer duplicado. ⚠️ **Soft-delete quebraria exatamente isso** (o matcher
   pula deletado → nasce cadastro novo e o rastro fica órfão). Além disso: dos
   93, a `duplicidadePolicy` aceita **27 pares** — vários são o fantasma
   duplicando um membro REAL, ou seja, a fila das Entradas está apontando
   trabalho útil de consolidação, não ruído. A origem já é auditável
   (`mem_identidade_observacoes`).
4. **A FK que faltava** (a causa-raiz, virou lei nº 10 das regras de segurança):
   os 58 órfãos existiam porque `next_inscricoes`/`next_matriculas` tinham
   `membro_id` **sem FOREIGN KEY**, e `merge_membros` descobre os filhos pelo
   catálogo. Os 58 foram reconstruídos pelo `mem_merge_log` (seguindo cadeia de
   fusão; redundante vira soft-delete) e as duas FKs entraram com
   `ON DELETE SET NULL`. Daqui pra frente toda fusão reponta sozinha.

⚠️ **Ponto cego consciente que sobrou**: o ramo `next` do
`fn_app_inscricoes_fanout` (rede de segurança pra builds ANTIGOS do app) insere
só em `next_inscricoes`, e com a porta retirada essa linha não aparece na view.
Volume real: 1 linha em 2 meses. Fecha quando o fanout puder ser reescrito sem
reverter o patch dinâmico de `20260729060000`.

⚠️ **Observação de escala pra investigar depois**: `mem_membros` viva está com
**7.487 linhas, todas `active=true`** — a auditoria de junho documentava 3.665.
O crescimento vem de imports (Next 682, "Contribuinte NNN" do financeiro, Kids)
e merece uma varredura própria: hoje "membro" e "nome que passou por uma porta"
contam igual no mesmo número.

## Catálogo de portas · escritor tem que ser tabela real (2026-07-30)

Follow-up da auditoria do módulo de inscrições. Três correções em
`inscricaoPortas.js` — o registro **descreve** as portas, e descrição errada
manda quem audita procurar no lugar errado:

- **`escritor` (string) virou `escritores` (array)**: a porta de apresentação
  tem DOIS escritores (`apresentacao_criancas` no formulário público ·
  `apresentacao_bebes` no totem) e declarava um só — e declarava
  **`kids_apresentacao_inscricoes`, tabela que nunca existiu**. Ninguém consome
  o campo em runtime, então a mentira vivia sem quebrar teste nenhum. A de
  eventos passou a listar `['inscricoes', 'ext_inscricoes']` (o fallback de
  rollback do Celebra fica explícito na tabela, não numa string sintética).
- **Teste novo bloqueia a reincidência**: todo nome em `escritores` precisa ter
  um `CREATE TABLE` em `supabase/migrations`. Checagem **estática** (o CI não
  tem banco) e mutation-testada — reintroduzir o fantasma falha com
  `escritor "kids_apresentacao_inscricoes" não é tabela criada por migration
  nenhuma`.
- **`escritoresDerivados` no Next**: o direcionamento do fim do encontro
  (`/next/direcionar/:token`) é o **único** caminho em que uma porta escreve na
  tabela de OUTRAS (`vol_inscricoes`, `batismo_inscricoes`,
  `jornada_encaminhamentos`). Quem perguntasse "quem escreve em
  `vol_inscricoes`?" achava só o formulário de voluntariado e concluía errado.
- Junto: `publicBatismo` e `publicApresentacao` passaram a importar
  `emailValido` do contrato (as 2 últimas cópias locais). Regex **idêntica** ao
  canônico → zero-diff conferido em 20 casos; o `.trim()` do batismo ficou
  (sem ele, e-mail com espaço nas pontas passaria a ser recusado, mudando
  comportamento).

⚠️ **O que NÃO foi feito, e por quê** (era premissa minha errada): eu havia
listado "colocar `/next/direcionar/:token` sob o Contrato de porta". Lendo o
código, **ele já está**: não coleta dado de pessoa nenhum (lê a matrícula, que
passou pelo contrato) e resolve identidade pelo matcher canônico
(`acharOuCriarGuardado`, `origem: 'next_direcionamento'`), que registra a
observação sozinho. Mesma coisa no walk-in do totem
(`/checkin/:token/walkin`, `origem: 'next_checkin'`) — normaliza, valida DV
quando há CPF, e a obrigatoriedade relaxada é decisão registrada do Marcos
("nunca travar o atendimento na hora"). **Fica UMA pergunta aberta pra ele:** a
tela de direcionamento cria inscrição REAL no voluntariado sem exibir/registrar
o consentimento daquela porta em `inscricao_consentimentos`. A pessoa está ali
tocando o tablet (é self-service, não o líder decidindo), então dá pra registrar
com honestidade — mas exige mostrar o texto no fim do encontro, com fila. Não
inventei o registro: gravar consentimento sem ter exibido o texto seria fabricar
prova legal.

## ⚠️ Pessoa · o import financeiro não cria mais cadastro (2026-07-30)

Decisão do Marcos, na varredura do crescimento de `mem_membros` (7.487 linhas
vivas contra 3.665 na auditoria de junho): *"essas pessoas não podem virar
membro, vai confundir a base inteira, deixa só como um nome no lançamento sem
vínculo com membresia"*. Migration `20260730150000`.

**O que acontecia**: `fin_resolver_ou_criar_contribuinte` resolvia a pessoa por
**nome exato** e, não achando, CRIAVA um `mem_membros` `contribuinte_avulso`. Em
29/07 às 16:16 isso gerou **3.441 cadastros** — 46% da base viva — dos quais 1
tem CPF, 1 telefone, 1 e-mail, e **nenhum** tem contribuição ou transação
apontando pra ele. Um deles é `RECEBIMENTOS CRECHE E PRE-ESCOLA … LTDA`:
descrição de extrato bancário virou pessoa. A fila de duplicidades das Entradas
foi de ~525 para ~9.458 pares, 9.294 deles **sem chave nenhuma** — humanamente
indecidíveis.

- **A função só resolve por CPF de 11 dígitos; sem CPF devolve `NULL`.** O match
  por nome exato SAIU — era ele que cruzava identidades, e viola a lei do
  Contrato de porta ("nome sozinho nunca identifica").
- **Devolver NULL é seguro** porque `financeiroV2.js:808` (o ÚNICO chamador)
  grava em `fin_transacoes`, cujo `membro_id` é **nullable** e que já guarda
  `nome_contraparte`. `mem_contribuicoes` (`membro_id NOT NULL`) **não é escrita
  por esse caminho** — conferir isso antes de mexer.
- **Limpeza descobre o rastro pelo CATÁLOGO** (toda tabela com FK pra
  `mem_membros`), não por lista fixa, **com as tabelas de log/identidade
  explicitamente FORA** (`mem_identidade_observacoes`, `mem_identidade_pares`,
  `mem_duplicados_ignorados`, `entradas_*`, `identidade_pendencias`,
  `mem_merge_log`, `app_audit_log`). Sem essa exclusão a limpeza não apagaria
  nada: as 3.443 observações de identidade contam como "rastro".
- ⚠️ **Isto NÃO revoga a decisão nº 3 do Next** (os 93 cadastros vazios do
  backfill ficam pra reconciliação). São casos diferentes: lá o fantasma tem
  nome+telefone REAIS de alguém que passou por uma porta e o matcher o
  reencontra; aqui é descrição de extrato sem contato nenhum, que só polui a
  fila humana. Régua: **existe chave (CPF/telefone/e-mail) pra reconciliar?**
  Se não, não é pessoa.

## ⚠️ Fila de identidade · a decisão é por PESSOA (2026-07-31 · migration 20260731120000)

Revisão adversarial das 5 PRs de 30–31/07, com os números reconferidos no banco.
Os três achados que viraram código:

**1 · A confirmação HUMANA da conciliação ainda fabricava cadastro.**
`financeiroClassificador.resolverMembroPorDocumento` tinha
`{ criarSemNome = true }` como padrão, e o único caller que não passava a opção
era justamente o clique de gente:
`conciliacaoBalancoOfx.confirmarVinculo` (`financeiroV2.js` POST
`/conciliacao-ofx/confirmar`). Memo sem nome parseável → `Contribuinte
070230...`, o MESMO fantasma que a limpeza de 30/07 apagou 93 vezes. O default
virou **false**: sem nome real o retorno é NULL e a confirmação responde
"cadastre a pessoa na Membresia com este CPF e volte" — ninguém precisa lembrar
de passar flag. ⚠️ Junto, a busca do dono do CPF ganhou **`deleted_at IS NULL`**:
84 dos contribuintes apagados TÊM CPF, e sem o filtro o extrato voltaria a ligar
lançamento novo num cadastro que a igreja tirou da base (foi assim que 4 linhas
de `fin_lancamentos_brutos`, R$ 1.107, ficaram penduradas em cadastro
soft-deletado).

**2 · A fila `inscricao_sem_vinculo` dedupava por CANDIDATO, e isso perdia
gente + rebaixava prova.** Ela reusou o UNIQUE histórico
`(tipo, membro_id, membro_conflito_id)`, correto pros 3 tipos antigos (a
pendência fala de um PAR DE CADASTROS) e errado pra este (fala de uma PESSOA
ÓRFÃ, que não tem cadastro, e duas pessoas órfãs podem apontar o mesmo
candidato). Medido: 195 pessoas com candidato → **190 candidatos distintos, 189
gravados**; as colapsadas **desapareciam da fila sem registro** e, nas 3
colisões abertas, quem sobrevivia era a evidência **mais fraca** (nome exato),
porque o critério era ordem de inserção. E o clique ligava **uma linha só**
(`origem_id` = `ref_id`) e resolvia a pendência: **18 pendências eram de gente
com 2+ inscrições → 20 linhas ficavam órfãs e SEM pendência nenhuma.**
- `origem_id` deste tipo passa a guardar a **CHAVE DA PESSOA**
  (`cpf:` > `tel:` > `nome:` > `ref:`), com UNIQUE parcial próprio
  `(tipo, origem_id)`; o UNIQUE histórico ganhou `AND tipo <> 'inscricao_sem_vinculo'`.
- A régua virou **fonte única** em `services/inscricaoOrfas.js` (`chavePessoa` +
  `PORTA_VINCULO` + `lerLinhasOrfas`), importada pelo script E pela rota — a
  cópia dentro do script era o que permitia a fila apontar pra linha diferente
  da que o clique liga. Teste `npm run test:inscricao-orfas` (no gate de deploy)
  exige que **toda fonte da view tenha ponteiro** e vice-versa: porta nova sem
  ponteiro = pendência que o humano decide e nada acontece. Mutation-testado.
- `ligar-inscricao` relê a view AGORA e liga **todas** as linhas da pessoa
  (`.is(col, null)` por linha, como antes), devolvendo
  `{ ligadas, portas, ja_ligadas, nao_mapeadas, cpf_tardio }`. Pendência do
  formato antigo (origem_id = uuid) segue funcionando — deploy em 2 etapas.
- ⚠️ **A observação de identidade gravava os dados do CANDIDATO**, o que não
  acrescenta chave nenhuma (era exatamente por não achar a pessoa que a
  inscrição estava órfã). Agora grava os dados **DA INSCRIÇÃO**, ACUMULA
  telefone/e-mail em `mem_contatos` (`membroMatch.registrarContatoDaPorta`, a
  MESMA função do match — exportada, não duplicada) e, quando a inscrição traz
  CPF e o cadastro não tem, consolida por `reconciliarCpfTardio` com
  `confianca: 'forte'` (decisão humana auditada em `resolvida_por`; conflito
  segue virando pendência, nunca fusão). É isso que faz a próxima porta
  encontrar a pessoa — sem isso, os 26 pares de nome fraco voltariam órfãos.
- **Pós-migration**: rodar `node backend/scripts/_entradas_inscricao_sem_vinculo.cjs`
  (dry-run) e depois `--exec`. Esperado ~195 pendências (as 5 pessoas colapsadas
  voltam). A PARTE 3 da migration **aborta** se alguma pendência deste tipo já
  tiver sido triada.

**3 · Números que não se sustentaram na reconferência** (registrados pra não
serem citados errado): a base viva de `mem_membros` é **3.930**, não ~4.018 — o
dia 30/07 fechou com **3.553** contribuintes soft-deletados, não 3.469, porque
houve **duas** limpezas (a migration às 13:50 + 93 registros `Contribuinte
NNNNNN...` COM CPF, do import de 24/07, às 13:37). E o split do Next é
**963 nível 2 / 641 nível 3**, não 1.109/495: o total de backfill (1.604) bate
exato, mas **34% da porta Next está em dia sintético**, não 26%. A régua do
nível 2 exige aparição **no mês da turma**; medir "aparição em qualquer mês" dá
990 e ainda não chega a 1.109.

**Alarmes reconferidos** (nenhum era falso): Celebra 29/08 tem 97 inscrições
confirmadas e **9 QRs emitidos** — e `checkin_ativo=false`, que a tela de
check-in já resolve com o botão "Ativar check-in" (1 clique no dia; o QR é HMAC
derivado, existe pra todos, e o check-in por busca de nome funciona sem ele).
`insc_checkins` está **vazia** e o evento Patrocinadores tem 0 QR: o ensaio de
#2175 não deixou artefato em prod. RLS: módulo `inscricoes` tem **37 dos 41
cargos no nível 3** (= 89 usuários com INSERT/UPDATE direto em `inscricoes`,
`insc_eventos`, `insc_pagamentos`, `insc_checkins`, `insc_sorteios`), incluindo
um cargo chamado **"Acesso negado"** — o seed subiu todo mundo pra 3. A view
unificada está revogada de `authenticated`; as tabelas-base não.

## ⚠️⚠️ AUDITORIA DO APP · ONDAS 0 e 1a (2026-08-06 · migrations `20260806140000`, `20260806160000`, `20260806170000`)

Auditoria de 4 dimensões pedida pelo Marcos ("o app aguenta 4.000 downloads?").
21 agentes, 85 achados brutos, **12 confirmados sob contestação adversarial**.
Plano em **6 ondas agrupadas por VEÍCULO de entrega** (servidor chega na hora,
inclusive em bundle velho · OTA depende de 2 aberturas · loja depende da Apple).
Narrativa completa no legado; relatório em `~/Downloads/auditoria-app-cbrio.html`.

**Resposta à pergunta dele: não aguentava — e o gargalo não era o Supabase.**
Cold start = ~13 chamadas; 4.000 pessoas em 30 min = ~30 RPS (picos 90-150), que
o banco absorve. Quem quebrava primeiro era coisa nossa.

### ⚠️⚠️ LEI · o limite do `/api/app` é por USUÁRIO, não por IP

No WiFi da igreja todo celular sai por 1 IP e UMA abertura gasta 10-30
requisições ⇒ 5 a 10 aparelhos esgotavam a cota de TODOS. ⚠️ **E o 429 não
parecia limite de rede**: o app traduzia a falha em resposta de NEGÓCIO —
`temporadaGrupos` → `aberta:false` ("inscrições fechadas") e `useAdminGrupo` →
`isAdmin:false` (líder sem botão). O teto estourado se disfarçava de regra da
igreja.

- **`backend/utils/appRateLimit.js`** = régua PURA da chave: `u:<id>` →
  `t:<hash do Bearer>` → `ip:<...>`. O nível do token existe porque em
  `/membro/vincular` e `/inscricoes` o limiter vem ANTES do `authApp`. Mínimo de
  40 chars no Bearer — senão `Bearer x` de lixo viraria bucket próprio.
- Tetos: **600/15min por usuário** · 30 (strict) · anônimo tem teto PRÓPRIO e
  mais alto (10.000 · 120), porque ali continua sendo 1 IP pra congregação.
- ⚠️⚠️ **A normalização de IPv6 é NOSSA** (`normalizarIpParaChave`, agrupa por
  /64) e **não pode usar o `ipKeyGenerator` do pacote** (ver régua abaixo).
- ⚠️ **LIMITAÇÃO CONHECIDA**: MemoryStore por instância no Vercel ⇒ teto efetivo
  = `max × instâncias`, zerando a cada cold start. O desenho por usuário já tira
  o dano do NAT, que era o real.
- ⚠️ Quem protege as sondas de identidade **não é o teto** — é o serviço
  (`appIdentidade`: 5 envios/telefone/dia, 6 tentativas, TTL 10min, resposta
  MASCARADA). Testes: `appRateLimit.test.ts` (10 · mutation-testado).

#### ⚠️⚠️ RÉGUA · `backend/` tem árvore de dependências PRÓPRIA em produção

Incidente 06/08: `ipKeyGenerator is not a function` derrubou as rotas ANÔNIMAS em
produção depois de passar no gate inteiro, no tsc, no mutation test e num smoke
com express de verdade. Causa: `vercel.json` roda `cd backend && npm install`, e
`backend/package.json` pina **express-rate-limit ^7.4.0** enquanto a RAIZ tem
8.3.2 — `ipKeyGenerator` só existe na 8.x. Como o `backend/node_modules` das
worktrees costuma estar **vazio**, o Node sobe pra raiz e o teste local exercita
**uma versão que produção nunca carrega**.

⇒ **Conferir a versão em `backend/package.json`, nunca na raiz**, antes de usar
API nova de dependência em `backend/`. Smoke de mudança que roda no servidor tem
que rodar **de dentro de `backend/` com `npm install` feito lá**.

#### ⚠️⚠️ RÉGUA · checagem por TEXTO em corpo de função/arquivo IGNORA comentário

Aconteceu **2× no mesmo dia**, e nas duas o falso positivo foi a própria
documentação do conserto: a guarda do teste casou com o comentário que cita o
import errado como exemplo; e a conferência da migration `20260806140000` usava
`pg_get_functiondef(...) ilike '%is_membro_only%'` — que devolve o corpo **com
comentários** — acusando falha numa função correta (o Marcos veio perguntar por
quê: **era a conferência**, não a migration).

**Como fazer:** tirar comentário antes de casar (`regexp_replace(d, '--[^\n]*',
'', 'g')` no SQL · helper `semComentarios` no teste) **e** procurar o COMANDO,
não o identificador solto (`update public.profiles`, não `is_membro_only`) —
identificador aparece em explicação, comando não. ⚠️ Conferência que dá falso
positivo custa CONFIANÇA: manda a pessoa investigar um conserto que estava certo.

### O que mais foi corrigido (regras que ficam)

- **Fale Conosco do app era invisível no ERP** (2 mensagens reais pendentes):
  `contato` entrou em `TIPOS_PEDIDO_APP`, e a notificação passou do módulo
  `membresia` (tela que NÃO lista `app_inscricoes`) pro **`cuidados`**
  `?tab=acomp`. ⚠️ `contato` **NÃO é tipo de `cui_pedidos`** (o CHECK de lá não
  o tem) — por isso o front tem `TIPOS_PEDIDO_MANUAL` separado do
  `PEDIDO_TIPO_META`. Segunda pessoa a receber = **regra de notificação** em
  /admin, nunca 2º destino no código.
- **Broadcast de push parava de entregar em 1.000 instalações**: `select` cru
  (cap de 1000 silencioso) + `.in()` gigante. Régua: **leitura de tabela que
  cresce com o uso vai paginada, e `.in()` sempre em lotes ≤ 200.**
- ⚠️⚠️ **`app_salvar_membro` vinculava conta a pessoa SEM PROVA DE POSSE** — por
  CPF **ou telefone ou nome EXATO**, e `profiles.membro_id` alimenta
  `current_user_membro_id()`: quem digitasse o nome de um homônimo passava a ver
  grupo, contribuições e **filhos no Kids** daquela pessoa. **Estreitada, NÃO
  dropada** (o app ainda a chama): perdeu os ramos de BUSCA e CRIAÇÃO, CPF só
  preenche vazio e só com DV, e deixou de tocar `profiles` (marcava **staff**
  como app-only). ⚠️ A migration tem **guarda de DRIFT** (aborta se a assinatura
  viva divergir — `CREATE OR REPLACE` com assinatura diferente cria OVERLOAD e
  deixaria a versão perigosa alcançável). **Pode ser DROPADA quando o app estiver
  usando `PUT /app/membro/perfil`.**
- ⚠️ **`notify-lembretes` (repo do app) lia a camada aposentada** do NEXT ⇒
  **nenhum lembrete de véspera saiu desde 13/06**, com o cron vivo e 46
  matriculados. Reescrita. **Precisa de `supabase functions deploy
  notify-lembretes` — não sai por OTA nem por merge daqui.**

### Onda 1a · parar de perder dado

- **O fanout carimbava `'processado'` incondicionalmente**, engolindo a exceção
  nos 4 ramos. ⚠️ **PATCH DINÂMICO obrigatório** (`pg_get_functiondef` +
  `regexp_replace`): a definição VIVA não é a do repo, e `CREATE OR REPLACE` do
  arquivo reverteria em silêncio o ajuste feito em produção. ⚠️ **`'erro'` teve
  que entrar no CHECK ANTES** — UPDATE pra valor fora do CHECK dentro de AFTER
  INSERT levanta 23514 e **ABORTA o INSERT** (a pessoa não conseguiria se
  inscrever); a lista nova é **derivada da viva**, nunca escrita à mão.
  O motivo vai em **coluna própria** (`fanout_erro` jsonb, via `GET STACKED
  DIAGNOSTICS`) — ⚠️ **nunca SQLERRM** (embute o valor que violou a chave, e a
  linha é legível pelo dono via RLS).
  ⚠️ **O consumidor é o backend, não uma tela**: `POST /app/inscricoes` RELÊ a
  linha (o `RETURNING` reflete o estado ANTES do AFTER trigger) e responde **502
  honesto** em vez de "Solicitação recebida!" — **nenhuma tela do sistema lê
  `app_inscricoes.status`**.
  ⚠️⚠️ **RESÍDUO**: o trigger `app_inscricoes_notify_recebida` (repo do app) roda
  **antes** do fanout (ordem alfabética) e manda push "o líder recebeu seu
  pedido" mesmo quando o fanout falha.
- **RLS `app_inscricoes_own` era `FOR ALL USING(...)`** sem `TO` nem `WITH
  CHECK`: o autor podia concluir o próprio SOS (sai da fila pastoral), apagar a
  linha e inserir pedido com `membro_id` de terceiro. ⚠️⚠️ **Policies são
  descobertas no CATÁLOGO, não pelo nome do arquivo** — policy permissiva é
  OR'eada, e havia indício de uma 2ª policy `own` fora de migration; dropar só a
  que o git conhece deixaria a duplicata viva com o lint verde.
  ⚠️ `(select auth.uid())` na policy nova (cru reavalia por LINHA).
  ⚠️ Teste de fumaça **com token de usuário real** — anon key pura dá "permission
  denied" (correto) e se lê como "quebrei o app".
- ⚠️⚠️ **`app_soft_delete`/`app_restore` estavam com GRANT pra `authenticated`**
  e a única validação era "a tabela está na whitelist" — **sem checagem de dono,
  módulo ou nível**. Qualquer pessoa logada (inclusive pelo app, com a chave
  pública do bundle) podia soft-deletar **qualquer linha das ~30 tabelas**
  sabendo só o id. **Revogado, com ZERO mudança de comportamento** (17 rotas do
  backend chamam com service_role; zero chamadores no front/app/Edge Functions).
  ⚠️ **Follow-up**: outras SECURITY DEFINER com grant pra `authenticated`
  merecem a mesma varredura.
- **Payload do app SANEADO, e por que NÃO é o contrato**: ligar
  `validarCamposPadrao` reprovaria ~tudo (medido: 0 de 22 mandam nascimento ou
  sexo; SOS e Fale Conosco passariam a recusar ~55% das contas, em telas sem
  campo pra corrigir). O conserto é o dano REAL: **o '55' grudado no telefone**
  (15 de 22 linhas). `backend/utils/saneamentoInscricaoApp.js` ⚠️ **NÃO BLOQUEIA
  NADA** — campo que não normaliza vira `null`. ⚠️ **Só mexe em chave que
  EXISTE** (o fanout lê `grupo_id`, `areas`, `nome_mae`, `sobrenome`,
  `tamanho_camisa`, `possui_deficiencia`, `observacoes`, `evento_id`, … — remover
  ou renomear qualquer uma quebra um ramo). Log sai com os **NOMES** dos campos,
  nunca os valores.
- ⚠️ **Réguas puras mudaram de casa**: `validarNascimento`, `emailValido` e
  `tirarCodigoPaisTelefone` saíram de `inscricaoContrato.js` (que carrega o
  Supabase e por isso não entrava no gate) pra **`backend/utils/camposContato.js`**
  — o contrato **re-exporta as três**, então nenhuma das 7 portas muda de import.

## ⚠️ AUDITORIA DO APP · ONDA 2 · o servidor recebe a tela de perfil (2026-08-07)

`PUT /app/membro/perfil` estava **órfão** desde sempre (quem salvava era a RPC
`app_salvar_membro`, o crítico da auditoria). Com a Onda 2 a tela passou a
chamá-lo, então ele ganhou o MESMO saneamento da porta de inscrição
(`utils/saneamentoInscricaoApp.js`) — telefone com "+55 (21) …" gravado cru em
`mem_membros` é o que quebra o dedup por telefone do sistema inteiro.

- ⚠️ **Saneia, NÃO recusa**: perfil não é porta de inscrição; bloquear aqui
  prenderia a pessoa numa tela de edição do próprio cadastro. A única recusa é
  `nome` vazio — a coluna é NOT NULL e o UPDATE estouraria com 23502, que a
  pessoa leria como "Erro ao atualizar perfil" sem motivo.
- Ganhou `limiterNormal` (estava sem limiter nenhum).
- ⚠️ **CPF não passa por aqui** (nunca esteve no allowlist) — e agora a tela
  reflete isso: o campo virou somente-leitura. Trocar CPF é ato de IDENTIDADE,
  em `/completar-cadastro`.

## ⚠️⚠️ LEI · o que não pode se perder vai AWAITED · WhatsApp duplicado (2026-08-07 · SEM migration)

Reportado pelo Marcos com screenshot: ao se inscrever num grupo de conexão pelo
app, ele recebeu **a MESMA mensagem de confirmação duas vezes** — 16:33 e 17:00
(BRT), texto idêntico. Investigando, apareceu um segundo defeito, mais grave e
totalmente silencioso: **a líder nunca soube do pedido dele**.

### 1 · A mensagem dupla · fire-and-forget em container que congela

O bloco de confirmação do `POST /app/inscricoes` era
`resolveMembroApp(req).then(...)` **sem await**, com o `res.status(201).json(...)`
imediatamente abaixo. Em serverless o container **CONGELA na resposta**:
`enfileirar` já havia feito o INSERT (commitado) e `tentarEnvio` já havia
chamado a Meta — a mensagem foi **entregue às 16:33** — mas o UPDATE que marca
a linha como `enviado` se perdeu no congelamento. A linha ficou `pendente` e o
**cron horário da fila reenviou às 17:00**.

⚠️⚠️ **A forense me enganou primeiro, e a lição vale além deste caso:** a linha
de `whatsapp_envios` mostrava `tentativas=1` e UM `message_id` — o do SEGUNDO
envio. Eu disse ao Marcos que **não havia duplicação**; o screenshot dele provou
o contrário. **Envio cuja escrituração se perdeu é INVISÍVEL** em
`tentativas`/`message_id`: a entrega das 16:33 tem wamid próprio que nunca foi
gravado. Não concluir "não duplicou" porque a fila mostra um envio só.

Aplicada a **lei de 31/07** (mesma classe do aviso ao líder que não saía): em
porta pública serverless, **o que não pode se perder vai AWAITED**. `membroId` e
`dados.nome` já estavam em escopo desde o topo do handler, então o await não
custa nem uma consulta a mais — some a 2ª chamada a `resolveMembroApp`.

### 2 · Inscrição de grupo pelo APP nunca avisava o líder

Só o formulário público (`publicGrupos`) mandava `grupos_pedido_novo_lider_v2`.
Pelo app, o pedido nascia pelo fanout e **ninguém era avisado** — ficava pendente
na Caixa de entrada, e quem deveria ligar pra pessoa antes de aprovar (lei dos
templates v2, 29/07) não sabia que existia. Medido em 06/08: **1 pedido
origem-app na história inteira** (o do Marcos, `d1907c7a`, no grupo da Natasha) e
**zero avisos** citando ele entre os 34 disparados desde então.

- Chama a **MESMA** `gruposWhatsapp.notificarLiderNovoPedido` do formulário
  público — o app é cliente novo da porta, **não** uma 2ª régua de aviso.
- **AWAITED**, e só **depois** da releitura do fanout: avisar o líder de um
  pedido que não existe é pior que não avisar.
- ⚠️ **Best-effort no erro** (log, não 502): o pedido já está gravado e a pessoa
  já tem vaga na fila — derrubar a resposta porque o aviso falhou trocaria um
  problema de comunicação por um de inscrição. A Caixa de entrada segue sendo o
  caminho garantido da coordenação.
- ⚠️ **A janela de 2 min na busca do pedido não é enfeite**: o ramo `grupos` do
  fanout **não tem dedup**, então cada tentativa da pessoa cria um pedido novo.
  Sem a janela, um pedido ANTIGO dela no mesmo grupo seria re-notificado a cada
  inscrição. O par usado é (grupo, membro) + `pendente` + `origem='app'`, e o
  `created_at` do pedido é idêntico ao da linha de `app_inscricoes` porque o
  fanout roda na MESMA transação.

### ⚠️ Resíduos conhecidos (mesma classe, NÃO corrigidos aqui)

- **`kids_precheckin`** (`app.js`, chamada a `wpp.notificarMembro`) ainda é
  fire-and-forget — mesmo risco de mensagem dupla, volume baixo.
- O trigger **`app_inscricoes_notify_recebida`** (repo do app) segue mandando
  push *"o líder recebeu seu pedido"* **antes** do fanout (ordem alfabética de
  trigger), inclusive quando o fanout falha. Já registrado na Onda 1a.

## ⚠️ Batismo pelo APP escolhe o HORÁRIO (2026-08-13 · migration `20260813120000`)

Pedido do Marcos: *"no app de membros, na inscrição de batismo, tenha a mesma
opção de escolher os horários abertos que tem no formulário de inscrição."*
O app já **chamava** `GET /public/batismo/horarios` — só pra pegar o
`grupo_url`, **jogando a lista fora**. Estado medido em 13/08: 08:30 e 10:00
abertos (limite 11 cada), 11:30 e 19:00 fechados; **1** inscrição de batismo com
origem app na história inteira × **40** públicas com horário.

**Régua ÚNICA em 2 camadas** — o app é cliente da porta, não uma 2ª régua:
- **`backend/utils/batismoHorario.js`** = decisão PURA (entra no gate) ·
  `avaliarHorarioBatismo` / `horariosDisponiveis` / `normalizarHorario`.
- **`backend/services/batismoHorarios.js`** = as consultas, compartilhadas pelo
  formulário público e pelo `POST /app/inscricoes`. Duas cópias das consultas é
  como o app e o web passam a discordar sobre o que está aberto.

⚠️⚠️ **O conserto de segurança que veio junto: a validação do público FALHAVA
ABERTA.** `publicBatismo.js` envolvia a regra inteira num `if (!hErr)` — consulta
que falhasse **PULAVA a validação** e gravava em `horario_culto` o texto CRU do
cliente. Esse campo alimenta o **`{{2}}` do template de lembrete**
(`whatsappCron.js`), ou seja: texto arbitrário saindo numa mensagem pelo número
oficial da igreja. Agora não conseguir conferir **RECUSA** (`motivo:
'indisponivel'`), e é isso que o mutante do teste trava — rodado de verdade:
trocar o `ok:false` por `true` deixa exatamente 1 caso vermelho.

- ⚠️ **Ausência de horário NÃO é erro, e tem que continuar assim**: o binário da
  loja e todo bundle sem o OTA não sabem que o campo existe. Exigir aqui
  trancaria essa gente fora do batismo — a mecânica do portão que trancou todo
  mundo em 06/08.
- ⚠️ `ocupacaoPorHorario` virou **paginada**: o cap de 1000 do PostgREST trunca
  em silêncio e um batismo grande faria o limite por horário parar de valer sem
  erro nenhum aparecer.
- **Migration = PATCH DINÂMICO** (`pg_get_functiondef` + `replace`), obrigatório:
  a definição VIVA de `fn_app_inscricoes_fanout` não é a do repo (foi reescrita
  em prod em 29/07 e 06/08), e `CREATE OR REPLACE` de arquivo reverteria aquilo
  em silêncio. Âncoras conferidas 1× cada ANTES de substituir — `'sede')` sozinho
  aparece **2×** no corpo, por isso a âncora do VALUES leva a linha do
  `observacoes` junto. Conferido no CATÁLOGO depois de aplicar (não no
  `success:true`): 2 ocorrências de `horario_culto`, e as 3 proteções anteriores
  intactas (`vi.deleted_at IS NULL` 1 · `fanout_erro` 1 · 4 blocos de
  `GET STACKED DIAGNOSTICS`).
- **Teste funcional com INSERT real** em transação revertida (a lição do "fluxo
  com dinheiro se confere no BANCO"): `horario=[08:30] status=[pendente]
  app_status=[processado]`, e **0 resíduo** conferido depois.

### ⚠️ De brinde: `'duplicado'` caía no caminho de SUCESSO

O `POST /app/inscricoes` relia a linha pós-fanout e tratava só `'erro'`. Quem já
tinha inscrição lia **"Solicitação recebida! Nossa equipe entrará em contato."**
e a equipe recebia aviso de "nova inscrição" que não existe — a versão silenciosa
do mesmo defeito. Agora responde 200 com `duplicado: true` e texto honesto, sem
disparar os avisos. É a lei do Contrato de Inscrição: `ja_inscrito`/`duplicado`
são **EXIBIDOS**, nunca engolidos como confirmação.

## ⚠️⚠️ AUDITORIA DO APP · ONDA 1b (2026-08-06 → 08-10 · narrativa no legado)

Itens 4 e 5 do plano + os achados de 07–10/08. **Sem migration** no núcleo — é
rota + tela + régua pura (as migrations citadas são de push e backfill de sexo).

### O save do supervisor gravava NADA (`PUT /app/grupos/:grupoId`)

`grupo-editar.tsx` fazia UPDATE DIRETO em `mem_grupos`, e a RLS só aceita
`lider_id = current_user_membro_id()` OU grupos ≥ 3 — **supervisor não passa**.
Sem `.select()` nem conferência de linhas, **0 linhas voltavam SEM erro** e a tela
dizia "Grupo atualizado". ⚠️ O MESMO defeito estava no `escolherCapa()` da mesma
tela (`foto_url` preenchido em **0 de 278** linhas — a capa nunca funcionou).

- ⚠️⚠️ **NÃO reusar o `PUT /api/grupos/:id` do web**: ele é update de OBJETO
  INTEIRO (~28 colunas) e aplica DEFAULT no que não vem — chamá-lo com os 9
  campos da tela do app **apagaria liderança, temporada e estado de inscrição**.
  O endpoint do app é **PATCH com allowlist**.
- Autorização = o MESMO `gateGrupoApp` dos outros endpoints (líder OU supervisor
  OU admin). Era a divergência entre o que a TELA mostra e o que a RLS aceita que
  produzia o save silencioso. **`.select()` + 0 linhas ⇒ 409**, não sucesso.
- ⚠️ **`categoria` é REGRA DE NEGÓCIO, não rótulo**: `publicGrupos` usa pra a
  trava de gênero e pra habilitar **inscrição de CASAL** (só em 'Casais'), com
  comparação exata. Texto livre no app ("casais" minúsculo) desligaria a
  inscrição de casal em silêncio ⇒ lista **FECHADA** + normalização.
- ⚠️ `horario` é coluna `time` (texto livre virava erro de cast cru, lido como
  "não salvou") · `dia_semana` aceita **0 = domingo**, que é falsy.
- ⚠️ **NÃO geocodifica dentro do request** (ViaCEP + Nominatim com 1,1s de espera
  vira timeout): quando `endereco`/`bairro` mudam, **avisa a coordenação** com
  link pra `/admin/grupos/geocode`. Nenhum save do sistema re-geocodifica.
- **Capa** (`POST|DELETE /api/app/grupos/:grupoId/foto`): multer 4MB — **não 5MB**,
  porque o corpo serverless tem teto ~4,5MB e estourar vira 413 opaco, e **não dá
  pra redimensionar no cliente** (`expo-image-manipulator` é nativo, não sai por
  OTA). ⚠️ **Caminho ÚNICO por upload** (`<gid>/<ms>.<ext>`), nunca fixo: bucket
  público + CDN de ~1h faria a troca de capa não aparecer por uma hora.
  ⚠️ A extensão sai do **MIME que o multer validou**, nunca do nome (no Android a
  URI é `content://…` sem extensão). `backend/utils/grupoCapaApp.js` (37
  asserções) é testado porque **autoriza um DELETE no Storage** a partir de uma
  string que nem sempre é nossa (`Grupos.jsx` grava `foto_url` por texto livre):
  recusa outro bucket, URL externa e travessia — **na dúvida devolve `null`**.
- ⚠️ Autoria do audit log: `auth.uid()` é NULL em escrita por service_role ⇒ a
  edição pelo app aparece como "sistema" — **mesma limitação do web**.
- ⚠️ **ORDEM DE ENTREGA**: endpoint chega no merge, tela só depois de 2 aberturas
  (OTA). **Não revogar as policies do bucket antes do OTA chegar.** E liberar "o
  supervisor" na policy do SQL resolveria 7 grupos e deixaria 88 de fora (só 14
  dos 102 grupos ativos têm líder com conta no app), além de duplicar a régua de
  autorização — a doença que o `gateGrupoApp` existe pra curar.

### ⚠️⚠️ O PUSH NUNCA CHEGOU: 1.801 de 1.820 recusados (07/08 · migration `20260807220000`)

`app_push_tokens` recebe token de **DOIS apps Expo** (membros e CBRio Staff —
mesma org, mesmo Supabase), e a Expo **recusa o REQUEST INTEIRO** quando mistura:
*"All push notification messages in the same request must be for the same
project."* Um token do Staff derrubava a entrega dos 30 tokens iOS válidos; os 19
aceitos foram os envios de uma pessoa só, em que o lote por acaso não misturou.

⚠️⚠️ **Por que ninguém viu**: TRÊS remetentes, cegos de jeitos diferentes — duas
Edge Functions davam `await fetch(...)` **sem ler o corpo**, e `appPush.js` lia e
gravava ticket, mas ninguém olhava a tabela.

- **`backend/utils/pushLotes.js`** agrupa por app Expo antes de montar o request.
- ⚠️ **Token de projeto DESCONHECIDO vai SOZINHO** (1 por request) — request com
  uma mensagem só não tem como ter "experience ids demais". Entrega correta desde
  o 1º envio, sem adivinhar origem e **sem apagar linha de ninguém** (o app
  reescreve o próprio token a cada volta do background). ⚠️ **NUNCA juntar os
  desconhecidos num lote** — são os de origem ambígua, a mistura mais provável.
- ⚠️ `tokenMorreu()` só aceita **`DeviceNotRegistered`**. Apagar por erro de LOTE
  teria **zerado a tabela** (1.773 tickets eram culpa do request, não do token).
- ⚠️ **RÉGUA GÊMEA**: `backend/utils/pushLotes.js` e
  `Aplicativo-CBRio/lib/pushLotes.ts` têm que decidir IGUAL — mesma tabela, mesmo
  serviço. Divergir faz o erro voltar **só metade das vezes**. Os testes usam o
  **mesmo vetor de casos** nos dois repos.
- De quebra: `appPush.js` mandava `sound: 'cbrio-chime.wav'` com **hífen** e o
  asset é `cbrio_chime.wav` — todo push do ERP saía com som inexistente.
- ⚠️ **AINDA ABERTO (decisão de gente)**: os 4 broadcasts definem a AUDIÊNCIA por
  `select from app_push_tokens`. Quem não tem token — hoje **todo Android**,
  porque o binário não tem Firebase — fica de fora até do **sino in-app**. Trocar
  por "todo mundo com conta no app" muda o alcance de ~23 pra ~113 pessoas.

### ⚠️⚠️ `POST /api/app/inscricoes` NÃO VALIDAVA NADA (10/08 · migration `20260810160000`)

Achado pelo Marcos testando no aparelho: *"sou homem e consigo ver os grupos
apenas para mulheres e posso tentar me inscrever."* O handler **não lia NENHUMA
das 5 travas do site** (categoria/gênero · `ativo` · `aceitando_inscricoes` ·
`modo_inscricao='fechado'` · temporada). ⚠️ **O app não "escapava" da trava — ele
nunca chegava lá**: o site trava no formulário público, e o app tem porta própria.

Régua única em **`backend/utils/entradaGrupoApp.js`** (37 asserções).

⚠️⚠️ **Desenho corrigido pelo MARCOS no mesmo dia, e ele estava certo.** Eu havia
feito um caminho especial que **DEIXAVA PASSAR** quem não tinha `genero` (só 16
de 54 contas tinham). Palavras dele: *"parece que estamos criando algo pra
resolver 40 pessoas, mas que vai quebrar quando abrir pra igreja; prefiro que
tenham pedidos errados e recusados dessas pessoas do que do restante todo."*
⇒ **UMA REGRA SÓ**: o sexo tem que BATER; desconhecido não bate. E o que fecha o
argumento: **o portão de identidade JÁ EXIGE o sexo** — quem chega na tela de
grupo já passou por ele. Não havia buraco a acomodar, só máquina a mais.

- ⚠️ **A ORDEM das travas importa** (tem teste): grupo fechado responde
  "fechado", não "sexo" — senão a pessoa completa o perfil e continua sem entrar.
- ⚠️ **`sempre_aberto` entra MESMO com a temporada fechada** (tem mutante) ·
  categoria NÃO restritiva **nunca** pergunta o sexo (se regredir, 70% das contas
  param de entrar em QUALQUER grupo).
- ⚠️ `resolveMembroApp` **não traz `genero`** — a leitura é ISOLADA e, se falhar,
  cai em `sexo_necessario`, nunca em "deixa passar".
- ⚠️⚠️ **AINDA HÁ DUAS CÓPIAS DA RÉGUA, de propósito**: `publicGrupos.js` mantém a
  dele (é a porta principal — 462 dos 463 pedidos). **AS DUAS TÊM QUE CONCORDAR**;
  há ponteiro no arquivo. Unificar quando houver janela pra testar o formulário.
- **Backfill**: a base tem `genero` em **499 de 4.056 vivos (12%)**. Recuperadas
  51 declarações que a própria pessoa fez em `mem_cadastros_pendentes` e o matcher
  descartava. ⚠️⚠️ **NUNCA inferir sexo por NOME *e gravar como se fosse
  declarado*** — errar isso constrange uma pessoa real e decide em qual grupo ela
  pode entrar. Sem declaração o campo fica NULO e o app pede.
  ⚠️ **Precisão de 14/08**: a lei proíbe a GRAVAÇÃO automática, não a sugestão.
  Palpite por nome pode existir como sugestão que uma PESSOA confirma — ver
  "Completar o sexo" abaixo. Quem legitima o dado é a confirmação humana.
- ⚠️ **PENDENTE DE GENTE (é dado)**: "NEW HEART - RECOMEÇO 40+" está
  `categoria='Homens'` com 4 mulheres no roster e 6 pedidos aprovados — CADASTRO
  errado, não bypass. Quem já está no grupo não é afetado; mulher nova é recusada.

### Pedido de exclusão de conta (LGPD) · fila e SÓ leitor

`GET /api/membresia/exclusoes` + bloco recolhível na aba Cadastros pendentes.
⚠️ **SÓ LEITURA de propósito**: **não existe nenhum caminho de desativação de
conta no sistema** (o único `auth.admin.deleteUser` é script de teste;
`profiles.active` é só LIDO). Um botão "processar" que não processa repetiria o
erro que criou o problema — a tela **declara** que a desativação é manual e cita
o prazo de 15 dias (art. 18). ⚠️ Decidir o que a igreja **RETÉM** por obrigação
legal vem antes de qualquer processamento — e a FK `user_id → auth.users ON
DELETE CASCADE` significa que apagar o auth user **apaga a prova de que o pedido
existiu**. ⚠️ Erro de carregamento não se disfarça de fila vazia.

⚠️ **Suporte da Apple**: `Suporte.tsx` publicava um número **sem caixa nenhuma no
sistema** (zero conversas) — quem escrevia falava com o vazio. É a **Support URL
exigida pela Apple** (Guideline 1.5): número errado ali é motivo de rejeição.

### ⚠️ O sino lotou quando os geradores periódicos ligaram (10/08)

⚠️⚠️ **Correção de registro**: este arquivo afirmou até 10/08 que
`/api/notificacoes/cron` não estava agendado. **Está** (`0 9 * * *`, registrado na
Vercel e medido produzindo). **Lição de método: antes de repetir um achado deste
arquivo, medir de novo** — a nota estava correta quando escrita e envelheceu em 4
dias.

Medido em 10/08: **16.646 avisos NÃO LIDOS · 90 pessoas · média de 185 por
pessoa**, com `grupos` respondendo por 59%. Sino nesse estado não é lido — o
efeito é o mesmo de não notificar. Duas causas, donos diferentes:

1. **38 dos 51 módulos ativos não têm regra em `notificacao_regras`** ⇒ fallback
   de TODOS os admin/diretor (16). Assinatura no dado: os tipos de maior volume
   batem em 15–18 pessoas; `kids`, que TEM regra, entrega para 2. ⚠️ Configurar é
   decisão de QUEM RECEBE — o Matheus assumiu em 10/08.
2. **Os geradores avisavam 1 POR ITEM.** Os 4 de maior volume passaram a avisar
   **AGREGADO** (`grupo_sem_encontro`, `membro_sem_grupo`, `ata_pendente`,
   `kids_crianca_ausente`) — 1 aviso com contagem + amostra de 5 + link. Régua e
   o porquê da chave de dedup ESTÁVEL: **`backend/utils/avisoAgregado.js`**
   (mutation-testado, no gate).

⚠️ **NÃO agreguei `pedido_grupo` nem `nova_inscricao`**: ali cada linha é item de
trabalho de uma PESSOA (o líder recebe por `extraTargetIds`) e o dedup por pedido
é o que impede duplicar. O excesso deles é a causa nº 1, que não se conserta
agregando.

## ⚠️ DECISÃO · o APP é o canal oficial do devocional (2026-08-06)

Palavras do Marcos: *"acho que podemos usar agora o canal oficial da devocional
sendo o aplicativo mobile, mantenha assim por enquanto"*.

Contexto: eu havia levantado que, com o login não ligando mais ninguém a cadastro
(migration `20260806120000`), quem entrasse na **webapp** `/devocionais/*` sem ter
preenchido a ficha veria *"você não é membro"*. Ele decidiu **não consertar** —
a webapp fica como está.

⚠️⚠️ **NÃO "consertar" isso depois.** Especificamente, NÃO criar `mem_membros`
automaticamente pra a tela parar de reclamar: era exatamente esse cadastro-fantasma
que o gatilho fazia e que a migration removeu. Se um dia o comportamento
incomodar, o caminho é a webapp **mandar completar o cadastro**, nunca o banco
inventar pessoa.

**Estado medido em 06/08 (encanamento OK, adoção é o gargalo):**
- Lembrete por **push funciona**: 253 notificações `tipo='devocional'`, a última
  **hoje 07:30 BRT** (o horário do cron). `app_lembretes_enviados` tem 32 chaves
  `devocional:`.
- **Conteúdo existe**: plano "Devocional da semana 03/08" ativo, 96 itens, com item
  pra hoje.
- 🔴 **Uso real: 12 check-ins em `mem_devocionais`, de 6 pessoas, o último em
  15/07** (3 semanas atrás). 253 lembretes → ~0 registro. Como `mem_devocionais` é
  a fonte dos KPIs de **Investir tempo com Deus**, o valor é ~zero por falta de
  USO, não por falta de canal — não confundir os dois ao ler o painel.
- Achado menor: temas repetidos em dias seguidos ("A Força que Vem da Fraqueza" em
  05 e 06/08 · "A Força na Fraqueza" em 04/08) — a geração por IA repetindo
  assunto. Não bloqueia nada.
- ⚠️ Correção de registro: a aba "Automáticas" (05/08) marcou o devocional como
  "quebrado · 187 erros, 0 entregas". Aquilo é do canal **WhatsApp**
  (`whatsapp_envios` não tem NENHUMA linha de devocional hoje); o **push**, que é o
  canal que importa agora, está entregando.

## ⚠️⚠️ As 4 portas de criança/inscrição alinhadas (2026-08-11 · migration `20260811120000`)

Pedido do Marcos, depois da auditoria das 7 portas: *"eu só não quero ter crianças
ou pessoas com dados faltando porque em um lugar pede uma coisa e no outro pede
outra"* — mais *"em outra sessão o Claude me disse que você não usa os limites de
pessoas por culto no batismo, pode ver isso? Caso um horário esteja cheio, liberar
apenas o outro; o limite é 11 pessoas."*

### 1 · ⚠️⚠️ A porta do app escrevia na tabela que a equipe do Kids NÃO lê

Achado ao ligar os campos de saúde. Existem DUAS tabelas de apresentação e elas
têm leitores diferentes:

| tabela | quem escreve | quem LÊ |
|---|---|---|
| `apresentacao_criancas` | formulário público · **app (desde hoje)** | **`totemKids.js GET /apresentacoes` → a aba do `/kids`** |
| `apresentacao_bebes` | totem de membros | só o próprio totem, pro dedup dele |

A porta que nasceu em 10/08 escrevia em `apresentacao_bebes`: a família veria
"recebemos" e **o balcão não saberia de nada no domingo**. Trocado — e a troca é
de custo zero porque `apresentacao_bebes` tem **0 linhas** (medido em 11/08). De
brinde, `apresentacao_criancas` tem `crianca_id` (o elo com a ficha do Kids) e os
campos do Contrato, que era o que faltava pro item 2.
⚠️ `culto_id` **não existe** em `apresentacao_criancas` — mandar coluna
inexistente faz o PostgREST recusar o INSERT INTEIRO (42703) e a família perderia
o pedido por causa de um informativo.

### 2 · Saúde/inclusão: régua ÚNICA nas duas portas (`utils/saudeCrianca.js`)

Medição que fecha o argumento dele, no recorte justo (crianças criadas **desde
28/07**, quando o formulário do Kids ganhou os campos): **34 pela porta do Kids ·
100% respondidas** contra **2 pela apresentação · 0%**.

⚠️⚠️ **E o dano é operacional, não estético:** `tem_espectro` e
`tem_limitacao_fisica` são a **régua do PAGER** no totem (`totemKids.js`), e o
pager de inclusão é OBRIGATÓRIO desde 03/08 (decisão da Mari). Criança com
autismo que entra pela apresentação chegava no Kids com o campo NULO e **não caía
na regra**, a menos que o voluntário percebesse e editasse a ficha na hora.

- **São 3 perguntas, não 8.** `kids_criancas` tem 8 campos de saúde; entram as 3
  que MOVEM o domingo (alergia → lanche; TEA e limitação → pager). As outras duas
  são texto livre que a equipe preenche no atendimento — pedir 8 campos numa tela
  de autoatendimento troca dado bom por formulário abandonado.
- ⚠️⚠️ **`null` e `false` são coisas diferentes, e é disso que o buraco é feito.**
  `null` = ninguém perguntou (98% da base); `false` = a família respondeu que não.
  Pergunta em branco **não entra no payload** — gravar `false` faria a régua do
  pager EXCLUIR ativamente criança sobre a qual não se sabe nada. Mutation-testado.
- **Nenhuma é obrigatória**: travar o envio empurraria a família a responder
  qualquer coisa pra passar.
- **Só-onde-vazio** quando a ficha já existe: a equipe do Kids pode ter corrigido
  no balcão, e formulário não sobrescreve correção humana.
- A tela AVISA ("vocês vão receber um pager") na hora do "sim" — quem decide o
  pager continua sendo o totem, no check-in.

### 3 · ⚠️⚠️ `mem_membros.genero` é `masculino`/`feminino` — NUNCA `M`/`F`

Medido na base inteira em 11/08: **4.045 vivos · 579 com sexo · ZERO com valor
curto**, nas 14 origens que preenchem. Vários comentários deste arquivo afirmavam
o contrário, e o código acreditou neles: `if (genero === 'M')` **nunca é verdade
em produção**.

Consequência real, na porta escrita na véspera: a derivação de pai/mãe da
apresentação estava morta — `nome_pai`/`nome_mae` saíam sempre nulos e o balcão
receberia a criança sem o nome de nenhum dos dois. E `pessoaDaCrianca` gravaria
`genero: 'M'`, criando a única pessoa da base num vocabulário que nenhum filtro
do sistema procura (a régua de gênero dos grupos, entre outros).

`utils/dadosDoCadastro.sexoPara(destino, valor)` é o tradutor único: aceita as
duas formas na ENTRADA e emite a do DESTINO. O vocabulário curto existe de
verdade, mas noutras tabelas — `kids_criancas.sexo` (867 M / 1.058 F) e
`batismo_inscricoes.sexo`; `vol_inscricoes.sexo` e `next_matriculas.sexo` são
canônicos. Mutation-testado: "simplificar" aceitando só M/F na entrada ressuscita
o bug.

### 4 · O app carrega o que o cadastro JÁ TEM (`patchDoCadastro`)

Decisão dele: *"caso alguém tenha baixado e não tenha esses campos, já colocamos a
tela de preencher; quando elas voltarem terão, e aí vamos passar isso."*

O fanout grava nome/telefone/e-mail e deixa CPF, nascimento e sexo vazios — mas
**10 das 12 linhas incompletas de origem `app` têm o cadastro completo**. O dado
existia; o app é que não o carregava. Então **preencher, não exigir**: exigir na
porta reprovaria as contas que ainda não passaram pelo portão de identidade e
derrubaria inclusive o SOS.

- Roda **depois** da releitura do fanout, best-effort, só-onde-vazio.
- ⚠️ `grupos` fica FORA: `mem_grupo_pedidos` **não tem** coluna de CPF, nascimento
  nem sexo (introspectado, não decorado) — inventar coluna derruba o UPDATE
  inteiro com 42703. O CPF do pedido de grupo já tem caminho próprio desde 06/08.
- ⚠️ A janela de 2 min ao localizar a linha não é enfeite: sem ela, uma inscrição
  ANTIGA da mesma pessoa seria reescrita a cada nova.

### 5 · O direcionamento do Next passa o Contrato adiante

`services/nextDirecionar.js` criava `vol_inscricoes` e `batismo_inscricoes` sem
**sexo** (o formulário do Next passou a exigi-lo em 28/07 e o dado morria na
matrícula) e o batismo ainda ia sem **nascimento e e-mail**. Agora a matrícula é a
fonte preferida e o cadastro entra só onde ela está vazia.

### 6 · ⚠️⚠️ BATISMO · o limite de 11 era só enfeite de tela

Ele estava certo pela metade, e a metade que faltava é a pior:

- o mecanismo EXISTE (`batismo_horarios.limite` + `GET /horarios`, que já esconde
  do seletor o horário lotado) e 08:30/10:00 tinham limite 11;
- **11:30 e 19:00 estavam com `limite` NULO** = sem teto nenhum;
- e **`POST /inscrever` não conferia NADA**. Prova no banco: **28/06 às 10:00
  fechou com 12 inscritos num limite de 11.**

Agora `vagaNoHorario` trava antes do insert e responde **409 `horario_lotado`**
com a mensagem mandando pro OUTRO horário — que é o que ele pediu; dizer só
"lotado" deixa a pessoa sem saída. A migration preenche o teto onde está NULO
(só onde está: capacidade é decisão da equipe do batismo, não deste script).

⚠️ **RESÍDUO DECLARADO**: a conferência é SELECT-depois-INSERT, sem lock — dois
envios no mesmo instante passam os dois. Não usei `pg_advisory_xact_lock` (a
técnica da espinha) porque exige função SQL + migration, e o buraco de hoje **não
é corrida**: os 12 de 28/06 entraram porque não havia conferência nenhuma. Com
~6 inscrições por cerimônia a janela é pequena; se um dia estourar por 1, é aqui
que vira RPC com lock.

## Apresentação de bebês · o culto vem da régua D3 (2026-08-12 · SEM migration)

Lote 1 da EXECUÇÃO da mudança dos cultos de domingo (estratégia completa no §13
de `docs/cultos-domingo/contexto-e-plano.md`, branch `claude/cultos-domingo-handoff`
— modo piloto aprovado pelo Marcos em 12/08). A regra "SEMPRE 10:00" (23/07)
morre junto com o culto em 24/08; a nova é a **D3: 09:30 primário, overflow pro
11:30 por LIMITE** — e bebês estão **SEM limite por enquanto** (Marcos 12/08),
então na prática "sempre 09:30".

- **`escolherCultoApresentacao`/`rotuloHora`** em `utils/criancaApresentacao.js`
  (régua PURA · `src/test/cultoApresentacao.test.ts`, 13 casos **no gate**, 2
  mutantes): 09:30 → (lotado com limite) 11:30 → (pré-corte) 10:00 → **null**.
  ⚠️ O fallback antigo "primeiro culto por horário" MORREU — pós-corte ele
  penduraria a cerimônia no **fantasma de 08:30** (achado B9 da varredura). Sem
  candidato, a linha nasce com `culto_id` nulo e os textos OMITEM o horário.
- **Comportamento IDÊNTICO até 24/08**: sem 09:30 na grade, a régua resolve o
  10:00 — é o que permite este código ir ao ar ANTES do corte, aberto, sem véu.
- `GET /totem/apresentacao-bebe/status` devolve `horario_previsto` +
  `horario_rotulo` e o `TotemMembro.tsx` deixou de hardcodar "10h" (2 textos ·
  omitidos quando o servidor não manda horário); o `{{4}}` do WhatsApp sai do
  culto escolhido. ⚠️ **Pendência de GENTE**: conferir na Meta se o CORPO do
  template `apresentacao_bebes_confirmacao` cita "10h" fora do `{{4}}` — se
  citar, é template `_v2` (editar aprovado volta pra revisão e o envio para).
- **Limite por env `APRESENTACAO_LIMITE_POR_CULTO`** (vazia = ilimitado, o
  estado atual): ligar o overflow do 11:30 no futuro é setar a env, sem mudança
  de regra. Cancelada não ocupa vaga na contagem.
- ⚠️ Esta régua é SÓ do TOTEM (único escritor de `apresentacao_bebes`): a porta
  do app e o formulário público escrevem em `apresentacao_criancas`, que **não
  tem `culto_id`** (alinhamento de 11/08).

## Cultos de domingo · Lote 2 · Fase 1 aberta: régua do voluntariado + totem Kids + guards (2026-08-13 · migration `20260813120000`)

Lote 2 do modo piloto (§13 de `docs/cultos-domingo/contexto-e-plano.md` ·
branch `claude/cultos-domingo-handoff`). Tudo **INVISÍVEL até o corte de
24/08**: 'Domingo 09%' não casa com culto nenhum enquanto o tipo "Domingo
09:30" não existir, e a grade atual se comporta byte-idêntica (travado em
teste). Regra do Marcos honrada: ninguém consegue se inscrever/fazer check-in
em horário que ainda não existe.

- **Migration `20260813120000` = PATCH DINÂMICO** (`pg_get_functiondef`/
  `pg_get_viewdef` + `regexp_replace` · técnica da 20260729060000): acrescenta
  `OR … ~~* 'Domingo 09%'` após cada comparação com `'Domingo 08%'` no gate
  `fn_dash_vol_service_no_bloco` (obrigatório), na `vw_dashboard_voluntariado`
  (obrigatória) e em composicao/resumo/pessoas (lenientes — versões novas
  delegam ao gate). Idempotente (já tem 'Domingo 09' → NOTICE) · **ABORTA** se
  a forma viva divergir · checagem ignora comentário (régua 06/08) · smoke: o
  gate aceita 'Domingo 09:30' E segue aceitando 08:30/11:30. ⚠️ NUNCA colar
  corpo estático de arquivo (reverteria patch de prod). ⚠️ **Aplicar ANTES de
  24/08.** ⚠️ O anchor do bloco 'Domingo Manhã' (`'08:30:00'` no VALUES da
  view) NÃO muda aqui — é visível; fica pro script do corte (Lote 5).
- **⚠️⚠️ DESCOBERTA na 1ª aplicação (13/08 — a guarda ABORTOU, como devia):**
  produção foi REFATORADA fora do git — a régua vive em DUAS funções centrais,
  **`fn_dash_vol_bloco_nome(text)` e `fn_dash_vol_bloco_id(text)`** (gate/view/
  irmãs só DELEGAM), e elas **JÁ classificam 'Domingo 09:30' → 'Domingo Manhã'
  / bloco `b10c…001`** (sondado funcionalmente via RPC em 13/08 — noite intacta,
  'GC 12 HORAS' → null). Provável trabalho do Matheus (a varredura de 11/08
  ainda media a forma antiga) — **confirmar com ele**. A migration virou v2:
  reconhece as duas formas — forma refatorada = verificação FUNCIONAL (09:30 no
  MESMO bloco do 08:30 · manhã ≠ noite · NOTICE e encerra sem tocar em nada);
  forma do repo (banco montado das migrations) = patch textual como antes.
  ⚠️ **As 2 centrais NÃO estão em nenhuma migration do repo** — mesmo drift do
  handle_new_user; commitar a definição viva é follow-up alinhado com o Matheus.
  ⚠️ Régua de leitura que fica: quem quiser mexer na classificação de bloco do
  voluntariado mexe nas CENTRAIS (fora do git, pedir def viva), nunca nas
  consumidoras.
- **volMatch.ts** (espelho JS da régua) ganhou `m(/^domingo 09/)` no bloco da
  manhã + `src/test/volMatch.test.ts` (mutante: 09 na noite fica vermelho).
- **Totem Kids** — régua do relógio virou PURA em `src/lib/cultoRelogioKids.ts`
  ('agora' injetado · `src/test/cultoRelogioKids.test.ts`, 3 mutantes): a grade
  nova 09:30+11:30 deixaria BURACO 10:30–11:00 sem culto de agora → **regra do
  buraco zero**: a antecedência do PRÓXIMO estica até o fim da janela do
  anterior, SÓ entre cultos do MESMO período (12:30–18:00 segue vazio) e NUNCA
  esticando o fim do anterior (criança das 10:45 não cai no culto que acabou).
  E **sessão única VENCIDA deixou de ser adotada em silêncio**
  (`seletorCultosNecessario`/`faltaEscolherCulto` no TSX): única sessão só é
  destino implícito quando é o culto de AGORA; senão o seletor aparece e trava
  o confirmar — vale pro modo ensaio também (1 toque a mais, explícito).
  `/cultos-do-dia` filtra `deleted_at` + `is_active !== false`; `POST
  /sessoes/garantir` recusa culto apagado/tipo encerrado/sem Kids (falha de
  LEITURA não bloqueia — instabilidade não trava o culto).
- **Guards**: POST/PUT/DELETE `/voluntariado/service-types` →
  `authorizeModule('voluntariado', 5)` (herdavam `membresia` nível 1 =
  LEITURA, 27 cargos alcançavam). **DELETE com culto vinculado → 409** mandando
  encerrar (mina nº 5: o DELETE anula `service_type_id` em 209 cultos e apaga
  roteiro de produção/escala em CASCADE). Contagem head-only, fail-closed.
  ⚠️ O POST segue NÃO cobrindo has_kids/has_online/presencial_label — tipo de
  culto novo nasce por SQL (comentado na rota).
- **kpis.js auto-create**: pré-check de idempotência = `(service_type_id,
  data)`, a MESMA chave do índice único (lei 04/08 — com `hora` no pré-check,
  culto existente com hora divergente estourava o UNIQUE e a falha sumia nos
  skipped); insert com erro vai em `erroItems` + console.error.
- **integracao.js `/coleta/:id/aprovar`**: submissão de KIDS recusa 409 em
  culto com `has_kids=false` (só recusa quando o banco DIZ).
- **CalendarioCultos.jsx**: campo que o tipo não usa é OMITIDO do payload, não
  zerado — zerar apagava o que o totem Kids consolidou se a config do tipo
  estivesse errada/incompleta (tipo novo antes das flags).
- **isSedeCulto ×3** (kpiAutoCollector/painel/painelArea): fallback por `nome`
  quando não há `service_type_name` (espelha isAmi/isBridge) — culto sem tipo
  não some da Sede em silêncio.

## Cultos de domingo · Lotes 3+4 · lentes + ocupação ofertada ATRÁS DO VÉU (2026-08-13 · migration `20260813150000`)

Continuação do modo piloto (§13 de `docs/cultos-domingo/contexto-e-plano.md`).
É a "página teste" pedida pelo Marcos em 13/08: um card de prévia no Dashboard
Semanal que **só existe pra quem pode ver** — o backend decide.

- **Migration `20260813150000`** (aditiva/idempotente · nada existente a lê):
  `vol_service_types` += `vigente_de`/`vigente_ate` (janela de vigência ·
  seeds: 08:30 e 10:00 com `vigente_ate='2026-08-23'`), `linhagem_key` (lente
  continuidade · seed: 10:00 = `'domingo-0930'`) e `consolidacao_key` (lente
  consolidação · seeds: 08:30 e 10:00 = `'domingo-0930'`). + tabela
  **`cultos_config`** (singleton padrão app_config · RLS service_role +
  super-admin) com **`lentes_domingo_publicas` = O VÉU** (default false).
  ⚠️ O script do corte (Lote 5) completa: INSERT do tipo "Domingo 09:30" com
  as 2 chaves + `vigente_de='2026-08-24'`, e o destrave do véu = `UPDATE
  cultos_config SET lentes_domingo_publicas = true` (1 UPDATE, sem deploy).
- **`GET /dashboard-semanal/lentes-domingo`**: responde `{visivel:false}` (e
  NADA mais) a menos que a flag esteja ligada OU o usuário seja super-admin
  (`isSuperAdminEmail` · falha ao ler a config = véu FECHADO). Colunas do Lote
  3 em SELECT ISOLADO (lição parcelas_max): sem a migration o endpoint segue
  de pé com `chaves_ok:false` e as lentes degradam pra separada. Leitura da
  `vw_dashboard_semanal` paginada (2 anos ISO × tipos passa do cap de 1000).
- **Régua PURA em `backend/utils/lentesDomingo.js`** (`montarLentes` ·
  `src/test/lentesDomingo.test.ts`, 3 mutantes): lente **separada** (dado cru ·
  padrão) · **continuidade** (linhagem_key: 10:00 → 09:30 = UMA série que
  atravessa o corte, rótulo "Domingo 10:00 → Domingo 09:30") · **consolidação**
  (consolidacao_key: 08:30+10:00 **SOMADOS POR SEMANA antes de qualquer
  média** — mutante trava a pegadinha do Pr. Juninho). **Ocupação sobre
  lugares OFERECIDOS** (ideia do Marcos): freq_adulto ÷ (1050 × cultos
  VIGENTES no domingo, pela janela vigente_de/ate + is_active) — o denominador
  cai de 4200 pra 3150 no corte SOZINHO (mutante). Eixo se estende até o 1º
  domingo do formato novo pra `ReferenceLine` do corte aparecer já na prévia.
- **`LentesDomingoCard.jsx`** montado no topo do main da `DashSemanalAba`
  (após o ResumoSemanaCard): pills das 3 lentes + LineChart com ReferenceLine
  "novo formato" (30/08) + `OcupacaoGauge` sobre a capacidade OFERECIDA +
  médias por série + tabela de vigência/chaves (os dados do Lote 3 à vista).
  Badge "atrás do véu" enquanto a flag está OFF. Card com `visivel:false`
  renderiza **null** — usuário comum não vê nem espaço em branco.
- ⚠️ Capacidade: o endpoint usa o `CAPACIDADE_TEMPLO = 1050` do próprio
  dashboardSemanal.js e o card usa a capacidade QUE O ENDPOINT DEVOLVE (sem
  hardcode novo no front). O inventário completo dos 1050/1300 hardcoded
  (painel.js ×2, prompts de IA ×2, fn_monitoramento_okr_raw, vw_culto_stats
  dormente) ficou mapeado na sessão de 13/08 — unificar é follow-up separado,
  não deste lote.

## ⚠️⚠️ Cultos de domingo · Lote 5 · O SCRIPT DO CORTE (2026-08-13 · NÃO é migration)

Fecha o modo piloto (§13 de `docs/cultos-domingo/contexto-e-plano.md` — o
handoff AGORA ESTÁ NA MAIN, mergeado em 13/08 junto com a régua central do
voluntariado `20260811120000_vol_bloco_fonte_unica.sql`, que commitou a
refatoração que a sessão de 13/08 tinha achado só em prod).

**`backend/scripts/corte-cultos-domingo-20260824.sql`** — vive em
`backend/scripts/` DE PROPÓSITO (em `supabase/migrations/` alguém o aplicaria
antes do dia). É UM DO block com `v_executar constant boolean := false`:

- **ENSAIO** (qualquer dia): rodar como está → faz TUDO e termina com
  `RAISE EXCEPTION 'ENSAIO OK — resumo…'` = ROLLBACK TOTAL, o resumo aparece na
  mensagem de erro do editor. **CORTE REAL (24/08)**: trocar UMA linha
  (`v_executar := true`) e rodar — tudo numa transação; invariante violada
  aborta e desfaz tudo. Guarda extra: execução real ANTES de 24/08 aborta.
- Passos: pré-condições (Lote 2/3 aplicados · régua aceita 09:30 · guarda de
  bloqueadores: culto futuro com dado/satélite ABORTA com contagem) → backups
  `_bk_20260824_*` → tipo novo por SQL herdando flags do 10:00 (mina nº 2) +
  vigente_de/linhagem/consolidação → is_active=false ANTES de limpar linhas
  (senão o auto-create recria) → clone dos vínculos de template de escala →
  INSERT dos 09:30 por data + repoint de apresentacao_bebes + DELETE dos
  futuros → fin_culto_slots (desativa 8h30/10h, cria 'Domingo 9:30' 06:00–11:00
  slug `domingo-9h30`; slot NUNCA é deletado — FK de fin_pix_detalhe/
  fin_transacoes) → batismo (fecha 08:30/10:00 · abre 09:30+11:30 limite 11 ·
  labels sem ordinal · find-or-insert porque o UNIQUE de horario é índice
  PARCIAL e ON CONFLICT não infere) → anchor da vw_dashboard_voluntariado
  '08:30:00'→'09:30:00' (patch DINÂMICO na def viva · guard: exatamente 1
  ocorrência — a `20260811120000` deixou o anchor de fora DE PROPÓSITO pra
  esta fase) → véu aberto (`lentes_domingo_publicas=true`) → invariantes §4.2
  como asserts (fantasmas=0 · órfãos não cresceram · grade da manhã =
  {09:30, 11:30} · `fin_identifica_culto` 09:29/10:59→'Domingo 9:30' e
  11:00→'Domingo 11:30' · batismo aberto = {09:30, 11:30}).
- **D2 (financeiro)**: `v_conta_dizimo_0930`/`v_conta_oferta_0930` no topo do
  DO block — NULL = fallback interim nas contas do 10:00 (3.01.01.09/.09);
  se o ok da conta nova sair até 20/08, preencher os 2 uuids antes de rodar.
- **`backend/scripts/_corte_cultos_domingo_ensaio.cjs`** (SEM --exec, nunca
  escreve): backup JSON do estado anterior em ~/Downloads + pré-condições via
  RPC + lista de bloqueadores (a guarda do passo 0, antecipada) + o plano com
  os números de hoje. Rodar antes do dia 24 e no dia, antes do SQL.
- ⚠️ **O que o script NÃO cobre (checklist de GENTE, no header do SQL)**: PCO
  (planos 30/08 e 06/09 → 09:30; as 84 escalas não se movem), whatsapp_config
  "Horários de culto" (única superfície pública que EXPLICA a mudança),
  template Meta `apresentacao_bebes_confirmacao` (conferir "10h" no corpo),
  OTA do CBRio-Staff (`index.tsx:276`), verificação de campo 30/08 (totem Kids
  08:50/09:35/10:45/11:15 · PIX da manhã → slot 9:30 · online_pico do 09:30),
  dashboard_metas (recalibrar em OUTUBRO, só anotar o corte no rótulo).
- Rollback pós-commit: tabelas `_bk_20260824_*` guardam o estado anterior.

## ⚠️ Identidade · o nome MAIS COMPLETO vence (2026-08-11 · SEM migration)

Decisão do Marcos, no caso Thiago (candidatura de líder de 10/08): o matcher
ligou o formulário "Thiago dos Santos Nogueira" ao cadastro existente "Thiago
Nogueira" (stub do auth de 10/07 · match por CPF) — comportamento CORRETO, mas
o nome declarado pela própria pessoa era descartado e o sistema mostrava um
nome no pedido e outro na membresia. *"Ele não pode mostrar um nome em um lugar
e outro em outro lugar — os nomes devem ser juntados e o mais completo deve ser
mantido."*

- **`nomeMaisCompleto(atual, declarado)`** em `services/identidadeProgressiva.js`
  — regra conservadora: promove SÓ quando o atual é subsequência (mesma ordem)
  dos tokens do declarado e o declarado acrescenta algo. Nunca troca token
  ("Maria Silva" × "Maria Souza" → null), nunca encurta, nunca reordena;
  inicial de 1 letra expande ("Ana P" → "Ana Paula"); placeholder
  "Contribuinte…" e e-mail no campo de nome nunca viram nome. Contrato em
  `nomeMaisCompleto.test.js` (**no gate de deploy** · `test:nome-completo`),
  mutation-testado: containment de conjunto (aceitaria reordenação) e
  containment parcial (derrubaria token) deixam vermelho.
- **Roda em `registrarObservacaoIdentidade`** — o ponto que TODAS as portas
  atravessam quando ligam num membro (o `_observar` do matcher guardado E o
  `registrarObservacaoSegura` das portas read-only). Best-effort, ANTES da
  gravação da observação (não depende da tabela existir), com `.eq('nome',
  atual)` contra corrida (padrão #2257). Sincroniza `profiles.name` ligado ao
  membro pela MESMA régua (precedente do gatilho do auth: nome só na membresia
  deixa o app mostrando o antigo).
- **O passado**: `backend/scripts/_reparo_nomes_mais_completos.cjs` (dry-run /
  `--exec` · backup em Downloads) varre observações de identidade + pedidos de
  grupo + candidaturas de líder e aplica a régua em cadeia (a mais completa de
  todas vence).
- ⚠️ **A aba de Entrada segue exibindo o nome DIGITADO no pedido**
  (`insc.nome`), não o cadastro resolvido — Marcos decidiu NÃO mexer na tela;
  com a promoção do nome os dois convergem no caso comum.

## Grupos · faxina de vínculos abertos em grupo INATIVO + cartão da ficha (2026-08-11 · SEM migration)

Caso Eliandra: 4 vínculos abertos ao mesmo tempo, 3 em grupos `ativo=false` —
cada tela mostrava um grupo diferente e nenhum era onde ela está. Medido:
**1.443 vínculos abertos · 375 em grupo inativo · 257 pessoas com 2+ abertos**.

- **`backend/scripts/_faxina_vinculos_grupos_inativos.cjs`** (dry-run/`--exec` ·
  backup em Downloads): fecha (`saiu_em` + `motivo_saida`) os vínculos abertos
  de grupos inativos/deletados, com `.is('saiu_em', null)` de guarda. ⚠️ NÃO
  toca nos vínculos em grupos ATIVOS de temporada encerrada (os ~402 do
  handoff de 04/08 — decisão ainda aberta) nem em `mem_grupos.lider_id`.
- **Cartão "grupo de conexão atual" da ficha** (`membresia.js` ×2): o
  `.maybeSingle()` sem limit ERRAVA ("multiple rows") pra quem tem 2+ vínculos
  abertos, e sem filtro de grupo mostrava grupo morto. Agora
  `mem_grupos!inner` + `ativo=true` + `deleted_at null` + mais recente
  (`order entrou_em desc · limit 1`).
- ⚠️ Régua de leitura que fica: vínculo aberto NÃO significa grupo vivo —
  qualquer tela que derive "o grupo da pessoa" precisa filtrar
  `mem_grupos.ativo` ou aceitar mostrar grupo encerrado.

## ⚠️⚠️ LEI · Grupos · `visitante` é DECLARADO, e quem promove é o CADASTRO (2026-08-13/14 · migrations `20260814120000`, `20260814140000`, `20260814150000`)

Pergunta do Matheus olhando a aba Pessoas: *"por que a maioria das pessoas são
classificadas como visitantes e não como membros? Se elas estão em grupo de
conexão, se inscreveram em grupo de conexão, elas são membros."* E, ao ver o
mecanismo: *"quem o líder realmente identifica como visitante, deve ser
visitante"* · *"só não vai ser visitante aquele de quem tivermos os dados
completos (os mesmos que pedimos no momento da inscrição)... se um visitante
for, ele vai ser visitante, e aí o líder deve pegar os dados dele, e aí ele já
entra na categoria de membro."*

⚠️⚠️ **ISTO REVERTE `20260620150000`** (pedido do MARCOS em 20/06: "entra como
visitante, vira membro no 4º check-in"). O Matheus foi avisado e reafirmou.
**Não tratar como bug e reverter sem falar com os dois.**

### A lei em uma frase

**Passar pela porta faz participante; presença NÃO promove ninguém; quem promove
o visitante é o cadastro dele ficar COMPLETO.**

| como entra | nasce | vira participante |
|---|---|---|
| inscrição aprovada · equipe adiciona · import · "engajou" do cuidado | **frequentador** | — |
| líder registra visitante do encontro (`POST /public/grupos/grupo/frequencia/visitante`) | **visitante** | quando o cadastro fecha |

- **O DEFAULT da coluna voltou a `frequentador`** e as **5 portas** que caíam
  nele passaram a setar `funcao` EXPLICITAMENTE (vale mesmo antes da migration):
  `aprovarPedidoCore` · `POST /grupos/:id/membros` · `gruposImporter` ·
  **`encaminhamentos` "engajou"** (é o vínculo que conta em Conectar da NSM) ·
  **`POST /membresia/grupos/:id/membros`**. As duas que setam `visitante` de
  propósito não foram tocadas.
- **Números medidos**: 387 promovidos na 1ª leva (pedido aprovado) + 29 na 2ª
  (lote: 25 da "Jornada Bíblica" todos com `entrou_em` 2026-08-10, 3 do "Grupo de
  Meninas", 1 adicionada à mão) ⇒ **1.099 participantes · 0 visitantes**.

### ⚠️⚠️ O trigger que apagava a declaração do líder

`tg_grupo_auto_membro` (23/07) promovia `visitante → frequentador` na 1ª
presença. E o líder registra o visitante **justamente pra ele aparecer na
chamada** — então `registrar_encontro_grupo` incrementava `presencas` e o
sistema desfazia a leitura do líder **no primeiro encontro**. Aquele trigger
existia pra promover o NOVO ENTRANTE (que nascia visitante por default); com o
default mudado, o único efeito que sobrou era esse. **Trigger dropado** (a
função fica, com COMMENT de depreciação — religar é 1 comando).

- **`fn_membro_cadastro_completo`** (SQL) e **`avaliarCadastroPessoa`**
  (`backend/utils/prontidaoCadastro.js`) são ESPELHOS: nome completo sem
  abreviação · CPF com DV (`fn_cpf_dv_valido`) · telefone · e-mail · nascimento
  plausível · sexo. **Mudou num, muda no outro** — senão a tela diz "está tudo
  preenchido" e a pessoa continua visitante. Contrato em
  `src/test/cadastroPessoaCompleto.test.ts` (19 casos · **no gate** ·
  mutation-testado: exigir termos mata 6, trocar pela régua de alcance mata 2).
- ⚠️ **DUAS diferenças conscientes** em relação ao `avaliarProntidao` (que avalia
  uma SUBMISSÃO, não a PESSOA): **`aceita_termos` fica de fora** (termo é prova
  de PORTA; o visitante anotado à mão nunca terá um, e exigi-lo tornaria
  impossível o caminho do líder) e **telefone por DÍGITOS** (régua do Contrato),
  não `telefoneAlcancavel` (régua de ENVIO).
- ⚠️ **`tg_grupo_visitante_vira_participante` promove SÓ na transição
  incompleto → completo.** Se disparasse com o cadastro já completo, o censo
  corrigindo um telefone promoveria visitante de grupo que a pessoa visitou uma
  vez. Corolário aceito: quem JÁ era completo antes de ser registrado como
  visitante **continua visitante** — a declaração do líder vale, e o clique na
  função resolve.
- ⚠️ **Não move número nenhum do painel**: Conectar/NSM conta vínculo ativo **sem
  filtrar função**.
- ⚠️ **`PATCH /grupos/pessoas/:id/ficha` não aceitava `genero`** (o GET já o
  devolvia): era **impossível completar um cadastro por aquela tela**, e a pessoa
  ficaria visitante pra sempre com o selo pedindo um campo sem lugar pra
  preencher. Mesmo defeito que travou a fila de membresia em 04/08.
- **Selo "Faltam dados"** + chip de filtro na aba Pessoas (o servidor manda o que
  FALTA; os VALORES de cpf/e-mail **não** trafegam) e **"Pedir os dados à
  pessoa"** (`POST /grupos/pessoas/:membroId/pedir-dados` · nível 3), que reusa
  `censoDisparo.convidarPessoa` — mesma fila, mesmo template, mesmo registro em
  `mem_censo_convites`, sem repetir convite da mesma rodada.
  ⚠️⚠️ **O link do censo NUNCA é entregue a terceiro**: ele abre o cadastro da
  pessoa preenchido **e editável**, então dá leitura e ESCRITA no cadastro alheio
  sem trilha de quem alterou. Quem envia é o servidor, pro contato DELA.

## ⚠️ Completar o SEXO · declaração GRAVA, palpite SUGERE (2026-08-14 · migration `20260814160000`)

Pergunta do Matheus, ao ver a fila de "faltam dados": *"tem muito que é só o
sexo. Será que conseguimos usar IA para ver pelo nome se é feminino ou
masculino?"*

**Sim — como SUGESTÃO.** A lei de 10/08 proíbe a GRAVAÇÃO automática, não a
sugestão; é a confirmação humana que legitima o dado. Duas camadas, e a
separação entre elas é a própria lei:

| camada | o quê | grava sozinho? |
|---|---|---|
| **1 · declarado** (`colherDeclaracoes`) | sexo que a PESSOA preencheu no voluntariado, Next ou batismo | **sim** — é dado dela, só-onde-vazio, mesma política de telefone/e-mail |
| **2 · palpite** (`sugerirPorNome` → `confirmarSexos`) | Haiku olhando o primeiro nome | **não** — sugestão efêmera; só o clique de gente grava |

- **`backend/utils/sexoDeclarado.js`** = régua PURA no gate
  (`src/test/sexoDeclarado.test.ts` · 19 casos · 2 mutantes RODADOS: conflito
  virando desempate mata 1, aceitar palpite ambíguo mata 2).
- ⚠️⚠️ **Divergência entre portas é CONFLITO, nunca desempate.** Se o
  voluntariado diz masculino e o batismo diz feminino, uma das duas está errada
  — ou são duas pessoas fundidas por engano. Escolher "a primeira" ou "a mais
  recente" grava um erro com cara de dado. Vai pra decisão humana, DECLARADO na
  tela.
- ⚠️ **Nome unissex tem que voltar `ambiguo`** e ambíguo NÃO vira sugestão.
  Aceitar confiança 'media' transformaria a fila numa fila de erros plausíveis —
  parecem certos e ninguém confere.
- ⚠️ **Só o PRIMEIRO NOME vai ao modelo** (LGPD · minimização): sobrenome não
  ajuda a decidir sexo. E nomes repetidos viram UMA pergunta ("Maria" ×300) —
  o palpite é sobre o nome, não sobre a pessoa.
- ⚠️ **A sugestão NÃO é persistida** (sem tabela de fila): fila de sugestão
  envelhece — a pessoa declara pelo censo e a linha antiga continua propondo o
  contrário. Recalcular custa centavos; divergir custa um cadastro errado.
- ⚠️ **Nasce tudo DESMARCADO** na tela: marcar por padrão faria um clique gravar
  centenas de palpites que ninguém leu, que é o que a confirmação existe pra
  impedir.
- ⚠️ **A origem fica registrada** em `mem_identidade_observacoes`
  (`sexo_colhido_porta` × `sexo_inferido_ia`): sem isso, em um ano ninguém
  distingue o que a pessoa declarou do que foi palpite confirmado — e é essa
  distinção que permite rever a decisão se ela se mostrar ruim.
- ⚠️ Endpoints em `grupos.js` **nível 5** e restritos ao **universo de grupos**
  (`apenasIds`): um endpoint guardado por `grupos` não pode escrever `genero` —
  a régua que decide quem entra em grupo de Homens/Mulheres — em quem nunca
  passou por um grupo.
- ⚠️ **`mem_cadastros_pendentes` ficou FORA das fontes**: a única ligação dela
  com o cadastro é `duplicado_de_id`, que existe só quando a linha foi marcada
  como duplicata — não é vínculo de identidade, e colheria o sexo de uma pessoa
  pro cadastro de outra sempre que aquela marcação estivesse errada.

**Migration `20260814160000`**: `genero = ''` vira NULL e M/F vira canônico.
⚠️ Não é cosmético — "sem sexo" tinha DUAS formas, e `.is('genero', null)` (a
guarda que impede sobrescrever declaração alheia) **não pega string vazia**:
a pessoa apareceria em "faltam dados" e a gravação seria recusada em silêncio,
reportada como "já tinha sexo". Ausência tem uma forma só.

## ⚠️⚠️ A foto do app NUNCA chegava ao ERP · `avatar_url` × `foto_url` (2026-08-13 · migration `20260814130000`)

Pedido do Matheus: *"gostaria que na lista de pessoas tivesse a foto da pessoa
(avatar); essas fotos vão vir do app de membros, com o tempo que as pessoas
forem usando e colocando suas fotos de perfil."*

⚠️ **O avatar JÁ estava desenhado** (aba Pessoas do /grupos, lista da Membresia,
roster, ficha) — o que faltava era o DADO chegar, e ele nunca chegaria: o app
grava **`profiles.avatar_url`** (bucket `avatars` · `POST /api/app/membro/foto`)
e o ERP inteiro lê **`mem_membros.foto_url`**. As duas colunas nunca se
encontravam. Medido: **17 fotos já subidas e invisíveis** pra igreja.

- O endpoint passou a **propagar** pro cadastro. **SOBRESCREVE** de propósito (não
  é só-onde-vazio como o censo): é a própria pessoa escolhendo a foto dela,
  autenticada — a fonte mais forte que existe pra este campo.
- ⚠️ Liga por **`profiles.membro_id` explícito**, nunca por `resolveMembroApp`: o
  fallback por e-mail dele existe porque família compartilha caixa, e ali a foto
  do filho pousaria no cadastro da mãe.
- ⚠️ **CONSEQUÊNCIA DECLARADA**: `mem_membros.foto_url` de quem é **LÍDER** já
  aparece no cartão público de inscrição (`publicGrupos` · `lider_foto`) — a foto
  de perfil de quem lidera grupo passa a estar na página pública. Não é canal
  novo (o formulário público e o cadastro de membresia já alimentam essa coluna),
  mas é alcance que a pessoa não escolheu. Separar exige coluna própria pro
  cartão, não desligar a propagação.
- Estado depois do backfill: **33 de 3.995 membros com foto** · 2 pessoas com
  foto no app e sem vínculo `membro_id` (resolvem sozinhas quando completarem o
  cadastro e trocarem a foto — o backfill é idempotente e pode rodar de novo).

⚠️ **Régua de método que fica**: "o avatar não aparece" parecia pedido de UI e era
**bug de encanamento**. Antes de construir a tela, conferir se o dado que ela
mostraria **existe e chega** — a tela estava pronta havia meses.

## ⚠️⚠️ Dashboard Semanal · a presença do NEXT vinha da camada MORTA (2026-08-11 · migration `20260811150000`)

Pedido do Matheus na aba NEXT: *"a presença do next seja inputada de forma
automática aqui, a partir da presença das pessoas."*

**O automático existia e lia a camada APOSENTADA.** `next-presenca-mensal`
(`dashboardSemanal.js`) contava `next_inscricoes.check_in_at` com o mês de
`next_eventos` — o modelo anterior ao cutover de turmas (17/06/2026). Medido:

| camada | última data com presença |
|---|---|
| `next_inscricoes.check_in_at` (a que o painel lia) | **2026-04** |
| `next_presencas` (a chamada real · matrícula × encontro) | **2026-08** |

Daí mai/2026 em diante nascer "sem dado" e jun/jul terem sido **digitados na
mão**. É a MESMA doença do #2288 (que consertou as rotas `/next/*` do app) e da
Edge Function `notify-lembretes`: consumidor apontado pra camada morta.

- **`vw_next_presenca_mes`** conta **PESSOAS distintas** por mês do ENCONTRO.
- ⚠️⚠️ **O histórico DIMINUI e está certo**: o legado contava **LINHAS**
  (participações — a mesma pessoa nos 2 encontros do mês contava 2) e a pergunta
  do card é quantas PESSOAS estiveram. set/2025 eram **44 linhas de 31 pessoas**.
  Quem comparar com print antigo vai achar que sumiu dado; não sumiu.
- ⚠️ **Medido ANTES de escrever**: a união com a camada legada é **idêntica** à
  view em todos os meses (o backfill da `20260729190000` já subiu o legado) —
  ler só da view não perde histórico nenhum. Sem essa medição, o desenho natural
  seria um `UNION` que traria dupla contagem de volta.
- ⚠️ **Matrícula soft-deletada fica FORA** (a equipe apaga duplicata/teste) e a
  identidade é `membro_id` com fallback na matrícula (151 de 1.998 sem membro):
  sem chave, contar 2 é menos grave que fundir gente diferente.
- ⚠️ **Falha de consulta NÃO vira zero**: devolve `aviso` e a aba mostra faixa
  âmbar. "Ninguém foi ao NEXT" é a leitura errada de uma query que falhou.
- ⚠️ **O ajuste MANUAL continua vencendo o automático** — e agora a tela mostra a
  chamada AO LADO dele, senão o manual vira número que ninguém revisita.
  jul/2026: manual 35 × chamada 34. **jun/2026: manual 66 × chamada 24** — lista
  contada à mão que nunca virou chamada no sistema; o manual dele FICA.
- ⚠️ `next_presencas` tem `presente boolean` e hoje **0 linhas com false** — o
  filtro está lá pela semântica, não porque haja ausente gravado.
## ⚠️⚠️ O SINO DE GRUPO no app do membro (2026-08-11 · migration `20260811150000`)

Autorizado pelo Marcos (item 3 dos 16 apontamentos): *"pode ligar claude"*.

**Medido antes de escrever: 459 pedidos de grupo desde 01/07 e `app_notificacoes`
(825 linhas, 8 tipos) com ZERO de qualquer tipo de grupo.** O líder nunca soube
pelo app que alguém pediu pra entrar no grupo dele — e é ele quem deve LIGAR pra
pessoa antes de aprovar (lei dos templates v2, 29/07).

### ⚠️⚠️ São DUAS tabelas e DOIS vocabulários — INVERTIDOS

| | tabela | tipo emitido | quem lê |
|---|---|---|---|
| `notificar()` | `notificacoes` | **`pedido_grupo`** | ERP web + app do STAFF |
| `notificarApp()` | `app_notificacoes` | **`grupo_pedido`** | app do MEMBRO |

Copiar o tipo de um pro outro faz o aviso chegar e **não abrir tela nenhuma**.
`utils/avisoGrupoApp.js` é a régua (no gate, mutation-testada) e
`services/gruposAvisoApp.js` o serviço — **um só**, porque são CINCO origens
(formulário público, app, tela interna do /grupos, totem, cadastro de membresia)
e cinco cópias é a doença que este módulo já teve.

⚠️ **`grupo_pedido` é o ÚNICO ligado agora**, e é decisão: é o único tipo que os
DOIS mapas do app já roteiam (`notifTap.ts` + o `abrir()` de `notificacoes.tsx`,
mais ícone e categoria) ⇒ **chega por merge, no binário que já está no campo, sem
esperar OTA**. Os outros eventos de grupo entram depois da unificação dos mapas —
ligar antes faria o aviso cair em "Outros" e o toque não levar a lugar nenhum.

### ⚠️⚠️ `donosDoGrupo` EXCLUI quem tem o app — por construção

`gruposDestinatarios.donosDoGrupo` filtra `is_membro_only` de propósito (linha em
`notificacoes` pra conta só-de-membro é linha que ninguém abre). Usá-la pra
alimentar o app entregaria **zero avisos**. A irmã `donosDoGrupoApp` não tem esse
filtro — e é **superconjunto, não espelho**: conta de staff também pode ter o app
instalado, e exigir `is_membro_only = true` excluiria esse líder. Quem separa os
dois apps no push é o agrupamento por `projeto_id` do `lotesDePush`.

⚠️ **Alcance real, medido: dos 89 líderes de grupos ativos, 15 têm conta no app e
6 têm push token** (os 42 tokens da base são 100% iOS — Android sem Firebase).
Lista vazia é o caso COMUM aqui, não erro; o WhatsApp segue alcançando os 89.

### `chave_dedup` em `app_notificacoes` (a tabela não tinha dedup nenhum)

A irmã do ERP tem `chave_dedup` desde sempre; a do app nasceu sem — não havia
como escrever escritor idempotente. Agora `notificarApp({chaveDedup})` amarra o
aviso ao FATO (`grupo_pedido:<id do pedido>`).
⚠️ **Índice ÚNICO e SEM PREDICADO**: `ON CONFLICT` do PostgREST não infere índice
parcial (lição do `mem_censo_convites`, 04/08). Seguro porque `NULLS DISTINCT` é
o padrão — as 825 linhas legadas e os avisos sem fato único nunca conflitam.
⚠️ **O que ela NÃO resolve**: a Edge Function `notify-grupo-pedido` está
**DEPLOYADA** (sonda de 11/08: 401, não 404) e insere sem `chave_dedup` ⇒ se o
webhook dela for ligado, duplica mesmo assim. Fechar exige mexer nela ou derrubar
o trigger — o diagnóstico está no fim da migration, pendente de olho humano.

### Consertos que a revisão adversarial pegou (e valem além disto)

- ⚠️⚠️ **O resgate linha-a-linha do `notificarApp` reusava a query que acabara de
  falhar** — em erro de coluna ele repetiria o mesmo erro em cada linha e o log
  culparia `chave_dedup` no lugar da causa real (um `user_id` órfão viola a FK de
  `auth.users` e derruba o LOTE; é pra salvar os válidos que o resgate existe).
  Agora o resgate **herda a forma** da última tentativa, tem **teto de 25** (a
  mesma função serve o broadcast de 500 do evento publicado) e a guarda é por
  **código** (`42703`/`PGRST204`/`42P10`), não por texto de terceiro — `42P10`
  não cita `chave_dedup` e passaria batido.
- ⚠️⚠️ **`fetch` da Expo ganhou timeout de 8s** (`AbortSignal.timeout`). Desde
  hoje essa cadeia é AWAITED no formulário público de grupos: sem teto, exp.host
  lento seguraria quem está se inscrevendo até o `maxDuration`, e a pessoa veria
  ERRO num pedido que FOI gravado — o dano exato que a lei do awaited evita.
- ⚠️ **`membresia.js` chamava `donosDoGrupo` SEM NUNCA TER IMPORTADO** —
  ReferenceError latente em `/totem/grupos/:id/entrar`. O insert roda antes do
  erro, então o primeiro uso real gravaria o pedido e responderia 500. Medido:
  **0 pedidos com origem `totem`** na base (570 do formulário público, 2 do app),
  ou seja a rota nunca foi exercitada. Achado ao ligar o sino.

⚠️ **Risco residual declarado**: `donosDoGrupoApp` resolve `mem_grupos.lider_id`
e **não confere o roster** — e 30 dos 97 grupos ativos têm a principal fora dele
(follow-up de 31/07, ainda aberto). Não é regressão (o WhatsApp já tinha o risco);
a diferença é que agora chega numa tela navegável. E o corpo do aviso cita o
primeiro nome de quem pediu + o nome do grupo, que aparece na tela de bloqueio.

## Devocionais · módulo do Matheus (no ar)

Módulo existe e roda: `backend/routes/devocionalPlanos.js` (CRUD + geração de
conteúdo por IA · exige `passagem_texto` no JSON) e `devocionalMembro.js`
(webapp do membro · `resolveMembro` por `profile.membro_id`/email — funcionários
RH foram sincronizados pra `mem_membros`). Migrations `devocional_planos`/
`devocional_envios`. Texto bíblico via **API.Bible** (`BIBLE_API_KEY` no Vercel
· chave antiga rotacionada · fail-closed 503 — PR #913); traduções ARA/NAA/NTLH.
Decisão de pesquisa (2026-05-19): YouVersion descartado como backend (API não
expõe progresso · scraping viola ToS) — pesquisa completa + spec original no
legado (o schema implementado difere da spec). **Dono do módulo é o Matheus —
não mexer sem alinhar.**

## Agente Executor Financeiro · Worker Railway (2026-05-26)

Primeiro agente "ativo" (propõe ações via tool use · humano aprova). Roda no
**Railway** (`agent-worker/` · processo persistente · Agent SDK + MCP
in-process) porque o serverless do Vercel não comporta agente long-running.
Vercel chama `POST /run/financeiro_executor` com HMAC; cron 3x/dia (9/14/19h
SP). Tools: 9 read-only + 4 propose (`propor_categorizar_transacao`,
`propor_pagar_conta`, `propor_decidir_reembolso`, `propor_atender_alerta`) —
**zero filesystem/bash**, allowlist explícita. Toda mutation vira linha
`pending` em `agent_queue` (com `action_label` + `reasoning`); humano aprova em
`/assistente-ia` > Fila de Aprovação → `POST /api/agents/queue/:id/apply` →
handler em `backend/agents/apply/financeiroApply.js` (→ applied/failed).

- **Regras absolutas do agente** (SKILL.md): nunca aplica direto · respeita
  closing mensal · sempre com reasoning ≥20 chars · só com evidência ·
  idempotência via `verificar_proposta_existente` · max 20 propostas/execução.
- **Envs**: Vercel `AGENT_WORKER_URL` + `AGENT_WORKER_HMAC_SECRET`; Railway
  `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, mesmo HMAC,
  `TZ=America/Sao_Paulo`, `SCHEDULER_ENABLED=1`. Custo ~$10/mês (Sonnet).
- **Plugar novo módulo**: skill + tools read/propose + agent + case no server +
  scheduler + apply handler no backend + `ACTION_META` em `FilaAprovacao.jsx`.
  `action_type` sempre `<modulo>.<verbo_obj>`. Deploy: `agent-worker/README.md`.
  ⚠️ As rotas de leitura de `agents.js` migraram pro cliente REST (pool pg não
  conecta no Vercel · PR #920).

## /novosite · prévia da home do novo site público (2026-05-30)

Rota PÚBLICA standalone `/novosite` (+ `/novosite/quem-somos`) fora do
AppShell, não-listada, noindex + `Disallow` no robots.txt — teste de layout do
redesign de cbrio.com.br. Chrome/estilos compartilhados em
`src/pages/public/novosite/shared.tsx` + `styles.ts`; fotos WebP + vídeo de
hero (só ≥768px sem prefers-reduced-motion). Links reais ligados (cbrio.org,
cbrio.tv, CBZap, Maps, Next inscrição). ⚠️ **Armadilhas CSS · não regredir**: o
reset `.ns a{color:inherit}` vence classes simples — menu branco exige
`.ns-header .ns-nav-link`/`.ns-logo` e botões usam dupla classe
`.ns-btn.ns-btn-*`; centralizar CTA via `.ns-cta .ns-hero-actions`.

## Decisões pontuais de pessoas/permissões (maio-junho/2026)

- **Juninho (presidente) vê só 3 telas** (Dashboard · Monitoramento OKR ·
  Dashboard Semanal): conta ativa `juninho.lit@cbrio.org`, role rebaixado pra
  `assistente` (frontend trata admin/diretor como vê-tudo), matriz do cargo
  `pastor-presidente` zerada, cargo de exibição preservado. Monitoramento OKR
  virou item sem-módulo; Integração/Grupos ganharam `module:` no menu; aba
  Financeiro do Dashboard Semanal gateada por `canFinanceiro`. Pós-mudança de
  matriz: bust de cache + logout/login.
- **Acesso base (role) editável na UI** de Usuários: `PUT
  /api/permissoes/usuario/:id/role` (admin/diretor · valida CHECK
  `assistente|admin|diretor` · anti-autoescalação `bloqueiaAutoEdicao` · `:id` é
  UUID do profile, atualiza `profiles` direto). Mudança exige logout/login.
- **Cargo `supervisor-jornada` (Marcelo Soares)**: rede de segurança da jornada
  — nível 3 SEM `escopo_proprio` em integracao/cuidados/online/kids/ami/bridge/
  next/voluntariado/membresia/grupos/dados-brutos/minha-area (vê TODAS as
  áreas, diferente do assistente-ministerial que só vê a sua).
- **`/perfil` mostra o cargo do sistema granular** (`granular.cargoNome` via
  my-permissions), não o `profile.role` legado — o role continua usado em
  outros pontos, não mexer.
- **Modal de culto exibe vazio em vez de 0** (helper `exibir(v)` em
  `CalendarioCultos.jsx`) — schema tem DEFAULT 0 e o 0 atrapalhava digitação;
  trade-off aceito pelo Marcos.
- **Nomes**: "Juninho" como display na conta oficial; "Lorena" (não Alda
  Lorena) em profiles/usuarios/text-mirrors — ⚠️ renomear pessoa exige
  atualizar `projects.leader/responsible` etc. (filtro `escopo_proprio` compara
  por nome enquanto a migração pra UUID não termina); Pr. Pedrão não tem conta.

## Permissões · mecanismos vivos (consolidado de maio/2026)

A fonte de verdade de permissão é **cargo + matriz + overrides** (seção
"Permissoes · matriz cargo x modulo" abaixo). Mecanismos que complementam:

- **Boost por área** ⭐ (`AREA_MODULO_BOOST` em `backend/middleware/auth.js` +
  espelho SQL em `current_user_module_level()`): 1 cargo genérico + N áreas =
  acesso modular. Área da pessoa (em `usuario_areas`, normalizada sem acento)
  escala o módulo correspondente pra nível 5. Mapa atual: cuidados, grupos,
  integracao, voluntariado, next, online, kids, ami, bridge, marketing,
  producao. Pra novo módulo no padrão: adicionar no map JS **e** na função SQL.
- **`ROUTE_MODULE_MAP`** (auth.js) mapeia routeKey → slugs; toda rota nova
  precisa de entrada. Backend: `authorizeModule('slug', nivel)` (não
  `authorize('admin','diretor')` — lição dos guards de Grupos). Frontend:
  `ModuleGuard moduleSlug="x" nivelMinimo={n}` em App.tsx; itens de menu usam
  `module: 'slug'` (aparece com leitura ≥1) em vez de hooks `canX` legados.
- **Cache da matriz = 5 min** no middleware. Depois de mexer em matriz/área via
  SQL direto: `POST /api/permissoes/cache/bust` (ou botão em
  `/admin/permissoes`) + logout/login do afetado (JWT).
- **`usuarios.id` é INTEGER legado; profiles usa UUID** — endpoints de
  permissões resolvem via `resolverUsuarioId()` (lazy-create por email).
  Profiles antigos foram backfillados em `usuarios` (sync por email · coluna
  `nome` NOT NULL).
- **`escopo_proprio`**: em projetos filtra a lista pela área do usuário
  (`p.area in userAreas`); em eventos trata como "líder" no kanban (entra
  filtrado pela área mesmo com nível <3).
- **UI**: `/admin/permissoes` (matriz por célula + aba Usuários com cargo,
  áreas e overrides com expiração). O diário completo da implantação
  (atribuições em massa, fixes pessoa a pessoa, limpeza de código morto) está
  no legado.

## Permissoes · matriz cargo x modulo (reuniao Marcos Paulo · 2026-05-18)

A matriz aprovada vive em duas tabelas (Supabase):

- `cargo_modulo_permissao` · **default por cargo** (matriz que veio da
  planilha · source of truth). Linha por (cargo, modulo) com nivel 0-5
  + modificadores (`pode_exportar`, `pode_aprovar`, `escopo_proprio`).
- `permissoes_modulo` · **override por usuario** (excecao individual).
  Tem os mesmos campos + `motivo` e `expira_em` (override temporario).

A view `vw_permissao_efetiva` ja faz o fallback `override -> default
do cargo -> 0`. Quando precisar consultar permissao efetiva, usa essa view
ao inves de juntar manualmente.

### Niveis 0-5

- `0` Sem acesso · modulo nao aparece no menu nem responde a URL
- `1` Ver (so leitura)
- `2` Ver + preencher dado bruto (lancar numeros)
- `3` Ver + editar (CRUD)
- `4` Ver + editar + deletar
- `5` Admin do modulo (configura regras, metas, seeds, deleta tudo)

### Modificadores

- `pode_exportar` (`+E`) · exportar dados (CPF, telefone, financeiro · LGPD)
- `pode_aprovar`  (`+A`) · aprovar workflows daquele modulo (ex: despesa)
- `escopo_proprio` (`*`) · acesso so da propria area / valor / setor

### 25 cargos (slugs)

`pastor-senior`, `pastor-presidente`, `diretor-administrativo`,
`coordenador-estrategia`, `diretor-ministerial`, `diretor-criativo`,
`lider-ministerial`, `assistente-area`, `assistente-ministerial`,
`coordenador-financeiro`, `assistente-financeiro`,
`coordenador-marketing`, `assistente-marketing`,
`lider-producao`, `assistente-producao`,
`lider-operacoes`, `lider-logistica`, `assistente-logistica`,
`assistente-operacoes`,
`diretor-rh`, `coordenador-voluntarios`, `voluntario`, `membro`,
`conselho`, `dev`.

### 30 modulos (slugs)

- **Estrategica**: `dashboard`, `painel-cbrio`, `minha-area`, `gestao`,
  `planejamento`, `ritual`, `governanca`, `revisao-estrategica`
- **Ministerial**: `integracao`, `cuidados`, `online`, `next`,
  `voluntariado`, `membresia`, `grupos`
- **Operacional**: `eventos`, `projetos`, `expansao`, `rh`, `financeiro`,
  `logistica`, `patrimonio`, `solicitacoes`
- **Dados / IA / Admin**: `dados-brutos`, `nps`, `notificacoes-config`,
  `assistente-ia`, `cerebro`, `perfil`, `permissoes-admin`, `usuarios-admin`

### Backend · como usar

```js
const { authorizeModule } = require('../middleware/auth');
// Bloqueia acesso ao endpoint se o usuario nao tiver nivel >= 2 em /financeiro
router.use(authenticate, authorizeModule('financeiro', 2));
```

`ROUTE_MODULE_MAP` em `backend/middleware/auth.js` mapeia routeKey -> slugs
de modulo. Quando criar rota nova, adicionar entrada la.

`req.user.granular.modulePerms[slug]` retorna
`{ leitura, escrita, pode_exportar, pode_aprovar, escopo_proprio }`.

### Frontend · como usar

```jsx
const { canFinanceiro, canMembresia, getAccessLevel } = useAuth();
if (!canFinanceiro) return <Navigate to="/dashboard" />;
const nivel = getAccessLevel(['financeiro']);
```

Hooks ja definidos em `src/contexts/AuthContext.jsx`: `canRH`, `canFinanceiro`,
`canLogistica`, `canPatrimonio`, `canMembresia`, `canProjetos`, `canExpansao`,
`canAgenda`, `canIA`, `canKPIs`, `canCuidados`, `canSolicitacoes`, `canNPS`,
`canDadosBrutos`, `canPainel`.

### Overrides com expiracao

`permissoes_modulo.expira_em` permite override temporario (cobrir licenca,
projeto pontual). Quando expira, o usuario volta automaticamente para o
default do cargo. O middleware filtra overrides expirados antes de compor
a permissao efetiva.

### Endpoints admin (`/api/permissoes/*`)

- `GET /matriz` · matriz completa (cargos, modulos, celulas)
- `PUT /matriz/celula` · editar uma celula da matriz (default por cargo)
- `GET /cargo/:id` · detalhe + celulas de um cargo
- `GET /usuario/:id` · permissoes efetivas + overrides + areas
- `PUT /usuario/:id/cargo` · trocar cargo do usuario
- `PUT /usuario/:id/modulo` · criar/atualizar override por modulo
- `DELETE /usuario/:id/modulo/:moduloId` · remover override

Todos exigem `authorize('admin','diretor')`. Ao editar matriz ou override,
o cache do middleware e' invalidado automaticamente.

## Membro Modelo — Fluxo da jornada nos 5 valores

A migration `20260430130000_membro_modelo_completo.sql` fechou os 4 gaps
do fluxo de membro, conectando os módulos ponta a ponta:

```
visitante (int_visitantes)
   ├── fez_decisao=true → [trigger] cria mem_membros + trilha 'conversao'
   │                          → KPI INTG-01, CBA-01 sobem (auto)
   │                          → Jornada mostra +1 em "Seguir Jesus"
   ├── inscreve no batismo (batismo_inscricoes)
   │
   └── batismo realizado (status='realizado')
                              → [trigger] trilha 'batismo'
                              → mem_membros.status = 'membro_ativo'
                              → int_visitantes.status = 'batizado'
```

**Tabela nova:** `mem_devocionais` (gap 3) — alimenta KID-04 via
`devocionais.familias` collector. Endpoint: `/api/devocionais` (CRUD +
stats). Cliente: `devocionais` em `src/api.js`.

**Cálculo dos 5 valores** (em `backend/routes/jornada.js`):
- **Seguir Jesus**: `mem_trilha_valores.etapa IN ('conversao','primeiro_contato','batismo')` + concluida
- **Conectar**: `mem_grupo_membros.saiu_em IS NULL`
- **Investir Tempo**: `cui_jornada180.data_encontro` nos últimos 90d (futuro: também `mem_devocionais`)
- **Servir**: `mem_voluntarios.ate IS NULL`
- **Generosidade**: `mem_contribuicoes.data` nos últimos 90d

**Membro Modelo**: derivado em tempo real pelo Jornada como
`COUNT(valores) >= 2` por membro. Não tem flag/coluna — é calculado.

## KPI Auto-Collector (separação AMI/Bridge)

`backend/services/kpiAutoCollector.js` agora tem coletores separados:
- `cultos.ami_freq` / `cultos.ami_conv` → AMI-01 / AMI-02
- `cultos.bridge_freq` / `cultos.bridge_conv` → AMI-05 / AMI-06
- `cultos.amibridge_*` ficam como DEPRECATED (não usar em fonte_auto novos)

Filtros em `isAmiCulto` (AMI ou sábado, exclui Bridge) e `isBridgeCulto`
(qualquer culto com 'bridge' no nome). Ajustar se nomenclatura de
cultos mudar.

## ⚠️ EM CURSO · mudança dos cultos de DOMINGO · handoff pro MARCOS PAULO (2026-08-05)

A partir da semana de **24/08/2026** (segunda — para o domingo **30/08** já sair
no formato novo), o domingo passa de **4 para 3 cultos**: o **08:30 encerra** e
passa a existir um **09:30**. Quarta, AMI e Bridge **não** mudam.

**Contexto COMPLETO — ler antes de tocar em qualquer coisa de culto de domingo:
`docs/cultos-domingo/contexto-e-plano.md`** (estado medido, decisões e plano) **+
`docs/cultos-domingo/varredura-2026-08-11.md`** (inventário de 113 achados, 53
confirmados em verificação adversarial · **é a fonte para executar**).

⚠️ Os 5 achados que mais matam, da varredura:

1. **O voluntariado DESCARTA culto desconhecido, não zera.** A régua é prefixo de
   texto do nome, em **5 cópias**, nenhuma com `'Domingo 09%'` → check-in
   desaparece do dashboard **sem erro, sem log e sem zero visível**. A correção
   vai ao ar **ANTES** de o tipo existir.
2. **`POST /service-types` descarta `has_kids`/`has_online`/`presencial_label`** →
   tipo criado pela UI nasce sem Kids e **nenhuma criança faz check-in**, sem
   caminho de UI para ligar. O tipo novo **nasce por SQL**.
3. **Existem 4 fontes de horário sem FK**: o catálogo, o snapshot em
   `cultos.hora`/`nome`, o `fin_culto_slots` (que roteia dízimo pra conta
   contábil) e o `batismo_horarios` (porta pública). ⚠️ **09:30 cai EXATAMENTE na
   fronteira de dois slots financeiros** — o dízimo de um culto parte em duas
   contas de cultos extintos, por trigger.
4. **72 cultos futuros já gravados** com hora antiga · `gerar_cultos_recorrentes`
   é INSERT-ONLY e **nunca corrige** · `cultos.hora` está fora da allowlist do
   `PUT /cultos/:id` (só por SQL).
5. 🔴 **`DELETE /service-types/:id` é guardado por `membresia` nível 1 (LEITURA)**,
   alcançável por 27 cargos: um clique anula `service_type_id` em **209 cultos**
   (saem dos KPIs) e apaga em CASCADE roteiro de produção, checklist e o vínculo
   do template de escala. **Nunca usar "Remover" em tipo de culto.**

O essencial para não fazer besteira:

- ⚠️ **NADA foi executado ainda** (nem migration, nem dado, nem código) e há
  **5 perguntas abertas** com o Matheus que travam a execução.
- ⚠️ **NÃO renomear `name` nem `recurrence_time` de tipo existente.** A decisão do
  Matheus é ter **duas lentes** — "o 10:00 virou 09:30" (continuidade) **e** "o
  09:30 nasceu novo, o 10:00 encerrou" (separada) — como FILTRO, porque a
  diretoria vai escolher o caminho com o tempo. Renomear queima a lente separada.
  O caminho é **criar o `Domingo 09:30` como tipo novo + linhagem explícita**
  ligando 10:00 → 09:30.
- ⚠️ **NUNCA deletar `vol_service_types`.** `producao_roteiro_etapas.service_type_id`
  é **ON DELETE CASCADE** — apagar o tipo apaga o roteiro de produção em cascata.
  O 08:30 é **encerrado**, nunca deletado.
- **A tabela de slots logo abaixo desta seção descreve o formato ATUAL (4 cultos)
  e continua válida até 23/08/2026.**
- **Turno já existe** — reusar os blocos da migration `20260705140000`
  (Domingo Manhã / Domingo Noite / Quarta / AMI / Bridge), não inventar um segundo
  vocabulário. É o que o Dashboard Semanal já usa no voluntariado.
- ⚠️ **A média por culto sobe ~33% por aritmética** (mesmo público, denominador
  menor: ~440 → ~587 · medido nos últimos 10 domingos). Imunes à mudança: total
  absoluto, por turno, por domingo. Por isso a data da mudança tem de ficar
  **marcada nos gráficos**. Nos níveis de turno e de domingo as duas lentes dão o
  MESMO número — a divergência existe só na visão por culto.
- **`cultos.hora` existe e está 100% preenchida**, mas quase todo o sistema exibe
  o `recurrence_time` do TIPO (`totemKids.js` 14×, `voluntariado.js` 12×,
  `dashboardSemanal.js` 9×, `kpis.js` 6×…). Só o `CalendarioCultos.jsx` mostra a
  hora da própria linha do culto. É isso que faz rename reescrever o passado na
  tela mesmo com o dado correto guardado.

**Atualização 11/08 · decisões do MARCOS PAULO (detalhe no §11 do
`contexto-e-plano.md` — as "perguntas abertas" citadas acima FECHARAM, menos o
plano de contas):** eventos especiais (batismo/bebês/ativações) →
**09:30 primário, overflow 11:30 por limite** (no batismo o overflow já é
automático: GET esconde lotado + POST recusa 409 · **limite medido em prod:
11**, não 8 · ⚠️ 11:30/19:00 têm `limite=NULL` = nunca lota — definir ao abrir
· ⚠️ batismo via APP fura a lotação, fan-out sem horário/limite); **bebês SEM
limite por ora = sempre 09:30** (helper com limite NULL pra ligar o overflow
depois · 3 portas de escrita divergentes hoje · prazo 13/09); plano de contas
ABERTO com **deadline 20/08** (fallback interino: slot 09:30 → contas do
10:00); pedidos do **Pr. Juninho**: **3ª lente "consolidação"** (08:30+10:00
somados vs 09:30 — exige 2ª chave de agrupamento além da linhagem, e somar POR
SEMANA antes da média) + % de ocupação sempre ao lado da frequência total de
domingo; **capacidade oficial = 1050** (térreo; os 1300 da `vw_culto_stats`
não são a régua) com **fonte única a criar** (hoje hardcoded em ≥6 pontos);
indicador novo de **ocupação sobre lugares OFERECIDOS** (só adulto ÷
1050×cultos vigentes — conserta o gauge que divide a semana por 1050);
**catálogo central de cultos = projeto de setembro**, não entra no corte.
Divisão de frentes: Matheus segue dono dos 4 arquivos em disputa (lentes);
Marcos Paulo leva bebês/batismo/apps/ocupação.

## Cultos recorrentes — slots fixos e identidade única

Os horários de culto vivem em `vol_service_types` com `recurrence_day`
(0=Dom … 6=Sáb) + `recurrence_time`. A função
`gerar_cultos_recorrentes(data_inicio, data_fim)` materializa rows em
`public.cultos` para cada ocorrência no range — idempotente, pula slots
que já existem.

### Slots vigentes e config do modal

`vol_service_types` tem 3 colunas que configuram o `ModalCulto`:
- `presencial_label` (texto) · label do input de presencial
- `has_kids` (bool) · mostra campo Kids
- `has_online` (bool) · mostra decisoes_online + bloco Transmissão online

| Service Type | Dia | Hora | Presencial label | Kids | Online |
|--------------|-----|------|------------------|------|--------|
| Domingo 08:30 | Dom (0) | 08:30 | **Sede** | ✓ | ✓ |
| Domingo 10:00 | Dom (0) | 10:00 | **Sede** | ✓ | ✓ |
| Domingo 11:30 | Dom (0) | 11:30 | **Sede** | ✓ | ✓ |
| Domingo 19:00 | Dom (0) | 19:00 | **Sede** | ✓ | ✓ |
| Quarta com Deus | Qua (3) | 20:00 | Presencial | ✓ | ✓ |
| Bridge | Sáb (6) | 17:00 | Presencial | — | — |
| AMI | Sáb (6) | 20:00 | Presencial | — | ✓ |

Para adicionar um novo tipo de culto: `INSERT INTO vol_service_types
(name, recurrence_day, recurrence_time, presencial_label, has_kids,
has_online, color)`. Modal adapta automaticamente · não precisa
mexer no React.

### Identidade única do culto

- `cultos.id` é `uuid PRIMARY KEY DEFAULT gen_random_uuid()` — cada row
  tem ID único naturalmente.
- **UNIQUE (service_type_id, data)** em `cultos` garante que não exista
  2 rows pro mesmo slot lógico. Migração:
  `20260514110000_ami_sabado_20h_unique_culto.sql`.
- Série histórica de indicadores por culto cruza `cultos.service_type_id`
  com `cultos.data` sem ambiguidade — `(service_type_id, data)` é
  chave estável.

### Regras e decisões vigentes (condensado · detalhes no legado)

- **Contagem de visitantes descontinuada** (2026-05-14 · decisão do Marcos):
  UI removida (abas Visitantes/Pendentes, campos do modal); schema preservado
  (`cultos.visitantes`, `int_visitantes`). Coletor `cultos.conv_visit` soma só
  decisões. Tabs vigentes de `/integracao`: Cultos · Frequência · Decisões ·
  Batismos · Histórico.
- **KPIs só-visualização ficam fora do painel NSM** via `valores = '{}'::text[]`
  (array vazio passa no isArray mas não casa nenhum valor da Jornada). Padrão
  usado nos KPIs do Online (`ON-AUD-01`/`ON-DS-01`/`ON-DDUS-01` · aparecem só
  em `/minha-area`) e nos `PROD-CULTO-*`.
- **Recálculo de KPI em tempo real por trigger SQL**: `kpi_calcular_valor_auto`
  + `kpi_recalcular_para_data` + triggers em `cultos` e `batismo_inscricoes`
  (20260514210000). Latência zero; editar culto antigo recalcula o período
  daquele culto. Backend só limpa o cache do `/painel`.
- **Decisões · aba única com toggle** Por culto | Pessoas (CPFs) — a aba
  "Pessoas decididas" separada foi removida (2026-05-14). Lista de pendências
  lê `vw_nsm_sem_dados`.
- **Cadastro flexível na decisão**: obrigatórios só nome + telefone (11
  dígitos); CPF/nascimento/email opcionais → badge `incompleto` + endpoint
  `GET /api/kpis/decisoes-pessoas/incompletos` pro censo posterior. Trigger
  resolve/cria membro com o que houver.
- **Decisão Kids (LGPD)**: `tipo_decisao='kids'` guarda nome da criança + dados
  do RESPONSÁVEL; triggers pulam criação de membro/trilha/nsm_eventos —
  criança fica fora do NSM (motivo real: a jornada não avança pra ela, não só
  LGPD). Campo agregado `cultos.decisoes_kids`.
- **Cutoff temporal "de hoje pra cá" (18/05) foi REVERTIDO em 2026-06-09**
  (migration `20260609160000`): com a NSM em janela móvel de 90d, o cutoff
  escondia gap que JÁ contava no denominador do card. A `vw_nsm_sem_dados`
  cobre tudo; o recorte de período é do consumidor.
- **Membros duplicados**: detecção pela `vw_membros_duplicados` (CPF/nome+nasc/
  telefone/email/trigram) + `mem_duplicados_ignorados` + função
  `merge_membros(keep, merge_ids[], ...)` (migra FKs de 9+ tabelas, enriquece o
  keep, loga snapshot em `mem_merge_log`). Aba Duplicados em
  `/ministerial/membresia`. Decisão: não impedir cadastro duplicado · juntar
  depois.
- **Cascata Seguir → KPIs por área**: coletores `cultos.{ami,bridge,sede,
  online,kids}_{freq,conv}` alimentam AMI/BRG/SED/ONL/KIDS-* filtrando por
  `service_type_name` (Bridge ≠ AMI · separado em 2026-05-21). Convertidos
  atendidos pertencem ao valor **'seguir'** (não 'investir').
- **KPIs semanais comparam YoY** (mesma semana do ano anterior · decisão
  2026-05-21, liturgias mensais distorcem semana-a-semana): 22 KPIs com
  `comparacao='ano_anterior'`; os 6 de batismo seguem `evento_anterior`;
  mensais/semestrais intocados. `_kpi_periodo_anterior` suporta YoY em todas as
  periodicidades.
- **NPS do culto**: `POST /api/painel-area/:area/nps` (nível ≥3) faz UPSERT em
  `dados_brutos` tipo `nps_culto` → KPIs CULTO-NPS-* recalculam por trigger.
  Canal provisório até o módulo NPS rodar pesquisa pós-culto.
- **Histórico longo**: aba Histórico usa `vw_culto_historico_anual` (1 linha
  por ano×tipo · escala sem limit); visualizações usam react-query staleTime
  5min. Calendário semanal Dom–Sáb na aba Cultos.
- **Rotas dos módulos de culto na raiz** (`/online` `/kids` `/ami` `/bridge` ·
  2026-05-21): `<Navigate>` cobre os paths antigos `/ministerial/*`.
  `PainelArea.jsx` é o componente reusável (score de saúde + abas Cultos/Dados/
  Indicadores · aba Cultos lê `vw_culto_stats` filtrada por área — decisão:
  dado de culto vive em `cultos.*`, não em dados_brutos). Líderes:
  Kids=Mariane · AMI=Arthur Cecconi · Bridge=Lillian Xavier · Online=Renata.

### ⚠️ Meta absoluta × periodicidade do KPI · regra importante

**Sempre** que adicionar novo KPI tático com `tipo_calculo != 'manual'` E meta
cascateada via `aplicar_meta_institucional()`, lembrar:

- `aplicar_meta_institucional()` materializa `meta_valor_absoluto` SEMPRE em
  **escala anual** (baseline = ano anterior jan-dez × 1.30 / fator institucional).
- O **coletor automático** gera registros na **periodicidade do KPI**
  (semanal: soma da semana · mensal: soma do mês · etc).
- Comparar valor de UMA semana contra meta ANUAL gera percentual baixo falso
  (ex: 2.500 / 23.400 = 10.6% · vermelho falso positivo).

**Onde a normalização acontece**: `vw_kpi_trajetoria_atual` e
`vw_kpi_taticos_status` dividem `meta_valor_absoluto` pelo fator da
periodicidade do KPI:

| Periodicidade | Divisor |
|---------------|---------|
| `semanal`     | 52      |
| `mensal`      | 12      |
| `trimestral`  | 4       |
| `semestral`   | 2       |
| `anual`       | 1       |

Migration de referência: `20260515520000_normalizar_meta_periodicidade.sql`.

**Cuidados ao adicionar KPI novo:**
1. Decidir a **periodicidade** correta no `kpi_indicadores_taticos.periodicidade`
2. Garantir que o **coletor** (`fonte_auto` em `kpiAutoCollector.js`) retorna
   o valor agregado naquela periodicidade (semanal = 1 semana, não acumulado)
3. Se quiser meta **manual em escala não-anual** (ex: meta semanal direto),
   preencher `kpi_indicadores_taticos.meta_valor` SEM passar pela cascata
   (a view só normaliza quando `meta_valor_absoluto IS NOT NULL`)
4. KPIs com checkpoints granulares em `kpi_trajetoria` continuam com a meta
   do checkpoint (não passam pela normalização) · checkpoint já é por período

## ⚠️ Mandala · a média de FREQUÊNCIA divide por DOMINGO, não por semana (2026-08-12)

Pedido do Marcos: *"na mandala do sistema, preciso que na frequência (seguir a
Jesus) seja dividido pela quantidade de domingos do mês, e não semanas"*. Escopo
que ele mesmo delimitou quando perguntei: **"Só Média exibida. Mas apenas para
frequência isso"** e **"Apenas frequência q será dividido pelo número de
domingos"** — meta, semáforo e periodicidade de KPI **não** foram tocados.

A mandala é a do `/dashboard` (`MandalaCultura` → `GET /kpis/cultura`), não as 6
do `/painel` (aquelas pintam pétala por status de KPI e não exibem frequência).

**A distorção era real e sempre no mesmo sentido.** O divisor era o nº de semanas
ISO (seg→dom) com culto, e a semana das BORDAS do mês entra na conta trazendo a
**quarta** sem trazer o **domingo** dela. Janeiro/2026: a semana de 29/12–04/01
tem a quarta 01/01, mas o domingo dela (28/12) é de dezembro → 5 semanas contra 4
domingos. Medido em produção (presencial · online DS):

| mês | semanas | domingos | antes | depois |
|---|---|---|---|---|
| jan/26 | 5 | 4 | 1.809 · 3.608 | **2.262 · 4.510** |
| fev/26 | 5 | 4 | 1.715 · 3.830 | **2.144 · 4.787** |
| mar/26 | 5 | 5 | 2.416 · 5.107 | *(igual)* |
| abr/26 | 5 | 4 | 2.128 · 4.503 | **2.660 · 5.629** |
| jul/26 | 5 | 4 | 1.649 · 3.869 | **2.061 · 4.836** |

⚠️ **Evidência de que a régua nova é a que a equipe já usava**: o único lançamento
MANUAL de `cultura_mensal` (abril/2026) tem **`freq_presencial_semanal = 2660`** —
exatamente a média por domingo, não a por semana (2.128). O automático é que
divergia do número que a própria equipe escrevia à mão.

- **`backend/utils/divisorMandala.js`** = régua PURA no gate (13 casos em
  `src/test/divisorMandala.test.ts`). Conta **domingos DISTINTOS com culto**
  (são 4 cultos por domingo — contar linha daria 16) e cai no calendário quando
  o mês não tem culto nenhum. **Nunca devolve 0** — divisor zero viraria
  `Infinity` na tela.
- ⚠️ **Mutation-testado de verdade, não afirmado**: os dois mutantes foram
  rodados. (1) Voltar a contar semanas ISO → 4 casos vermelhos. (2) Trocar
  `getUTCDay()` por `getDay()` → vermelho **porque o teste força
  `process.env.TZ='America/Sao_Paulo'` dentro do caso** (com restauração no
  `finally`): o gate roda em UTC, onde os dois são idênticos, e sem forçar o
  fuso a guarda passaria despercebida. `2026-01-04T00:00:00Z` é sábado 21h no
  Rio — com `getDay()`, nenhum domingo do mês seria contado.
- ⚠️ **O NUMERADOR não mudou**: segue somando TODOS os cultos do mês (domingo,
  quarta, AMI, Bridge). Foi o pedido literal — só o divisor virou domingos.
  Trocar o numerador junto seria outra métrica ("frequência de domingo"), que
  ninguém pediu.
- A resposta ganhou **`domingos_no_mes`** (o divisor REAL); `semanas_no_mes`
  continua sendo publicado como informação do mês. Rótulo e divisor andam
  juntos no `PetalDetailDialog` ("Média presencial / domingo") — foi a
  divergência entre os dois que fez a média parecer baixa.
- **Valor manual de `cultura_mensal` continua vencendo** o cálculo automático,
  como antes.

⚠️ **PENDENTE de decisão (pré-existente, NÃO introduzido aqui):** os cultos do
mês corrente nascem **pré-agendados com frequência 0**, e eles entram no divisor
— em 12/08 agosto conta **5 domingos** com só 2 realizados, então a média do mês
em curso aparece como **801** em vez de ~2.003. Isso já acontecia com o divisor
por semana (a contagem de semanas com culto também pegava os pré-agendados).
Consertar exige definir o que "média do mês corrente" significa: contar só
domingo com dado lançado **infla** a média quando a Integração atrasa o
lançamento; contar todos **deprime** até o mês fechar. É chamada do Marcos.

## Sistema OKR/NSM 2026 (arquitetura consolidada · fases 1-6 mergeadas em maio)

Sistema unificado OKR/KPI/NSM. **Conceito**: 1 NSM ("novos convertidos
engajados em ≥1 valor em até 60d da decisão") · 5 valores (Seguir, Conectar,
Investir, Servir, Generosidade) × 6 áreas (Kids, Bridge, AMI, Sede, Online,
CBA) → matriz com ~150 KPIs · cascata automática. "Instituição" da planilha
virou **"Sede"** no banco. Narrativa fase a fase no legado; o que vale saber:

- **Estruturas**: `igrejas` · `kpi_trajetoria` (checkpoints + view
  `vw_kpi_trajetoria_atual`) · `nsm_eventos` (append-only · 1 linha por
  engajamento · `dentro_janela_60d`) · `nsm_estado` (1 linha por segmento:
  central/cbrio/online/cba · recalculada por `recalcular_nsm()` — **v3 desde
  2026-06-10**: numerador = engajamento REAL via `fn_nsm_valores_engajados`,
  ver seção "Jornada NSM · engajamento de verdade") · `areas_kpi` ·
  `profiles.is_diretoria_geral` (5 nominais: Eduardo Gnisci, Arthur Serpa,
  Pedro Menezes, Pr. Pedrão, Pr. Juninho — complementa, não substitui,
  role='diretor'). Recalculo: `SELECT public.recalcular_nsm();` (cron horário).
- **Telas**: `/painel` (NSM + carrossel de 6 mandalas + carrossel de tendências
  + matriz 6×5 + top 3 alertas → drilldown modal célula → `/painel/kpi/:id` →
  `/painel/nsm/pessoas`) · `/minha-area` (KPIs da área por valor) · `/gestao` ·
  `/ritual` · `/dados-brutos`. Telas legadas (`/painel-kpis`, `/kpis`,
  `/admin/cultura`, `/meus-kpis`) removidas com redirect.
- **Endpoints**: `/api/nsm/{painel,eventos,recalcular}` ·
  `/api/painel/{mandalas,matriz,celula/:a/:v,alertas,kpi/:id,nsm/pessoas,
  serie-temporal[...]}`. Componentes em `src/components/painel/`.
- **Carrossel de tendências**: catálogo `SERIE_DADOS` em
  `backend/routes/painel.js` (dados por valor · Seguir filtra por culto ·
  snapshots calculam "ativos no fim do período" por overlap). Pra dado novo:
  entrada em `SERIE_DADOS[valor]` + branch em `calcularSerie()`.
- **Pipeline de cálculo (Fase 6)** — lider preenche **dado bruto**, sistema
  calcula o KPI: `tipos_dado_bruto` (~35 tipos) → `dados_brutos`
  (UNIQUE tipo+area+data+contexto) → trigger statement-level →
  `calcular_kpi()` por `tipo_calculo` (delta_pct/delta_abs/razao/
  contagem_janela/soma_periodo · config em `formula_config`) →
  `kpi_valores_calculados` (cache) → `vw_kpi_trajetoria_atual` (calculado
  primeiro, `kpi_registros` como fallback manual).
- **Permissões**: leitura geral pra autenticado; `/minha-area` e
  `/dados-brutos` filtram por `profile.kpi_areas`/`kpi_valores` (admin/diretor
  e sem-config veem tudo · fallback MVP); escrita em `/integracao` exige
  admin/diretor OU `kpi_areas` com 'integracao'.
- **Definições**: voluntário inativo = sem servir há 90+ dias. Módulos
  futuros (NPS, solicitações de membro) já têm tipos de dado preparados.

### NSM pessoas (camada 4) · filtros v2 (2026-06-09)

Ajustes do Marcos no drilldown `/painel/nsm/pessoas` (`PainelNsmPessoas.jsx` +
endpoint `GET /api/painel/nsm/pessoas`):
- **"Seguir a Jesus" marcado SEM atividade não exclui ninguém**: a própria
  conversão (que põe a pessoa na lista) já cumpre o valor · as atividades
  (1º Contato/Batismo/Next) refinam. Implementado no `matchFiltro` do backend
  + hint no card. ⚠️ NÃO muda o cálculo de `engajado` (engajamento segue sendo
  sinal pós-decisão · senão a NSM viraria 100% sempre).
- **Cards seguem o filtro**: endpoint devolve `match_engajados` /
  `match_nao_engajados` / `match_pct` (totais da lista filtrada por
  status+valores/atividades) além dos `total_*` do recorte; os 4 cards da UI
  usam os `match_*` (label vira "Pessoas no filtro") com nota do recorte
  completo embaixo.
- **Origem da decisão**: filtro Todos/Presencial/Online (`?tipo=` · filtra
  `cultos_decisoes_pessoas.tipo_decisao` na fonte, então muda o próprio
  universo). `?segmento=online` legado segue aceito. A página agora LÊ os
  query params da URL — os deep links dos cards NSM do `/painel`
  (`?segmento=online&engajados=false`) passaram a funcionar (antes ignorados).
- **v3 · fetch único + filtros instantâneos (2026-06-09)**: a página busca
  TUDO 1x no mount (universo do ano com `janela=acumulado&limit=1000` + a aba
  Sem dados com `dias=366`, em paralelo) e deriva Janela/Origem/Engajamento/
  valores client-side — useMemo espelhando o `matchFiltro` e a janela de
  engajamento do backend (recorte 30/60/90 = decisões em [fim−N, fim] ·
  atividades contam em [decisão, min(decisão+N, fim)]). Trocar filtro não faz
  round-trip; só trocar o **Ano** refaz o fetch. Backend intocado (os params
  do endpoint seguem suportados). ⚠️ payload capado em 1000 pessoas/ano —
  revisitar se um ano passar disso (paginação server-side).
- **Aba "Sem dados" só lista pendência**: cultos `gap_status='completo'`
  ficam fora da lista (nota informa quantos foram ocultados) · os 4 cards
  seguem resumindo o recorte inteiro (decisões × registradas × gap).
- **Reconciliação com o card NSM (2026-06-09)**: a aba Sem dados abre com um
  bloco fixo usando a janela OFICIAL do `nsm_estado` (móvel · 90d · via
  `nsm.painel()`): "X decisões no denominador · Y com pessoa cadastrada · Z
  sem dados" — bate com o card do `/painel` por construção. Exigiu remover o
  cutoff de 18/05 da `vw_nsm_sem_dados` (migration `20260609160000` · ver
  seção "Cutoff temporal · REVERTIDO"). O denominador da NSM (ex.: 240) NÃO é
  meta — é o total de decisões agregadas dos cultos nos últimos 90d; a meta da
  NSM é `meta_percentual` (50%). ⚠️ O numerador do card conta pessoa nominal
  com QUALQUER etapa concluída na trilha — como a etapa 'conversao' nasce
  concluída no ato, hoje ele mede na prática "decisões com pessoa cadastrada"
  (21/240), não engajamento pós-decisão (critério mais exigente da tela de
  pessoas). Alinhamento do numerador fica como decisão futura do Marcos.
- **Filtro de origem na aba Sem dados (2026-06-10)**: o segmented Origem
  (Todos/Presencial/Online) passou a valer pras 2 abas. A view ganhou
  `registradas_presencial/online` + `sem_dados_presencial/online` (migration
  `20260610120000` · colunas no FINAL · CREATE OR REPLACE) e o front projeta
  cards/lista/gap_status pela origem. Vínculo de membro não é separado por
  origem (oculto no modo filtrado). Fix junto: culto só-kids
  (`gap_status='sem_decisoes'`) não vaza mais como pendente na lista.

## Escala 50k pessoas (preparação 2026-05-11)

Banco/backend preparados pra 50k+ pessoas (visão 5 campus): view materializada
`vw_pessoas_papeis_mat` (10 booleans + 8 índices parciais · refresh CONCURRENTLY
via cron `/api/jornada/cron/refresh-papeis` + manual `POST
/api/jornada/refresh-papeis`; a `vw_pessoas_papeis` original segue pra
backward-compat) · RPC `cruzar_pessoas(criterios, limit, offset)` (count +
página em 1 query · usada por `POST /api/jornada/cruzar` · paginação de 100 no
/admin/cruzamentos) · triggers de `dados_brutos` em statement-level (batch de
500 = 1 recálculo por combo) · cache 5 min no `/api/painel` (bust:
`POST /api/painel/cache/bust`) · índices parciais nas tabelas quentes
(20260511100000). Quando crescer (10k+): read replica, particionar
`mem_contribuicoes` por ano, paginação server-side no /membresia.

## Responsáveis por área (ciclo criativo)

A tabela `area_responsaveis` define quem é o líder padrão de cada área.
Ao ativar um ciclo criativo ou propagar um novo template, o sistema
preenche `responsavel_nome` automaticamente com o valor dessa tabela.

| Área | Responsável |
|------|-------------|
| cozinha | Jéssica Salviano |
| limpeza | Jéssica Salviano |
| manutencao | Amaury |
| compras | Amaury |
| producao | Pedro Fernandes |
| marketing | Pedro Paiva |
| financeiro | Alberto Luiz Stassen da Silva |
| adm | Marcos Paulo |
| integracao | Alda Lorena |

Para alterar: `PUT /api/cycles/area-responsaveis/:area` com
`{ "responsavel_nome": "Novo Nome" }`. Os eventos futuros usarão
o novo responsável; tarefas já criadas não são afetadas
retroativamente.

## Cérebro CBRio — Base de Conhecimento

O Cérebro é o sistema automático que transforma documentos do
SharePoint em notas Obsidian contextualizadas. **Qualquer alteração
neste módulo deve respeitar a arquitetura abaixo.**

### Fluxo de dados

1. **Upload no SharePoint** → bibliotecas monitoradas (Gestão,
   Criativo, Ministerial, etc.)
2. **Detecção** → webhook do Microsoft Graph ou cron (`/api/cerebro/processar`)
   detecta arquivos novos via Delta Query
3. **Fila** → arquivo entra na tabela `cerebro_fila` com status
   `pendente`
4. **Processamento** → `backend/services/cerebroProcessor.js` baixa o
   arquivo, extrai texto via `textExtractor.js`, envia para
   **Claude Haiku** classificar e resumir (JSON estruturado)
5. **Nota gerada** → arquivo `.md` com frontmatter YAML completo é
   salvo na biblioteca "Cerebro CBRio" no SharePoint
6. **Obsidian** → qualquer membro com OneDrive sincronizado vê as
   notas aparecerem automaticamente no vault local

### Arquitetura dos arquivos

```
backend/
  routes/cerebro.js          — Webhook Graph + cron + subscriptions
  services/cerebroProcessor.js — Coração: baixa, classifica, gera nota
  services/textExtractor.js    — Extrai texto de PDF/DOCX/XLSX/PPTX/imagens
  services/storageService.js   — getGraphToken, downloadFile
```

### Regras do agente processador

- **Modelo**: usar `claude-haiku-4-5-20251001` (barato e rápido)
- **System prompt**: pedir JSON puro com campos `resumo`,
  `tipo_documento`, `tags`, `dados_chave`, `notas_relacionadas`,
  `area_vault`
- **Tags padrão**: `#membro`, `#evento`, `#projeto`, `#financeiro`,
  `#ministerio`, `#ata`, `#decisao`, `#pendente`, `#concluido`,
  `#marketing`, `#producao`, `#patrimonio`, `#administrativo`
- **Frontmatter YAML** obrigatório em toda nota gerada:
  ```yaml
  titulo, tipo, data_criacao, ultima_atualizacao,
  biblioteca_origem, pasta_origem, arquivo_original,
  tamanho, status, tags, processado_por: cerebro-cbrio
  ```
- **Nomenclatura** de notas: minúsculas, hífens, sem acentos,
  max 80 chars (ex: `relatorio-financeiro-marco-2026.md`)
- **Wikilinks**: notas relacionadas usam `[[nome-da-nota]]`

### Vault Obsidian — estrutura

```
cerebro-cbrio/
├── 01-crm-pessoas/    ← Membros, visitantes, líderes
├── 02-eventos/        ← Cultos, conferências, retiros
├── 03-projetos/       ← Projetos e iniciativas
├── 04-financas/       ← Receitas, despesas, relatórios
├── 05-comunicacao/    ← Campanhas, identidade visual
├── 06-ministerios/    ← Células, louvor, infantil, voluntários
├── 07-patrimonio/     ← Espaços, equipamentos
├── 08-administrativo/ ← Atas, docs legais, processos
├── 09-ensino-discipulado/ ← Cursos, trilhas, materiais
├── _dados-brutos/     ← Importados sem classificação
├── _relatorios-ia/    ← Relatórios gerados pelo Claude
└── _templates/        ← Templates reutilizáveis
```

### Mapa biblioteca → pasta vault

| SharePoint         | Vault                  |
|--------------------|------------------------|
| Gestão             | gestao                 |
| Criativo           | criativo               |
| Ministerial        | ministerial            |
| CRM e Pessoas      | crm-pessoas            |
| Eventos            | 02-eventos             |
| Projetos           | 03-projetos            |
| Financas           | 04-financas            |
| Comunicacao        | 05-comunicacao         |
| Ministerios        | 06-ministerios         |
| Patrimonio         | 07-patrimonio          |
| Administrativo     | 08-administrativo      |
| Ensino             | 09-ensino-discipulado  |

### Tabelas Supabase do Cérebro

- `cerebro_fila` — fila de processamento (status: pendente →
  processando → concluido/erro/ignorado)
- `cerebro_config` — configurações (bibliotecas monitoradas,
  extensões permitidas, delta links, limite de tokens)
- `cerebro_doc_texto` — texto integral do documento + `tsvector` português
  (migration `20260730220000` · **aplicada em prod 2026-08-03**). ⚠️ Nasce
  **VAZIA**: só recebe linha quando o cron do Cérebro processa arquivo NOVO. Os
  documentos já processados antes disso seguem sem corpo indexado — reprocessar o
  acervo custa Haiku de novo, então é decisão do Marcos, não automática.

## ⚠️ Cérebro · o que pode virar nota no VAULT é uma ALLOWLIST (2026-08-03 · PR #2227)

O sync reverso (`cerebroSync.js`) transforma entidade do ERP em markdown numa
biblioteca do SharePoint espelhada pelo OneDrive. Isso significa duas coisas que
mudam a régua: **markdown sincronizado não tem permissão por linha** (quem tem
acesso à biblioteca lê tudo) e **a cópia local é irrevogável** — tirar o acesso
depois não apaga o arquivo que o OneDrive já baixou no laptop.

**`ENTIDADES_PERMITIDAS_NO_VAULT` = `membro · evento · projeto · voluntario ·
funcionario · contribuicao-mes`.** Lista FECHADA, em 3 camadas (`enqueueSync`
ignora com aviso · `upsertNoteForEntity` lança — `routes/cerebro.js` a importa
direto pro backfill · `getSupportedEntityTypes` filtra, senão
`POST /cerebro/backfill/:tipo` enfileirava a fila pastoral inteira de uma vez).
`action: 'delete'` **nunca** é bloqueado (senão nota já publicada ficaria órfã).

- ⚠️ **`acompanhamento` (fila pastoral) está FORA por decisão do Marcos** —
  LGPD art. 11 + sigilo pastoral. A proteção anterior era **acidental**: as
  rotas que chamavam `enqueueSync('acompanhamento', …)` ficaram dormentes no
  refactor do Cuidados de 22/07, mas `AREA_VAULT_BY_ENTITY` continuava dizendo
  que ela ia — quem "consertasse a inconsistência" publicaria a fila. Travado em
  `src/test/cerebroVault.test.ts` (mutation-testado).
- **`funcionario` é permitido porque o renderer EXCLUI salário**; mexer no
  renderer sem reler isto vaza remuneração pro OneDrive de quem tem a biblioteca.
- Acesso hoje: **só o Marcos e o Marcos Paulo** têm a biblioteca "Cerebro CBRio".

**Falha de CONSULTA não é entidade ausente** (o mesmo padrão do `parcelas_max`,
agora na fila): os loaders faziam `const { data } = await supabase…`,
descartavam `error`, e o chamador concluía "entidade não encontrada" → a fila
marcava **`erro` na 1ª tentativa** (com `tentativas` incrementado e nunca lido).
Foi assim que **os 50 eventos da igreja ficaram fora do vault de 22/04 a 03/08** —
os 50 ids existem em `events`, as 13 colunas existem, o loader funciona hoje; o
que falhou em 22/04 é **impossível saber**, porque a mensagem real do PostgREST
foi sobrescrita pela genérica. Agora `umaLinha()` marca `retentavel` e
`decidirRetrySync` devolve `pendente` até `MAX_TENTATIVAS_SYNC = 4`; ausência
real segue terminal na hora (re-tentar não faz a linha existir).
✅ Os 50 foram devolvidos pra `pendente` em 03/08 (`tentativas=0`, erro limpo) —
o cron `/api/cerebro/sync-erp` (`30 3 * * *` = 00:30 BRT) leva **8 por rodada**,
FIFO por `enfileirado_em`, então drenam em ~7 dias. Pra acelerar: chamar o
endpoint com `?limite=20` 3×.

## ⚠️ Cérebro · a IA passa a ler o CONTEÚDO, e o filtro falha FECHADO (2026-07-30)

Pedido do Marcos ("criar um RAG pro sistema saber todo o contexto da CBRio").
Passou pelo conselho deliberativo; o desenho mudou por causa do que a
investigação achou. **Não há embeddings** — e a decisão de não ter é registrada
abaixo.

**⚠️ LEI · o filtro de origem do Cérebro é FAIL-CLOSED.** `cerebroSearch.js`
`canReadRouteKey` fazia `if (!routeKey) return true`: biblioteca fora do mapa
ficava visível pra qualquer autenticado. Medição de 30/07 antes de mexer: as 5
bibliotecas monitoradas (`Gestão, Criativo, Ministerial, Planejamento, CRM e
Pessoas`) e as 5 pastas de `cerebro_entidades_indice` estavam **todas mapeadas**
— não era vazamento ativo, era **gatilho armado**, porque
`cerebro_config.bibliotecas_monitoradas` é uma STRING editável em runtime (sem
deploy, sem PR): bastava alguém digitar "Financas" ali. Agora origem não mapeada
não aparece pra ninguém além de admin/diretor, e `avisarOrigemNaoMapeada`
**notifica o módulo cerebro** — fechar a porta em silêncio seria trocar um
vazamento por um sumiço inexplicável. Travado em `src/test/cerebroPermissao.test.ts`
(mutation-testado: reverter pra fail-open deixa 2 testes vermelhos).
⚠️ Lição repetida: dois conselheiros afirmaram "isto já vaza"; o banco desmentiu.
Consenso não é evidência — a régua do CLAUDE.md valeu de novo.

**O texto do documento parou de ser jogado fora.** `cerebroProcessor.js` extraía
até 15k chars, mandava pro Haiku e **descartava** — só `resumo` (2-5 frases)
sobrevivia, e por isso `cerebroSearch` (que se autodenomina RAG no cabeçalho) só
conseguia procurar em TÍTULO e RESUMO. Agora `indexarTexto` grava em
`cerebro_doc_texto` com `tsvector` português + **`f_unaccent`** (obrigatório: o
`extractTerms` já manda a pergunta sem acento, e o dicionário `portuguese`
sozinho não faz unaccent). **Dois tetos separados**: `MAX_CHARS_PROMPT` (15k, o
que vai pro Haiku — custo) e `MAX_CHARS_INDICE` (100k, o que fica pesquisável) —
com teto único, todo relatório longo perdia o fim para sempre.
É **best-effort e depois** do update de sucesso: se propagasse, o arquivo viraria
`erro` e pagaria o Haiku de novo.

**Documento INTEIRO, não chunks — decisão do conselho.** A fronteira de permissão
(e de LGPD) é o documento; chunk espalharia pedaços de ata pastoral por várias
linhas com o rótulo de permissão copiado em cada uma. Duas tools novas em
`assistantTools.js`: `buscar_documento` (full-text no corpo, devolve trecho) e
`ler_documento` (texto completo sob demanda). ⚠️ As duas têm `minLevel: 0` porque
a permissão **não cabe num routeKey único** — é por documento, resolvida no
handler. E a permissão entra **no SQL** (`bibliotecasPermitidas` → `.in()`), nunca
num filtro em JS depois do `.limit()`: filtrar depois é o bug que faz quem tem
poucos módulos receber "nada encontrado" existindo documento permitido abaixo do
corte.

**`serializeContext` não corta mais com `slice()` cego.** Ele truncava por ordem
de inserção e `cerebro_vault` é o ÚLTIMO campo — a busca rodava, gastava consulta
e era a primeira coisa descartada; pior, cortar JSON no meio entrega ao modelo um
objeto **inválido** junto da instrução "responda SOMENTE com base no contexto".
Agora preserva os campos pequenos (sistema, conhecimento curado, resultado da
busca) e remove **módulos inteiros**, de trás pra frente. ⚠️ Guarda de regressão:
sem `cerebro_vault`/`conhecimento_sistema` no objeto, volta ao caminho antigo
byte a byte — é o caso dos auditores (`systemAuditor`/`moduleAuditor` chamam
`buildContext` sem `options.query`). Coberto em `src/test/agentContextSerialize.test.ts`.

**Por que NÃO tem embedding** (decisão, não esquecimento): a Anthropic não tem
API de embeddings, então gerar vetor significa mandar o conteúdo pra um terceiro
— e o acervo tem ata de diretoria, Kids e fila pastoral, exatamente o que a lei
do Stax proíbe. O conselheiro jurídico apontou que a **LGPD não tem equivalente
ao art. 9(2)(d) do GDPR** (organização religiosa), então a base para dado
sensível é consentimento específico (art. 11, I), e transferência internacional
exige cláusulas-padrão da ANPD (Res. 19/2024) — não basta DPA com cláusulas
europeias. **A lei do Stax fica como está.** `pgvector` já está instalado (usado
só por reconhecimento facial), então se um dia a decisão jurídica mudar, o
caminho é acrescentar coluna `vector` na MESMA tabela e somar os rankings —
nada do que foi feito aqui se perde. Antes disso: **medir** com ~30 perguntas
reais; se as falhas forem de vocabulário (pergunta "desligamento", documento diz
"rescisão"), vetor se justifica; se forem outras, não resolveria nada.

### AGENTE-REGRAS.md — fonte única de verdade

As regras completas do agente vivem no **SharePoint** dentro do
vault "Cerebro CBRio", no arquivo `AGENTE-REGRAS.md`. O processador
(`cerebroProcessor.js`) baixa esse arquivo automaticamente antes de
cada execução e injeta as regras no system prompt do Haiku.

**NÃO manter cópia do AGENTE-REGRAS.md no repositório Git.** Se
precisar alterar regras, editar direto no SharePoint — as mudanças
valem imediatamente na próxima execução do cron.

Regras críticas resumidas (detalhes no SharePoint):
- 3 camadas: Supabase (operacional) → SharePoint (lastro) → Obsidian (inteligência derivada)
- Nomes: kebab-case, max 25 chars, semânticos, temporais com prefixo `YYYY-MM-DD-`
- Tags hierárquicas obrigatórias: `tipo/X`, `area/X`, `status/X`, `ano/X`
- Classificar por CONTEÚDO, não por pasta de origem
- Pastas de alto volume usam hierarquia `YYYY/MM/`
- MOCs (Map of Content) por ano em áreas de alto volume
- Resumos PROFUNDOS (min 40 linhas projetos, 35 eventos, 25 financeiro)
- Wikilinks APENAS para arquivos reais do vault
- Fotos: descrição visual via Haiku + metadados no frontmatter

### O que NÃO fazer

- **Nunca duplicar** o AGENTE-REGRAS.md no repo — fonte é o SharePoint
- **Nunca alterar o frontmatter** das notas sem manter todos os
  campos obrigatórios
- **Nunca salvar nota sem resumo** — se o Claude não conseguir
  gerar resumo, marcar como `erro` na fila
- **Nunca processar arquivos temporários** (começam com `~` ou `.`)
- **Nunca exceder 10 arquivos por execução do cron** — controlar
  custo de tokens
- **Nunca usar modelo caro** para classificação — Haiku é suficiente
- **Nunca hardcodar o Site ID do SharePoint** — usar constante
  `HUB_SITE_ID` em `cerebroProcessor.js`
- **Nunca gerar resumos rasos** de 2-3 linhas — inutiliza o Cérebro

### Variáveis de ambiente necessárias

```
AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID
ANTHROPIC_API_KEY
CRON_SECRET
```

## KPIs de Eventos · plano aprovado mas NUNCA implementado

Plano de score 0-100 por documento com rollup documento→área→evento→
institucional (abril/2026 · `event_document_templates`, `event_area_weights`,
campos de scoring em `card_completions`). **Verificado em 2026-06-10: nenhuma
tabela/endpoint existe** — não tratar como recurso vivo. Spec completa (schema,
pesos, dashboard, perguntas pendentes) em `docs/CLAUDE-LEGADO.md`; só
implementar com aval do Marcos.

## Online · visao do canal YouTube (somente leitura)

Modulo `/online` mostra desempenho do canal YouTube CBRio com
inscritos, views, melhores videos do mes (por views e por engajamento) e
analise por serie de pregacao.

**Regra de negocio importante**: este modulo eh **somente leitura**. A
frequencia online dos cultos e as aceitacoes/conversoes online sao
preenchidas pela **Alda Lorena** (responsavel da Integracao) em
`/ministerial/integracao` (aba Cultos).

### Arquitetura

- Series de pregacao = playlists do YouTube. Para criar/editar serie,
  basta criar/editar playlist no YT Studio. Cron sincroniza.
- Tabelas:
  - `online_canal_snapshot` (1 linha por dia · inscritos, views totais)
  - `online_series` (espelha playlists)
  - `online_videos` (videos com statistics + serie_id + culto_id)
- View `vw_online_series_kpi` agrega totais por serie
- Cron diario 6h (`/api/online/cron/sync`) chama YouTube API e popula
  as tabelas. Custo ~40 unidades de quota/dia.
- Endpoint `POST /api/online/sync` permite refresh manual (admin/diretor)

### Variaveis de ambiente

- `YOUTUBE_API_KEY` (ja existe, usada pelo coletor de DS/DDUS) — **obrigatoria**
- `YOUTUBE_CHANNEL_ID` (opcional) — formato `UCxxxxxxxxxx`. Default
  hardcoded em `backend/services/youtubeCollector.js`
  (`DEFAULT_CHANNEL_ID = 'UCfjMVzaYlCS_VE3JuEJj2vQ'`, canal oficial CBRio).
  So setar a env se um dia o canal mudar.
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` — credenciais OAuth
  para coleta automatica via YouTube Analytics API (pico online, DS, DDUS)

### Coleta automatica (OAuth + Analytics API)

3 jobs autonomos · tokens persistidos em `online_oauth_tokens`:

- **live-monitor** · GitHub Actions
  (.github/workflows/online-live-monitor.yml) porque Vercel Hobby nao
  permite cron sub-diario. Secrets necessarios no repo:
  `CRON_SECRET` e `APP_BASE_URL`. Roda `*/5` apenas em janelas que
  cobrem horarios reais de culto + buffer pra eventos atipicos:
  Dom UTC 11-15 (BRT 08-13 · manha) · diario UTC 16-23 (BRT 13-21) ·
  diario UTC 0-4 (BRT 21-02). Pula UTC 05-10 (BRT 02-07) onde nao ha
  culto. So age (server-side) se ha culto na janela (30min antes ate
  4h depois do horario marcado). Detecta live ativa via
  `liveBroadcasts.list?broadcastStatus=active`, linka `youtube_video_id`
  no culto e atualiza `online_pico` quando `concurrentViewers > atual`.
  Pra evento atipico fora de janela, usar botao "Coletar pico agora"
  da UI em `/online`.
- **ds-collect** · cron `0 10 * * *` · pra cultos de ontem com video_id,
  grava `online_ds` = **total acumulado de views do video** no momento da coleta
  (snapshot da manha seguinte ao culto) via `videos.list?part=statistics`
  (`fetchVideoStatistics` · Data API · quase tempo real, SEM o atraso de 1-2d da
  Analytics que deixava o DS de ontem zerado). watch time / retencao do DS
  seguem vindo da Analytics como best-effort (podem atrasar). Os endpoints
  manuais `/coletar/ds` e `/coletar/ddus` rodam `backfillCultoVideoIds` antes,
  pra vincular o video ao culto (o coletor so age em culto ja vinculado).
- **ddus-collect** · cron `30 10 * * *` · pra cultos de 7 dias atras,
  grava `online_ddus` = **on-demand acumulado na semana** = `statistics.viewCount`
  AGORA (>= D+7) **menos o DS** (snapshot da manha seguinte). Mesma fonte do DS
  (Data API · sem o atraso da Analytics). So calcula se `online_ds` existe (o DS
  e o ponto de partida da subtracao · sem ele pula com `ds_ausente`). watch time
  / retencao do DDUS seguem da Analytics como best-effort.

Override manual continua funcionando · coletor so atualiza se valor `null`
ou `0` (DS/DDUS), ou se for `pico > online_pico atual`.

Endpoints OAuth:
- `GET /api/online/oauth/authorize` (admin/diretor) · retorna URL Google
- `GET /api/online/oauth/callback` (publico, valida state HMAC) · troca code
- `GET /api/online/oauth/status` · status atual
- `POST /api/online/oauth/disconnect` (admin/diretor) · revoga refresh_token

### O que **NAO fazer**

- Nunca permitir input de frequencia/aceitacoes neste modulo. Eh
  competencia da Integracao.
- Nunca consumir a API do YouTube live na resposta de `/dashboard`. Sempre
  ler do snapshot. Pra atualizar, usar cron ou botao "Sincronizar agora".
- Series sao playlists. Nao criar uma camada de "serie manual no banco" —
  fonte de verdade eh o YouTube.

## Grupos · hierarquia e supervisao

Modulo Grupos tem hierarquia formal de papeis (visitante → frequentador
→ lider_treinamento → lider → co_lider → supervisor → coordenador) e
fluxo de supervisao (visitas + observacoes mensais por grupo).

Tela: `/grupos/supervisao` (em `src/pages/ministerial/GruposSupervisao.jsx`).

**Documentação completa** com checklist de ativação + queries de
atribuição: `docs/modulo-grupos-supervisao.md`. Consultar antes de
popular dados reais de função/supervisor pra verificar permissões.

## Revisao Estrategica — edicao direta com impacto

Modulo para revisar projetos e marcos de expansao com visualizacao de
cascata. **Nao usa workflow de aprovacao** — o PMO edita direto.

> ⚠️ 2026-06-10: "marcos de expansao" = os marcos do **Planejamento Estratégico**
> (ex-"Expansão" · slug `expansao`). Módulo **pouco usado** — a aba Acompanhamento
> (planos + parecer) cobre a leitura/retrospectiva. Ver a seção "Planejamento
> Estratégico × Gestão Anual" no topo deste arquivo.

### Fluxo
1. Diagnostico: KPIs + lista filtrada de itens atrasados/pendentes
2. Clicar num item: abre painel split (edicao + impacto)
3. Ao alterar `date_end` de um marco: recalcula cascata em tempo real
4. Salvar aplica direto e loga em `revision_log`

### Endpoints
- `GET /api/revisoes/diagnostico` — radar completo
- `GET /api/revisoes/simular/:tipo/:id?nova_data=X` — cascata de impacto
- `PUT /api/revisoes/projeto/:id` — editar projeto + log
- `PUT /api/revisoes/expansao/:id` — editar marco + log
- `GET /api/revisoes/historico?tipo=&item_id=` — log de alteracoes

### Tabelas
- `revision_log` — audit trail de cada campo alterado (campo, valor
  anterior, valor novo, motivo, quem, quando)

## Governanca — Ciclo mensal de reunioes

4 reunioes mensais interligadas que formam um ciclo de governanca:
```
Sem 1: OKR → Sem 2: DRE → Sem 3: KPI → Sem 4: Conselho
```

Extras (nao mensais): Diretoria Estatutaria (quadrimestral),
Assembleia Geral (semestral).

### Tabelas
- `governance_cycles` — um por mes (year, month, status)
- `governance_meeting_types` — tipos de reuniao (OKR, DRE, KPI, CC, DE, AG)
- `governance_meetings` — 4+ por ciclo, com pauta, ata, deliberacoes
- `governance_tasks` — demandas por reuniao
- `governance_task_templates` — demandas padrao por tipo

### Endpoints
- `POST /api/governanca/cycles` — criar ciclo mensal + reunioes + tarefas
- `POST /api/governanca/cycles/generate-year` — gerar ano inteiro
- `GET /api/governanca/cycle/:year/:month` — ciclo completo
- `PUT /api/governanca/meetings/:id` — atualizar reuniao
- `GET /api/governanca/meetings/:id/dados` — dados automaticos do sistema
- CRUD tarefas e templates

### Frontend
- `/governanca` — navegacao mensal, pipeline visual das 4 reunioes
- Detalhe: formulario (pauta/ata/deliberacoes) + demandas + dados automaticos

### KPIs
Marcos vai definir os KPIs especificos de cada reuniao. Estrutura
pronta para receber — por enquanto os dados automaticos puxam
resumos dos modulos (projetos, financeiro, cultos, pendencias).


## Membresia · faixa etária + ministério (AMI/Bridge) auto-declarado (2026-06-16)

Pedido do Matheus: o cadastro do app pergunta (escolha única) se a pessoa
frequenta **AMI / Bridge / nenhum**; e a pessoa entra na Membresia já **tageada
por faixa etária** pela data de nascimento. Líderes de AMI/Bridge passam a ver
suas pessoas numa aba, com detalhe **sem contribuições**.

- **Migration `20260616120000`**: `mem_membros.frequenta_area` (CHECK ami/bridge,
  nullable · índice parcial) + `fn_faixa_etaria(date)` (criança <13, adolescente
  13–17, jovem 18–30, adulto 31+). Aplicada em prod.
- **App**: cadastro grava `frequenta_area` via metadata → trigger
  `handle_new_user` (em `supabase/handle_new_user_membro.sql`, aplicado em prod;
  valida ami/bridge, e se o membro já existir preenche se estiver vazio).
- **Membresia** (`Membresia.jsx`): badge de faixa etária + badge AMI/BRIDGE no
  cabeçalho do detalhe (detalhe usa `select *` → já traz `frequenta_area`). A
  faixa é derivada no front (helper inline); não é coluna.
- **AMI/Bridge** (`PainelArea.jsx` + novo `PainelAreaPessoas.jsx`): aba
  **"Pessoas"** (só `area in (ami,bridge)`) lista `mem_membros` com
  `frequenta_area = área`, filtros por faixa + busca; clicar abre detalhe.
  Backend `routes/painelArea.js`: `GET /:area/pessoas` e `GET /:area/pessoas/:id`
  (este NÃO retorna contribuições — regra "líder de área não vê doação" também no
  servidor, não só na UI; valida que a pessoa é da área). Guard
  `authorizeModule('painel-area', 1)` (boost de área cobre os líderes).
- ⚠️ Editar `frequenta_area` na Membresia (UI) ficou de fora (só leitura por ora);
  o vínculo vem do cadastro do app. Pessoas já existentes não têm `frequenta_area`
  até se cadastrarem/escolherem (forward-looking).

## WhatsApp · disparos pra eventos do app (2026-06-16)

Camada `notificarMembro(membroId, chave, params)` em `services/whatsappService.js`
dispara templates da Cloud API pros membros, a partir de eventos do app —
**plug-and-play**: enquanto o env do nome do template estiver vazio, é **no-op
gracioso** (não quebra o fluxo). Respeita **opt-in** (`mem_membros.whatsapp_optin`,
migration `20260616160000`): obrigatório pra Marketing; pra Utility só se
`WHATSAPP_OPTIN_OBRIGATORIO=1`. Token = `WHATSAPP_ACCESS_TOKEN` (o mesmo do bot) +
`WHATSAPP_PHONE_NUMBER_ID`.

- **Chaves → env do template:** inscricao_confirmada=`WHATSAPP_TEMPLATE_INSCRICAO` ·
  doacao_recebida=`WHATSAPP_TEMPLATE_DOACAO` · kids_vinculo=`WHATSAPP_TEMPLATE_KIDS_VINCULO` ·
  kids_precheckin=`WHATSAPP_TEMPLATE_KIDS_PRECHECKIN` · batismo_lembrete=`WHATSAPP_TEMPLATE_BATISMO` ·
  escala_voluntario=`WHATSAPP_TEMPLATE_ESCALA` · aniversario=`WHATSAPP_TEMPLATE_ANIVERSARIO` (Marketing).
- **Já ligados:** confirmação de inscrição (`app.js` POST /app/inscricoes ·
  grupos/batismo/next/voluntariado/retiro/cursos/eventos · {{1}} nome {{2}} tipo) e
  vínculo Kids aprovado/recusado (`totemKids.js` · {{1}} criança {{2}} aprovado/recusado).
- **Convite NEXT em massa (2026-07-20):** `nextConvite.js` POST `/next-convite/enviar`
  dispara o template `WHATSAPP_TEMPLATE_NEXT_CONVITE` (= `next_convite`, aprovado ·
  **1 variável {{1}}=1º nome**, link fixo/botão · pt_BR). Usado na aba Convertidos do
  Cuidados ("Convidar para o NEXT"). ⚠️ Esse disparo usa `wpp.sendTemplate` direto —
  NÃO checa opt-in (diferente do `notificarMembro`).
- **A ligar quando útil:** doação (vem do webhook Stripe / Edge Function — fora do
  Express), batismo lembrete (cron), escala, aniversário. O helper já está pronto.
- **Pra ativar um template:** aprovar na Meta → setar o env com o nome exato → começa
  a enviar (respeitando opt-in). Opt-in marcado no app (Configurações → Notificações).

## App · Telemetria (analytics de uso + erros · 2026-06-16)

Fase 1 do programa de features do app. O app de membros loga **telas, ações e
erros (crash JS)** em `app_eventos` (migration `20260616180000` · append-only ·
RLS service_role · sem PII), via `POST /api/app/telemetria` (`tryAuth` · batch ≤50 ·
nunca 500 pro app). Dashboard no sistema: `GET /api/app-analytics/resumo?dias=` →
RPC `fn_app_telemetria_resumo` (1 query JSONB · evita o cap de 1000) →
tela **`/admin/app-analytics`** (`AppAnalytics.jsx` · guard `dashboard`≥1):
eventos/usuários por dia, telas mais vistas, ações, erros recentes, plataformas/versões.
App: `lib/telemetria.ts` (`trackTela`/`trackEvento`/`trackErro` + handler global de
erro + flush por tamanho/timer/background) ligado no `app/_layout.tsx` (init + cada
tela via `usePathname`). Próximas features chamam `trackEvento` pra medir adoção.

### ⚠️ A telemetria ficou 5 dias MORTA em silêncio · `event_id` (2026-08-05)

Fui usar a telemetria pra diagnosticar um problema do app do Marcos e ela estava
**zerada desde 31/07** — o dia em que a `20260731143000` (etapa 4 do módulo
Sistema) criou `app_eventos.event_id uuid NOT NULL DEFAULT gen_random_uuid()` e o
índice único, pro `upsert(..., { onConflict: 'event_id' })` do endpoint.

**O DEFAULT existe e funciona** (conferido: `POST /rest/v1/app_eventos` cru, SEM a
chave → 201). Quem quebrava era o **cliente**: o app não manda `event_id`, o
normalizador devolvia `event_id: undefined`, e — a pegadinha — **`Object.keys()`
INCLUI chave com valor `undefined`**, então o supabase-js montava
`?columns=…,event_id`; o PostgREST vê a coluna listada e ausente no JSON e insere
**NULL** → `23502`, lote inteiro descartado. E o handler responde **HTTP 200
`{ok:false}`** de propósito ("telemetria não pode quebrar o app") e o app ignorava
o corpo ⇒ **falha perfeitamente silenciosa**.

- **Régua que fica:** em `upsert` com `onConflict`, **toda linha precisa ter a
  chave de conflito PREENCHIDA** — nem `undefined` (vira NULL via `?columns=`) nem
  presente só em algumas linhas (o `?columns=` é a UNIÃO das chaves do lote).
  `normalizeMobileEvent` agora sempre gera `event_id` (o do app quando vier — aí o
  reenvio é idempotente de verdade; senão `crypto.randomUUID()`).
- **Falha de ingestão AVISA GENTE** (`notificar` módulo `dashboard`, dedup por dia,
  link `/admin/app-analytics`). Sem isso, o próximo silêncio dura outros 5 dias.
- ⚠️ **A whitelist de `props` estava comendo quase tudo**: das 10 chaves que o app
  mandava, só `message` passava (`{grupo: id}`, `{tipo}`, `{criado}`,
  `{encontrado}`, `{id}`, `{url}` iam pro lixo sem erro). O app foi ajustado pras
  chaves permitidas e a lista ganhou **`entity_id`** (id de COISA — grupo, vídeo,
  comunicado · **nunca de pessoa**) e **`label`** (rótulo curto de enum NOSSO —
  tipo de decisão, parentesco · **nunca texto digitado**). Chave nova exige a
  mesma pergunta: *isso pode identificar alguém?*
- O app passou a mandar `event_id`, `occurred_at` (quando ACONTECEU · o
  `created_at` é quando chegou), `session_id` (uma abertura), `installation_id`
  (aparelho, persistido), `os_version`, `device_model`, `manufacturer` e
  `build_number` — tudo de `Platform.constants` + `expo-constants`, **sem
  dependência nativa nova** (o que manteria a mudança fora do alcance de OTA).
  ⚠️ **`Constants.deviceName` é PROIBIDO** aqui: no iOS vem "iPhone de \<nome da
  pessoa\>" (PII). No iOS vai o formato (`handset`/`pad`).
- ⚠️ `GET /sistema/v1/mobile/command-center` (mesma etapa 4) **não tem tela** no
  frontend ainda — a telemetria do app se vê em `/admin/app-analytics`.

## Comunicados / Mural (2026-06-16 · Fase 2 do app)

Conteúdo criado no **Marketing** → **mural do app** + **push segmentado**.
Tabela `comunicados` (migration `20260616210000` · bucket público `comunicados`
pra foto · RLS marketing≥1 lê / ≥3 escreve · service role). Backend
`routes/comunicados.js` (`/api/comunicados` · CRUD + `/upload-foto` multer +
`/:id/publicar` → fan-out push) e `GET /api/app/comunicados` (mural do membro:
status publicado, segmento 'todos' OU `frequenta_area` do membro). Push: Edge
Function **`notify-comunicado`** (app repo · `--no-verify-jwt`) — alvos =
`app_push_tokens` (filtra por `frequenta_area` se segmento ≠ todos) → `notificar`
(app_notificacoes + Expo). Front sistema: aba **Comunicados** no Marketing
(`MarketingComunicados.jsx` · `/marketing/comunicados`). App: `mural.tsx`
(`/mural`, item "Avisos" no Menu) + tap da push tipo `comunicado` → /mural.
Segmentos: todos/ami/bridge/online/sede/kids.

## App · Meu Grupo de Conexão (2026-06-16 · Fase 3)

`GET /api/app/meu-grupo` (app.js): grupos ativos do membro (`mem_grupo_membros`
saiu_em null) com info (dia/horário/local/foto), **líder** (nome+telefone p/
"falar com o líder" via wa.me), **próximo encontro** (calculado de dia_semana+
horário) e **materiais** (`mem_grupo_documentos` por grupo_ids → URL pública do
bucket eventos-anexos). App: tela `meu-grupo.tsx` (`/meu-grupo`, item "Meu grupo"
no Menu). Sem RSVP/presença por ora (follow-up · não há infra de confirmação).

## App · Modo Culto · decisão de fé pelo app (2026-06-17)

"Segunda tela" do culto no app + **decisão de fé** que entra por **fila de
revisão** (decisão da liderança: NADA do app entra direto na NSM). Migration
`20260617180000` (aplicada em prod): tabela `app_decisoes` (PII · membro_id +
culto_id + ambiente presencial/online + tipo aceitar/reconciliacao/rededicacao/
batismo/outro + status pendente/confirmada/descartada + decisao_id · deleted_at +
whitelist + RLS contextual) e libera `fonte='app'` em `cultos_decisoes_pessoas`.
- **App**: `GET /app/culto/agora` (culto de agora + `ao_vivo` + link ao vivo +
  jaRegistrou), `POST /app/culto/decisao` (insere pendente · dedup 1/dia ·
  notifica Integração).

### ⚠️ Qual culto é "agora" · dia em BRT e o mais recente que COMEÇOU (2026-08-04)

Os dois endpoints acima resolviam o culto com
`data = new Date().toISOString().slice(0,10)` + `order('hora', desc).limit(1)`.
**Os dois pedaços estavam errados**, e o efeito era atribuição de culto errada
na fila da Integração (que alimenta a NSM):

1. **`toISOString()` é UTC.** Das 21h BRT em diante o "hoje" já é o dia
   SEGUINTE — ou seja, **no culto de domingo 19h** (que passa das 21h) o
   `culto` vinha nulo, a decisão era gravada sem `culto_id` e o dedup de
   1-por-dia olhava a janela do dia errado. Mesma classe de bug do dia da
   curva do censo e do check-in do Kids: **dia de operação da igreja é BRT**.
2. **"maior hora do dia" ≠ "culto de agora".** Às 08:30 o endpoint dizia que o
   culto era o das 19:00 → decisão do culto da manhã carimbada no da noite.

Agora existe `cultoDeAgora()` (helper único, usado pelos DOIS endpoints —
duplicar a régua era o que deixava o GET e o POST discordarem):
`hojeBRT()` + entre os cultos que **já começaram** e estão dentro de 3h vale o
**mais recente**; só quando nada começou é que a antecedência de 30 min conta.
⚠️ A ordem importa porque os cultos de domingo saem de 90 em 90 min e uma
janela de 3h sobrepõe dois ou três: `find` simples (o primeiro que casa) diria
"08:30" às 10:30, e "10:00" às 09:40 com o das 08:30 ainda rolando.
`ao_vivo` é o que o app usa pra mostrar o "No culto" **só durante o culto** —
fora da janela aquela tela não tem propósito (pedido do Marcos, 04/08).
Conferido em BRT nos horários reais de domingo (06:00 → fora · 08:05/08:15 →
08:30 · 09:40 → 08:30 · 10:30 → 10:00 · 12:15 e 13:00 → 11:30 · 15:00 → fora ·
18:45–21:30 → 19:00 · 22:10 e 23:40 → fora, com o dia BRT correto).
- **Integração**: `GET /integracao/decisoes-app` + `/:id/confirmar` (cria a
  decisão oficial em `cultos_decisoes_pessoas` com `fonte='app'` → entra na NSM
  via trigger) + `/:id/descartar`. UI: `DecisoesApp.tsx` no topo da aba Decisões
  (`vis_decisoes`) do `/integracao`. Notificação `decisao_app` → módulo integracao.
- App (tela `modo-culto.tsx` · `/modo-culto`, "No culto" no Menu + atalho Home):
  ao vivo + cartão de decisão + anotações da pregação (locais no aparelho).

## App · Pregações / Transmissão (2026-06-17 · Fase 5)

Expõe ao app os vídeos do canal YouTube (módulo Online). `GET /api/app/videos`
(app.js · authApp): 30 vídeos mais recentes (`online_videos` · titulo, video_id,
thumbnail_url, publicado_em, duration_seconds, serie), 20 séries
(`online_series`) e `canal_live` (`youtube.com/channel/<YOUTUBE_CHANNEL_ID ou
default CBRio>/live`). **Somente leitura** (a coleta do YouTube continua no cron
do `/online`); sem migration, sem env nova. App: tela `videos.tsx` (`/videos` ·
atalho na Home + "Pregações" no Menu) abre os vídeos no YouTube via Linking.

## App Staff · Kids gerencia batismo de criança (2026-07-21)

`PATCH /totem-kids/batismos/:id` (kids ≥ 3): a equipe Kids atualiza
status/data_batismo/observações de inscrição de batismo **de criança**
(eh_crianca ou <13 anos) sem depender do módulo Integração — inscrição de
adulto responde 403 e segue exclusiva do `PUT /kpis/batismos/:id`
(authorizeBatismo). Status aceitos: pendente/confirmado/realizado/cancelado.
Consumidor: app CBRio-Staff (telas Kids · batismos/apresentações). As
apresentações já tinham PATCH/DELETE próprios (kids ≥ 3/4) — sem mudança.

## Entradas · identidade progressiva e fusão segura (2026-07-18)

Prioridade zero definida pelo Marcos: **todo cadastro novo precisa aumentar a
confiabilidade futura da identidade**, mesmo quando hoje não há dados suficientes
para afirmar que dois registros são a mesma pessoa. Migration
`20260718190000_identidade_progressiva_merge_seguro.sql` (aplicada em produção 2026-07-18):
- `mem_identidade_observacoes`: histórico acumulativo por porta de nome, CPF,
  telefone, e-mail e nascimento. A base viva é semeada como `base_legada`; um
  trigger captura também inserts/updates SQL que contornem o backend.
- `mem_identidade_pares`: fila materializada e incremental com score, prioridade
  (`quase_confirmado/alta/media/descoberta`), evidências, contradições, fontes e
  data da última corroboração.
- `identidadeProgressiva.js`: ao receber uma observação, procura os membros
  conectados e recalcula o par imediatamente. Exemplo-alvo: um cadastro A com
  CPF, B com telefone+nome e um terceiro formulário com CPF+telefone+nome cria
  uma ponte e promove A×B para **quase confirmada**. Nunca auto-funde.
- CPF agora só é chave se o dígito verificador for válido. Se chega CPF novo e
  o único vínculo é telefone/e-mail compartilhável, o matcher exige também
  nascimento compatível; sem isso cria separado e abre sugestão forte.
- Todos os criadores diretos encontrados (app visitante, face, Cuidados,
  membresia manual, importador de grupos e CPF financeiro) passaram pelo matcher
  canônico. Formulários de Next, batismo, grupos, voluntariado, Kids e membresia
  registram origem. **Decisões de culto permanecem como primeiro contato fraco**.
- Batismo público passou a exigir CPF válido; o cadastro interno continua sendo
  a exceção operacional da equipe.
- `merge_membros` agora atualiza filhos linha a linha: colisão UNIQUE/CHECK apaga
  apenas a linha realmente redundante, não a tabela inteira daquele membro.
  `mem_merge_log.related_snapshot` preserva todos os filhos pré-fusão.
- Entradas combina a fila progressiva com a descoberta legada, prioriza “quase
  confirmadas”, mostra fontes, tem busca/filtros e pagina 100 cards por vez. A
  ficha da pessoa mostra quando e por qual porta os dados foram corroborados.

Validações: `node backend/services/identidadeProgressiva.test.js`, políticas de
duplicidade/família, `npm test -- --run` e `npm run build` aprovados. Migration + backend **aplicados e no ar** em produção (Marcos aplicou a migration
manualmente · deploy Vercel automático da main · confirmado no banco 2026-07-18:
`mem_identidade_observacoes`/`mem_identidade_pares` presentes, seed `base_legada` =
3667, `merge_membros` seguro é a única versão viva).

**Follow-up (2026-07-18 · auditoria + correções · PR `claude/entradas-followups-email-doc-limpeza`):**
auditoria multi-agente confirmou a entrega contra o banco vivo (o resumo do ChatGPT
procedia; o CLAUDE.md é que tinha ficado com "NÃO aplicada" desatualizado). Corrigidos:
(1) `membroMatch` (acharOuCriarGuardado/acharMembroGuardado) NÃO liga mais por e-mail
sozinho quando o chamador não passa nome — alinha ao contrato "e-mail sozinho nunca
identifica"; (2) `publicVoluntariado /inscrever-form` roteia pelo matcher canônico
(`acharMembroGuardado`) em vez de lookup por e-mail solto e registra observação de
identidade (Contrato de porta); (3) removido código morto do Entradas
(`PessoaTab`/`SemVinculoTab`/`LigarDialog`/`buildBuscaParams`). ⚠️ Follow-ups deliberados
(NÃO nesta PR): `merge_membros` não faz snapshot de netos de linha filha apagada por
colisão UNIQUE (edge case raro · exige nova migration CREATE OR REPLACE); 2ª impl. de
`normalizarCpf` em `utils/cpf` não valida DV (armadilha p/ código futuro); colisão de
número das migrations `20260717170000`/`20260718120000`/`20260718190000` (cada uma tem
gêmea de grupos/crons no mesmo número — ao aplicar manualmente, rodar as DUAS de cada par).

## Pagamentos · núcleo provider-agnostic (2026-07-28 → 08-10 · narrativa no legado)

Vender inscrição paga pelo próprio sistema (Pix, cartão parcelado, boleto).
⚠️ **O retiro NÃO é módulo novo** — é evento da espinha de inscrições com
`pagamento_ativo=true`. **NÃO criar tabelas `ret_*`.**

**PSP padrão = MERCADO PAGO** (decisão do Marcos · 06/08). O adapter do **Asaas
NÃO foi removido e não deve ser**: `pag_cobrancas.provider` é por LINHA, e
cobrança criada por ele precisa seguir sendo consultada, conciliada e estornada
por ele. Quem decide o PSP das cobranças NOVAS é `PAG_PROVIDER_PADRAO` — trocar
custa 1 env, que é exatamente o que o núcleo provider-agnostic existe pra
permitir. Produção segue em Asaas até o Matheus virar a env.

### ⚠️ LEIS do núcleo (não regredir · íntegras)

1. **Dinheiro SEMPRE em centavos inteiros.** Nenhum float, em nenhuma coluna.
2. **`status` é canônico do CBRio, nunca a string do PSP.** Todo mapeamento vive
   em `providers/<nome>.js`. `if (status === 'RECEIVED')` fora de um adapter está
   no lugar errado. Nenhum módulo de domínio importa `providers/*` — só a fachada
   (é o que faz trocar de PSP custar 1 arquivo + 1 env).
3. **Idempotência do webhook É a UNIQUE** `pag_webhook_eventos(provider,
   evento_id)` + `ON CONFLICT DO NOTHING`: processa só quem conseguiu inserir.
   Dedup por SELECT-depois-INSERT **não é dedup** — duas entregas concorrentes do
   PSP veem ambas "não existe" e ambas inserem. Foi o bug do
   `generosidade-webhook` do app (que, aliás, **não grava linha nenhuma**:
   `origem:'app'` viola o CHECK e `membro_id:null` viola o NOT NULL de
   `mem_contribuicoes` — **não usar como referência**).
4. **`pago` NUNCA regride** (trigger `fn_pag_cobrancas_transicao` + espelho em
   `maquinaEstados.js`). Webhook fora de ordem não pode despagar inscrição
   confirmada. Transição inválida → `RAISE WARNING` e mantém o status antigo,
   **não aborta**: exception em handler de webhook vira retry infinito no PSP.
5. **NUNCA armazenar PAN/CVV/validade/nome impresso.** Só `cartao_brand` e
   `cartao_last4` como o PSP devolveu. Dado de cartão não entra no nosso banco,
   nos nossos logs, nem no nosso Express — a tokenização é no PSP/cliente.
   ⚠️ Aplicada à UI: **cartão fica no checkout do PSP**; coletar PAN em formulário
   nosso ampliaria o escopo PCI-DSS da igreja (SAQ-D). **Pix e boleto NÃO são
   dado sensível** (QR e linha digitável) — por isso são nativos na nossa página.
6. **`pag_pagamentos` é razão auxiliar e NUNCA é somada em view financeira.** O
   caixa recebe **1 receita por REPASSE** do PSP em `fin_transacoes` (+ 1 despesa
   de tarifa), conciliada contra o crédito do extrato. Somar as duas camadas é
   exatamente como nasce a dupla contagem (a de ~R$ 1,5 mi veio desse mecanismo).
   `liquido`/`taxa` vêm do **payload do PSP**, nunca calculados — a taxa varia por
   método, parcela e antecipação. `vw_pag_invariantes` grita quando divergir.
7. **Nenhuma confirmação sem `status='pago'` lido do servidor** — WhatsApp, push,
   e-mail, tela de sucesso, confete. Nada.

**⚠️ LEI: a forma de pagamento é ESCOLHIDA pela pessoa e CONFIRMADA pelo PSP —
nunca adivinhada.** Criar a cobrança sem `billingType` não garante fatura com as
três formas (o PSP monta a página com o que a CONTA tem habilitado). O adapter
**LANÇA quando o PSP devolve `billingType` diferente do pedido**; o chamador
transforma em 502 com o estado atual. `definirMetodo` não toca em valor, status
nem vaga, e recusa cobrança que já recebeu dinheiro (ali o método é fato
consumado). A tela nunca mostra duas verdades: a aba vem do que o SERVIDOR
gravou. ⚠️ **`parcelas_max` é TETO, não plano** — `criarCobranca` NUNCA manda
`installmentCount`; parcelar é escolha da pessoa no `definirMetodo`
(`installmentCount` + `totalValue` cheio). Mandar o teto como plano criava N
cobranças e confirmava a inscrição com 1/12 pago.

**⚠️ LEI: imagem NUNCA marca pagamento.** Comprovante de Pix/transferência entra
como `em_analise`; quem baixa é uma pessoa, via `marcarPagoManual` (que exige
`confirmado_por`). Tabela `insc_comprovantes` (não coluna — recusar+reenviar é o
caso normal), bucket **privado**, `revisado_por` é SNAPSHOT sem FK.

**⚠️ LEI · ledger append-only NÃO tem FK com `ON DELETE SET NULL`** (`insc_checkin_eventos`
· migration `20260729100000`): SET NULL **é um UPDATE**, e o trigger de
imutabilidade aborta — apagar um profile que operou a portaria falharia para
sempre. **Ator em ledger é SNAPSHOT** (UUID sem FK). Vale pra toda trilha nova.

### Arquitetura e estado

`backend/services/pagamentos/`: `index.js` é a **FACHADA — a única coisa que
módulo de domínio importa** (`criarCobranca`, `sincronizar`, `marcarPagoManual`,
`cancelar`, `estornar`, `expirarVencidas`, `reconciliar`, `capacidades`,
`metodosDisponiveis`, `registrarHandler`) · `cobrancas.js` (persistência +
transições · `valor_pago_centavos` **derivado da soma de `pag_pagamentos`**,
nunca copiado do payload) · `webhooks.js` · `providers/{index,manual,asaas,mercadopago}.js`
· `handlers/{index,inscricao}.js`.

**Camada de domínio:** `pag_*` é o MOTOR · `insc_pagamentos` é ESPELHO que aponta
pra ele (`cobranca_id` FK). Ler pela **`vw_insc_pagamento_estado`**. O espelho não
dá idempotência (`webhook_log` é histórico legível, não mecanismo).

Banco: 3 tabelas + `pag_provider_saude` · `pag_cobrancas` na whitelist de
soft-delete · 2 triggers · 10 policies (`pag_webhook_eventos` só super-admin —
payload cru) · `vw_pag_invariantes`.
Envs: `PAG_ENABLED` (kill switch — recusa cobrança NOVA; consultar/expirar/
reconciliar seguem, senão dinheiro já cobrado ficaria preso) ·
`PAG_PROVIDER_PADRAO` · `PAG_WEBHOOK_SECRET` ou `<PROVIDER>_WEBHOOK_SECRET`.
Testes: `pagamentosMaquinaEstados` (16) · `pagamentosNucleo` (11) ·
`pagamentosReemissao` (13) · `pagamentosSaude` (11) · `pagamentosMercadoPago` (34).

### Regras operacionais que não regridem

- **Provider desconhecido LANÇA**, nunca cai no padrão em silêncio.
- **`criarCobranca` grava a linha ANTES de falar com o PSP** (morte no meio deixa
  `criada` + `ultimo_erro` e o cron retoma). Erro de chamada **não marca
  `falhou`** — `falhou` é TERMINAL e tornaria a cobrança irrecuperável.
- **`aplicarStatus` reconfere se o BANCO aceitou** antes de disparar o handler.
- **Handler `inscricao`**: UPDATE condicionado ao status de ORIGEM (reentrega é
  no-op). **Inscrição já cancelada NÃO é ressuscitada** por pagamento atrasado.
  **Estorno/chargeback NÃO cancelam a inscrição** — quem está na logística
  (ônibus, quarto, comida) não sai da lista por automação.
- **Webhook responde 200 pra tudo menos assinatura inválida (401)** — 4xx/5xx
  viram reentrega eterna, e vários PSPs DESATIVAM o webhook após N falhas.
- **Cron `cron/tick` `*/10`**: expira + reconcilia (50) + replay + sonda de
  credencial (1x/dia). `listarParaReconciliar` ordena por **`updated_at` ASC** e
  `reconciliar` **toca a linha ao fim de cada tentativa** — sem esse round-robin,
  as 50 mais antigas seriam re-checadas pra sempre. ⚠️ **Cron só roda em
  PRODUÇÃO, nunca em preview.**
- **Vaga atômica**: `fn_insc_inscrever(...)` é o **ÚNICO caminho de criação de
  inscrição** — janela/vaga/duplicidade/`numero_sorte`/insert no MESMO comando,
  sob `pg_advisory_xact_lock`. Não inserir em `inscricoes` direto (nem painel, nem
  import) sem reproduzir a trava. **Regra de negócio NUNCA vira exceção**: devolve
  `{ok, motivo}` e quem chama decide o HTTP (`sem_vaga` = **409**, nunca sucesso).
  **`recebida` OCUPA vaga** (só `cancelada` devolve).
- **Porta pública paga**: evento pago mal configurado **não abre** e não vira
  inscrição gratuita (`bloqueioPagamento()` → 503) · re-inscrição de cancelada
  reativa como `recebida`, não `confirmada` · **reenvio devolve a MESMA cobrança**
  (`referencia = inscricao:<id>`, UNIQUE) · **a vaga é reservada ANTES de cobrar**
  (o inverso seria estornar gente).
- **Cobrança TERMINAL sem dinheiro é REEMITIDA, não devolvida** (referência
  versionada `:r<ts>`). Só `expirada`/`cancelada`/`falhou` com
  `valor_pago_centavos = 0`; `estornado`/`chargeback` ficam de fora mesmo zerando
  a soma. `familiaReferencia()` evita duas cobranças pagáveis pela mesma
  inscrição. A anterior é cancelada **no provedor** antes (terminal aqui não é
  terminal lá). O espelho tem que ser aposentado junto.
- **Preço é atributo da INSCRIÇÃO, não do evento**: bolsa/desconto/gratuidade em
  `inscricoes.valor_cobrado_centavos` + `bolsa_tipo` + `bolsa_motivo` (obrigatório
  no CHECK). Gratuidade → `confirmada` na hora. Desconto → cancela e reemite.
  **Não devolve dinheiro, não cancela, não confirma quem deve.** `insc_beneficios`
  (pré-autorização por CPF) é o lado de ENTRADA da bolsa, não uma 2ª régua de
  preço; vale UMA vez (`usado_em` marcado só DEPOIS de aplicar).
  ⚠️ **Re-inscrição NÃO aplica benefício** (a cobrança já existe com valor cheio) —
  notifica a equipe em vez de aplicar pela metade.
- **Fundação**: `inscricaoPortas.js` é o registro canônico das portas (teste fecha
  nos 2 sentidos) · `insc_qr_tokens` guarda **só SHA-256**; o comprovante é HMAC
  determinístico e **o hash nunca muda**, então revogar exige poder reativar
  (`PATCH /qrs/:id/reativar`) · busca/paginação do inventário são SERVER-SIDE.
- **Placar**: `GET /inscricoes/eventos/:id/resumo` (COUNT no banco) é
  acompanhamento do evento, **não caixa** (lei nº 6). `lerInscritosDoEvento`/
  `contadoresEvento` são os leitores ÚNICOS (tela do sistema + app do staff).

### Réguas transversais que saíram daqui

- **Valor default plausível (`|| 'pix'`) numa coluna de registro é palpite gravado
  como fato** — e some da revisão, porque parece dado. Sem informação, a coluna
  guarda NULL. (Era isso que fazia a tela mostrar "Pix" pra todo mundo.)
- **CPF fica FORA da lista de inscritos** · telefone/e-mail ficam FORA da lista
  IMPRESSA por padrão (PII que vira papel na mão de voluntário).
- **`src/lib/faixaEtaria.ts` é espelho EXATO de `fn_faixa_etaria`** — mudou no
  banco, muda aqui, senão a lista impressa discorda do KPI. Data parseada como
  LOCAL (`+T00:00:00`).
- ⚠️ **O gate de deploy roda Vitest + os contratos ANTES do Vercel** e
  `workflow_dispatch` roda o mesmo job — **não existe bypass**. Teste aqui precisa
  ser **determinístico**: nada de rede de terceiro (4 testes do Asaas batiam no
  sandbox de verdade) nem de relógio da máquina.
- ⚠️ **Armadilha de CSS**: `textAlign: 'center'` **não centraliza `<img>`** — o
  preflight do Tailwind faz `img { display: block }`; sem `margin-inline: auto` a
  imagem encosta à esquerda (foi o QR do Pix).
- ⚠️ **`vi.mock` do Vitest não alcança `cobrancas.js`** (CommonJS que DESESTRUTURA
  `supabase` no topo) — usar `createRequire` e trocar `module.exports` antes do
  require. Vale pra qualquer teste novo sobre o núcleo.
- ⚠️ **MCP do Supabase oscila por sessão**: tentar primeiro, cair no SQL colado se
  recusar. **Colar o SQL da migration na conversa continua obrigatório** e
  **conferir o resultado no CATÁLOGO**, nunca só o `{"success":true}`.
- ⚠️ Rodar `vercel` a partir de uma **worktree** falha ("codebase isn't linked") —
  o `.vercel/project.json` só existe no checkout principal.

### ⏳ Pendente de GENTE (não é código)

Conta no PSP no CNPJ da igreja avisando por escrito o volume do lançamento (CNPJ
religioso + 150 transações em 72h dispara retenção de saldo por 30-90 dias) ·
política de reembolso escrita (CDC art. 49: 7 dias de arrependimento, e ela
precisa dizer quem come a taxa) · classificação contábil da receita · quando a
igreja paga o local (decide o teto de parcelas) · **confirmar com o Mercado Pago
se dá pra repassar juros do parcelado ao pagador** (a doc não documenta; o
material comercial descreve o custo como do VENDEDOR — se não repassar, 4–13%
saem da margem da igreja) · decidir a fonte da TARIFA (a Orders API do MP não
devolve taxa/líquido).

## ⚠️⚠️ LEI · o embed `tabela(count)` do PostgREST NÃO filtra soft-delete (2026-08-10)

Reportado pelo Matheus: *"mesmo eu apagando as inscrições de teste que fiz, tá
ficando como 14 pessoas inscritas no evento do retiro; sendo que se eu clicar não
tem ninguém, pois apaguei os testes."* Os dois números estavam na mesma tela do
sistema: o **card da série** dizia "14 no total" e o **detalhe do mesmo evento**
dizia 0.

**O detalhe estava CERTO** (`contadoresEvento` faz COUNT com
`.is('deleted_at', null)`). Quem contava linha apagada era o card, que lia
`inscritos:inscricoes(count)` — e o `count` de um recurso EMBUTIDO conta a tabela
inteira, inclusive o que o `app_soft_delete` marcou. Medido antes de tocar:
**RETIRO = 14 linhas, TODAS soft-deletadas** (11 cancelada + 2 confirmada + 1
recebida) ⇒ resposta certa é 0; **Celebra 2026 = 201 exibido contra 200 vivas**
(inflado em 1, e ninguém tinha percebido); Patrocinadores 15 = 15 (correto por
acaso, não tem linha apagada).

- **`backend/services/inscricaoContagem.js`** é o leitor ÚNICO
  (`contarInscritosVivos(db, eventoIds)`), usado pelos **3** endpoints que
  contavam por embed: `GET /inscricoes/eventos` (o card da série),
  `GET /eventos/:id` e `GET /inscricoes/app/eventos` (**o app do staff tinha o
  MESMO bug**). O cliente `db` é injetado — é isso que torna a régua testável
  sem banco.
- ⚠️ **A RÉGUA É A MESMA do `contadoresEvento.inscritos`**: linha VIVA, com
  **cancelada INCLUSA**. É o que faz card e detalhe passarem a bater. Excluir
  cancelada só aqui recriaria, do outro lado, exatamente a divergência que este
  arquivo fecha. Se a igreja decidir que cancelada não conta, muda **nos DOIS**.
- ⚠️ **Filtro no recurso embutido foi descartado de propósito**: não deu pra
  verificar neste ambiente se o `count` do embed respeita filtro do embed, e
  contagem que a liderança lê pra decidir não pode depender de suposição sobre o
  PostgREST. A contagem é explícita, seleciona **só `evento_id`** (nenhuma PII),
  pagina de 1.000 (cap server-side trunca em silêncio) e faz `.in()` em lotes de
  200 (lista longa estoura a URL).
- ⚠️ **Erro do banco PROPAGA** em vez de virar 0: contagem errada é pior que erro
  visível — o zero silencioso é justamente o que ninguém investiga.
- **Varredura do resto do sistema**: os outros dois `(count)` de embed são
  `devocional_itens(count)` e `vol_escala_template_itens(count)`, e **nenhuma
  das duas tabelas tem `deleted_at`** (conferido no `information_schema`) — ali o
  embed está correto. Nenhum falso alarme aberto.
- Testes: `src/test/inscricaoContagem.test.ts` (9 casos, banco falsificado com os
  números reais de produção). **Mutation-testado**: tirar o
  `.is('deleted_at', null)` deixa **4 vermelhos**.

⚠️ **Régua que fica pra qualquer contagem nova**: em tabela da whitelist de
soft-delete, **`(count)` de embed é sempre errado**. Contar exige query própria
com o filtro, ou `head: true` com `.is('deleted_at', null)`.

## ⚠️⚠️ LEI · RPC chamada pelo CLIENTE precisa de grant pra `authenticated` (2026-08-10 · migration `20260810120000`)

Reportado pelo Matheus com screenshot: o cartão de membro do app mostrava
**"QR indisponível"**. O token DELE **existe** em `mem_qrcodes` — o que falhava
era a chamada: `app_meu_qrcode()` estava com EXECUTE só pra `service_role`, e o
app chama com o JWT da pessoa (papel `authenticated`).

**Provado funcionalmente antes de escrever a migration**, não deduzido do
catálogo: `set local role authenticated; select public.app_meu_qrcode();` →
`permission denied for function app_meu_qrcode`. Depois do grant, o MESMO bloco
passa. ⚠️ E o app **descarta o erro** (`const { data: tk } = await
supabase.rpc(...)`, sem ler `error`), então o token virava null e a tela dizia
"indisponível" — **falha perfeitamente silenciosa**.

**⚠️ CAUSA:** o sweep de segurança que revogou `anon`/`authenticated` de ~114
funções SECURITY DEFINER partiu de *"o backend usa service_role, logo é imune"*.
A premissa vale pro backend e **não vale pro app mobile**, que fala direto com o
PostgREST usando a chave pública. **4 RPCs do app foram pegas.**

**⚠️⚠️ O RAIO ERA MAIOR QUE O SINTOMA:** além do QR, **o check-in de batismo pelo
app estava quebrado** (`app_batismo_checkin`) e ninguém havia reportado, junto de
marcar/desmarcar batismo em outra igreja. Das RPCs que o FRONT do ERP chama com a
anon key, a única (`app_marcar_senha_trocada`) manteve o grant e segue de pé.

**Por que re-conceder é SEGURO nas 4** (auditado uma a uma, não em bloco): todas
resolvem o alvo pelo **`auth.uid()`** — o parâmetro nunca escolhe a PESSOA, então
id de terceiro no argumento não alcança dado de terceiro.

| RPC | como resolve o alvo |
|---|---|
| `app_meu_qrcode()` | sem parâmetro · `profiles.id = auth.uid()` |
| `app_batismo_checkin(uuid)` | filtra `membro_id = v_membro` → id alheio devolve "Inscrição não encontrada" |
| `app_marcar_batizado_outra(text)` | `update … where id = v_membro` |
| `app_desmarcar_batizado_outra()` | idem |

⚠️ **`anon` não recebeu nada** — as quatro exigem pessoa autenticada.

- ⚠️⚠️ **A MARCA FICA NO CATÁLOGO** (`COMMENT ON FUNCTION` começando com
  `[GRANT authenticated OBRIGATÓRIO]`), não só no arquivo da migration: a
  varredura de segurança é feita **à mão no SQL Editor**, e quem varrer de novo
  precisa ver o motivo no próprio objeto. Conferido no catálogo: 4 linhas com
  `authenticated = true`, `anon = false`, marca presente.
- ⚠️ A migration **só faz GRANT + COMMENT** — nenhum corpo de função é tocado, de
  propósito: `CREATE OR REPLACE` a partir do arquivo do repo do app reverteria
  ajuste feito em produção depois (a lição do patch dinâmico do fanout).
- ⚠️ Os arquivos `supabase/*.sql` do **repo do APP** declaram esses grants, mas
  são **cópia de leitura** (o cabeçalho deles diz isso desde 08/08): quem cria e
  altera é a migration do ERP.
- **Inventário + guarda no gate**: `backend/utils/rpcsCliente.js` lista as RPCs
  chamadas com a chave pública, e `src/test/rpcsCliente.test.ts` (8 casos) exige
  que **cada uma tenha `grant execute … to authenticated` declarado em migration**
  — é a rede contra o erro mais provável (RPC nova no app sem o grant, que produz
  exatamente a mesma falha silenciosa). **Mutation-testado**: apagar um grant da
  migration deixa vermelho, e "consertar" com `service_role` **não** satisfaz.
  O teste também varre `src/` e exige que toda `supabase.rpc()` do front esteja
  no inventário.
- ⚠️ **A checagem ignora COMENTÁRIO antes de casar** — nos dois lados (SQL e JS).
  A 1ª versão do teste ficou vermelha por causa do comentário do PRÓPRIO teste,
  que cita a chamada como exemplo: a mesma armadilha de 06/08, agora no JS. E o
  `semComentariosJs` **não pode comer o `//` de uma URL** (`https://…`) — tem caso
  cobrindo.
- ⚠️ **NÃO listar no inventário RPC que só o BACKEND chama**: essas devem
  continuar restritas a `service_role`, e ampliar o grant delas é regressão de
  segurança. O critério é UM: *alguém chama isso com a chave pública?*

## ⚠️ Adapter do MERCADO PAGO (2026-08-06 → 08-11 · narrativa no legado)

`providers/mercadopago.js` — o único arquivo que conhece a linguagem do MP.
`'accredited'` em qualquer outro lugar é bug de arquitetura (lei nº 2). Fatos
levantados na doc oficial (não de memória); o que NÃO foi confirmado está
declarado como tal no fim.

### As três coisas que o MP forçou no desenho

1. ⚠️⚠️ **A Orders API (a recomendada) NÃO devolve taxa, líquido nem data de
   liberação.** Quem tem `fee_details`/`net_received_amount`/`money_release_date`
   é a **Payments API, marcada "legacy"**. Decisão: **escrever pela Orders API,
   ler pelas duas.** Pagamento pela Orders entra com `taxa_centavos: null` — a
   resposta HONESTA ("o PSP não disse"), que **não fere a lei nº 6** (ela proíbe
   CALCULAR taxa, não proíbe não tê-la). ⚠️ **Consequência aberta: a conciliação
   automática da TARIFA não fica de pé só com este adapter** — exige o relatório
   "Released money" (produto separado) ou aceitar a API legada. Decisão de
   arquitetura, ainda não tomada.
2. ⚠️⚠️ **Nenhum prefixo distingue token de teste do de produção** ("The test
   Access Token starts with `APP_USR`, just like your production Access Token") —
   isso **mata a guarda de prefixo do Asaas**. No lugar: `MERCADOPAGO_AMBIENTE`
   declara a intenção e o **`live_mode`** da resposta é conferido contra ela,
   **lançando** se divergir. Os dois lados são fatais por motivos opostos:
   produção com token de teste = a pessoa "paga" e nada entra; teste com token de
   produção = o ensaio cobra de verdade. ⚠️ `live_mode` ausente **não** vira erro.
3. ⚠️ **O webhook chega em DOIS tópicos**: `orders` (nosso Pix) e `payment`
   (checkout hospedado). **Marcar só um no painel deixa metade das entregas
   muda.** Tópico desconhecido devolve `null` e o núcleo registra sem despachar.

### Mapeamento no núcleo

| momento | o que faz | por quê |
|---|---|---|
| `criarCobranca` | `POST /checkout/preferences` | a Orders API exige `payment_method` na criação e a pessoa **ainda não escolheu**; sem um `provider_cobranca_id` aqui o núcleo trataria a linha como meio-criada e retentaria pra sempre |
| `definirMetodo('pix')` | `POST /v1/orders` | é onde o objeto cobrável nasce; devolve o QR |
| `definirMetodo('cartao')` | devolve o `init_point` | PAN não entra (lei nº 5). ⚠️ **NÃO devolve `parcelas`** — quem escolhe é o pagador na página do MP; o número real chega no webhook |
| `consultarStatus` | `GET /v1/orders/{id}` | só a ORDER é consultável; antes da escolha devolve `null` |

⚠️ **O vínculo estável entre preference e as N orders é o `external_reference`**
(= nossa `referencia`), não o id do provider — é por ele que o webhook reencontra
a cobrança e é o que torna seguro trocar de forma (cada troca cria outra order).
⇒ `cobrancas.definirMetodo` passou a persistir `provider_cobranca_id` quando o
adapter devolve um; sem repontar, o cron consultaria a preference, que nunca muda
de estado. (O Asaas não devolve o campo e segue idêntico.)

**Assinatura do webhook**: manifesto com o `data.id` do **QUERY STRING** (não do
corpo) + `x-request-id` → `id:<data.id minúsculo>;request-id:<...>;ts:<ts>;` →
HMAC-SHA256 comparado com o `v1` do `x-signature`. ⚠️ O `;` final faz parte e
**minusculizar é o caso NORMAL** (ids da Orders API são ULIDs MAIÚSCULOS). Sem
passar a query, toda entrega legítima tomaria 401.

⚠️ **Boleto está FORA das capacidades, de propósito**: o do MP exige **endereço
completo** do pagador e `pag_cobrancas` não guarda endereço. Declarar abriria uma
aba que **sempre** falha — mesma régua do provider `manual`: declarar só o que se
sabe fazer. Ligar exige coletar endereço na porta pública primeiro.

### ⚠️⚠️ O PRIMEIRO PAGAMENTO REAL (08/08) · 7 causas, nenhuma visível no código

Sintoma único ("o botão de pagar carrega e não acontece nada"), sete causas em
série. As que viram regra:

1. **Valor ia como STRING pra Payments API** (`/v1/payments` exige número) — daí
   `paraReaisNumero`. ⚠️ **O teste que existia travava o comportamento ERRADO**
   (`toBe('900.00')`, comentado como "convenção deste adapter"): 45 testes verdes
   conviviam com um cartão que **nunca havia cobrado**. **Teste que espelha a
   implementação em vez do contrato externo deixa de ser rede e vira confirmação.**
2. **Credenciais de TESTE foram aposentadas na Orders API** — o sandbox é obrigado
   a usar **credencial de PRODUÇÃO de uma conta de teste**.
3. ⚠️⚠️ **E isso NEUTRALIZOU a guarda de ambiente**: com o ensaio declarando
   `AMBIENTE=producao`, o `live_mode` deixou de distinguir. **A proteção parou de
   proteger sem ninguém mexer nela** — mudança de terceiro esvaziou a premissa.
   No mesmo dia uma chave de PRODUÇÃO da igreja foi parar no Preview; com cartão
   real, teria cobrado. ⇒ **`MERCADOPAGO_CONTA_ID`** (último segmento do token =
   id da conta), conferido por escopo. Token `TEST-` é ignorado pela guarda (ela
   existe pra impedir cobrança REAL). Fail-open sem a env.
4. **Public Key e Access Token têm que ser do MESMO PAR** (conta + aplicação +
   versão) — par trocado dá `401 Unauthorized use of live credentials`, que não
   diz nada disso. `chavePublica()` devolve **null** quando as versões divergem: o
   cartão some da página e a pessoa segue pelo checkout hospedado. ⚠️ **Aba que
   sempre falha é pior que aba que não existe.**
5. **`external_reference` não aceita `:`** (só letras, números, `-`, `_`; máx 64).
   Conversão **reversível** `:` ↔ `_`. ⚠️ `inscricao:<uuid>` já usa **46 dos 64** —
   os sufixos de reemissão e bolsa passaram a base36 (`:r<8>`/`:b<8>`).
6. **Em conta de teste o e-mail do pagador tem que ser `@testuser.com`** — regra
   que **só existe no sandbox**; o erro é traduzido dizendo pra NÃO mexer no
   código (forçar o domínio quebraria produção).
7. ⚠️⚠️ **Pix e cartão exigem credenciais INCOMPATÍVEIS no sandbox** — era isso
   que fazia a investigação oscilar (cada ajuste consertava uma forma e quebrava a
   outra, com a mesma mensagem):

| forma | credencial | `AMBIENTE` | e-mail do pagador |
|---|---|---|---|
| **Pix** (Orders API) | produção da conta de **teste** | `producao` | **precisa** ser `@testuser.com` |
| **Cartão** (Bricks) | **teste** da conta real | `teste` | **não** pode ser `@testuser.com` |

⚠️ Vale **só pro ensaio** — em produção as duas usam a mesma credencial real.

### ⚠️⚠️ O bug que só apareceu porque o pagamento FUNCIONOU

Cobrança de R$ 5,00 gravou `valor_pago = R$ 5,05`: o adapter preferia
**`total_paid_amount`** (o que o PAGADOR desembolsou, com o custo de
financiamento que fica com o MP) a **`transaction_amount`** (o valor da NOSSA
cobrança liquidado). O e-mail errado era o menor estrago — **o arrecadado somaria
juros que a igreja não recebe**, a classe de erro que a lei nº 6 existe pra
impedir. ⚠️ **Não trava nada e não gera erro**: teria ido pra produção sem
ninguém notar até o fechamento não bater. ⇒ **Fluxo com dinheiro precisa ser
conferido no BANCO depois do primeiro sucesso, não só na tela.**

O payload cru passou a ser guardado na razão auxiliar — **SEM o bloco `card`**
(o MP traz `expiration_month/year`, `first_six_digits` e `cardholder.name`, e a
lei nº 5 proíbe armazenar validade e nome impresso). O teste *"NUNCA devolve PAN,
CVV, validade ou nome impresso"* pegou essa regressão na 1ª versão escrita.

### Regras de tela que saíram daqui

- **Confete: o gatilho é a RESPOSTA, nunca o clique** — o pagamento na própria
  página atualiza o estado direto do POST, sem passar pelo GET, e a inscrição era
  confirmada sem festejar. `aplicarPagamento()` cobre os 3 caminhos. A LEI segue:
  só com `pago === true` LIDO DO SERVIDOR.
- **O comprovante (QR da portaria) só existe com a inscrição `confirmada`**
  (11/08): `GET /app/eventos/minhas` o emitia para qualquer inscrição viva —
  inclusive `recebida`, que é **vaga reservada e não paga**. ⚠️ **Régua ÚNICA:
  `status === 'confirmada'`** (cobre gratuito, bolsa e pago). **NÃO conferir o
  pagamento em separado** — manual e gratuidade não têm cobrança, e a 2ª checagem
  esconderia o QR de quem a igreja já confirmou. ⚠️ Esconder sem dizer o motivo é
  bug: o endpoint devolve `comprovante_bloqueado`.
- **O ritmo do polling do Pix é "tem alguém olhando?", não tempo decorrido**
  (11/08): **aba escondida = polling PARADO** · visível = 3s no 1º minuto → 8s →
  teto 20s. Menos carga que o backoff antigo e resolve em ~3s. ⚠️ No celular o
  caminho comum nem depende disso (sair pro app do banco esconde a aba e voltar
  dispara consulta imediata) — os 3s são pra quem paga em **outro aparelho**.
  ⚠️ **`PARADA_MS` (2 min, rede de segurança contra webhook perdido) NÃO mudou.**

### ⏳ Aberto (não é código)

**Confirmar com o MP se dá pra repassar juros do parcelado ao pagador** — a doc
de API não documenta; o material comercial descreve o custo como do VENDEDOR
(à vista ~3% · 2–6x 4–6% · 7–12x 7–13%), e o sistema pressupõe
`juros_repassados = true` desde 28/07. Se não repassar, **4–13% saem da margem da
igreja** · gerar credenciais e setar `MERCADOPAGO_*` + `PAG_PROVIDER_PADRAO`
(sandbox no **Preview**; produção segue em Asaas até o Matheus virar) · no painel
do MP **marcar os tópicos `orders` E `payment`** · decidir a fonte da tarifa ·
devolver as envs do Preview pra Pix depois de testar cartão (as duas se excluem).

**O que a doc NÃO confirmou (não preencher por conta própria):**
`payment_method_id` do boleto na API legada · subcampos de `fee_details` ·
`money_release_status` · busca de order por `external_reference` · 3DS na Orders
API · valor mínimo/máximo por transação · nº máximo de reentregas de webhook.

Testes: `src/test/pagamentosMercadoPago.test.ts` (34 · **sem rede**, `fetch`
stubado — a lição é o flake dos testes do Asaas que batiam no sandbox de verdade
e derrubavam o deploy). Mutation-testados: a guarda de `live_mode`, `authorized`
não ser "pago", e a ausência de boleto nas capacidades.

## ⚠️ Marcadores de JORNADA na lista de pessoas (2026-08-13 · SEM migration · PR #2456 + app #115)

Pedido do **Arthur Serpa**, com ideia do **Pr. Nélio**: *"ao acessar o cadastro de
uma pessoa, ver se já fez o Next, já se batizou, já serve como voluntário — o
líder de grupo vê rapidamente em quais etapas da jornada cada pessoa da sua turma
está e dá um direcionamento mais intencional"*. Restrição do Matheus no mesmo dia:
**aconselhamento / conversas pastorais e histórico de contribuição NÃO ficam
abertos.**

**5 marcadores ABERTOS** (batismo · Next · grupo · serve · devocional) +
**1 SENSÍVEL** (generosidade). Aconselhamento **não virou marcador nenhum**.
4 telas, **um serviço só**: Membresia (lista + ficha) · Grupos > Pessoas ·
Voluntariado · roster do app do líder.

- **`backend/utils/jornadaMarcadores.js`** = régua PURA (catálogo + dobra + gate),
  em `utils/` pra entrar no gate · **`services/jornadaMarcadores.js`** lê o banco.
  `src/lib/jornadaMarcadores.ts` é SÓ apresentação, e um teste do gate exige que
  as chaves dos dois lados batam (marcador novo no backend sem entrada de UI
  apareceria como flag sem nome).
- ⚠️ **Generosidade exige `membresia` OU `financeiro` nível 2** (espelha
  `membros-financeiro`, a rota que guarda o extrato): quem tem só `grupos` **não
  recebe nem o booleano** — o dado financeiro nem sai do banco (`incluirSensiveis`
  false não faz a consulta). ⚠️ **NÃO usar `getEffectiveLevel` pra este gate**: ele
  tem `cargoNivelLeitura` como PISO, então cargo com nível base alto passaria sem
  ter nenhum dos dois módulos. Mutation-testado.
- ⚠️ **`next` lê `vw_next_formado_pessoa`** (a fonte única que NSM/painel/KPI/
  Cuidados usam), NÃO `next_matriculas.status`: as 2 aulas não são sequenciais e o
  status por turma diz "não formou" pra quem formou cruzando turmas.
  ⚠️ **`services/jornadaEngajamento.js` (motor da tela Jornada e do /painel) ainda
  lê `next_matriculas` + `next_inscricoes.check_in_at` — ou seja ele JÁ diverge da
  NSM, desde antes disto.** Alinhá-lo MOVE números do /painel ⇒ decisão do Marcos,
  não efeito colateral. Enquanto não alinhar, a aba Jornada da Membresia e a coluna
  Jornada podem discordar sobre "fez o Next".
- ⚠️⚠️ **A LEI: marcador diz o que o sistema tem REGISTRO de, não o que a pessoa
  fez.** Ausência NÃO é prova. Por isso: **`mem_membros.batizado_outra_igreja`
  conta como batizado** (com o detalhe à vista) — sem isso o líder cobra batismo de
  quem se batizou há 20 anos noutra igreja; a tela escreve "Sem marcador
  registrado", nunca "não fez"; e **NÃO existe marcador de decisão de fé** (a etapa
  `conversao` só nasce preenchida por quem entrou pela porta de Decisões, seria
  falsa em quase toda a base importada — marcador errado na maioria das linhas
  ensina a não confiar no conjunto inteiro).
- ⚠️ `batizado_outra_igreja` nasceu no **repo do APP** (`supabase/batismo_anterior.sql`),
  não nas migrations daqui ⇒ lida em **select ISOLADO** (sem ela o PostgREST
  recusaria a query inteira · 42703).
- ⚠️ **Sinal que falha vira `indisponiveis` DECLARADO** (chip âmbar "⚠ incompleto"),
  carimbado DENTRO do payload de cada pessoa porque vários endpoints respondem
  array cru. Ausência silenciosa aqui viraria afirmação errada sobre gente.
- ⚠️ Na **Membresia os marcadores SUBSTITUÍRAM** as flags de papel da coluna
  (VOL/GRP/CTB/NXT) em vez de somar: `NXT` era "inscrito no Next" e `NEXT` é
  "concluiu o Next" — rótulos quase iguais, fatos diferentes, lado a lado. `VIS`
  ficou (não é etapa). O **filtro** de papel do topo não mudou (pergunta outra
  coisa) — então filtro e badge não são a mesma régua ali.
- No **app** (`lib/marcadoresJornada.ts`) o chip `grupo` é omitido do desenho (todo
  mundo do roster está em grupo = ruído em 100% das linhas) e a rota manda
  `incluirSensiveis: false` **fixo** — não é o `req.user` do ERP.
- ⚠️ Nenhuma permissão foi ampliada: os marcadores entram nas listas que cada
  público já abre.
- Teste: `src/test/jornadaMarcadores.test.ts` (21 casos · no gate). Mutantes
  RODADOS: generosidade no conjunto aberto → 4 vermelhos · piso de cargo → 1.

⚠️ **Achado PREEXISTENTE, não corrigido aqui** (é estreitamento de autorização ⇒
"parar e perguntar"): `ROUTE_MODULE_MAP['membros']` inclui **grupos, voluntariado,
cuidados, integracao, next, kids, ami, bridge, online, face**. Logo
`authorizeModule('membros', 1)` deixa quem tem nível 1 em QUALQUER um deles chamar
`GET /membresia/membros/:id/timeline` (que traz **contribuições com valores** e
**aconselhamentos com motivo**) e `GET /membresia/membros/:id` (com
`contribuicoes`). A TELA é gated por `canMembresia`, então não aparece na
navegação — o furo é de **API**, alcançável por qualquer logado. É exatamente o que
o Matheus disse que não pode ficar aberto.

⚠️ **Não medido**: o MCP do Supabase recusou OAuth (`Unrecognized client_id`) e não
havia credencial local, então a densidade real de cada marcador na base **não foi
conferida no banco vivo**. Conferir ao abrir a tela.

## ⚠️ Jornada do convertido · QUANTO TEMPO levou até cada marco (2026-08-14 · SEM migration)

Pedido do Matheus: *"saber a trajetória e o tempo que o novo convertido leva até
se engajar — quanto tempo até entrar em algum valor, quanto até fazer o Next"*,
para **deixar a informação mais clara para os líderes**.

O que existia respondia **se**, nunca **quando**: `GET /cuidados/jornada-convertidos`
calculava dias só do 1º contato (batismo e Next eram `{feito:true}`) e
`services/jornadaEngajamento.js` mede **estado atual**. Sem tempo, o líder não
distingue quem está começando de quem parou há meio ano.

- **`backend/utils/jornadaTempo.js`** = régua PURA no gate
  (`src/test/jornadaTempo.test.ts` · 33 casos · **4 mutantes RODADOS**: limiar de
  import 100→50 → 2 vermelhos · alcançado-sem-data virando "não alcançado" → 1 ·
  dia em UTC → 2 · média no lugar da mediana → 3). O endpoint ganhou `marcos` por
  pessoa (com data + dias) e `tempo` (mediana/quartis por marco) — **aditivo**, os
  campos antigos seguem intactos porque 4 telas os consomem.
- **Tela**: toggle **Linha do tempo | Tabela** no `JornadaConvertidos.tsx`, que já
  está montado em `/ami`, `/bridge`, `/online` (`PainelArea`) e `Online.tsx`. A
  linha do tempo é o **default**; a aba Next da Integração (`view="next"`) segue na
  tabela — ali a pergunta é cobertura, não trajetória.

### ⚠️⚠️ A LEI: são TRÊS estados, e confundi-los faz o painel mentir

`sem registro` (nunca "não fez") · `alcançado com data confiável` (entra na
mediana) · **`alcançado com data APROXIMADA`** (conta como alcançado, marcador
**vazado**, FORA da mediana, com a exclusão **declarada** na tela).

O estado 3 existe por medição, não por precaução: **16 dos 23 convertidos com
vínculo de grupo (70%) têm `entrou_em` numa das 3 cargas em massa** (2026-06-19 =
342 pessoas · 2026-07-10 = 233 · 2026-06-23 = 115). Usar essas datas produziria
uma mediana de "tempo até entrar em grupo" **inteiramente fabricada, com cara de
medição** — é o mesmo fato que a `20260619140000` registra e a razão de nenhuma
régua do sistema aplicar janela de tempo em grupo.

- ⚠️ **`datasDeImport` detecta pelo DADO, não por lista hardcodada**, com limiar
  **alto (100)**: o pico ORGÂNICO mais alto (abertura da T2, 2026-08-10) tem 71, e
  baixar o limiar marcaria como suspeito o dia de maior adesão real da igreja.
- ⚠️ Marco **ANTES da decisão** também é aproximado (gente que já estava na igreja
  e decidiu depois) — dias negativos fingiriam agilidade na mediana.
- ⚠️ **Mediana, nunca média**: a cauda é longa e a média não descreveria ninguém.

### ⚠️ A régua de "fez o Next" AQUI é PRESENÇA em ≥1 encontro (decisão do Matheus)

`next_presencas` (`presente=true`) → `next_encontros.data` + a camada legada
`next_inscricoes.check_in_at`. **NÃO** é `vw_next_formado_pessoa` (que exige aula
1 E 2 e é o que NSM/KPI/marcadores usam). Duas consequências:

- **A data melhora**: passa a ser o dia do ENCONTRO. O `formado_em` da view é
  `min(next_matriculas.created_at)` — data de MATRÍCULA, que num gráfico de
  "quanto tempo levou" mediria a inscrição, não a participação.
- ⚠️ **`next_encontros.data` é NULLABLE** e `next_pessoa_aula_manual` só tem
  `updated_at` ⇒ a pessoa fez, sem data de evento: entra como `aproximada`.
  Descartar diria "não fez o Next"; inventar sujaria a mediana.
- ⚠️ Medido em 14/08: nesta coorte as duas réguas dão **20 pessoas** — o que muda
  é a DATA, não a contagem. Mas a régua é mais frouxa em geral, então a tela
  **escreve a régua ao lado do marco** para não gerar discussão com o `/painel`.

### Estado medido em 14/08 (o que a tela mostra hoje)

**407 convertidos** (out/2025 → ago/2026) · 282 com 1º contato datado · 114 com
contato só por status (sem data) · **só 50 (12%) têm algum marco além do contato**.

| marco | alcançaram | mediana | aproximados |
|---|---|---|---|
| 1º contato | 282 (69%) | 0 d | 0 |
| Next | 20 (5%) | 7 d | 7 |
| Batismo | 16 (4%) | 56 d | 3 |
| Grupo | 23 (6%) | 41 d | **16** |
| Voluntariado | 4 (1%) | 116 d | 0 |
| Generosidade | 20 (5%) | 31 d | 11 |

- ⚠️ **`cui_convertidos.membro_id` é nullable, mas hoje NÃO há nenhum órfão**
  (medido: 0 de 407) — por isso a tela **não** tem contador de "sem cadastro".
- **Generosidade é SENSÍVEL**: reusa `podeVerFinanceiroDePessoa`
  (`membresia` OU `financeiro` ≥ 2) — quem não passa **não recebe nem o booleano**
  (a consulta nem roda), e a tela DECLARA que a lista está incompleta.
- ⚠️ Casamento pessoa↔marco pela régua do próprio handler: chave forte
  (`membro_id`, depois CPF de 11 dígitos) e **nome só sem identificação nenhuma**.
- `.in()` em lotes de 200 · leituras paginadas · `mem_grupo_membros` é lido
  INTEIRO de propósito (a detecção de import precisa da distribuição completa).

## ⚠️⚠️ Voluntariado · disponibilidade virou REGRA, e a montagem de escala foi refeita (2026-08-13 · SEM migration)

Pedidos do Matheus, em sequência, sobre `/ministerial/voluntariado/montar-escala`:
*"queria que a funcionalidade de montar escala fosse prática e fácil… ele escolhe
o culto, se for domingo vai selecionar os horários, aí depois vão aparecer as
áreas, já com as pessoas predefinidas automaticamente por conta do template… e a
opção de adicionar voluntários nas áreas. **Deve aparecer apenas os que estão
disponíveis. Quem não estiver disponível não vai aparecer para o supervisor ou
líder escalar**."* E, com print: *"essa lista de voluntários disponíveis tá
infinita, melhore isso, talvez nem precise aparecer dessa forma."*

⚠️ **O modelo de dados JÁ TINHA tudo isso** — o que faltava era a tela usar:
`vol_escala_template_tipos` (template ↔ tipo de culto) · `vol_escala_template_itens`
(equipe × função × quantidade × `fixo`) · **`vol_escala_template_item_pessoas`**
(pessoas-padrão, descrita no schema como "pré-preenchimento") ·
`vol_escala_culto_itens` (snapshot aplicado) · `vol_availability`.

### ⚠️⚠️ LEI · disponibilidade é REGRA DO SERVIDOR, não filtro de tela

Era um **checkbox marcado por padrão e desmarcável**, e o servidor **nunca
conferia nada**: dava pra escalar quem marcou "não posso" pelo drag-and-drop,
pelo botão +, pelo auto-fill e pelo **aplicar-template**, sem aviso nenhum.
Filtro que só existe no cliente não é regra — é sugestão.

- **`POST /voluntariado/schedules` recusa** com **409 `indisponivel`**. A saída é
  `forcar: true`, que é decisão consciente ("falei com ela, ela vai"), não clique
  acidental.
- **`apply` do template PULA quem está indisponível** e **DECLARA** os pulados na
  resposta. O template diz "normalmente é a Ana nesta função"; a Ana dizendo "não
  posso nesse domingo" é mais recente e mais específico. A vaga fica ABERTA (não
  consome `quantidade`) — some da tela seria trocar um erro por outro.
- ⚠️ **Falha de CONSULTA na checagem NÃO vira "está disponível"** — seria a guarda
  falhando ABERTA no caminho que ela existe pra fechar. Sem conseguir conferir,
  passa com log (travar a montagem por instabilidade de banco é pior), mas o log
  existe pra isso aparecer.

### ⚠️ A régua está em `backend/utils/volDisponibilidade.js` (pura, no gate)

- **São DOIS modelos na MESMA tabela** e ler só um é o bug de 07/08/2026 (o
  auto-fill lia só a faixa de datas, o painel lia só o por-culto — **o gerador
  automático e a tela de escalar na mão discordavam sobre a mesma pessoa no mesmo
  culto**): `service_id` preenchido = "não posso NESTE culto"; `service_id` NULL +
  `unavailable_from/to` = "viajo de 20 a 31/08".
- ⚠️ **`diaBRT` — nunca `toISOString().slice(0,10)`**: das 21h BRT o dia UTC já
  virou, e o culto de **domingo 19:00** cairia na segunda, escapando de uma faixa
  de férias que termina no domingo.
- ⚠️ **A chave do índice é CADA identificador, não `profile_id || pc_person_id`** —
  a linha de ausência admite só um dos dois lados (CHECK da 20260415100000), e a
  chave `a || b` do auto-fill antigo não casava com metade dos registros.
- ⚠️ **O modelo é NEGATIVO: "disponível" é o DEFAULT.** Não existe declaração
  positiva neste sistema; exigir uma esvaziaria toda escala.
- **`ehPessoaEscalavel`** tira conta de sistema da lista de escalar (o print
  trazia `". f"` e `"ADM CBRio"` entre os 860). **Conservador de propósito**:
  esconder voluntário REAL é pior que deixar passar uma conta de sistema — a
  conta se ignora num relance, a pessoa ausente ninguém percebe.
- ⚠️ **`contexto-montagem` não filtrava `arquivado = false`** (o `/volunteers-pool`
  filtra): a tela oferecia voluntário ARQUIVADO pra escalar. Arquivar tem que
  significar "sumiu de todo lugar onde se escolhe gente".

### A tela

- **Culto em 2 passos: dia → horário.** Era lista plana dos 10 próximos cultos, e
  o rótulo nem mostrava a hora — os 4 horários de domingo eram 4 linhas soltas.
  O passo 2 só aparece quando o dia tem mais de um horário.
- **A lista de 860 morreu.** O pool nasce **recolhido** e é **busca-primeiro**:
  só renderiza depois de um recorte (nome com 2+ letras ou área), com teto de 60
  **declarado**. Uma lista de 860 não é lista, é despejo — ninguém rola até
  "Vitor". O caminho normal de escalar passou a ser o "Adicionar" da própria área.
- **Aplicar template a partir daqui**: `schedule-templates/por-tipo/:id` existia no
  backend e **nenhum componente do front consumia**. Aplicar exigia sair da tela,
  ir em Templates e achar o culto num diálogo — então a escala era montada do zero
  toda semana. O banner só aparece com `cobertura.alvo === 0` (com escala montada,
  o botão viraria convite a reaplicar).
- **Sem toggle de "ocultar indisponíveis"** em lugar nenhum: o servidor recusa de
  qualquer jeito, então mostrar o nome só produziria erro.

⚠️ **`POST /schedules/copy` também fechou.** Ele faz INSERT EM LOTE direto (não
passa pelo `POST /schedules`), então a trava de lá não o alcançava — e "copiar a
escala do domingo passado" é justamente o caminho que traria de volta quem avisou
que não pode NESTE domingo. Quem está indisponível no DESTINO é pulado e
declarado (`pulados` na resposta + toast); ninguém disponível ⇒ 409.

⚠️ **O DnD e o pool anotado do PR #2444 (outra sessão, mesmo dia) foram
PRESERVADOS** — `MIME_VOL`/`MIME_SCHED`, drop por equipe e as anotações
`indisponivel`/`jaEscalado`/`escaladoEm` seguem intactos.

⚠️⚠️ **ARMADILHA DE WORKTREE**: o checkout principal estava em
`claude/bot-respostas-automaticas-off`, que **não contém** o #2444 — lá o
`VolScheduleBuilder.tsx` tem 635 linhas e nenhum DnD, contra 898 na `main`.
Editar o checkout principal teria destruído o trabalho da outra sessão sem
nenhum conflito de merge aparecer. **Conferir a branch da worktree antes de
editar arquivo que outra sessão tocou hoje.**

Teste: `src/test/volDisponibilidade.test.ts` (34 casos, **no gate**), com 4
mutantes RODADOS: ler só o por-culto → 2 vermelhos · só a faixa → 1 · chave
`a || b` → 1 · dia em UTC → 2.

⏳ **Não feito nesta leva** (registrado pra não parecer esquecimento): o builder
ainda **não reusa `components/schedules/SchedulesByTeam.tsx`** (o card de área da
escala montada, com iniciais e contadores ✓/✗/⏱) — ele recebe só
`schedules: VolSchedule[]` e não tem noção de VAGA VAZIA nem callbacks de
edição, então reusá-lo exige estender a interface. E não existe drop target por
**vaga/posição** — o DnD move entre equipes e zera `position_id`.

## ⚠️ Montar escala no ESTILO DO SERVICES · rodízio, vagas e auto-preencher (2026-08-13 · SEM migration)

Pedido do Matheus, no mesmo dia da leva acima: *"lembra que te pedi para deixar
as funcionalidades de montar escala no estilo do service e ao mesmo tempo mais
prático para os supervisores de área usarem para escalarem seus voluntários"* —
com acesso ao navegador dele pra eu **ver o Planning Center Services por
dentro**. Foi o que fiz (conta já logada · nada foi escrito lá).

### O que o Services faz e nós não fazíamos

| lá | aqui, antes |
|---|---|
| vaga em aberto é uma linha DENTRO da equipe (`2 Needed`, vermelho) | vaga vivia num card "Cobertura" **separado**, no topo |
| `✓4 ✗0 ?1` no cabeçalho de cada equipe | só o total de escalados |
| **MY TEAMS** separado de OTHER TEAMS | todas as áreas iguais, em ordem alfabética |
| painel lateral abre **na vaga**, candidatos ordenados por **há quanto tempo não servem** (`-7w`, `-5w`…) | modal com a igreja inteira em ordem **alfabética** |
| checkbox + **"Add N"** | um `+` por vez |
| auto-schedule com a regra escrita na tela + **undo** | `Auto-preencher` sem volta |

### ⚠️⚠️ Os dois defeitos que a comparação escancarou (e que foram corrigidos)

1. **O `POST /schedules/auto-fill` escalava a EQUIPE INTEIRA.** Ele ordenava por
   rodízio e depois fazia `available.map(...)` — o número de vagas
   (`vol_escala_culto_itens`) **nunca era consultado**. Numa equipe de 40, as 40.
2. **"Quando essa pessoa serviu pela última vez" não existia em lugar nenhum.**
   Sem esse número a lista só podia ser alfabética, o topo era sempre a mesma
   gente e o rodízio ficava no olho do supervisor.

### O que passou a existir

- **`backend/utils/volRodizio.js`** = régua PURA (**no gate** ·
  `src/test/volRodizio.test.ts`, 22 casos): `semanasSemServir`,
  `ordenarCandidatos`, `candidatoElegivel`, `distribuirVagas`. **4 mutantes
  RODADOS**: voltar ao alfabético → 3 vermelhos · ignorar o nº de vagas → 3 ·
  aceitar OUTRA posição da mesma equipe (baterista no vocal) → 1 · deixar
  conflito entrar no automático → 1.
- **`_ultimaEscalaPorPessoa`** varre os cultos **do mais recente pro mais
  antigo**, em blocos, com teto (10×12 cultos) e parada antecipada quando todo o
  pool já foi encontrado. ⚠️ **Não** varre a base inteira: `vol_schedules` de um
  ano passa de 10 mil linhas e o cap de 1000 do PostgREST viraria dezenas de
  round-trips numa tela que se abre o tempo todo.
- ⚠️ **A janela EFETIVA volta na resposta** (`rodizio.desde`, do culto mais
  antigo realmente varrido) e a tela a mostra. Quem não aparece fica com `null`,
  que a régua trata como "há mais tempo que todos" e a tela escreve **"sem escala
  recente" — NUNCA "nunca serviu"**, que seria afirmar sobre uma pessoa real algo
  que não foi medido. Tem teste em cima do texto.
- **Auto-preencher** preenche as vagas por rodízio, **declara quem entrou e por
  quê** ("há 7 semanas"), **declara a vaga que ficou sem candidato** e tem
  **Desfazer** (o endpoint devolve `schedule_ids`).
- ⚠️ **Sem composição definida o auto-preencher RECUSA** (409 `sem_composicao`,
  mandando aplicar um template) em vez de escalar "a equipe toda" — que era
  justamente o defeito. E quando não existe template pro tipo de culto, a tela
  diz isso e oferece **"Escalar em uma área"**, senão o culto ficaria sem
  caminho nenhum pra receber gente.
- **Minhas áreas primeiro**: `vol_teams.area` × áreas do perfil, **mais** a
  estrela que fixa a área no topo (localStorage). ⚠️ A estrela não é enfeite —
  `vol_teams.area` é texto livre e **não pude medir quantas equipes o têm
  preenchido** (sem credencial de service role local nesta sessão); sem ela a
  separação simplesmente não apareceria pra quem trabalha numa equipe sem área.
  Sem nenhuma área marcada, a tela diz como fixar em vez de mostrar seção vazia.

### ⚠️ O terceiro caminho de INSERT sem trava de disponibilidade

`POST /schedules/bulk` faz INSERT em lote e **não passava pelo `POST /schedules`**
— exatamente o furo que o `/copy` teve em 13/08. Fechado com
`_separarPorDisponibilidade` (uma consulta só), devolvendo `pulados` NOMEADOS.
Régua que fica: **todo caminho novo que grave `vol_schedules` em lote tem que
passar por essa função** — a trava do handler individual não alcança lote.

### Outras decisões

- **`_coberturaDoCulto` foi EXTRAÍDA** e é usada pela tela E pelo auto-preencher:
  duas cópias dessa conta apareceriam como "a tela diz que falta 1 e o automático
  não preenche nada".
- ⚠️ **Conflito (já serve em outro culto do mesmo dia) NÃO entra por automação** —
  a pessoa pode topar dobrar, mas quem pede isso é gente. No painel manual ele
  aparece, num grupo separado e no fim.
- **Indisponível continua fora da lista** (lei da leva anterior), e agora o painel
  **diz quantos** sumiram por isso — a ausência de um nome conhecido não pode
  parecer bug.
- O `PoolSection` busca-primeiro **saiu**: a busca global virou a aba "Qualquer
  voluntário" dentro do painel. O botão "Sincronizar" que morava no modal antigo
  **não se perdeu** (segue em VolDashboard e VolLista).

⏳ **Não feito, e é a próxima leva**: a **visão Matrix** (grade equipe × posição ×
N datas, pra montar o mês inteiro numa tela) — decisão do Matheus de fazer
primeiro a tela de um culto. O painel lateral já foi escrito pra ser reusado por
ela. Segue valendo o follow-up anterior: não há drop target por **vaga**, o DnD
move entre áreas e zera `position_id`.

## Escala · a visão MATRIZ (várias semanas de uma vez) (2026-08-14 · SEM migration)

Segunda leva do pedido de 13/08 ("no estilo do Service"): a grade **área × função
nas linhas, datas nas colunas**, que é o `Matrix` do Planning Center Services.
Responde a pergunta que a tela de um culto não responde — *"onde estão os buracos
do meu mês?"* —, porque antes descobrir isso exigia abrir culto por culto.

Toggle **Um culto | Matriz** no topo de `/ministerial/voluntariado/montar-escala`
(as duas visões na mesma tela, como lá).

- **`GET /voluntariado/escala-matriz?service_type_id=&semanas=&desde=`** ·
  filtros de 2/4/8 semanas, por tipo de culto e **"só as minhas áreas"**.
- ⚠️ **A célula vazia abre o MESMO `PainelEscalar`** da tela de um culto — mesma
  ordenação por rodízio, mesma trava de disponibilidade, mesma gravação
  (`/schedules/bulk`). Um segundo caminho de escalar teria régua própria e
  divergiria do primeiro no dia em que uma das duas mudasse.
- ⚠️ **O painel mostra a DATA no cabeçalho** quando aberto pela matriz: ali há 4
  colunas à vista ao mesmo tempo, e escalar no domingo errado é o erro que a
  grade torna fácil.
- **Tirar alguém cabe na grade** (× no hover da pessoa). Sem isso a matriz seria
  uma tela que só sabe acrescentar, e quem visse o erro teria que sair dela.

### ⚠️ A conta de cobertura virou régua ÚNICA · `backend/utils/volCobertura.js`

`montarCobertura(itens, escalas)` (PURA · **no gate** ·
`src/test/volCobertura.test.ts`, 13 casos) é usada pelo `_coberturaDoCulto` **e**
pela matriz. Sem isso a grade e a tela do culto teriam contas paralelas e
diriam números diferentes sobre a mesma vaga — e quem monta escala confiaria na
que estivesse mais à mão. **3 mutantes RODADOS**: sem a marca de "usada" → 3
vermelhos · descartar o `sobrando` → 3 · deixar linha sem voluntário preencher
vaga → 1.

- **Casamento em 2 níveis**: `escala_culto_item_id` (o vínculo explícito, gravado
  desde 13/08) e depois o par (equipe, função), pro histórico e pra quem foi
  escalado à mão. ⚠️ **Uma pessoa conta pra UM item só** — sem a marca, uma
  escala sem vínculo casaria com duas linhas do mesmo par e a tela
  **subestimaria a falta**.
- ⚠️ **`sobrando` não pode sumir**: quem está escalado fora de qualquer
  composição entra na grade com alvo 0 e o selo "fora da composição". Pessoa que
  não aparece na matriz é pessoa escalada em duplicidade.
- ⚠️ Linha sem `volunteer_id` **não preenche vaga** — é lugar reservado, não gente.

### Decisões

- **Teto de 24 colunas, DECLARADO** (`truncado: true` + aviso na tela). Grade de
  40 colunas não se lê, e cortar em silêncio faria o supervisor concluir que não
  há culto marcado depois.
- **O "hoje" da janela é BRT** (`diaBRT`): em UTC, das 21h em diante o dia já
  virou e a grade começaria amanhã, escondendo o culto de hoje.
- **Erro NÃO vira grade vazia** — "nenhum culto marcado" e "a consulta falhou"
  levam a decisões opostas.
- **Auto-preencher ficou FORA da matriz de propósito**: ali ele agiria sobre
  semanas inteiras de uma vez, e o resultado (quem entrou, por quê, o que ficou
  sem candidato) precisa ser lido antes de virar escala. Continua por culto, na
  visão de um culto, onde a pessoa vê o que aconteceu e pode desfazer.
- ⚠️ Célula sem composição naquele culto mostra **"—"**, não branco: a área
  existe noutra data, mas ali não há vaga definida — e branco é ambíguo.

## ⚠️ Escala · auto-preencher o período + AVISO na semana do serviço (2026-08-14 · SEM migration)

Terceira leva do pedido de 13/08. Decisões do Matheus em 14/08: *"o auto
preencher pode ser implementado · ele vai acontecer conforme a disponibilidade
das pessoas · toda vez que a pessoa for escalada, deve ser avisada na semana do
serviço · [teto de colunas] deixe o que for melhor para o usuário · célula sem
composição pode deixar um texto escrito 'vazio'"*.

### Auto-preencher o PERÍODO (na matriz)

Botão na barra da grade: roda o auto-preencher em todos os cultos visíveis e
devolve o resultado NOMEADO (quem entrou, em que culto, e há quanto tempo não
servia) + **Desfazer tudo**.

- ⚠️⚠️ **UM CULTO POR VEZ, sequencialmente** — e isso não é preguiça: cada
  chamada relê quem já está escalado nos OUTROS cultos do mesmo dia. Em
  paralelo, as quatro chamadas de um domingo leriam o mesmo estado inicial e
  escalariam a MESMA pessoa nos quatro horários, que é o que a régua de conflito
  existe pra impedir.
- ⚠️ Os ids voltam **amarrados ao culto que os criou** (`lotes: [{cultoId,
  ids}]`): o desfazer manda cada lote pro seu culto, e é essa amarração que
  impede um id perdido no payload de apagar escala de outro dia.
- ⚠️ **Desfazer PARCIAL não se apresenta como sucesso** — o que sobrou continua
  escalado, e quem não souber disso escala outra pessoa por cima.
- Culto sem composição **não é erro**: vira contagem com o caminho ("aplique um
  template"), não um toast vermelho que faz parecer que o botão quebrou.
- A disponibilidade que o voluntário marca no app **já era regra do servidor**
  desde 13/08 — a tela existe (`components/voluntariado/Disponibilidade.tsx`) e
  grava pelos endpoints `/app/voluntariado/indisponibilidade[s]`.

### ⚠️⚠️ Aviso na SEMANA do serviço · `services/escalaAviso.js`

Automático, de **carona no cron `/api/agente-voluntariado/cron/checar`**
(`10 11 * * *` = 8h10 BRT · sem slot novo no `vercel.json`, que já tem 46) +
botão **"Avisar a semana"** no painel do agente, para quem for escalado DEPOIS
da rodada do dia.

- **Régua PURA em `backend/utils/avisoEscala.js`** (**no gate** ·
  `src/test/avisoEscala.test.ts`, 24 casos · **4 mutantes RODADOS**: agrupar por
  escala → 2 vermelhos · avisar culto que já passou → 1 · lembrar quem recusou →
  1 · data/hora em UTC → 3).
- ⚠️⚠️ **AGRUPA POR (PESSOA, DIA).** Quem serve nos quatro cultos de domingo
  receberia QUATRO mensagens quase idênticas — o padrão que a Meta lê como spam,
  e a nota de qualidade do número é o que decide a subida de tier da conta. Uma
  mensagem por dia, citando os horários ("domingo, 16/08, às 08:30, 10:00 e
  19:00").
- ⚠️ **Culto que já passou nunca é avisado** e **quem RECUSOU não é lembrado**
  (a pessoa já disse que não vai; insistir é constrangimento). Confirmado É
  lembrado — o aviso é da semana, não da confirmação.
- ⚠️⚠️ **O registro de "já avisei" é a UNIÃO dos dois canais** (`whatsapp_envios.
  ref_id` + `app_notificacoes.chave_dedup`), sem tabela nem coluna nova. Só a
  fila não bastaria: **enquanto o template não estiver aprovado ela não grava
  nada**, e quem recebeu pelo app receberia de novo todo dia. A checagem procura
  QUALQUER escala do grupo — assim a ordem do array não importa.
- **Dois canais, não um**: push/in-app pra quem tem conta (grátis, imediato, e o
  tipo `escala` **já é roteado** pelos dois mapas do app pra /voluntariado) +
  WhatsApp pela fila pra quem tem telefone. Só o app deixaria a maioria sem
  aviso (a base de tokens é pequena e 100% iOS); só o WhatsApp desperdiça um
  canal grátis num disparo com teto de 250 destinatários/24h.
- **Telefone pela cadeia canônica** (`perfisPorId`, exportada do
  `agenteVoluntariado`) — ler só `vol_profiles.phone` é o bug de 13/08 (8 de 930).
- Teto de rodada 200 com `adiados` **declarado**; como o cron roda todo dia, o
  adiado de hoje sai amanhã.
- ⚠️ O aviso roda em bloco protegido dentro do cron: **falhar não pode derrubar
  o alerta do coordenador**, que divide a mesma execução.

⏳ **PENDENTE DE GENTE, e sem isso o WhatsApp não sai**: `WHATSAPP_TEMPLATE_ESCALA`
**não existe na Vercel** (conferido em 14/08 com `vercel env ls`: há 15
`WHATSAPP_TEMPLATE_*` e essa não está entre elas). É preciso aprovar o template
`escala_voluntario` na Meta (UTILITY · pt_BR · `{{1}}` área · `{{2}}` evento ·
`{{3}}` quando), setar a env em produção e **fazer deploy novo**. Até lá o aviso
sai **só pelo app**, e o relatório diz exatamente isso — nunca "0 enviados" como
se fosse sucesso.
⚠️ **Não pus default no código de propósito**: nome de template errado é recusa
**permanente** da Meta (132001), que queima o aviso sem retry.

### Ajustes da matriz

- **Teto de colunas 24 → 40**: 4 semanas sem filtro rendem ~28 cultos, então a
  visão padrão vinha truncada — o usuário pedia 4 semanas e recebia 3 e meia.
- **Célula sem composição escreve "vazio"** (pedido dele) — um traço é ambíguo
  com "não carregou".

## ⚠️⚠️ Escala · o WhatsApp da VÉSPERA com "não vou poder" (2026-08-14 · SEM migration)

Pedido do Matheus: *"queria que chegasse a mensagem no wpp tbm, com a opção da
pessoa falar que não vai. O disparo deve ser feito 1 dia antes. Se ela indicar
que não vai, deve atualizar imediatamente na escala e avisar [a coordenação] no
app do staff e no sistema. E deve avisar tbm no app do membro, mas aí apenas
para o membro que é supervisor da área da pessoa que disse que não vai."*

### O que mudou

- **Disparo é na VÉSPERA**, não numa janela de 7 dias: `avisarVespera()` avisa
  quem serve **amanhã** (dia da IGREJA). ⚠️ `dias: 2` no limite externo não é
  descuido — com 1, o corte cairia em cima do culto de amanhã à noite (mais de
  24h à frente) e ele nunca seria avisado. O botão manual cobre hoje+amanhã.
- **O link vai como 4º parâmetro do template**, no CORPO (não em botão de URL),
  que é o que mantém a categoria UTILITY — mesma decisão dos fluxos de grupos.
- ⚠️ **Sem link, o WhatsApp NÃO sai.** O template tem 4 variáveis, então mandar
  3 é recusa da Meta por contagem de parâmetros; disparar 200 mensagens que
  serão recusadas uma a uma é pior que não disparar. O relatório declara.

### `/e/<token>` · a página do "vou / não vou poder"

- **`backend/utils/escalaToken.js`** — HMAC do id da escala, namespace
  **`escala-resposta:`**, fail-closed, segredo `ESCALA_TOKEN_SECRET` com
  fallback no `CRON_SECRET`. ⚠️ O namespace é o que impede um token do CENSO ou
  do comprovante de inscrição — **mesmo segredo** — de derrubar a escala de
  outra pessoa. Tem teste específico pra isso (`src/test/escalaToken.test.ts`,
  12 casos, **no gate** · 2 mutantes rodados: sem namespace → 1 vermelho ·
  aceitar sem segredo → 1).
- **Sem login de propósito**: a credencial é o token que chegou no WhatsApp
  dela. Exigir login seria o mesmo que não ter o botão — a maioria dos
  voluntários não tem conta.
- ⚠️ A página devolve o **mínimo** (primeiro nome, área, função, culto,
  horário). Link vaza em print e celular emprestado; não pode virar janela pra
  base de gente. Recusa **neutra**: não distingue token inválido de escala
  inexistente.
- ⚠️ **SEM `publicLimiter` (10/15min)** nas duas rotas: ele é pro probing de
  CPF/login, e aqui são 200 pessoas clicando no mesmo dia, muitas atrás do
  mesmo NAT — travaria na 3ª (lição do censo). Vale o `limiterGeral` do router,
  e somar outro contaria **2× a mesma requisição**.

### `services/escalaResposta.js` · o caminho ÚNICO da resposta

Serve o link público E o `POST /my-schedules/:id/respond` do app. Duas
implementações divergiriam como *"recusou pelo app e ninguém foi avisado"*.

- ⚠️ **O UPDATE é condicionado ao status anterior** (`.neq(...)` + `.select`) e
  é ele que decide se houve transição: sem isso, abrir o link duas vezes
  dispararia o aviso à coordenação de novo. Mesmo cuidado dos recibos do
  WhatsApp — o efeito colateral fica amarrado à mudança real.
- **Coordenação**: `notificar()` do módulo `voluntariado` — o **sistema e o app
  do staff leem a mesma tabela**, então uma chamada cobre os dois. ⚠️ Quem
  recebe vem de `notificacao_regras`, **não de uma lista de nomes no código**
  (lei do projeto: o dono do fluxo muda sem PR). Sem regra, cai no fallback de
  admin/diretor.
- **App do membro**: `notificarApp` só pro **supervisor da área**
  (`vol_teams.leader_profile_id` → `vol_profiles.membresia_id` → `profiles`).
  Tipo `escala`, que **já é roteado** pelos dois mapas do app.
- ⚠️ Supervisor não resolvido (sem líder cadastrado, ou líder sem conta no app)
  **não derruba a resposta** — a pessoa dizer que não vai é o que importa.

### ⚠️⚠️ `POST /my-schedules/:id/respond` não conferia de quem era a escala

Achado ao ligar o fluxo: o handler fazia `update ... .eq('id', req.params.id)` e
pronto — **qualquer pessoa autenticada podia recusar a escala de qualquer
outra** sabendo só o id. Com o aviso automático, uma recusa forjada ainda
acordaria a coordenação e o supervisor. Agora confere `vol_profiles.auth_user_id`
(ou `planning_center_id`); coordenação com `voluntariado >= 3` também responde
por alguém — é o caso real de "a pessoa me avisou por telefone".

### ⏳ PENDENTE DE GENTE · sem isto o WhatsApp não sai

O template **`escala_voluntario` precisa ser criado na Meta com 4 variáveis**
(UTILITY · pt_BR) e `WHATSAPP_TEMPLATE_ESCALA` setada em produção + **deploy
novo**. Sugestão de corpo:

> Oi, {{1}} precisa de você amanhã!
> Você está escalado(a) em *{{2}}* — {{3}}.
> Se não puder ir, avise por aqui: {{4}}

`{{1}}` área · `{{2}}` evento · `{{3}}` quando · `{{4}}` link.
⚠️ **Não pôr default no código**: nome de template errado é recusa PERMANENTE
(132001), que queima o aviso sem retry. Até lá o aviso sai **só pelo app**.

## ⚠️⚠️ Escala · a resposta vem PELO PRÓPRIO WHATSAPP (2026-08-14 · SEM migration)

Decisão do Matheus, corrigindo a leva anterior: *"quero algo que a pessoa
responda pelo wpp mesmo"*. O link `/e/<token>` funciona, mas botão é **um
toque** — link é sair do WhatsApp, abrir navegador e esperar carregar.

O aviso de véspera passou a sair com **dois botões de quick-reply** ("Vou sim" /
"Não vou poder"). A resposta chega no webhook e cai no MESMO
`services/escalaResposta` que o link e o app usam — atualiza a escala na hora,
avisa a coordenação (sistema + app do staff) e o supervisor da área no app do
membro.

### ⚠️⚠️ O que amarra a resposta à escala é o `context.id`

A resposta do botão traz `context.id` = o **wamid da mensagem que nós
mandamos**, e `whatsapp_envios.message_id` já guardava esse wamid desde sempre.
`ref_id` daquela linha é a escala. Sem esse elo não dá pra saber de qual convite
a pessoa está falando — **quem serve em duas áreas na mesma semana teria a
recusa aplicada na escala errada**.

⇒ Resposta SEM `context` não é tratada como escala: segue pro fluxo normal do
bot. É o que impede um "não vou" solto no meio de outra conversa de derrubar uma
escala.

### As três armadilhas

1. ⚠️⚠️ **"Não vou poder" CONTÉM "vou".** A régua avalia a NEGAÇÃO primeiro —
   procurar a afirmação antes transforma toda recusa em confirmação, e o efeito
   é a pessoa avisar que não vai, o sistema responder "presença confirmada" e
   ninguém repor a vaga no domingo. Mutation-testado
   (`src/test/respostaEscala.test.ts`, 12 casos, **no gate**: inverter a ordem →
   3 vermelhos · inventar wamid quando não há `context` → 1).
2. ⚠️ **OPT-OUT tem prioridade** (decisão do Marcos, 24/07): *"não quero mais
   receber"* contém negação e seria lido como "não vou poder" — a pessoa pedindo
   pra sair da lista acabaria recusando a escala **e continuando na lista**. O
   handler devolve `false` e deixa o fluxo de opt-out tratar.
3. ⚠️ **Não entendeu? NÃO CHUTA.** Responde pedindo os botões. Marcar presença
   que a pessoa não deu é pior que perguntar de novo — e a janela de 24h está
   aberta, então o texto chega.

### Detalhes

- **O handler é testado ANTES dos outros fluxos** (só no número institucional):
  se caísse no bot, "não vou poder" viraria conversa com a IA. Ele devolve
  `false` quando a mensagem não é dele, e aí o despacho segue igual.
- **Confirmação de volta por texto** na mesma conversa (janela aberta, a pessoa
  acabou de escrever): "Presença confirmada 💚" / "Tudo bem, avisamos a
  liderança…". Sem isso a pessoa toca o botão e não sabe se funcionou.
- Idempotência pelo `whatsapp_coletas.whatsapp_message_id`, como os outros
  handlers — reentrega da Meta é comum.
- **O corpo do template voltou a 3 variáveis** (sem link): os botões substituem
  o `{{4}}`. O `/e/<token>` **continua existindo** como caminho alternativo (o
  coordenador pode mandar o link na mão) — não apagar.

### ⚠️⚠️ MODELO OPT-OUT · UM botão só (correção do Matheus, 14/08)

*"Mas ela já tá como sim. Quero que tenha apenas um botão ou então um número
para ela digitar para dizer NÃO vai conseguir comparecer."*

Quem foi escalado **VAI**. A mensagem não pede confirmação — informa e oferece a
única ação que a pessoa precisa tomar: avisar que não vai. Isso muda 3 coisas:

- **O template tem UM botão** ("Não vou poder"), não dois.
- **O dígito `2` também recusa** (`1` confirma), pra quem não enxerga botão —
  WhatsApp antigo, mensagem encaminhada. ⚠️ O dígito casa a MENSAGEM INTEIRA:
  *"chego 2 minutos antes"* não pode virar recusa. Mutation-testado.
- **A página `/e/<token>` segue o mesmo desenho**: o destaque é "Não vou
  conseguir comparecer", e confirmar virou link discreto. Dois botões iguais
  fariam a pessoa parar pra decidir algo que já estava resolvido.
- ⚠️ **Na tela do sistema, "sem resposta" NÃO é dívida** — é gente que vai. Os
  tooltips dos contadores (card da área e cabeçalho da matriz) dizem isso:
  *"ainda sem resposta (contam como presentes)"*. Sem essa leitura, o
  coordenador vê "45 pendentes" e acha que tem 45 pessoas para cobrar.

⚠️ **O status no banco continua `pending`** até a pessoa responder — não foi
trocado para `confirmed` de propósito: `confirmacoes_pendentes` do agente e os
contadores das telas leem esse campo, e mudar o default mexeria em tudo o que já
funciona. O que mudou é a LEITURA, e ela está escrita nos tooltips.

### ⏳ PENDENTE DE GENTE · o template

Criar `escala_voluntario` na Meta — **UTILITY · pt_BR · 3 variáveis no corpo +
1 botão de quick-reply** — e setar `WHATSAPP_TEMPLATE_ESCALA` + deploy novo.

> Corpo: Oi! Você está escalado(a) em *{{1}}* amanhã.
> {{2}} — {{3}}.
> Não precisa confirmar. Se NÃO conseguir vir, toque no botão abaixo (ou responda 2).
>
> Botão (quick reply): **Não vou poder**

⚠️ **O `{{3}}` NÃO repete o dia da semana quando o `{{2}}` já o diz** (reparo do
Matheus vendo a prévia na Meta, 14/08): a mensagem monta `{{2}} — {{3}}`, e com
"Culto de Domingo" saía *"Culto de Domingo — domingo, 16/08…"*. A omissão é
decidida contra o dia REAL do culto, não contra "tem palavra de dia no nome" —
um "Culto de Domingo" reagendado pro sábado precisa dizer **sábado**, e é isso
que evita a pessoa aparecer no dia errado. Com vários cultos no mesmo dia o
`{{2}}` vira "2 cultos" e o dia volta pro `{{3}}`. Mutation-testado.

⚠️ **O texto do botão importa**: é ele que chega em `m.button.text` e é o que a
régua interpreta. "Não vou poder" é reconhecido; se mudarem na Meta, conferir
contra `utils/respostaEscala.js`.
⚠️ Botão ESTÁTICO — o envio não muda por causa dele. Só se um dia virar botão
com payload dinâmico é que será preciso mandar `components` com
`sub_type: 'quick_reply'`.
