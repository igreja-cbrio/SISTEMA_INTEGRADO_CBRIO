// A PORTA da avaliação 360 não pode viver atrás do gate do RH.
//
// ⚠️⚠️ Medido em 16/09/2026: o módulo `rh` é alcançado por **3 cargos**
// (Dir RH, Coord Estratégico, Coord Financeiro) e `authorizeModule` tem default
// nível 2. Numa 360 TODO funcionário responde — 46 ativos, 39 com login.
//
// `backend/routes/rh.js:52` faz `router.use(authenticate, authorizeModule('rh'))`.
// Se alguém "padronizar" a 360 com o mesmo `router.use`, o formulário fica
// inalcançável para 43 das 46 pessoas — e o defeito só aparece depois de o
// ciclo ter sido anunciado para a equipe, com todo mundo tentando responder.
//
// Este arquivo é guarda ESTÁTICA: lê o código e exige que o gate do RH NÃO
// esteja no `router.use`, e que as rotas de administração tenham o seu POR
// ROTA.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(__dirname, '../..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

// ⚠️ Comentário fora dos DOIS lados antes de casar: este arquivo e a própria
// rota CITAM `authorizeModule('rh')` na explicação, e sem limpar o comentário
// a evidência seria o próprio texto que explica o cuidado (armadilha de 06/08).
function semComentarios(src: string): string {
  return src
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*$/, '$1'))
    .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n');
}

const rota = semComentarios(ler('backend/routes/avaliacao360.js'));
const servico = semComentarios(ler('backend/services/avaliacao360.js'));
const server = semComentarios(ler('backend/server.js'));
const sql = ler('supabase/migrations/20260926160000_avaliacao360_resposta_atomica.sql');

describe('⚠️⚠️ a porta fica FORA do gate do RH', () => {
  it('o router.use NÃO tem authorizeModule', () => {
    const useRouter = rota.match(/router\.use\([^)]*\)/g) || [];
    expect(useRouter.length).toBeGreaterThan(0);
    for (const u of useRouter) {
      expect(u).not.toContain('authorizeModule');
    }
  });

  it('o router.use exige login E ser colaborador', () => {
    // authenticate sozinho deixaria conta só-de-membro do app responder
    // avaliação de funcionário.
    expect(rota).toMatch(/router\.use\(\s*authenticate\s*,\s*apenasColaborador\s*\)/);
  });

  it('⚠️ a rota é montada fora de /api/rh', () => {
    expect(server).toContain("app.use('/api/avaliacao360', require('./routes/avaliacao360'))");
    // o mount não pode ser um sub-caminho de /api/rh, que tem o gate no topo
    expect(server).not.toMatch(/app\.use\('\/api\/rh\/[^']*avaliacao360/);
  });
});

describe('⚠️ administração do ciclo é gated POR ROTA', () => {
  const adminRotas = ['/ciclos', '/ciclos/:id/retrato', '/ciclos/:id/convites'];

  it('toda rota de administração exige rh nível 3', () => {
    for (const caminho of adminRotas) {
      const re = new RegExp(`router\\.(get|post|patch|delete)\\('${caminho.replace(/[/:]/g, '\\$&')}'\\s*,\\s*authorizeModule\\('rh',\\s*3\\)`);
      expect(rota, `${caminho} sem authorizeModule('rh', 3)`).toMatch(re);
    }
  });

  it('⚠️ as rotas do COLABORADOR não podem ser gated por módulo', () => {
    // Estas são as que os 46 usam. Se ganharem authorizeModule, o ciclo morre.
    for (const caminho of ['/minhas', '/convite/:id']) {
      const re = new RegExp(`router\\.get\\('${caminho.replace(/[/:]/g, '\\$&')}'\\s*,\\s*authorizeModule`);
      expect(rota, `${caminho} NÃO pode ter authorizeModule`).not.toMatch(re);
    }
    expect(rota).not.toMatch(/router\.post\('\/convite\/:id\/responder',\s*authorizeModule/);
  });
});

describe('⚠️⚠️ quem a pessoa é sai do LOGIN, nunca do corpo', () => {
  it('as rotas do colaborador resolvem pelo login', () => {
    // `comFuncionario(req)` → `funcionarioDoLogin(req)` → req.user.email.
    expect(rota).toContain('comFuncionario(req, res)');
    expect(servico).toMatch(/req\?\.user\?\.email/);
  });

  it('⚠️ responder confere que o convite é DESTE login', () => {
    // Sem `.eq('avaliador_id', eu.id)`, qualquer autenticado responderia pelo
    // convite de outra pessoa sabendo o id.
    const bloco = rota.slice(rota.indexOf("router.post('/convite/:id/responder'"));
    expect(bloco).toContain('p_avaliador_id: eu.id');
    expect(sql).toContain('avaliador_id = p_avaliador_id');
  });

  it('⚠️ nenhuma rota do colaborador aceita funcionario_id do corpo', () => {
    // Aceitar id no body transformaria a porta num "responder como qualquer um".
    expect(rota).not.toMatch(/req\.body[^\n]*funcionario_id/);
    expect(rota).not.toMatch(/req\.body[^\n]*avaliador_id/);
    expect(rota).not.toMatch(/req\.body[^\n]*avaliado_id/);
  });
});

describe('⚠️ a identidade não vaza para a resposta', () => {
  it('o INSERT em rh_aval360_resposta NÃO grava avaliador_id', () => {
    // O coração do desenho: RLS não filtra coluna. Se a identidade morasse na
    // linha da nota, qualquer policy que liberasse a resposta entregaria junto
    // quem escreveu.
    const i = sql.indexOf('INSERT INTO rh_aval360_resposta(');
    expect(i).toBeGreaterThan(-1);
    const bloco = sql.slice(i, sql.indexOf('RETURNING id', i));
    expect(bloco).toContain('convite_id');
    expect(bloco).not.toContain('avaliador_id');
  });
});

describe('⚠️ o serviço não convida par/liderado por conta própria', () => {
  it('a geração automática passa pela régua de anonimato', () => {
    expect(servico).toContain("require('../utils/avaliacaoAnonimato')");
    expect(servico).toContain('podeColetarPapel');
  });

  it('⚠️ convite suprimido é DECLARADO, não descartado em silêncio', () => {
    expect(servico).toContain('suprimidos');
    expect(servico).toMatch(/suprimidos\.push\(/);
  });

  it('⚠️ "par" não entra na geração automática — depende de indicação', () => {
    // A lista de papéis gerados automaticamente não inclui 'par': ele sai da
    // indicação do avaliado com aprovação do gestor, limitado por max_pares.
    // Sem isso, "par = área inteira" daria 741 convites (16,1 por pessoa).
    expect(servico).toMatch(/for \(const papel of \['auto', 'gestor', 'liderado'\]\)/);
  });
});
