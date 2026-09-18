import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { TABELAS_COM_MEMBRO, COLUNA_ALTERNATIVA } from '../../backend/services/fusaoVerificacao.js';

// ⚠️⚠️ ESTE TESTE É A GARANTIA QUE O MARCOS PEDIU (14/09/2026):
// *"garanta que não haja esse problema de linhas penduradas em cadastros
// juntados"*.
//
// A varredura de 14/09 sobre as 1.037 fusões já feitas e as 63 tabelas que
// apontam para `mem_membros` deu **zero linhas órfãs** — o `merge_membros`
// repointa tudo hoje, inclusive `cen_resposta`, que nasceu DEPOIS da função.
//
// O risco não é o passado: é a tabela que alguém vai criar mês que vem. Se ela
// ficar de fora do repointe, as fusões seguintes deixam linha apontando para um
// cadastro que não existe mais — e a fusão devolve sucesso do mesmo jeito. O
// dado não some do banco, some da FICHA DA PESSOA: contribuição órfã, batismo
// que desapareceu.
//
// Então a lista de `fusaoVerificacao.js` não pode envelhecer em silêncio. Este
// teste lê as MIGRATIONS e quebra o gate quando aparece tabela com `membro_id`
// que ninguém declarou. Mesma ideia do `routeModuleMap.test.ts`, que pegou o
// `links` órfão no ROUTE_MODULE_MAP.

const RAIZ = path.resolve(__dirname, '../../supabase/migrations');

/** Tabelas de backup: cópia congelada, não é vínculo vivo de pessoa. */
const ehBackup = (t: string) => /^_bk_|^bkp_|_backup$/.test(t);

/**
 * Tabelas cuja coluna `membro_id` NÃO é vínculo com `mem_membros`.
 * ⚠️ Cada entrada precisa de motivo escrito — sem isso, a exceção vira o
 * esconderijo onde a próxima tabela esquecida se acomoda.
 */
const NAO_E_VINCULO: Record<string, string> = {
  // (vazio hoje · 14/09/2026)
};

function tabelasComMembroIdNasMigrations(): Set<string> {
  const achadas = new Set<string>();
  for (const arq of fs.readdirSync(RAIZ).filter((f) => f.endsWith('.sql'))) {
    const sql = fs.readFileSync(path.join(RAIZ, arq), 'utf8');
    // CREATE TABLE <nome> ( ... membro_id ... );
    const criar = /CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\n\)\s*;/gi;
    let m: RegExpExecArray | null;
    while ((m = criar.exec(sql))) {
      if (/\bmembro_id\b/.test(m[2])) achadas.add(m[1]);
    }
    // ALTER TABLE <nome> ... ADD COLUMN membro_id
    const alterar = /ALTER TABLE (?:ONLY )?(?:public\.)?([a-z0-9_]+)[^;]*?ADD COLUMN (?:IF NOT EXISTS )?membro_id/gi;
    while ((m = alterar.exec(sql))) achadas.add(m[1]);
  }
  return achadas;
}

describe('fusão de cadastros · nenhuma tabela fica de fora da conferência', () => {
  it('toda tabela com membro_id nas migrations está declarada', () => {
    const nasMigrations = [...tabelasComMembroIdNasMigrations()]
      .filter((t) => !ehBackup(t))
      .filter((t) => !NAO_E_VINCULO[t]);
    const declaradas = new Set<string>([
      ...TABELAS_COM_MEMBRO,
      ...Object.keys(COLUNA_ALTERNATIVA),
    ]);
    const faltando = nasMigrations.filter((t) => !declaradas.has(t)).sort();

    expect(faltando, faltando.length
      ? `Tabela(s) com \`membro_id\` fora de TABELAS_COM_MEMBRO em `
        + `backend/services/fusaoVerificacao.js: ${faltando.join(', ')}.\n`
        + `Acrescente lá — senão a fusão de cadastros pode deixar linha apontando `
        + `para um cadastro apagado, e a pessoa perde o vínculo sem ninguém ver.`
      : '').toEqual([]);
  });

  it('a lista declarada não tem nome inventado', () => {
    // O contrário também importa: nome errado na lista vira consulta que falha
    // em silêncio (a conferência devolve "não conferida" para sempre).
    const nasMigrations = tabelasComMembroIdNasMigrations();
    const orfaosNaLista = TABELAS_COM_MEMBRO
      .filter((t) => !nasMigrations.has(t))
      // `profiles` e as tabelas de par/adiados nascem fora das migrations do
      // repo (schema do auth e migrations manuais) — conferidas em produção.
      .filter((t) => !['profiles'].includes(t));
    expect(orfaosNaLista, `na lista mas sem coluna membro_id nas migrations: ${orfaosNaLista.join(', ')}`)
      .toEqual([]);
  });

  it('a varredura acha as tabelas que já sabemos que existem', () => {
    // Rede de segurança do próprio regex: se ele parar de casar (mudança de
    // formatação nas migrations), o teste acima passaria a aprovar tudo.
    const achadas = tabelasComMembroIdNasMigrations();
    for (const conhecida of ['cen_resposta', 'mem_contribuicoes', 'mem_contatos', 'batismo_inscricoes']) {
      expect(achadas.has(conhecida), `o varredor deixou de achar ${conhecida}`).toBe(true);
    }
    expect(achadas.size).toBeGreaterThan(40);
  });
});
