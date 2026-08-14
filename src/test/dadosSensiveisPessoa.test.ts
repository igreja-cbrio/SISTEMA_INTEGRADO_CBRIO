// Contrato de quem vê DINHEIRO e CUIDADO PASTORAL de uma pessoa na ficha.
//
// Fecha o furo achado em 13/08/2026 e autorizado pelo Matheus:
// `ROUTE_MODULE_MAP['membros']` mapeia 12 módulos, então
// `authorizeModule('membros', 1)` bastava pra quem tem `grupos` nível 1 chamar
// `GET /membresia/membros/:id/timeline` e receber contribuições com VALOR e
// aconselhamentos com MOTIVO.
//
// ⚠️ MUTATION-TESTS desta suíte:
//   1. deixar `grupos` (ou qualquer um dos 12 do ROUTE_MODULE_MAP) abrir o
//      financeiro/pastoral → é literalmente o furo voltando;
//   2. usar o piso de cargo (`cargoNivelLeitura`) → cargo com nível base alto
//      passa sem ter nenhum dos módulos exigidos;
//   3. deixar de filtrar um tipo de evento sensível da timeline.
import { describe, it, expect } from 'vitest';
import {
  MODULOS_FINANCEIRO, MODULOS_PASTORAL, EVENTO_SENSIVEL,
  podeVerFinanceiroDePessoa, podeVerPastoralDePessoa, filtrarTimeline,
} from '../../backend/utils/dadosSensiveisPessoa.js';

const user = (over: any = {}) => ({
  role: 'assistente', is_super_admin: false,
  granular: { modulePerms: {}, modulosBloqueados: [] },
  ...over,
});
const com = (perms: Record<string, number>, over: any = {}) => user({
  granular: {
    modulePerms: Object.fromEntries(
      Object.entries(perms).map(([k, v]) => [k, { leitura: v, escrita: 0 }]),
    ),
    modulosBloqueados: [],
    ...(over.granular || {}),
  },
  ...over,
});

// ⚠️⚠️ AS LISTAS ABAIXO SÃO ESCRITAS À MÃO DE PROPÓSITO, e isto não é
// repetição preguiçosa. A 1ª versão deste arquivo derivava os "incidentais"
// excluindo `MODULOS_FINANCEIRO` da lista dos 12 — e o mutante que acrescentava
// `grupos` à constante fazia o teste PULAR `grupos`. Ou seja: o teste que
// existia pra travar o furo ficava verde COM o furo aberto. Teste que lê a
// constante que deveria verificar não é rede, é confirmação.
// É a mesma lição do `toBe('900.00')` do Mercado Pago (08/08/2026).

/** Módulos de `ROUTE_MODULE_MAP['membros']` que NÃO podem abrir o financeiro. */
const NAO_ABREM_FINANCEIRO = [
  'grupos', 'cuidados', 'integracao', 'next', 'next-batismo',
  'voluntariado', 'kids', 'ami', 'bridge', 'online', 'face',
];

/** Módulos de `ROUTE_MODULE_MAP['membros']` que NÃO podem abrir o pastoral. */
const NAO_ABREM_PASTORAL = [
  'grupos', 'integracao', 'next', 'next-batismo', 'voluntariado',
  'kids', 'ami', 'bridge', 'online', 'face', 'financeiro',
];

describe('financeiro · dízimo/oferta da pessoa', () => {
  it('fail-closed: sem user, sem granular, sem módulo', () => {
    expect(podeVerFinanceiroDePessoa(null)).toBe(false);
    expect(podeVerFinanceiroDePessoa({ role: 'assistente' } as any)).toBe(false);
    expect(podeVerFinanceiroDePessoa(user())).toBe(false);
  });

  it('membresia ou financeiro nível 2 passa · nível 1 não', () => {
    expect(podeVerFinanceiroDePessoa(com({ membresia: 2 }))).toBe(true);
    expect(podeVerFinanceiroDePessoa(com({ financeiro: 2 }))).toBe(true);
    expect(podeVerFinanceiroDePessoa(com({ membresia: 1 }))).toBe(false);
    expect(podeVerFinanceiroDePessoa(com({ financeiro: 1 }))).toBe(false);
  });

  // ⚠️ MUTANTE 1 — É O FURO. Os módulos incidentais do ROUTE_MODULE_MAP NÃO
  // podem abrir dado financeiro, nem no nível 5.
  it('nenhum dos módulos incidentais da rota `membros` abre o financeiro', () => {
    for (const m of NAO_ABREM_FINANCEIRO) {
      expect(podeVerFinanceiroDePessoa(com({ [m]: 5 })), `${m} nível 5`).toBe(false);
    }
  });

  // Trava a própria constante: alargá-la é o jeito mais fácil de reabrir o furo.
  it('MODULOS_FINANCEIRO é exatamente membresia + financeiro', () => {
    expect([...MODULOS_FINANCEIRO].sort()).toEqual(['financeiro', 'membresia']);
  });

  it('admin, diretor e super-admin passam', () => {
    expect(podeVerFinanceiroDePessoa(user({ role: 'admin' }))).toBe(true);
    expect(podeVerFinanceiroDePessoa(user({ role: 'diretor' }))).toBe(true);
    expect(podeVerFinanceiroDePessoa(user({ is_super_admin: true }))).toBe(true);
  });

  it('bloqueio explícito dos dois módulos vence admin', () => {
    const u = user({
      role: 'admin',
      granular: { modulePerms: {}, modulosBloqueados: ['membresia', 'financeiro'] },
    });
    expect(podeVerFinanceiroDePessoa(u)).toBe(false);
  });

  // ⚠️ MUTANTE 2 — o erro do `getEffectiveLevel`.
  it('piso de cargo NÃO abre o gate', () => {
    const u = user({
      granular: { modulePerms: { grupos: { leitura: 1 } }, modulosBloqueados: [], cargoNivelLeitura: 5 },
    });
    expect(podeVerFinanceiroDePessoa(u)).toBe(false);
    expect(podeVerPastoralDePessoa(u)).toBe(false);
  });
});

