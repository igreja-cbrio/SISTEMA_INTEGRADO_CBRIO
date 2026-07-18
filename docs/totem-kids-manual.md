# Manual · Totem Kids · CBRio

> **Última atualização**: 2026-05-22 · versão 2
> Versão HTML ilustrada (com fotos/exemplos visuais): [`totem-kids-manual.html`](./totem-kids-manual.html)
> Setup técnico da impressora: [`totem-kids-setup-brother.md`](./totem-kids-setup-brother.md)
> Plano de arquitetura: [`checkin-kids-plano.md`](./checkin-kids-plano.md)

---

## 1. Visão geral

O **Totem Kids** é o sistema que registra cada criança que chega no ministério
infantil. Substitui o antigo Planning Center Check-Ins.

Em cada check-in:
- Registra qual criança chegou, em qual sala vai ficar, e quem trouxe
- Gera um **código de segurança único de 4 letras/números** (ex: `F8K3`)
- Imprime **2 etiquetas Brother DK-1201** (90 × 29mm paisagem): uma fica com
  a criança, outra com quem trouxe
- Na hora de buscar, os 2 códigos têm que bater · garante que a criança só
  sai com quem deixou

**Estado atual do banco** (importado do PC, dez/25 → mai/26):
- 660 famílias cadastradas
- 894 crianças (status visitante por padrão)
- 2637 vínculos responsável-criança
- 498 crianças (56%) com pelo menos 1 responsável vinculado
- 394 sem vínculo · vão preencher organicamente no 1º check-in via modal
  auto-cadastro

---

## 2. Como fazer o check-in (entrada)

1. Abra o Totem Kids no computador da recepção: `/ministerial/totem-kids`
   (menu lateral: **Ministerial → Ferramentas → Totem Kids**).
2. Confira no topo:
   - Nome do culto da sessão atual
   - Badge da **estação pareada** (ex: "Totem Recepção 1") · se aparecer
     amarelo "não pareada", veja seção 10 abaixo
3. Digite o nome da criança no campo de busca (parcial funciona) · ou o
   telefone do responsável.
4. Clique no card da criança certa (confira idade + nome da família).
5. A sala vem **sugerida automática** baseada na idade · troque se necessário.
6. Se aparecer **caixa amarela "ATENÇÃO MÉDICA"**, leia em voz alta com a mãe
   pra confirmar (alergia, medicação).
7. **Se a criança não tem nenhum responsável cadastrado** (caso comum nas 394
   crianças importadas sem pai/mãe vinculado), **modal automático abre**
   pedindo:
   - Nome do responsável
   - Telefone
   - CPF (opcional)
   - Parentesco
   Voluntário pode preencher (cria mem_membros + liga em 1 clique) ou clicar
   em **"Pular agora"** pra seguir fluxo manual.
8. Selecione quem está entregando hoje na lista de responsáveis · ou clique
   em "Outro responsável (manual · não cadastra)" se for visita pontual.
9. Clique no botão rosa **Imprimir & Confirmar** → 2 etiquetas saem na Brother.

Cola a etiqueta da criança no peito/costas. Entrega a do responsável pra ela.

---

## 3. Como ler as etiquetas (DK-1201, 90 × 29mm paisagem)

**Etiqueta da CRIANÇA** (cola no peito):
- Faixa colorida da sala (à esquerda)
- Nome grande
- Sala + idade
- **Alergia/medicação** em destaque preto (se houver)
- Código de segurança (à direita, fonte grande)
- Data/hora

**Recibo do RESPONSÁVEL** (fica com quem trouxe):
- Logo CBRio + "Recibo Kids"
- Nome da criança + sala (à esquerda)
- Código grande + código de barras (à direita)
- "Apresente para buscar"

> **NÃO vai no recibo do responsável**: alergia, idade exata, foto.
> Segurança LGPD com menores.

> **Os 2 códigos têm que ser idênticos.** Se sair diferente, cancele e refaça.

---

## 4. Cadastrar criança nova (primeira visita)

1. Na tela do Totem Kids, clique no botão rosa **+ Nova criança** ao lado da
   busca · sempre visível.
