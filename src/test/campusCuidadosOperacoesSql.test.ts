// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from 'vitest';
let db: PGlite;
const A = '00000000-0000-0000-0000-000000000001', B = '00000000-0000-0000-0000-000000000002';
const ID = '11111111-1111-1111-1111-111111111111';
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE cui_visitas(id uuid PRIMARY KEY,igreja_id uuid,deleted_at timestamptz);
    INSERT INTO cui_visitas VALUES('${ID}','${A}',NULL);
    CREATE FUNCTION app_soft_deletable_tables() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['cultos','tabela_de_outra_pr']::text[] $$;
    CREATE TABLE audit_teste(autor uuid);
    CREATE FUNCTION app_soft_delete(t text,i text,u uuid) RETURNS boolean LANGUAGE plpgsql AS $$
    BEGIN IF NOT t=ANY(app_soft_deletable_tables()) THEN RAISE EXCEPTION 'fora da whitelist'; END IF;
      EXECUTE format('UPDATE %I SET deleted_at=now() WHERE id=$1::uuid',t) USING i;
      INSERT INTO audit_teste VALUES(u); RETURN true; END $$;
    GRANT SELECT,UPDATE ON cui_visitas TO service_role;
    GRANT INSERT ON audit_teste TO service_role;`);
  await db.exec(readFileSync(join(__dirname,'../../supabase/migrations/20260927030000_multicampus_cuidados_operacoes.sql'),'utf8'));
},30000);
beforeEach(async () => { await db.exec('UPDATE cui_visitas SET deleted_at=NULL; DELETE FROM audit_teste;'); });
afterEach(async () => { await db.exec('RESET ROLE'); });
afterAll(async () => { await db.close(); });
describe('Cuidados · exclusão lógica atômica por campus', () => {
  it('não altera registro de outro campus', async () => {
    await db.exec('SET ROLE service_role');
    expect((await db.query<{ok:boolean}>(`SELECT fn_campus_soft_delete_cuidados('cui_visitas','${ID}','${B}','${ID}') AS ok`)).rows[0].ok).toBe(false);
    await db.exec('RESET ROLE');
    expect((await db.query('SELECT * FROM audit_teste')).rows).toHaveLength(0);
    expect((await db.query<{deleted_at:null}>('SELECT deleted_at FROM cui_visitas')).rows[0].deleted_at).toBeNull();
  });
  it('apaga logicamente no campus correto e preserva autoria', async () => {
    await db.exec('SET ROLE service_role');
    expect((await db.query<{ok:boolean}>(`SELECT fn_campus_soft_delete_cuidados('cui_visitas','${ID}','${A}','${ID}') AS ok`)).rows[0].ok).toBe(true);
    await db.exec('RESET ROLE');
    expect((await db.query<{deleted_at:string}>('SELECT deleted_at FROM cui_visitas')).rows[0].deleted_at).not.toBeNull();
    expect((await db.query<{autor:string}>('SELECT * FROM audit_teste')).rows[0].autor).toBe(ID);
  });
  it('não aceita tabela livre nem execução direta pelo cliente', async () => {
    await expect(db.query(`SELECT fn_campus_soft_delete_cuidados('profiles','${ID}','${A}','${ID}')`)).rejects.toThrow('Tabela não permitida');
    await expect(db.query(`SELECT fn_campus_soft_delete_cuidados('cui_visitas','${ID}','${A}',NULL)`)).rejects.toThrow('Tabela não permitida');
    await db.exec('SET ROLE authenticated');
    await expect(db.query(`SELECT fn_campus_soft_delete_cuidados('cui_visitas','${ID}','${A}','${ID}')`)).rejects.toThrow('permission denied');
  });
  it('preserva entradas adicionadas por outras entregas à whitelist', async () => {
    const rows = (await db.query<{t:string[]}>('SELECT app_soft_deletable_tables() AS t')).rows;
    expect(rows[0].t).toEqual(expect.arrayContaining(['cultos','tabela_de_outra_pr','cui_visitas','cui_pedidos']));
  });
});