describe('pastoral · aconselhamento e jornada 180', () => {
  it('cuidados nível 1 passa (é o módulo dono do assunto)', () => {
    expect(podeVerPastoralDePessoa(com({ cuidados: 1 }))).toBe(true);
  });

  // A equipe de membresia trabalha NA ficha — o pedido foi "não abrir pra
  // TODOS", não tirar de quem já usa a tela.
  it('membresia nível 2 passa · nível 1 não', () => {
    expect(podeVerPastoralDePessoa(com({ membresia: 2 }))).toBe(true);
    expect(podeVerPastoralDePessoa(com({ membresia: 1 }))).toBe(false);
  });

  // ⚠️ MUTANTE 1 (lado pastoral) — o caso do pedido: o líder de grupo.
  // `financeiro` está na lista de propósito: os públicos são distintos.
  it('nenhum dos módulos incidentais da rota `membros` abre o pastoral', () => {
    for (const m of NAO_ABREM_PASTORAL) {
      expect(podeVerPastoralDePessoa(com({ [m]: 5 })), `${m} nível 5`).toBe(false);
    }
  });

  it('MODULOS_PASTORAL é exatamente cuidados + membresia', () => {
    expect([...MODULOS_PASTORAL].sort()).toEqual(['cuidados', 'membresia']);
  });
});

describe('filtrarTimeline · o que sai e o que é declarado', () => {
  const linha = () => ([
    { tipo: 'grupo', titulo: 'Entrou no grupo' },
    { tipo: 'contribuicao', titulo: 'Doação · dizimo', detalhe: 'R$ 500' },
    { tipo: 'aconselhamento', titulo: 'Aconselhamento', detalhe: 'motivo sensível' },
    { tipo: 'jornada', titulo: 'Encontro pastoral (jornada 180)' },
    { tipo: 'encaminhamento', titulo: 'Encaminhado · grupos' },
    { tipo: 'batismo_realizado', titulo: 'Batizado' },
    { tipo: 'censo', titulo: 'Respondeu o censo' },
  ]);

  it('sem nenhuma permissão sobra só o que não é sensível', () => {
    const r = filtrarTimeline(linha(), { financeiro: false, pastoral: false });
    expect(r.eventos.map((e: any) => e.tipo)).toEqual(['grupo', 'batismo_realizado', 'censo']);
    expect(r.ocultos).toEqual({ financeiro: 1, pastoral: 3 });
  });

  // ⚠️ O valor NUNCA pode sobrar no payload — é o dado do furo.
  it('nenhum evento remanescente carrega valor de contribuição', () => {
    const r = filtrarTimeline(linha(), { financeiro: false, pastoral: false });
    expect(JSON.stringify(r.eventos)).not.toContain('R$ 500');
    expect(JSON.stringify(r.eventos)).not.toContain('motivo sensível');
  });

  it('com as duas permissões nada é cortado', () => {
    const r = filtrarTimeline(linha(), { financeiro: true, pastoral: true });
    expect(r.eventos).toHaveLength(7);
    expect(r.ocultos).toEqual({ financeiro: 0, pastoral: 0 });
  });

  it('as permissões são independentes', () => {
    const soFin = filtrarTimeline(linha(), { financeiro: true, pastoral: false });
    expect(soFin.eventos.map((e: any) => e.tipo)).toContain('contribuicao');
    expect(soFin.eventos.map((e: any) => e.tipo)).not.toContain('aconselhamento');

    const soPast = filtrarTimeline(linha(), { financeiro: false, pastoral: true });
    expect(soPast.eventos.map((e: any) => e.tipo)).toContain('aconselhamento');
    expect(soPast.eventos.map((e: any) => e.tipo)).not.toContain('contribuicao');
  });

  // ⚠️ MUTANTE 3: tirar qualquer chave de EVENTO_SENSIVEL deixa isto vermelho.
  it('os 4 tipos sensíveis estão declarados', () => {
    expect(Object.keys(EVENTO_SENSIVEL).sort())
      .toEqual(['aconselhamento', 'contribuicao', 'encaminhamento', 'jornada']);
  });

  it('lista vazia / nula não quebra', () => {
    expect(filtrarTimeline([], { financeiro: false, pastoral: false }).eventos).toEqual([]);
    expect(filtrarTimeline(null as any, { financeiro: true, pastoral: true }).eventos).toEqual([]);
  });
});
