// Contrato dos marcadores de jornada.
//
// Pedido do Arthur Serpa (ideia do Pr. Nélio · 13/08/2026): flags de jornada ao
// lado do nome, pro líder de grupo ver em que etapa cada pessoa da turma está.
// Restrição do Matheus no mesmo dia: aconselhamento/conversas pastorais e
// histórico de contribuição NÃO ficam abertos.
//
// ⚠️ MUTATION-TESTS desta suíte (os dois erros de boa-fé que este arquivo existe
// pra travar):
//   1. deixar `generosidade` entrar no conjunto aberto → vaza quem dizima pro
//      líder de grupo;
//   2. usar o piso de cargo (`cargoNivelLeitura`, como o `getEffectiveLevel`)
//      pra decidir o gate → cargo com nível base alto passa sem ter membresia
//      nem financeiro na matriz.
import { describe, it, expect } from 'vitest';
import {
  MARCADORES, CHAVES, CHAVES_ABERTAS, CHAVES_SENSIVEIS,
  podeVerMarcadorSensivel, montarMarcadores, marcadoresVazios,
} from '../../backend/utils/jornadaMarcadores.js';
import { MARCADOR_UI } from '../lib/jornadaMarcadores';

const user = (over: any = {}) => ({
  role: 'assistente', is_super_admin: false,
  granular: { modulePerms: {}, modulosBloqueados: [] },
  ...over,
});
const comModulo = (slug: string, leitura: number, over: any = {}) => user({
  granular: { modulePerms: { [slug]: { leitura, escrita: 0 } }, modulosBloqueados: [] },
  ...over,
});

describe('catálogo · o que é aberto e o que é sensível', () => {
  it('generosidade é o ÚNICO marcador sensível', () => {
    expect(CHAVES_SENSIVEIS).toEqual(['generosidade']);
  });

  // ⚠️ MUTANTE 1: mover `generosidade` pro conjunto aberto deixa isto vermelho.
  it('o conjunto aberto NÃO contém generosidade', () => {
    expect(CHAVES_ABERTAS).not.toContain('generosidade');
    expect(CHAVES_ABERTAS).toEqual(['batismo', 'next', 'grupo', 'servir', 'devocional']);
  });

  it('não existe marcador de aconselhamento / conversa pastoral', () => {
    const proibido = /aconselh|pastoral|jornada180|cuidado|convers/i;
    for (const m of MARCADORES) {
      expect(m.chave).not.toMatch(proibido);
      expect(m.label).not.toMatch(proibido);
      expect(m.descricao).not.toMatch(proibido);
    }
  });

  it('toda chave tem rótulo, sigla e descrição · sem duplicata', () => {
    expect(new Set(CHAVES).size).toBe(CHAVES.length);
    expect(new Set(MARCADORES.map((m: any) => m.curto)).size).toBe(MARCADORES.length);
    for (const m of MARCADORES) {
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.curto.length).toBeGreaterThan(1);
      expect(m.descricao.length).toBeGreaterThan(10);
    }
  });

  // A tela só sabe desenhar o que o catálogo declara; um marcador novo no
  // backend sem entrada de UI apareceria como flag sem nome (ou sumiria).
  it('a UI do ERP cobre exatamente as chaves do backend', () => {
    expect(Object.keys(MARCADOR_UI).sort()).toEqual([...CHAVES].sort());
  });
});

describe('podeVerMarcadorSensivel · gate do dado financeiro', () => {
  it('fail-closed: sem user, sem granular, sem módulo', () => {
    expect(podeVerMarcadorSensivel(null)).toBe(false);
    expect(podeVerMarcadorSensivel(undefined)).toBe(false);
    expect(podeVerMarcadorSensivel({ role: 'assistente' } as any)).toBe(false);
    expect(podeVerMarcadorSensivel(user())).toBe(false);
  });

  it('membresia ou financeiro nível >= 2 passa', () => {
    expect(podeVerMarcadorSensivel(comModulo('membresia', 2))).toBe(true);
    expect(podeVerMarcadorSensivel(comModulo('financeiro', 2))).toBe(true);
    expect(podeVerMarcadorSensivel(comModulo('financeiro', 5))).toBe(true);
  });

  it('nível 1 (leitura simples) NÃO passa', () => {
    expect(podeVerMarcadorSensivel(comModulo('membresia', 1))).toBe(false);
    expect(podeVerMarcadorSensivel(comModulo('financeiro', 1))).toBe(false);
  });

  // O caso do pedido: o líder de grupo / a coordenação de Grupos.
  it('quem só tem GRUPOS não vê — nem no nível 5', () => {
    expect(podeVerMarcadorSensivel(comModulo('grupos', 5))).toBe(false);
    expect(podeVerMarcadorSensivel(comModulo('voluntariado', 5))).toBe(false);
    expect(podeVerMarcadorSensivel(comModulo('cuidados', 5))).toBe(false);
  });

  // ⚠️ MUTANTE 2: trocar a checagem por `getEffectiveLevel` (que usa
  // cargoNivelLeitura como PISO) deixa isto vermelho.
  it('piso de cargo NÃO abre o gate', () => {
    const u = user({
      granular: { modulePerms: { grupos: { leitura: 1 } }, modulosBloqueados: [], cargoNivelLeitura: 5 },
    });
    expect(podeVerMarcadorSensivel(u)).toBe(false);
  });

  it('admin, diretor e super-admin passam', () => {
    expect(podeVerMarcadorSensivel(user({ role: 'admin' }))).toBe(true);
    expect(podeVerMarcadorSensivel(user({ role: 'diretor' }))).toBe(true);
    expect(podeVerMarcadorSensivel(user({ is_super_admin: true }))).toBe(true);
  });

  it('bloqueio explícito dos dois módulos vence admin', () => {
    const u = user({
      role: 'admin',
      granular: { modulePerms: {}, modulosBloqueados: ['membresia', 'financeiro'] },
    });
    expect(podeVerMarcadorSensivel(u)).toBe(false);
  });

  it('bloqueio de UM módulo não tira o acesso pelo outro', () => {
    const u = user({
      granular: {
        modulePerms: { membresia: { leitura: 2 }, financeiro: { leitura: 2 } },
        modulosBloqueados: ['financeiro'],
      },
    });
    expect(podeVerMarcadorSensivel(u)).toBe(true);
  });
});

