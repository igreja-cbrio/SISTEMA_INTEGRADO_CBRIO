// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { sinaisNextDosAtos } = createRequire(import.meta.url)('../../backend/services/campusNextSinais.js');
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const M = '10000000-0000-0000-0000-000000000001';
const C = '20000000-0000-0000-0000-000000000001';
const N = '30000000-0000-0000-0000-000000000001';
const T = '40000000-0000-0000-0000-000000000001';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE igrejas(id uuid PRIMARY KEY); INSERT INTO igrejas VALUES('${A}'),('${B}');
    CREATE FUNCTION fn_campus_dado_pessoal_permitido(p uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT p=nullif(current_setting('test.campus',true),'')::uuid $$;
    CREATE TABLE mem_membros(id uuid PRIMARY KEY,igreja_id uuid,cpf text,nome text);
    CREATE TABLE cui_convertidos(id uuid PRIMARY KEY,igreja_id uuid,membro_id uuid,cpf text,deleted_at timestamptz);
    CREATE TABLE next_matriculas(id uuid PRIMARY KEY,igreja_id uuid,membro_id uuid,cpf text,nome text,status text,created_at timestamptz DEFAULT now(),deleted_at timestamptz);
    CREATE TABLE next_encontros(id uuid PRIMARY KEY);
    CREATE TABLE next_presencas(matricula_id uuid,encontro_id uuid,presente boolean);
    CREATE TABLE next_pessoa_aula_manual(membro_id uuid CONSTRAINT next_pessoa_aula_manual_pkey PRIMARY KEY,updated_at timestamptz,fez_aula1 boolean,fez_aula2 boolean,observacao text,marcado_por uuid);
    ALTER TABLE next_pessoa_aula_manual ENABLE ROW LEVEL SECURITY;
    CREATE POLICY baseline ON next_pessoa_aula_manual FOR SELECT TO authenticated USING(true);
    GRANT USAGE ON SCHEMA public TO authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT SELECT ON next_pessoa_aula_manual TO authenticated;
    INSERT INTO mem_membros VALUES('${M}','${A}','52998224725','Nome global secreto');
    INSERT INTO cui_convertidos VALUES('${C}','${A}','${M}','52998224725',null);
    INSERT INTO next_matriculas(id,igreja_id,membro_id,cpf,nome,status) VALUES('${N}','${B}','${M}','52998224725','Nome em outro campus','matriculado');
    INSERT INTO next_encontros VALUES('${T}'); INSERT INTO next_presencas VALUES('${N}','${T}',true);`);
  const source = readFileSync('supabase/migrations/20260814200000_next_um_encontro_basta.sql','utf8');
  await db.exec(source.slice(source.indexOf('CREATE OR REPLACE VIEW'),source.indexOf('COMMENT ON VIEW')));
  await db.exec(readFileSync('supabase/migrations/20260927080000_multicampus_next_sinais.sql','utf8'));
},30_000);
afterAll(async () => { await db.close(); });
describe('Next · conclusão global com autorização pelo ato local', () => {
  it('preserva conclusão em outro campus sem retornar nome, CPF ou origem da presença', async () => {
    const { rows } = await db.query(`SELECT * FROM fn_campus_next_sinais('${A}',ARRAY['${C}'::uuid],'{}')`);
    expect(rows).toEqual([{ tipo: 'convertido', registro_id: C, fez_next: true }]);
    expect((await db.query<any>(`SELECT igreja_id FROM mem_membros WHERE id='${M}'`)).rows[0].igreja_id).toBe(A);
  });
  it('recusa matrículas de outro campus mesmo existindo um convertido local', async () => {
    await expect(db.exec(`SELECT * FROM fn_campus_next_sinais('${A}',ARRAY['${C}'::uuid],ARRAY['${N}'::uuid])`)).rejects.toThrow(/Ato não encontrado/);
  });
  it('recusa IDs arbitrários e execução direta por authenticated', async () => {
    await expect(db.exec(`SELECT * FROM fn_campus_next_sinais('${A}',ARRAY['${M}'::uuid],'{}')`)).rejects.toThrow(/Ato não encontrado/);
    await db.exec('SET ROLE authenticated');
    await expect(db.exec(`SELECT * FROM fn_campus_next_sinais('${A}',ARRAY['${C}'::uuid],'{}')`)).rejects.toThrow(/permission denied/);
    await db.exec('RESET ROLE');
  });
  it('divide chamadas em lotes menores que o limite do PostgREST e não aceita resultado parcial', async () => {
    const registros = Array.from({ length: 1002 }, (_, i) => ({ id: `id-${i}` }));
    const rpc = vi.fn(async (_name, args) => ({ data: args.p_matricula_ids.map((id: string) => ({ tipo: 'matricula', registro_id: id, fez_next: true })), error: null }));
    const check = await sinaisNextDosAtos({ rpc },{ campus_id: A, campi: [{ id: A }] },[],registros);
    expect(rpc).toHaveBeenCalledTimes(3); expect(check(registros[1001],'matricula')).toBe(true);
    await expect(sinaisNextDosAtos({ rpc: async () => ({ data: [], error: null }) },{ campus_id: A, campi: [{ id: A }] },[],[{ id: N }])).rejects.toThrow(/incompleta/);
  });
  it('overrides têm observações locais e conclusão global sem duplicar pessoas na view', async () => {
    await db.exec('BEGIN');
    try {
      await db.exec(`SELECT fn_campus_next_manual('${A}','${M}','${M}','{"fez_aula1":true,"observacao":"Local A"}');
        SELECT fn_campus_next_manual('${B}','${M}','${M}','{"fez_aula2":true,"observacao":"Local B"}');
        SELECT fn_campus_next_manual('${A}','${M}','${M}','{"fez_aula2":true}');`);
      const rows = (await db.query<any>('SELECT igreja_id,observacao,fez_aula1,fez_aula2 FROM next_pessoa_aula_manual ORDER BY igreja_id')).rows;
      expect(rows).toEqual([{ igreja_id: A, observacao: 'Local A', fez_aula1: true, fez_aula2: true }, { igreja_id: B, observacao: 'Local B', fez_aula1: false, fez_aula2: true }]);
      expect((await db.query('SELECT * FROM vw_next_formado_pessoa')).rows).toHaveLength(1);
      await db.exec(`SELECT set_config('test.campus','${A}',false); SET ROLE authenticated`);
      expect((await db.query<any>('SELECT observacao FROM next_pessoa_aula_manual')).rows).toEqual([{ observacao: 'Local A' }]);
    } finally { await db.exec('RESET ROLE; ROLLBACK'); }
  });
  it('conhecer membro global sem ato local não autoriza override', async () => {
    await expect(db.exec(`SELECT fn_campus_next_manual('${A}','${T}','${M}','{"fez_aula1":true}')`)).rejects.toThrow(/sem ato Next/);
  });
  it('bloqueia migration com override histórico sem origem em vez de inferir campus-base', async () => {
    const migration = readFileSync('supabase/migrations/20260927080000_multicampus_next_sinais.sql','utf8');
    const guard = migration.slice(migration.indexOf('DO $$ BEGIN'),migration.indexOf('ALTER TABLE public.next_pessoa_aula_manual'));
    await db.exec('BEGIN');
    try {
      await db.exec(`SELECT fn_campus_next_manual('${A}','${M}','${M}','{"fez_aula1":true}')`);
      await expect(db.exec(guard)).rejects.toThrow(/mapa explícito/);
    } finally { await db.exec('ROLLBACK'); }
  });

});
