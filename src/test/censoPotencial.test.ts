// As listas acionáveis do censo — quem PODE ser convidado.
//
// ⚠️⚠️ FIXTURES, NUNCA OS NÚMEROS DE PRODUÇÃO. A pesquisa do Censo 2026 está
// ABERTA e coletando: entre duas medições com 40 minutos de diferença em
// 21/09/2026, a base foi de 1.355 para 1.356 respostas e os convertidos não
// batizados de 177 para 178. Ancorar um teste em "92" o deixaria vermelho no
// domingo seguinte, e teste que quebra sozinho é teste que alguém desliga.
//
// Os números medidos em 21/09/2026 ficam aqui como REFERÊNCIA de que a régua
// reproduz a realidade (conferidos em SQL contra `cen_resposta.payload`):
//   kids "Não" 92 · kids "Parcialmente" 69 · AMI 209 · Bridge 243 ·
//   convertidos não batizados 178 · recusaram WhatsApp 42 · base 1.356
import { describe, it, expect } from 'vitest';
import {
  classificar, contatoDe, montarPotencial, resumoPotencial,
  FAIXAS_KIDS, FAIXA_AMI, FAIXA_BRIDGE,
} from '../../backend/utils/censoPotencial.js';

const pai = (over: Record<string, unknown> = {}) => ({
  nome: 'Fulano de Tal', telefone: '21999990000', email: 'f@x.com',
  tem_filhos: 'Sim', filhos_quantos: 2, filhos_faixas: ['3 a 6 anos'],
  filhos_frequentam: 'Não', entregou_vida: 'Sim', batizado: 'Sim',
  whatsapp_optin: 'Sim, autorizo', ...over,
});
const linha = (payload: Record<string, unknown>, id = 'r1') => ({ id, membro_id: 'm1', payload });

describe('Potencial Kids · "Não" e "Parcialmente" são listas DIFERENTES', () => {
  it('quem tem filho na faixa e não frequenta entra em kids_nao', () => {
    expect(classificar(pai()).kids).toBe('nao');
  });

  it('⚠️ "Parcialmente" NÃO entra em kids_nao — a família já está no Kids', () => {
    const c = classificar(pai({ filhos_frequentam: 'Parcialmente' }));
    expect(c.kids, 'juntar os dois faz ligar para quem já leva o filho').toBe('parcial');
  });

  it('quem já frequenta não entra em nenhuma das duas', () => {
    expect(classificar(pai({ filhos_frequentam: 'Sim' })).kids).toBeNull();
  });

  it('as quatro faixas do Kids valem, e só elas', () => {
    for (const f of FAIXAS_KIDS) {
      expect(classificar(pai({ filhos_faixas: [f] })).kids, `faixa ${f}`).toBe('nao');
    }
    expect(classificar(pai({ filhos_faixas: [FAIXA_AMI] })).kids).toBeNull();
  });

  it('⚠️ sem filhos não entra, mesmo dizendo que não frequenta', () => {
    expect(classificar(pai({ tem_filhos: 'Não', filhos_faixas: undefined })).kids).toBeNull();
  });
});

describe('⚠️⚠️ payload sem `filhos_faixas` não pode derrubar a rota', () => {
  it('chave ausente (398 payloads reais) devolve lista vazia, não exceção', () => {
    const p = pai(); delete (p as Record<string, unknown>).filhos_faixas;
    expect(() => classificar(p)).not.toThrow();
    expect(classificar(p).kids).toBeNull();
  });

  it('valor não-array também não explode', () => {
    expect(() => classificar(pai({ filhos_faixas: 'texto' }))).not.toThrow();
    expect(() => classificar(pai({ filhos_faixas: null }))).not.toThrow();
  });
});

describe('AMI e Bridge saem SÓ da faixa — não há pergunta de frequência', () => {
  it('filho de 13 a 17 é AMI; de 18 a 25 é Bridge', () => {
    expect(classificar(pai({ filhos_faixas: [FAIXA_AMI] })).ami).toBe(true);
    expect(classificar(pai({ filhos_faixas: [FAIXA_BRIDGE] })).bridge).toBe(true);
  });

  it('a mesma pessoa pode estar nas duas', () => {
    const c = classificar(pai({ filhos_faixas: [FAIXA_AMI, FAIXA_BRIDGE] }));
    expect(c.ami && c.bridge).toBe(true);
  });
});

