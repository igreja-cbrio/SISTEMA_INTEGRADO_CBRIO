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
  // ⚠️⚠️ BRIDGE É 13-17 E AMI É 18-25. Eu tinha invertido, deduzindo da régua de
  // faixa etária da casa ("adolescente 13-17, logo AMI") em vez de perguntar. O
  // Matheus corrigiu olhando a tela em 21/09/2026. Faixa de ministério é nome da
  // casa, não dedução — este teste existe para a inversão não voltar.
  it('⚠️ 13 a 17 é BRIDGE; 18 a 25 é AMI', () => {
    expect(FAIXA_BRIDGE).toBe('13 a 17 anos');
    expect(FAIXA_AMI).toBe('18 a 25 anos');
    expect(classificar(pai({ filhos_faixas: ['13 a 17 anos'] })).bridge).toBe(true);
    expect(classificar(pai({ filhos_faixas: ['13 a 17 anos'] })).ami).toBe(false);
    expect(classificar(pai({ filhos_faixas: ['18 a 25 anos'] })).ami).toBe(true);
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

// Pedido do Matheus (21/09): *"quero mais dois potencial, que sao as pessoas que
// nao fizeram next e pssoas que nao servem"*. Medido: 809 e 859 de 1.356.
describe('Ainda não fez o Next · ainda não serve', () => {
  it('quem respondeu "Não" entra', () => {
    const c = classificar(pai({ fez_next: 'Não', serve_ministerio: 'Não' }));
    expect(c.nao_fez_next && c.nao_serve).toBe(true);
  });

  it('quem respondeu "Sim" não entra', () => {
    const c = classificar(pai({ fez_next: 'Sim', serve_ministerio: 'Sim' }));
    expect(c.nao_fez_next || c.nao_serve).toBe(false);
  });

  it('⚠️ quem NÃO RESPONDEU não entra — ausência não é "não fez"', () => {
    const p = pai(); delete (p as Record<string, unknown>).fez_next;
    expect(
      classificar(p).nao_fez_next,
      'ligar para quem já fez, por causa de campo vazio, queima quem liga',
    ).toBe(false);
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

// ⚠️⚠️ PARA ONDE O BOTÃO "Cuidado" MANDA — e por que não é a outra fila.
//
// A escolha natural seria `cui_batismo_next_fila`, que já existe e já tem
// status, responsável e rascunho de mensagem. Ela foi REJEITADA por medição
// (21/09/2026):
//
//  1. `convertido_id` é FK para `cui_convertidos` e **só 18 dos 178 convertidos
//     do censo existem lá** — os outros 160 teriam que ser CRIADOS.
//  2. `cui_convertidos` alimenta `cuidados.convertidos_pos_culto` e
//     `cuidados.reuniao_aceita_pct`, que contam por `data_culto` e **não filtram
//     origem nenhuma**. 160 linhas de gente que não foi atendida após culto e
//     não tem encontro marcado derrubariam os dois percentuais de uma vez.
//  3. E aquela fila tem **167 linhas, 100% pendentes desde 25/06** — ninguém a
//     trabalha. Somar 160 ali seria empilhar em cima de uma fila morta.
//
// ⇒ `cen_cuidado`: fila do próprio censo, ligada à `resposta_id`, com a aba
// Cuidado já lendo. Este teste existe para que a troca não seja desfeita por
// alguém que veja "já existe uma fila de batismo" e ache que é reuso.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('⚠️⚠️ o encaminhamento vai para a fila do CENSO, não para a de batismo', () => {
  const rota = readFileSync(join(__dirname, '..', '..', 'backend/routes/censo.js'), 'utf8');
  const trecho = rota.slice(rota.indexOf("router.post('/potencial/cuidado'"));

  it('insere em `cen_cuidado`', () => {
    expect(trecho).toMatch(/from\('cen_cuidado'\)[\s\S]{0,120}insert/);
  });

  it('⚠️ NÃO toca em cui_convertidos nem na fila de batismo', () => {
    expect(trecho, 'criar em cui_convertidos derruba 2 KPIs de Cuidados').not.toContain('cui_convertidos');
    expect(trecho).not.toContain('cui_batismo_next_fila');
  });

  it('⚠️ deduplica: `cen_cuidado` não tem UNIQUE, dois cliques criariam duas linhas', () => {
    expect(trecho).toMatch(/\.in\('status', \['aberto', 'em_contato'\]\)/);
    expect(trecho, 'já estar na fila não é erro — responde ok com ja_estava').toMatch(/ja_estava: true/);
  });

  it('⚠️ o tipo é validado contra o CHECK da tabela', () => {
    expect(trecho).toMatch(/\['familiar', 'aconselhamento', 'oracao', 'conversa'\]/);
  });

  it('exige nível 4 — o mesmo da lista nominal', () => {
    expect(trecho).toMatch(/authorizeModule\('censo', 4\)/);
  });
});
