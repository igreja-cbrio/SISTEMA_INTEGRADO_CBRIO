import { describe, it, expect } from 'vitest';
import { rotuloDoDisparo, chaveTelefone, ROTULOS } from '../../backend/utils/whatsappOrigem.js';
import { MAPA } from '../../backend/utils/whatsappModulo.js';

// O que está em teste: a tela de Conversas AFIRMAR de qual disparo a pessoa veio.
// Com o bot calado (12/08), quem responde é gente — e afirmar a origem errada é
// pior que não afirmar nada: manda o atendente responder sobre outro assunto.

describe('rótulo do disparo · o que a equipe lê', () => {
  it('traduz os contextos REAIS de produção', () => {
    // Os 8 contextos medidos no banco em 12/08 (últimos 45 dias) = 100% do volume.
    const reais = [
      'grupos.pedido_novo_lider',
      'grupos.inscricao_confirmada',
      'grupos.pedido_aprovado',
      'membresia.censo_atualizacao',
      'grupos.confira_lista',
      'app.inscricao_confirmada',
      'app.pedido_atualizado',
      'app.aniversario',
    ];
    for (const c of reais) {
      const r = rotuloDoDisparo(c);
      expect(r.conhecido, `${c} devia ter rótulo`).toBe(true);
      expect(r.rotulo).not.toBe(c); // rótulo é frase, não o slug cru
      expect(r.modulo).toBeTruthy();
    }
  });

  it('cada rótulo diz de qual ASSUNTO é (grupos, censo, batismo…)', () => {
    expect(rotuloDoDisparo('grupos.pedido_novo_lider').rotulo).toMatch(/grupos/i);
    expect(rotuloDoDisparo('membresia.censo_atualizacao').rotulo).toMatch(/censo/i);
    expect(rotuloDoDisparo('app.batismo_lembrete').rotulo).toMatch(/batismo/i);
    expect(rotuloDoDisparo('next.convite').rotulo).toMatch(/next/i);
  });

  // ⚠️ MUTATION GUARD: contexto desconhecido NÃO pode ser escondido. Se ele
  // sumisse, a tela diria "não veio de disparo nenhum" justamente para quem
  // recebeu um — e é essa pessoa que respondeu sem contexto na tela.
  it('contexto desconhecido é DECLARADO, não escondido nem inventado', () => {
    const r = rotuloDoDisparo('modulo_que_alguem_criou.amanha');
    expect(r.conhecido).toBe(false);
    expect(r.rotulo).toBe('modulo_que_alguem_criou.amanha'); // mostra o slug cru
    expect(r.modulo).toBeTruthy(); // sempre tem dono (o padrão do MAPA)
  });

  it('contexto vazio não vira rótulo bonito de mentira', () => {
    for (const v of ['', null, undefined]) {
      const r = rotuloDoDisparo(v as string);
      expect(r.conhecido).toBe(false);
    }
  });

  // ⚠️ A régua de MÓDULO é a de whatsappModulo.js (a mesma que decide quem
  // recebe o aviso de falha de entrega). Duas réguas divergiriam, e aí a tela
  // diria um dono e o aviso iria pra outro.
  it('todo prefixo do MAPA de módulos tem rótulo aqui', () => {
    const chavesRotulo = ROTULOS.map(([k]: [string, string]) => k);
    for (const [chave] of MAPA as [string, unknown][]) {
      const cobre = chavesRotulo.some((k: string) => k === chave || k.startsWith(`${chave}.`));
      expect(cobre, `o contexto "${chave}" existe no MAPA de módulos e não tem rótulo`).toBe(true);
    }
  });
});

describe('chave de cruzamento · o tail é só o FILTRO', () => {
  // ⚠️⚠️ O tail NÃO decide identidade — quem decide é `mesmoNumeroBR`
  // (services/waInbox.js), que já existia e tem teste próprio no gate. Estes
  // casos existem pra provar que o filtro do banco não PERDE ninguém: as formas
  // reais em que os writers gravam o telefone têm que cair no mesmo tail, senão
  // a consulta indexada nem chega na conferência.
  it('as formas reais do mesmo número caem no mesmo tail', () => {
    const formas = ['21986687406', '5521986687406', '(21) 98668-7406', '+55 21 98668-7406'];
    const chaves = new Set(formas.map(chaveTelefone));
    expect(chaves.size, `deveria ser uma chave só, veio ${[...chaves].join(' / ')}`).toBe(1);
    // Os 8 ÚLTIMOS: o 9 do celular fica fora, e é isso que faz o número gravado
    // sem o 9 (metade do legado desta base) cair no mesmo filtro.
    expect(chaves.has('86687406')).toBe(true);
    expect(chaveTelefone('2186687406')).toBe('86687406');
  });

  // ⚠️ MUTATION GUARD: casar por menos de 8 dígitos ligaria conversas de pessoas
  // diferentes — atribuir a alguém um disparo que ela não recebeu é pior que não
  // mostrar nada.
  it('número curto demais NÃO gera chave parcial', () => {
    expect(chaveTelefone('9660')).toBeNull();
    expect(chaveTelefone('123')).toBeNull();
    expect(chaveTelefone('')).toBeNull();
    expect(chaveTelefone(null as unknown as string)).toBeNull();
    expect(chaveTelefone('98687406')).toBe('98687406');
  });

  // ⚠️⚠️ Este é o caso que prova por que o tail não pode decidir sozinho: dois
  // números de pessoas DIFERENTES caem no mesmo filtro. Quem separa é a régua
  // do inbox, chamada em services/whatsappOrigemConversa.
  it('tail igual NÃO é o mesmo número (é por isso que existe conferência depois)', () => {
    expect(chaveTelefone('21986687406')).toBe(chaveTelefone('21886687406'));
    expect(chaveTelefone('21986687406')).toBe(chaveTelefone('11986687406'));
  });
});