describe('Convertidos não batizados', () => {
  it('entregou a vida e não foi batizado', () => {
    expect(classificar(pai({ entregou_vida: 'Sim', batizado: 'Não' })).convertido).toBe(true);
  });

  it('⚠️ "Ainda em decisão" NÃO entra — a pessoa não declarou conversão', () => {
    const c = classificar(pai({ entregou_vida: 'Ainda em decisão', batizado: 'Não' }));
    expect(c.convertido, 'abordar como convertido afirma por ela o que ela não disse').toBe(false);
  });

  it('já batizado não entra', () => {
    expect(classificar(pai({ entregou_vida: 'Sim', batizado: 'Sim' })).convertido).toBe(false);
  });
});

describe('⚠️⚠️ WhatsApp tem TRÊS estados, não dois', () => {
  it('quem autorizou', () => {
    expect(contatoDe(pai()).whatsapp).toBe('autorizou');
  });

  it('⚠️ quem escreveu "Não autorizo" é RECUSA — a tela não oferece WhatsApp', () => {
    expect(contatoDe(pai({ whatsapp_optin: 'Não autorizo' })).whatsapp).toBe('recusou');
  });

  it('⚠️ quem respondeu ANTES de a pergunta existir não é recusa', () => {
    const p = pai(); delete (p as Record<string, unknown>).whatsapp_optin;
    expect(
      contatoDe(p).whatsapp,
      'a pergunta entrou em 13/09; tratar ausência como recusa apagaria centenas sem ninguém ter dito não',
    ).toBe('nao_perguntado');
  });
});

describe('⚠️ a soma das listas NÃO é o número de famílias', () => {
  it('quem está em duas listas conta UMA vez em familias_distintas', () => {
    const r = montarPotencial([
      linha(pai({ filhos_faixas: ['3 a 6 anos', FAIXA_AMI], batizado: 'Não' }), 'r1'),
    ]);
    expect(r.totais.kids_nao + r.totais.ami + r.totais.convertidos).toBe(3);
    expect(r.familias_distintas, 'sem dedup a mesma família leva 3 ligações').toBe(1);
  });

  it('quem não entra em lista nenhuma não conta', () => {
    const r = montarPotencial([linha(pai({ tem_filhos: 'Não', filhos_faixas: undefined }), 'r9')]);
    expect(r.familias_distintas).toBe(0);
  });

  it('linha sem payload é ignorada, não derruba', () => {
    const r = montarPotencial([{ id: 'x', membro_id: null, payload: null } as never, linha(pai())]);
    expect(r.totais.kids_nao).toBe(1);
  });
});

describe('⚠️ o resumo (nível 2) não carrega PII', () => {
  it('devolve só contagens — nenhum nome ou telefone', () => {
    const r = resumoPotencial([linha(pai())]);
    expect(JSON.stringify(r)).not.toContain('Fulano');
    expect(JSON.stringify(r)).not.toContain('21999990000');
    expect(r.totais.kids_nao).toBe(1);
  });
});

// ⚠️⚠️ A guarda de EXPORTAÇÃO que a matriz sempre teve e a API nunca aplicou.
//
// Medido em 21/09/2026 no módulo `censo`: **34 cargos com nível >= 2 — entre
// eles "Membro" e "Voluntário" — e só "Dev" com `pode_exportar = true`.** Um
// botão de CSV sem esta guarda entrega a 33 cargos exatamente o que a tela de
// Permissões diz que eles não podem. E CSV sai do sistema: sem trilha, sem
// revogação, sem volta.
import { podeExportar } from '../../backend/utils/podeExportar.js';

describe('⚠️⚠️ podeExportar respeita a matriz de permissões', () => {
  const comFlag = (v: boolean) => ({ granular: { modulePerms: { censo: { leitura: 2, pode_exportar: v } } } });

  it('cargo de nível 2 SEM a flag não exporta', () => {
    expect(
      podeExportar(comFlag(false), 'censo'),
      'é o caso de 33 dos 34 cargos com acesso ao censo',
    ).toBe(false);
  });

  it('cargo com a flag exporta', () => {
    expect(podeExportar(comFlag(true), 'censo')).toBe(true);
  });

  it('super admin e diretor passam (como em todo o resto do sistema)', () => {
    expect(podeExportar({ is_super_admin: true }, 'censo')).toBe(true);
    expect(podeExportar({ role: 'diretor' }, 'censo')).toBe(true);
  });

  it('⚠️ sem permissão granular é NÃO — fail-closed', () => {
    expect(podeExportar({}, 'censo')).toBe(false);
    expect(podeExportar(null as never, 'censo')).toBe(false);
    expect(podeExportar({ granular: { modulePerms: null } } as never, 'censo')).toBe(false);
  });

  it('⚠️ flag de OUTRO módulo não libera o censo', () => {
    const u = { granular: { modulePerms: { financeiro: { pode_exportar: true } } } };
    expect(podeExportar(u, 'censo')).toBe(false);
  });
});
