// ⚠️⚠️ O AGENTE ACUSAVA TODO VOLUNTÁRIO ATIVO DE NUNCA TER SERVIDO.
//
// Relato do Matheus (22/09/2026), olhando a fila de propostas: *"esse rubens fez
// check in esse final de semana que passou, pq ta dizendo que ele ta a 158 dias
// sem checkin???"*
//
// A causa, em uma linha de `agent-worker/src/tools/voluntariadoRead.ts`:
//
//     const idsAtivos = new Set(recentes.map(r => r.volunteer_id));  // vol_profiles.id
//     voluntarios.filter(v => !idsAtivos.has(v.id))                  // mem_voluntarios.id
//
// `vol_check_ins.volunteer_id` guarda o id de **`vol_profiles`** (o perfil da
// escala/PCO). A lista de candidatos vem de **`mem_voluntarios`** (o vínculo da
// membresia). São tabelas diferentes para a MESMA pessoa, ligadas por
// `membro_id` (`vol_profiles.membresia_id`). O `has()` nunca casava ⇒ **todo
// voluntário formalmente ativo era classificado como inativo**.
//
// Medido: **24 das 32 propostas pendentes eram de gente que serviu nos últimos
// 90 dias**. O Rubens, acusado de "158 dias sem check-in (nunca serviu)", tinha
// servido **2 dias antes**, com 6 check-ins. Ao limpar a fila apareceram **42
// propostas erradas, de 7 rodadas** — o agente vinha errando desde o começo, e
// aprovar qualquer uma faria um líder ligar para quem serviu no domingo.
//
// ⚠️ E as duas réguas da casa (`backend/utils/atividadeVoluntario.js` e
// `volRodizio.js`) JÁ PROIBIAM dizer "nunca serviu" a partir de uma janela —
// uma delas registra isso como "o erro que este projeto já cometeu". O agente
// não usava nenhuma das duas.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FONTE = readFileSync(
  join(__dirname, '..', '..', 'agent-worker/src/tools/voluntariadoRead.ts'), 'utf8',
);
const trecho = FONTE.slice(FONTE.indexOf('listarVoluntariosInativos'));

describe('⚠️⚠️ o filtro de inativos casa pelo MEMBRO, não por ids de tabelas diferentes', () => {
  it('traduz vol_profiles → membro_id antes de comparar', () => {
    expect(trecho, 'sem a tradução, o Set nunca casa e todo mundo vira inativo')
      .toMatch(/from\("vol_profiles"\)[\s\S]{0,120}select\("id, membresia_id"\)/);
    expect(trecho).toMatch(/membrosAtivos\.add\(p\.membresia_id\)/);
  });

  it('⚠️ o filtro compara `v.membro_id`, NUNCA `v.id`', () => {
    expect(trecho).toMatch(/!membrosAtivos\.has\(v\.membro_id\)/);
    expect(
      trecho.replace(/\/\/[^\n]*/g, ''),
      'comparar mem_voluntarios.id contra vol_profiles.id foi o bug',
    ).not.toMatch(/idsAtivos\.has\(v\.id\)/);
  });
});

describe('⚠️ o item carrega o check-in REAL, para o modelo não inventar', () => {
  it('devolve ultimo_checkin e dias_desde_ultimo_checkin', () => {
    expect(trecho).toMatch(/ultimo_checkin:/);
    expect(trecho).toMatch(/dias_desde_ultimo_checkin:/);
    expect(trecho).toMatch(/total_checkins:/);
  });

  it('⚠️⚠️ avisa que `desde` é data de CADASTRO — a confusão que gerou "158 dias"', () => {
    expect(trecho).toMatch(/desde` e a data de CADASTRO/);
  });

  it('⚠️⚠️ e que `ultimo_checkin: null` NÃO é "nunca serviu"', () => {
    expect(
      trecho,
      'as duas réguas da casa proíbem afirmar isso a partir de uma janela',
    ).toMatch(/NUNCA 'nunca serviu'/);
  });

  it('marca quem não tem perfil de escala, em vez de acusá-lo', () => {
    expect(trecho).toMatch(/sem_perfil_de_escala/);
  });
});
