// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const employee = uid(1), cycle = uid(2), invite = uid(3), competence = uid(4);
let db: PGlite;
const notes = () => [{ competencia_id: competence, nota: 4, comentario: 'Feedback sintético.' }];
const submit = (payload: unknown = notes(), owner = employee) => db.query(
  'select fn_aval360_responder($1, $2, $3::jsonb) as resultado', [invite, owner, JSON.stringify(payload)],
);
const form = () => db.query<{ resultado: { competencias: { id: string }[] } }>(
  'select fn_aval360_formulario($1, $2) as resultado', [invite, employee],
);
const counts = async () => (await db.query(`select
  (select count(*)::int from rh_aval360_resposta) respostas,
  (select count(*)::int from rh_aval360_nota) notas,
  (select count(*)::int from rh_aval360_convite where respondido_em is not null) carimbos`)).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table rh_funcionarios(id uuid primary key, nome text, email text, cargo text, area text,
      gestor_id uuid references rh_funcionarios(id), status text default 'ativo', deleted_at timestamptz);`);
  const foundation = readFileSync(resolve(root, 'supabase/migrations/20260916120000_avaliacao_360.sql'), 'utf8');
  // Usa as definições reais das tabelas; não reproduz seu schema no mock.
  await db.exec(foundation.slice(foundation.indexOf('CREATE TABLE IF NOT EXISTS public.rh_aval360_ciclo ('),
    foundation.indexOf('ALTER TABLE public.rh_aval360_ciclo')));
  await db.exec(readFileSync(resolve(root, 'supabase/migrations/20260926160000_avaliacao360_resposta_atomica.sql'), 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`truncate rh_funcionarios, rh_aval360_ciclo, rh_aval360_competencia cascade;
    insert into rh_funcionarios(id,nome,area) values('${employee}','Pessoa sintética','Gestão');
    insert into rh_aval360_ciclo(id,nome,periodo_inicio,periodo_fim,status,coleta_ate)
      values('${cycle}','Ciclo sintético',current_date,current_date,'coleta',current_date + 1);
    insert into rh_aval360_competencia(id,codigo,nome) values('${competence}','teste','Competência sintética');
    insert into rh_aval360_ciclo_competencia(ciclo_id,competencia_id) values('${cycle}','${competence}');
    insert into rh_aval360_convite(id,ciclo_id,avaliado_id,avaliador_id,papel)
      values('${invite}','${cycle}','${employee}','${employee}','auto');`);
});

describe('avaliação 360 executada no PostgreSQL local', () => {
  it('salva todas as partes e rejeita uma segunda submissão', async () => {
    await submit();
    expect(await counts()).toEqual({ respostas: 1, notas: 1, carimbos: 1 });
    await expect(submit()).rejects.toMatchObject({ code: 'P0409' });
    expect(await counts()).toEqual({ respostas: 1, notas: 1, carimbos: 1 });
  });
  it.each(['rh_aval360_nota', 'rh_aval360_convite'])('reverte tudo se %s falhar e permite nova tentativa', async (table) => {
    await db.exec(`create function falha_teste() returns trigger language plpgsql as $$ begin raise exception 'falha injetada'; end $$;
      create trigger falha before ${table.endsWith('nota') ? 'insert' : 'update'} on ${table} for each row execute function falha_teste();`);
    try {
      await expect(submit()).rejects.toThrow('falha injetada');
      expect(await counts()).toEqual({ respostas: 0, notas: 0, carimbos: 0 });
    } finally { await db.exec(`drop trigger falha on ${table}; drop function falha_teste();`); }
    await submit();
    expect(await counts()).toEqual({ respostas: 1, notas: 1, carimbos: 1 });
  });
  it.each([
    null, {}, [], [{ competencia_id: uid(999), nota: 4 }], [...notes(), ...notes()],
    [{ competencia_id: competence, nota: '4' }], [{ competencia_id: competence, nota: true }],
    [{ competencia_id: competence, nota: 0 }], [{ competencia_id: competence, nota: 6 }],
    [{ competencia_id: competence, nota: 2.5 }], [{ competencia_id: competence, nota: 4, comentario: {} }],
    [{ competencia_id: competence, nota: 4, comentario: 'x'.repeat(5001) }],
  ])('recusa payload inválido sem deixar resposta parcial: %#', async (payload) => {
    await expect(submit(payload)).rejects.toMatchObject({ code: 'P0400' });
    expect(await counts()).toEqual({ respostas: 0, notas: 0, carimbos: 0 });
  });
  it('recusa conjunto incompleto', async () => {
    await db.exec(`insert into rh_aval360_competencia(id,codigo,nome) values('${uid(5)}','extra','Extra');
      insert into rh_aval360_ciclo_competencia(ciclo_id,competencia_id) values('${cycle}','${uid(5)}');`);
    await expect(submit()).rejects.toMatchObject({ code: 'P0400' });
  });
  it('recusa convite de outra pessoa antes de revelar formulário', async () => {
    await expect(submit(notes(), uid(999))).rejects.toMatchObject({ code: 'P0403' });
    await expect(db.query('select fn_aval360_formulario($1,$2)', [invite, uid(999)])).rejects.toMatchObject({ code: 'P0403' });
  });
  it.each([
    "update rh_aval360_convite set suprimido_em=now()",
    "update rh_aval360_convite set deleted_at=now()",
    "update rh_aval360_ciclo set deleted_at=now()",
    "update rh_aval360_ciclo set status='apuracao'",
    "update rh_aval360_ciclo set coleta_ate=current_date-2",
  ])('recusa convites indisponíveis: %s', async (sql) => {
    await db.exec(sql);
    await expect(submit()).rejects.toMatchObject({ code: expect.stringMatching(/^P040[39]$/) });
    await expect(form()).rejects.toMatchObject({ code: expect.stringMatching(/^P040[39]$/) });
  });
  it('aceita o último dia da coleta no fuso de São Paulo', async () => {
    await db.exec("update rh_aval360_ciclo set coleta_ate=(now() at time zone 'America/Sao_Paulo')::date");
    await submit();
  });
  it.each([
    "update rh_aval360_competencia set ativo=false",
    "update rh_aval360_competencia set deleted_at=now()",
    "update rh_aval360_ciclo_competencia set deleted_at=now()",
    "update rh_aval360_competencia set aplica_a='area', area='Outra área'",
    "update rh_aval360_competencia set aplica_a='gestores'",
  ])('formulário e resposta aplicam a mesma exclusão: %s', async (sql) => {
    await db.exec(sql);
    expect((await form()).rows[0].resultado.competencias).toEqual([]);
    await expect(submit()).rejects.toMatchObject({ code: 'P0400' });
  });
  it('inclui competência da área e competência de gestor elegível', async () => {
    await db.exec("update rh_aval360_competencia set aplica_a='area', area='Gestão'");
    expect((await form()).rows[0].resultado.competencias).toHaveLength(1);
    await db.exec(`update rh_aval360_competencia set aplica_a='gestores';
      insert into rh_funcionarios(id,nome,gestor_id) values('${uid(6)}','Liderado sintético','${employee}');`);
    expect((await form()).rows[0].resultado.competencias).toHaveLength(1);
    await submit();
  });
  it('par não aprovado ou abaixo do piso não coleta', async () => {
    await db.exec(`insert into rh_funcionarios(id,nome) values('${uid(6)}','Outra pessoa');
      update rh_aval360_convite set papel='par',avaliado_id='${uid(6)}';`);
    await expect(form()).rejects.toMatchObject({ code: 'P0409' });
    await db.exec('update rh_aval360_convite set aprovado_em=now()');
    await expect(submit()).rejects.toMatchObject({ code: 'P0409' });
  });
  it('nega execução direta aos clientes e permite somente service_role', async () => {
    for (const fn of ['fn_aval360_formulario(uuid,uuid)', 'fn_aval360_responder(uuid,uuid,jsonb)', 'fn_aval360_gerar_convites(uuid,jsonb)']) {
      const r = await db.query(`select has_function_privilege('anon',$1,'execute') anon,
        has_function_privilege('authenticated',$1,'execute') autenticado,
        has_function_privilege('service_role',$1,'execute') backend`, [fn]);
      expect(r.rows[0]).toEqual({ anon: false, autenticado: false, backend: true });
    }
  });
  it('geração é idempotente e informa inseridos de verdade', async () => {
    await db.exec("update rh_aval360_ciclo set status='rascunho'");
    const linhas = [{ avaliado_id: employee, avaliador_id: employee, papel: 'auto' }];
    const generate = () => db.query<{ resultado: unknown }>('select fn_aval360_gerar_convites($1,$2) resultado', [cycle, JSON.stringify(linhas)]);
    expect((await generate()).rows[0].resultado).toEqual({ gravados: 0, existentes: 1 });
    await db.exec(`insert into rh_funcionarios(id,nome) values('${uid(6)}','Pessoa nova');`);
    await expect(generate()).rejects.toMatchObject({ code: 'P0409' });
    linhas.push({ avaliado_id: uid(6), avaliador_id: uid(6), papel: 'auto' });
    expect((await generate()).rows[0].resultado).toEqual({ gravados: 1, existentes: 1 });
    expect((await generate()).rows[0].resultado).toEqual({ gravados: 0, existentes: 2 });
  });
  it('recusa convite antigo de gestor que saiu da equipe', async () => {
    await db.exec(`update rh_aval360_ciclo set status='rascunho';
      insert into rh_funcionarios(id,nome,status) values('${uid(6)}','Gestor antigo','inativo');
      insert into rh_aval360_convite(ciclo_id,avaliado_id,avaliador_id,papel)
        values('${cycle}','${employee}','${uid(6)}','gestor');`);
    const linhas = JSON.stringify([{ avaliado_id: employee, avaliador_id: employee, papel: 'auto' }]);
    await expect(db.query('select fn_aval360_gerar_convites($1,$2)', [cycle, linhas])).rejects.toMatchObject({ code: 'P0409' });
  });
  it('não regenera convite suprimido nem aceita geração durante coleta', async () => {
    const linhas = JSON.stringify([{ avaliado_id: employee, avaliador_id: employee, papel: 'auto' }]);
    const generate = () => db.query('select fn_aval360_gerar_convites($1,$2)', [cycle, linhas]);
    await expect(generate()).rejects.toMatchObject({ code: 'P0409' });
    await db.exec("update rh_aval360_ciclo set status='rascunho'; update rh_aval360_convite set suprimido_em=now()");
    await expect(generate()).rejects.toMatchObject({ code: 'P0409' });
  });
});