2. Preencha:
   - Nome (obrigatório)
   - Data de nascimento (opcional · pode ser só mês/ano)
   - Sexo (opcional)
   - **Alergia ou medicação** (pergunte sempre)
3. Preencha responsável:
   - Nome ✱
   - Telefone ✱
   - CPF (opcional)
   - Parentesco
4. **Cadastrar** · cai automático no fluxo de check-in.

> **LGPD com menores**: não pedimos CPF de criança. Não pedimos foto.

---

## 5. Como fazer o checkout (saída)

1. `/ministerial/totem-kids/checkout` (ou botão "Checkout" no header).
2. Peça o recibo da mãe. Digite o código de 4 caracteres (ou escaneie o
   código de barras com leitor USB).
3. Aparecem nome da criança, sala, quem entregou.
4. Se for a **mesma pessoa**, clique em "Mesma pessoa que entregou".
5. Se for **outro responsável autorizado**, clique no card dele.
6. Se quem busca **não está na lista** → seção 6 (override).
7. Vai até a sala, traz a criança, confirma identidade visual (etiqueta da
   criança bate com o código da mãe).

---

## 6. Pessoa diferente buscando a criança · Override

> **SEMPRE faça contato com quem entregou** antes de liberar.

1. Na tela de checkout, depois de encontrar a criança, clique em
   **⚠ Outra pessoa (precisa override)**.
2. Chame **Coord Kids (Mariane)**, **Admin do sistema** ou **Líder Kids do
   dia** · só essas pessoas aprovam.
3. Escreva motivo completo (mín 10 chars):
   - Quem está buscando (nome, parentesco)
   - Por que a mãe não veio
   - Como confirmou identidade (ligou, WhatsApp com foto, etc)
4. Coordenadora aprova · sistema registra **tudo** em auditoria
   (`/configuracoes` → aba Auditoria).

---

## 7. Decisão por Jesus

Duas formas:

### 7.1 Pelo painel ao vivo (rápido · marca por sala)
1. `/ministerial/totem-kids/painel` · clica num card de sala
2. Modal abre com lista de crianças presentes
3. Botão "Marcar decisão" ao lado da criança
4. Toast mostra: "1ª decisão registrada 🙏" ou "renovou a decisão · 3ª vez"

### 7.2 Pela sala de decisões (recomendado · workflow pastoral)
1. `/ministerial/totem-kids/decisoes` (botão **Decisões** no header)
2. Pegue a etiqueta de peito da criança que tomou decisão
3. Digite os 4 chars no campo grande
4. Sistema preenche TUDO: foto, nome, idade, sala original, alergia,
   responsável, telefone, parentesco
5. Banner colorido mostra sequência:
   - 🟢 "1ª decisão dessa criança no Kids!"
   - 🔵 "3ª vez · já decidiu 2 vezes antes"
