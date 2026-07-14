# Google Stax · guia de configuração e avaliação da IA do sistema

O [Stax](https://stax.withgoogle.com) é a ferramenta experimental do Google Labs pra
avaliar LLMs: você sobe um dataset (CSV), define avaliadores (rubricas julgadas por um
LLM ou notas manuais) e compara resultados entre modelos/prompts. **Não tem API** — todo
uso é pela interface web; por isso o fluxo aqui é: exportar CSV → subir na UI → avaliar.

## Passo a passo (primeira vez · ~15 min)

1. Acesse **stax.withgoogle.com** e entre com uma conta Google.
2. No onboarding (ou em **Settings**), adicione uma **chave da API Gemini** — os
   avaliadores automáticos usam Gemini por padrão. Crie a chave em
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (tem cota gratuita;
   acima dela é cobrada — decisão de custo sua, como manda a regra do projeto).
3. **Add Project** → projeto de modelo único (ou *Side-by-Side* pra comparar dois).
4. **Add Data > Import Dataset** → suba um CSV desta pasta.
5. **Evaluate** → crie um avaliador customizado colando uma rubrica da seção abaixo.
6. Veja os agregados em **Project Metrics**.

### Teste de hoje (sem dado real)

Suba o **`exemplo_whatsapp_culto.csv`** — dataset 100% sintético que simula o parser
de números de culto do bot WhatsApp (24 casos, ~20% com output propositalmente errado,
gabarito na coluna `expected` e veredito em `human_verdict`). Serve pra você conhecer o
fluxo inteiro do Stax e ver o avaliador discriminando certo/errado, sem nenhum dado de
membro envolvido.

## Exportar datasets reais

```bash
node backend/scripts/_stax_export.js <dataset> [--limite=200]
```

Rodar na máquina que tem o `backend/.env` (o script é read-only e os CSVs saem em
`backend/scripts/stax-export/export_*.csv`, que é **gitignored — nunca commitar**;
apague o arquivo depois do upload).

| Dataset | O que avalia | Gabarito | Estado (2026-07-13) |
|---|---|---|---|
| `whatsapp_culto` | Parser de números de culto (Haiku) | Submissão aplicada pelo coordenador | ~3 casos — aguardando uso do bot |
| `nf_categoria` | Sugestão de categoria contábil da NF (Haiku) | Categoria final lançada pelo financeiro | 0 casos — fluxo de scan ainda sem uso |
| `compras_scan` | Extração de compra escaneada (fila do Pery) | Campos após aprovação | 1 caso |
| `nps_comentarios` | Análise qualitativa de texto livre do NPS | Sem gabarito (inputs-only) | ~29 comentários |

**Leitura honesta desse estado**: os fluxos de IA do sistema são recentes e as filas de
revisão quase não têm veredito humano acumulado ainda (constatação no banco vivo em
13/07/2026 — inclusive havia 383 propostas do agente financeiro paradas em `pending`).
O exportador fica pronto; os datasets ganham corpo conforme a operação usar as filas.
Piso recomendado: **só tirar conclusão de fatia com 25+ pares**.

## Rubricas prontas (colar no avaliador do Stax)

**whatsapp_culto / exemplo_whatsapp_culto** — avaliador de exatidão da extração:

```
Você avalia um extrator de números de relatórios de culto de igreja.
A coluna "input" é a mensagem original do líder. A coluna "output" é o JSON
extraído automaticamente. A coluna "expected" é o gabarito correto.
Compare campo a campo (presencial, kids, decisoes, visitantes): o output
corresponde ao expected? Números ausentes devem ser null, nunca inventados.
Responda "correto" ou "incorreto" e aponte em uma frase qual campo divergiu.
```

**nf_categoria** — avaliador de classificação contábil:

```
Você avalia a sugestão de categoria contábil pra uma nota fiscal de igreja.
"input" descreve a nota (emitente, valor, itens). "output" é a categoria
sugerida pela IA com a explicação. "expected" é a categoria final escolhida
pelo financeiro. Julgue: a sugestão indica o mesmo plano de contas do
expected? Se expected estiver vazio, julgue apenas se a sugestão é plausível
pro conteúdo da nota. Responda "correto", "plausivel" ou "incorreto".
Lembrete de regra contábil: empréstimo/captação/mútuo nunca é receita ordinária.
```

**nps_comentarios** — avaliador de análise qualitativa (use com *Generate Outputs*:
o Stax gera o output a partir do input + system prompt que você colar — por exemplo,
o prompt de análise do módulo NPS):

```
"input" é um comentário real de pesquisa de satisfação (score 0-10 + texto).
"output" é uma análise gerada (temas, sentimento). Julgue de 1 a 5:
(a) os temas citados existem mesmo no comentário (sem inventar)?
(b) o sentimento condiz com o score e o texto?
Dê a nota e uma frase de justificativa.
```

## ⚠️ O que NUNCA sobe pro Stax (regra · ver CLAUDE.md)

Pedidos de oração, transcrições/atas de governança, relatos nominais de grupos, fila
pastoral (primeiro contato/batismo/convertidos), documentos do Cérebro e qualquer dado
de Kids. Dado de igreja identifica **convicção religiosa** (categoria especial · LGPD
art. 11) e o Stax é ferramenta experimental sem contrato de tratamento de dados. Pra
esses fluxos, a avaliação deve ser feita **dentro do sistema** (ver abaixo).

## Onde a medição de verdade deve viver (recomendação do conselho)

O sistema já grava o veredito humano das filas (aplicado/rejeitado/editado, sugestão da
IA vs valor final). Quando essas filas acumularem uso, a métrica permanente de "acurácia
da IA" sai de **SQL interno** (sem mandar nada pra fora) — o Stax fica pro caso que ele
resolve bem: **iterar prompt/modelo offline** e avaliar texto livre sem gabarito.
Follow-up sugerido: aba "Acurácia da IA" em `/assistente-ia` calculada das filas.