describe('montarMarcadores · dobra dos sinais', () => {
  it('sem sinal nenhum, nenhuma chave', () => {
    expect(montarMarcadores({}).chaves).toEqual([]);
    expect(marcadoresVazios().chaves).toEqual([]);
  });

  it('respeita a ordem da jornada, não a ordem do input', () => {
    const r = montarMarcadores({ servir: true, batismo_cbrio: true, grupo: true });
    expect(r.chaves).toEqual(['batismo', 'grupo', 'servir']);
  });

  // ⚠️ A lei do arquivo: ausência de marcador é ausência de REGISTRO. Quem se
  // batizou em outra igreja é batizado — ignorar isso faz o líder cobrar
  // batismo de quem já se batizou.
  it('batismo em outra igreja CONTA como batizado, com o detalhe à vista', () => {
    const r = montarMarcadores({ batismo_outra: true });
    expect(r.chaves).toContain('batismo');
    expect(r.detalhes.batismo).toBe('em outra igreja');
  });

  it('batismo na CBRio não ganha o detalhe "em outra igreja"', () => {
    const r = montarMarcadores({ batismo_cbrio: true, batismo_outra: true });
    expect(r.chaves).toContain('batismo');
    expect(r.detalhes.batismo).toBeUndefined();
  });

  it('generosidade NÃO sai sem permissão, mesmo com o sinal verdadeiro', () => {
    const r = montarMarcadores({ generosidade: true, grupo: true });
    expect(r.chaves).toEqual(['grupo']);
    expect(r.sensiveis_ocultos).toBe(true);
  });

  it('generosidade sai com permissão, e aí nada fica oculto', () => {
    const r = montarMarcadores({ generosidade: true, grupo: true }, { incluirSensiveis: true });
    expect(r.chaves).toEqual(['grupo', 'generosidade']);
    expect(r.sensiveis_ocultos).toBe(false);
  });

  it('só `incluirSensiveis === true` abre (nada de truthy solto)', () => {
    const r = montarMarcadores({ generosidade: true }, { incluirSensiveis: 1 as any });
    expect(r.chaves).toEqual([]);
  });

  it('valores não-booleanos não viram marcador', () => {
    const r = montarMarcadores({ grupo: null, servir: undefined, next: 0 } as any);
    expect(r.chaves).toEqual([]);
  });
});

// ⚠️⚠️ Marcos · 27/08/2026: *"ela se batizou na igreja, mas não tem opção de
// marcar isso; como não temos o histórico de batismo antigo, pode colocar essa
// opção de já me batizei na CBRio."* Quem se batizou AQUI antes de o sistema
// existir não tem `batismo_inscricoes` e não pode se declarar "de outra igreja"
// — isso gravaria a própria igreja como se fosse outra.
describe('batismo declarado na CBRio · a 3ª fonte do marcador', () => {
  it('a declaração sozinha já marca "batizado"', () => {
    const m = montarMarcadores({ batismo_cbrio_declarado: true });
    expect(m.chaves).toContain('batismo');
  });

  // ⚠️ O detalhe diz de ONDE veio: "registrado" é fato da igreja, "declarado" é
  // a pessoa dizendo — e a equipe pode querer conferir e criar o registro.
  it('declaração e registro produzem DETALHES diferentes', () => {
    expect(montarMarcadores({ batismo_cbrio_declarado: true }).detalhes.batismo)
      .toBe('declarado pela pessoa (sem registro)');
    expect(montarMarcadores({ batismo_outra: true }).detalhes.batismo)
      .toBe('em outra igreja');
    // registro da CBRio não ganha detalhe: é o caso canônico
    expect(montarMarcadores({ batismo_cbrio: true }).detalhes.batismo).toBeUndefined();
  });

  // ⚠️ O registro VENCE a declaração no rótulo: quem tem batismo registrado na
  // CBRio não pode aparecer como "sem registro" só porque também declarou.
  it('registro tem precedência sobre a declaração no detalhe', () => {
    const m = montarMarcadores({ batismo_cbrio: true, batismo_cbrio_declarado: true });
    expect(m.chaves).toContain('batismo');
    expect(m.detalhes.batismo).toBeUndefined();
  });

  it('sem nenhuma das três fontes, não há marcador de batismo', () => {
    expect(montarMarcadores({}).chaves).not.toContain('batismo');
  });
});
