---
name: mapa
description: Regenera e consulta o mapa do sistema (docs/mapa/) — onde mora cada módulo, tela, endpoint, régua e tabela, nos 3 repos. Use ANTES de investigar "como X funciona" ou "onde está Y", e sempre que precisar do estado de agora em vez do mapa commitado.
---

# Mapa do sistema

Responde **onde mora** cada coisa, sem varrer o repositório.

## Regenerar (estado de agora)

```bash
node backend/scripts/gerar-mapa.cjs
```

Roda em ~1s, sem rede e sem banco. Na máquina do Matheus ele acha os 2 repos de
app sozinho (`~/Documents/Aplicativo-CBRio`, `~/Documents/CBRio-Staff`); noutra
máquina, aponte com `MAPA_DIR_APLICATIVO_CBRIO` / `MAPA_DIR_CBRIO_STAFF`.

`--check` não escreve e sai 1 se o commitado estiver fora de data.

## Ordem de consulta

| pergunta | arquivo |
|---|---|
| tenho um NOME, quero o caminho | **`docs/mapa/ARQUIVOS.md`** — um grep resolve |
| que módulos existem | `docs/mapa/INDICE.md` |
| tudo de um módulo | `docs/mapa/<slug>.md` |
| telas dos apps e o que chamam | `docs/mapa/APPS.md` |
| rota/arquivo que nenhum módulo reivindica | `docs/mapa/ORFAOS.md` |

`INDICE.md` também lista as **89 réguas puras** de `backend/utils/` com o teste de
cada uma — conferir ali antes de escrever régua nova evita duplicar o que existe.

## ⚠️⚠️ O que o mapa NÃO responde

Ele é derivado do código, então não mente sobre caminho, rota ou endpoint. Mas
**não diz se o código está certo**, e não substitui medição:

- número do banco → consultar o catálogo/tabela ao vivo
- se um cron roda → `system_job_runs`, não o `vercel.json`
- se uma coluna existe → `information_schema` / `pg_attribute`
- o que uma função SQL faz → `pg_get_functiondef` (neste projeto a definição
  **viva** divergir do repo é comum, e já mordeu várias vezes)
- formato de arquivo de terceiro → abrir o arquivo real

Em 20/08/2026 foram quatro casos num só dia em que o documento estava velho e o
banco estava certo. O mapa não muda isso.

## ⚠️ Nunca editar `docs/mapa/` à mão

É saída de gerador: edição manual é sobrescrita na próxima rodada e reintroduz
exatamente a classe de erro que ele existe pra eliminar — o `atlas.html`
(840 KB, parado em 25/06) descreve como vivo um pareamento do Kids que nunca foi
implementado. Se o mapa estiver errado, o bug é do gerador
(`backend/scripts/gerar-mapa.cjs`), e `src/test/mapaGerador.test.ts` deve pegar.
