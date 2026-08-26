import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { semComentariosJs } from './_semComentarios';

/**
 * GUARDA · "sem equipe" na lista de voluntários (26/08/2026).
 *
 * O pedido do Matheus foi um filtro pra a coordenação alimentar quem está sem
 * equipe. O filtro EXISTIA (2ª opção do seletor "Equipe") e ele não achou — mas
 * a medição achou coisa pior: **ele contava errado**. Em 26/08 a tela dizia 40
 * voluntários sem equipe e os reais eram 19; os outros 21 TINHAM equipe, numa
 * linha de `vol_team_members` ligada só pelo `planning_center_person_id`, que o
 * embed do `/volunteers-pool` (FK do perfil) não alcança.
 *
 * Este arquivo trava as três pontas do conserto. É guarda ESTÁTICA (o teste não
 * tem banco), sobre o código SEM COMENTÁRIO — a lição de 06/08: a explicação do
 * conserto cita o padrão errado e viraria falso positivo.
 */

const raiz = path.resolve(__dirname, '../..');
const ler = (p: string) => semComentariosJs(fs.readFileSync(path.join(raiz, p), 'utf8'));

describe('sem equipe · o número não pode voltar a mentir', () => {
  const pool = ler('backend/routes/voluntariado.js');
  const sync = ler('backend/services/planningCenter.js');
  const tela = ler('src/pages/ministerial/voluntariado/VolLista.tsx');

  it('TODO embed de team_members devolve is_active', () => {
    // O `/team-members` já filtra `is_active`, e o totem Kids "remove" marcando
    // a flag em vez de apagar a linha. Sem a coluna no embed, vínculo encerrado
    // contaria como equipe. Hoje não há nenhum inativo no banco — é guarda
    // contra o dia em que houver.
    // ⚠️ São DOIS embeds (o `/volunteers-pool` e o pool anotado da montagem de
    // escala) e a exigência é sobre os DOIS: a 1ª versão desta guarda casava um
    // só, e o mutante que tirava a coluna do primeiro SOBREVIVEU.
    const embeds = pool.match(/team_members:vol_team_members\(\s*\n\s*[^)]*/g) || [];
    expect(embeds.length).toBeGreaterThanOrEqual(2);
    for (const e of embeds) expect(e).toContain('is_active');
  });

  it('a tela decide "sem equipe" pela régua, não por team_members.length cru', () => {
    expect(tela).toContain('function equipesDe(');
    expect(tela).toContain('!equipesDe(v).length');
    // O padrão antigo não pode voltar: ele conta vínculo encerrado como equipe.
    expect(tela).not.toMatch(/!\(\(v\.team_members \|\| \[\]\)\.length\)/);
  });

  it('o sync REPONTA a linha órfã que já está no banco', () => {
    // Sem isto a linha antiga fica com volunteer_profile_id NULL pra sempre (a
    // resolução do payload só arruma o sync corrente) E o dedup de withProfile
    // insere uma SEGUNDA linha — o banco fica com as duas, inflando a contagem
    // de membros da equipe. Medido em 26/08: 59 órfãs, 28 já duplicadas assim.
    expect(sync).toContain('async function repontarOrfas(supabase,');
    expect(sync).toContain('await repontarOrfas(supabase, memberships, profByPc);');
  });

  it('repontarOrfas recebe o supabase por PARÂMETRO', () => {
    // ⚠️ `supabase` NÃO é módulo-escopo em planningCenter.js — é parâmetro das
    // funções. Usá-lo livre compila, passa no `node --check` e estoura
    // ReferenceError na primeira execução real (a armadilha de 25/08).
    const corpo = sync.slice(sync.indexOf('async function repontarOrfas('));
    const fim = corpo.indexOf('\nasync function ', 1);
    const escopo = fim > 0 ? corpo.slice(0, fim) : corpo;
    expect(escopo).toContain('repontarOrfas(supabase,');
    expect(escopo).not.toMatch(/require\(['"].*supabase/);
  });

  it('órfã redundante é APAGADA no 23505, não deixada pra trás', () => {
    // Repontar uma órfã cujo vínculo já existe ligado ao perfil viola o unique.
    // Nesse caso a órfã é redundante e sai — senão o conserto arruma metade e
    // deixa a linha invisível no banco pra sempre.
    expect(sync).toMatch(/error\.code === '23505'[\s\S]{0,400}?\.delete\(\)/);
  });

  it('falha de LEITURA das órfãs não vira "não há órfã" nem derruba o sync', () => {
    const corpo = sync.slice(sync.indexOf('async function repontarOrfas('));
    const escopo = corpo.slice(0, corpo.indexOf('\nasync function ', 1));
    // Erro na consulta encerra devolvendo zero, sem lançar: o pior caso é o
    // comportamento de antes do conserto.
    expect(escopo).toMatch(/leitura de órfãs/);
    expect(escopo).toMatch(/return \{ repontadas: 0, apagadas: 0 \};/);
  });
});