6. Adicione observação pastoral opcional ("entendeu bem", "precisa de
   acompanhamento", etc)
7. Clique **Confirmar decisão**

Em ambos os casos o sistema vincula automaticamente em
`cultos_decisoes_pessoas` com `kids_crianca_id` preenchido · permite **contar
quantas vezes a mesma criança decidiu** ao longo do tempo (em cultos diferentes
cria registros separados).

> **LGPD com menores**: criança não vira "membro" automaticamente.
> Pastoral conduz acompanhamento com a família depois.

---

## 8. Importar planilha de crianças

Pra cadastrar várias crianças de uma vez (ex: histórico do Planning Center).

### Via UI (recomendado pra arquivos pequenos)

1. `/ministerial/totem-kids/configuracoes` → aba **Crianças**.
2. Clique em **Importar XLSX**.
3. Selecione o arquivo `.xlsx` ou `.csv`.
4. **Analisar** (dry-run) · valida sem gravar.
5. Confirme → import roda e mostra relatório (criadas, atualizadas, erros).

### Via script local (recomendado pra arquivos grandes / PCO)

Pra migração inicial usamos 2 scripts:

#### `scripts/importar_kids_pco.cjs`
Importa crianças do CSV de "attendance" do PC:
```bash
node scripts/importar_kids_pco.cjs <caminho-csv> [--dry-run]
```
- Filtra `Child=true` + `Status=active`
- Agrupa pelo identificador de família do Planning Center · cria `mem_familias`
- Cria `kids_criancas` com `visitante=true`
- Tenta vincular adultos da MESMA família como responsáveis

#### `scripts/vincular_responsaveis_pco.cjs`
Roda DEPOIS do import, com export de adultos:
```bash
node scripts/vincular_responsaveis_pco.cjs <caminho-csv> [--dry-run]
```
- Lê o CSV de famílias e responsáveis exportado pelo Planning Center.
- Faz **fuzzy match** com `mem_familias`, removendo o sufixo familiar legado em inglês.
- Cria `mem_membros` (status visitante) pra adultos novos
- Vincula em `kids_responsaveis` (idempotente)

### Filtros recomendados no PC

| Filtro PC | O que traz | Quando usar |
|---|---|---|
| **Attendance attended any event** | Quem fez check-in | Pegar histórico de crianças do Kids |
| **Famílias responsáveis por crianças ativas** | Pais/responsáveis legais | Vincular adultos faltando |
| **Pessoas pertencentes a famílias com crianças** | Todas as pessoas das famílias com crianças | Cobertura completa de pais |

### Colunas importantes (case-insensitive)

| Coluna | Obrigatória? | Match prioridade |
|---|---|---|
| `Person ID` / `nome_crianca` ou `nome` | ✱ | - |
| `data_nascimento` ou `Birthdate` | recomendado | - |
| Identificador e nome da família no Planning Center | ✱ | match com `mem_familias` |
| `responsavel_nome` | ✱ | - |
| `responsavel_telefone` ou `Mobile Phone Number` | ✱ | telefone normalizado |
| `responsavel_cpf` ou `CPF :: CPF` | recomendado | **CPF preferencial** |
| `Home Email` | opcional | fallback |
| `Gender` | opcional | infere parentesco (Female→mãe, Male→pai) |

---

## 9. Encerrar sessão

No fim do culto, coordenadora vai em `/ministerial/totem-kids/painel` ·
botão vermelho **Encerrar sessão**. O sistema:
- Consolida `cultos.presencial_kids` = total de check-ins
- Consolida `cultos.decisoes_kids` = total que fez decisão por Jesus
- Alimenta KPI `KID-01` automaticamente
- Marca sessão como `encerrada`

Cron noturno (23h · agendar via pg_cron) fecha checkins esquecidos de sessões
encerradas há mais de 1h OU abertos há mais de 8h como `checkout_forcado` +
dispara alerta.

---

## 10. Parear tablet/celular com estação

Cada dispositivo se pareia com **uma estação** via QR (uma vez por device,
sem login adicional). Daí pra frente todo check-in feito naquele tablet
vincula automaticamente à estação.

### Como parear

1. **Admin** vai em `/ministerial/totem-kids/configuracoes` → aba **Estações**
2. Clica no botão **✨** ao lado da estação que quer parear
3. Modal abre com **QR code** + URL `?estacao=X&token=Y`
4. **Tablet** escaneia o QR (qualquer leitor de QR · câmera nativa do iPad
   funciona)
5. Página `/ministerial/totem-kids/parear` valida o token e **salva no
   localStorage** do dispositivo
6. Volta no Totem · header agora mostra badge verde **"Totem Recepção 1"**

### Revogar tablet (quando perder/trocar)

1. Admin → Estações → ✨ da estação → **Regenerar token**
2. Tablet antigo passa a dar erro · admin escaneia QR novo no tablet certo

### Sem pareamento

Funciona mas o check-in fica **sem `estacao_id`** no banco. Útil pra teste
mas em produção pareia tudo.

---

## 11. Configurar a impressora Brother (admin · feito 1× por totem)

Setup em detalhe em [`totem-kids-setup-brother.md`](./totem-kids-setup-brother.md).

Resumo:
1. Brother QL-820NWB com cabo Ethernet no roteador da igreja
2. Rolo **DK-1201** (90 × 29mm pré-cortada paisagem)
3. Driver Brother no Windows + Brother como **impressora padrão**
4. Browser configurado pra impressão silenciosa:
   - **Edge** (recomendado): `edge://settings/printing` → "Impressão silenciosa"
   - **Chrome**: atalho com flag `--kiosk-printing`
5. Teste: `/ministerial/totem-kids/teste-etiqueta` → preencha → "Imprimir teste"

---

## 12. Troubleshoot rápido

| Sintoma | Diagnóstico |
|---|---|
| Não imprime nada | Brother ligada? Rolo dentro? Tenta página de teste do Windows |
| Etiqueta vem em branco | Trocar rolo (cabou) ou re-instalar driver |
| Saiu só 1 etiqueta | Pode ter travado · botão "Reimprimir" no check-in |
| Texto cortado nas bordas | Verificar margens 0 + papel `90 × 29mm DK-1201` paisagem |
| Caixa de diálogo aparece | Configurar impressão silenciosa do browser (seção 11) |
| Criança não aparece na busca | Tenta primeiro nome ou telefone; senão é 1ª visita → **+ Nova criança** |
| Mãe perdeu o recibo | Override (seção 6) |
| Badge "não pareado" no header | Parear o tablet (seção 10) ou ignorar se for só teste |

---

## 13. Quem pode fazer o quê

| Pessoa | Pode |
|---|---|
| **Voluntária Kids do dia** | Operar totem · check-in · checkout · marcar decisão · cadastrar responsável faltante · pedir override |
| **Líder Kids do dia** | Tudo da voluntária + aprovar override |
| **Coordenadora Kids (Mariane)** | Tudo acima + CRUD salas/crianças/estações + encerrar sessão + auditoria + parear estações |
| **Admin do sistema** | Tudo |

---

## 14. Atalhos do app (rotas e URLs)

| Rota | Pra que serve |
|---|---|
| `/ministerial/totem-kids` | Check-in (tela principal) |
| `/ministerial/totem-kids/checkout` | Checkout · digita código da etiqueta |
| `/ministerial/totem-kids/decisoes` | Sala de decisões (digita código → vincula) |
| `/ministerial/totem-kids/painel` | Painel ao vivo · clica em sala pra detalhes |
| `/ministerial/totem-kids/teste-etiqueta` | Teste impressão sem criar check-in real |
| `/ministerial/totem-kids/parear?estacao=X&token=Y` | Pareamento de tablet (gerado por QR) |
| `/ministerial/totem-kids/configuracoes` | Admin · 5 abas (Sessões, Salas, Estações, Crianças, Auditoria) |
| `/kids` | Painel de KPIs Kids (já existia · só leitura) |

---

## 15. Checklist pré-domingo

- [ ] Brother configurada no Windows do totem (passo-a-passo no setup-brother.md)
- [ ] Brother carregada com rolo DK-1201
- [ ] Cada tablet/computador da recepção **pareado** com sua estação
- [ ] Sessão criada pro culto: `/configuracoes` → Sessões → "+ Nova sessão"
- [ ] Mariane + voluntários treinados (passar este manual)
- [ ] Testar 1-2 check-ins fake antes do culto começar
- [ ] Teste de impressão limpo (sem texto cortado)
- [ ] Browser do totem com impressão silenciosa ativada

## 16. Checklist pós-culto

- [ ] Encerrar sessão no painel (consolida `cultos.presencial_kids`)
- [ ] Conferir auditoria de overrides (deveria ser 0 ou poucos)
- [ ] Verificar se KPI `KID-01` atualizou no painel `/kids`

---

## 17. Migrations aplicadas

Em ordem cronológica:

| Migration | O que faz |
|---|---|
| `20260521160000_totem_kids_schema.sql` | Schema completo (7 tabelas, 2 views, 5 triggers, 3 funções) |
| `20260521160100_totem_kids_seed.sql` | 5 salas padrão (Berçário, Maternal, Infantil 1/2, Pré-AMI) + 1 estação default |
| `20260521190000_totem_kids_etiqueta_paisagem.sql` | DK-1201 paisagem (90×29mm) |
| `20260521210000_totem_kids_decisoes_link_fix.sql` | `kids_crianca_id` em `cultos_decisoes_pessoas` + views de contagem |
| `20260521220000_totem_kids_pareamento.sql` | `token_pareamento` em `kids_estacoes` |

---

Última atualização: 2026-05-22 · versão 2 · pareamento + modal auto-cadastro + import PCO concluído
