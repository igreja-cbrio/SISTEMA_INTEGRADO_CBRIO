// @vitest-environment node
import { describe,it,expect,afterAll,beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {coberturaBatismo}=require('../../backend/services/campusBatismoCobertura.js');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
let db:PGlite;
describe('Cobertura batismo · sinal global, lista local',()=>{
 beforeAll(async()=>{db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
  CREATE TABLE cui_convertidos(id uuid,igreja_id uuid,membro_id uuid,cpf text,deleted_at timestamptz);
  CREATE TABLE batismo_inscricoes(igreja_id uuid,membro_id uuid,cpf text,status text,deleted_at timestamptz);
  INSERT INTO cui_convertidos VALUES('${A}','${A}','${B}','52998224725',NULL),('${B}','${B}',NULL,'52998224725',NULL);
  INSERT INTO batismo_inscricoes VALUES('${B}','${B}','52998224725','realizado',NULL);
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;`);
  await db.exec(readFileSync('supabase/migrations/20260927140000_multicampus_batismo_cobertura.sql','utf8'));},30000);
 afterAll(async()=>{await db.close();});
 it('deriva identidade do ato local e devolve apenas booleanos',async()=>{
  const result=await db.query(`SELECT * FROM fn_campus_batismo_sinais('${A}',ARRAY['${A}']::uuid[])`);
  expect(result.rows).toEqual([{registro_id:A,batizado:true,inscrito:false}]);
 });
 it('recusa ID local de outra unidade e acesso direto autenticado',async()=>{
  await expect(db.query(`SELECT * FROM fn_campus_batismo_sinais('${A}',ARRAY['${B}']::uuid[])`)).rejects.toThrow('neste campus');
  await db.exec('SET ROLE authenticated');
  try{await expect(db.query(`SELECT * FROM fn_campus_batismo_sinais('${A}',ARRAY['${A}']::uuid[])`)).rejects.toThrow('permission denied');}finally{await db.exec('RESET ROLE');}
 });
 it('não vincula globalmente apenas pelo CPF de convertido sem vínculo canônico',async()=>{
  await db.exec(`INSERT INTO cui_convertidos VALUES('00000000-0000-0000-0000-000000000003','${A}',NULL,'52998224725',NULL)`);
  expect((await db.query(`SELECT * FROM fn_campus_batismo_sinais('${A}',ARRAY['00000000-0000-0000-0000-000000000003']::uuid[])`)).rows).toEqual([{registro_id:'00000000-0000-0000-0000-000000000003',batizado:false,inscrito:false}]);
 });
 it('resposta incompleta não vira lista de pessoas não inscritas',async()=>{
  const q:any={};for(const m of ['select','eq','is','order','range'])q[m]=()=>q;q.then=(r:any)=>Promise.resolve({data:[{id:A,nome:'Pessoa local'}],error:null}).then(r);
  const fake={from:()=>q,rpc:async()=>({data:[],error:null})};await expect(coberturaBatismo(fake,{campus_id:A,campi:[{id:A}]})).rejects.toThrow('incompleta');
 });
});
