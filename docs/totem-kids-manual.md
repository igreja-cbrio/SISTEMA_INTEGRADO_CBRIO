# Manual · Totem Kids · CBRio

> Versão em markdown desse manual. A versão HTML ilustrada (com fotos · usada
> pelos voluntários no totem) está em `public/manuais/totem-kids/index.html`,
> acessível em runtime por `/manuais/totem-kids/`.

---

## 1. Visão geral

O **Totem Kids** é o sistema que registra cada criança que chega no ministério
infantil. Substitui o antigo Planning Center Check-Ins.

Em cada check-in:
- Registra qual criança chegou, em qual sala vai ficar, e quem trouxe
- Gera um **código de segurança único de 4 letras/números** (ex: `F8K3`)
- Imprime **2 etiquetas Brother DK-1201**: uma fica com a criança, outra com
  quem trouxe
- Na hora de buscar, os 2 códigos têm que bater · garante que a criança só sai
  com quem deixou

---

## 2. Como fazer o check-in (entrada)

1. Abra o Totem Kids no computador da recepção: `/ministerial/totem-kids`
   (menu lateral: **Ministerial → Ferramentas → Totem Kids**).
2. Confira no topo qual é o culto da sessão atual.
3. Digite o nome da criança no campo de busca (parcial funciona) · ou o
   telefone do responsável.
4. Clique no card da criança certa (confira idade + nome da família).
5. A sala vem sugerida automática baseada na idade · troque se necessário.
6. Se aparecer **caixa amarela "ATENÇÃO MÉDICA"**, leia em voz alta com a mãe
   pra confirmar.
7. Pergunte quem está entregando hoje e clique no responsável da lista. Se for
   alguém fora da lista, clique em "Outro responsável".
8. Clique no botão rosa **Imprimir & Confirmar** → 2 etiquetas saem na Brother.

Cola a etiqueta da criança no peito/costas. Entrega a do responsável pra ela
(é o recibo).

---

## 3. Como ler as etiquetas

**Etiqueta da CRIANÇA** (cola no peito):
- Faixa colorida da sala
- Nome grande da criança
- Sala + idade
- **Alergia/medicação** em destaque (se houver)
- Código de segurança grande
- Data/hora

**Recibo do RESPONSÁVEL** (fica com quem trouxe):
- Logo CBRio + "Recibo Kids"
- Nome da criança + sala
- Código grande
- Código de barras (pra scan no checkout)
- "Apresente para buscar"

> **NÃO vai no recibo do responsável**: alergia, idade exata, foto.
> Segurança · esses dados podem expor se o recibo cair em mão errada.

> **Os 2 códigos têm que ser idênticos.** Se sair diferente, cancele e refaça.

---

## 4. Cadastrar criança nova (primeira visita)

1. Na tela do Totem Kids, clique no botão rosa **+ Nova criança** ao lado da
   busca.
2. Preencha os dados da criança:
   - Nome (obrigatório)
   - Data de nascimento (opcional · pode ser só mês/ano)
   - Sexo (opcional)
   - **Alergia ou medicação** (pergunte sempre)
3. Preencha os dados do responsável: nome, telefone, CPF (opcional),
   parentesco.
4. Clique em **Cadastrar** · cai automático no fluxo de check-in.

> **LGPD com menores**: não pedimos CPF de criança. Não pedimos foto.
> Só o mínimo pra cuidar bem dela.

---

## 5. Como fazer o checkout (saída)

1. Abra `/ministerial/totem-kids/checkout`.
2. Peça o recibo da mãe. Digite o código de 4 caracteres (ou escaneie o
   código de barras com leitor USB).
3. Aparecem nome da criança, sala, quem entregou.
4. Se for a **mesma pessoa**, clique em "Mesma pessoa que entregou".
5. Se for **outro responsável autorizado** da lista, clique no card dele.
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

## 7. Marcar decisão por Jesus

Duas formas:

### 7.1 Pelo painel ao vivo (rápido)
1. `/ministerial/totem-kids/painel` · clica num card de sala
2. Modal abre com lista de crianças
3. Botão "Marcar decisão" ao lado da criança
4. Toast mostra: "1ª decisão registrada 🙏" ou "3ª vez · renovou a decisão"

### 7.2 Pela sala de decisões (recomendado · workflow pastoral)
1. `/ministerial/totem-kids/decisoes`
2. Pegue a etiqueta de peito da criança que tomou decisão
3. Digite os 4 chars no campo grande
4. Sistema preenche TUDO: foto, nome, idade, sala, alergia, responsável,
   telefone, sequência da decisão (1ª, 2ª, etc)
5. Adicione observação pastoral opcional ("entendeu bem", etc)
6. Clique em **Confirmar decisão**

Em ambos os casos o sistema vincula automaticamente em
`cultos_decisoes_pessoas` com `kids_crianca_id` preenchido.

> **LGPD com menores**: criança não vira "membro" automaticamente.
> Pastoral conduz acompanhamento com a família depois.

---

## 8. Importar planilha de crianças

Pra cadastrar várias crianças de uma vez (ex: histórico do Planning Center).

1. Vai em `/ministerial/totem-kids/configuracoes` → aba **Crianças**.
2. Clique em **Importar XLSX**.
3. Selecione o arquivo `.xlsx`.
4. Sistema valida + mostra preview do que vai ser criado.
5. Confirme → import roda em background.
6. Relatório no fim mostra: criadas, vinculadas (responsáveis já existiam),
   atualizadas, com erro.

### Formato esperado da planilha

Cabeçalho na primeira linha. Colunas (case-insensitive, espaços e acentos
ignorados):

| Coluna | Obrigatória? | Exemplo |
|---|---|---|
| `nome_crianca` | sim | Maria Clara Silva |
| `data_nascimento` | não | 2020-05-15 ou 15/05/2020 |
| `sexo` | não | M / F / outro |
| `alergia` | não | Amendoim, leite |
| `observacoes` | não | Usa aparelho auditivo |
| `responsavel_nome` | sim | Cláudia Silva |
| `responsavel_telefone` | sim | 21999998888 (digitos só) |
| `responsavel_cpf` | recomendado | 12345678900 |
| `responsavel_parentesco` | não | mae / pai / avo_a / tio_a / outro |
| `responsavel2_nome` | não | João Silva (pra cadastrar 2 responsáveis) |
| `responsavel2_telefone` | não | 21988887777 |
| `responsavel2_cpf` | não | 98765432100 |
| `responsavel2_parentesco` | não | pai |
| `ultima_visita` | não | 2026-03-10 (informativo) |

### Lógica de import

- **Idempotente**: se rodar a planilha 2x, não duplica.
- **Match de responsável**: tenta achar `mem_membros` por CPF (preferencial),
  depois por telefone normalizado. Se não acha, cria novo `mem_membros`
  status=`visitante`.
- **Match de criança**: por nome + responsável. Se já existe, atualiza dados
  (alergia, etc) ao invés de criar nova.
- **Família**: se responsável não tem `familia_id`, cria família automática
  com nome "Família [Primeiro nome do responsável]".
- **Status visitante**: toda criança nova entra como `visitante=true`. Vira
  `false` depois quando pastoral confirma cadastro.

### Modelo de planilha

Disponível em `/manuais/totem-kids/modelo-importacao-criancas.xlsx`
(baixar pela UI no botão **Baixar modelo**).

---

## 9. Encerrar sessão

No fim do culto, coordenadora vai em `/ministerial/totem-kids/painel` ·
botão vermelho **Encerrar sessão**. O sistema:
- Consolida `cultos.presencial_kids` = total de check-ins
- Consolida `cultos.decisoes_kids` = total que fez decisão por Jesus
- Alimenta KPI `KID-01` automaticamente
- Marca sessão como `encerrada`

Cron noturno (23h) fecha checkins esquecidos de sessões com mais de 1h
de encerradas como `checkout_forcado` + dispara alerta.

---

## 10. Configurar a impressora Brother (admin)

Setup feito **uma vez por totem** · em detalhe em
`docs/totem-kids-setup-brother.md`.

Resumo:
1. Brother QL-820NWB com cabo Ethernet no roteador da igreja
2. Rolo DK-1201 (29 × 90mm pré-cortada)
3. Driver Brother no Windows + Brother como **impressora padrão**
4. Browser configurado pra impressão silenciosa:
   - **Edge**: `edge://settings/printing` → "Impressão silenciosa"
   - **Chrome**: atalho com flag `--kiosk-printing`
5. Teste: `/ministerial/totem-kids/teste-etiqueta` → "Imprimir teste"

---

## 11. Troubleshoot rápido

| Sintoma | Diagnóstico |
|---|---|
| Não imprime nada | Brother ligada? Rolo dentro? Tenta página de teste do Windows |
| Etiqueta vem em branco | Trocar rolo (cabou) ou re-instalar driver |
| Saiu só 1 etiqueta | Pode ter travado · botão "Reimprimir" no check-in |
| Texto cortado nas bordas | Verificar margens 0 + papel `29 × 90mm DK-1201` |
| Caixa de diálogo aparece | Configurar impressão silenciosa do browser (seção 10) |
| Criança não aparece na busca | Tenta só primeiro nome ou telefone do responsável; senão é 1ª visita → **+ Nova criança** |
| Mãe perdeu o recibo | Override (seção 6) |

---

## 12. Quem pode fazer o quê

| Pessoa | Pode |
|---|---|
| **Voluntária Kids do dia** | Operar totem · check-in · checkout · marcar decisão · pedir override |
| **Líder Kids do dia** | Tudo da voluntária + aprovar override |
| **Coordenadora Kids (Mariane)** | Tudo acima + CRUD salas/crianças no admin · encerrar sessão · auditoria |
| **Admin do sistema** | Tudo |

---

Última atualização: 2026-05-21
