// Contrato do roteamento da resposta a disparo (Matheus · 25/08/2026).
// ⚠️ Os setores abaixo são os 8 REAIS de produção, lidos em 26/08 — não
// inventados. Se o cadastro mudar e este teste ficar vermelho, é o teste que
// está velho; conferir `conversas_setores` antes de "consertar" a régua.
import { describe, it, expect } from 'vitest';
import { decidirRoteamento, setorDoModulo, dentroDaJanela } from '../../backend/utils/roteamentoDisparo.js';

const NATASHA = '66200546-9d38-44c7-850e-7f2db8a383de';
const ARIEL = '829fecb2-2154-4892-8916-d9a474327c20';

// Estado ALVO (depois de cadastrar os donos): Grupos → Natasha, Voluntariado → Ariel.
const SETORES = [
  { ordem: 1, rotulo: 'Cuidados', area: 'Cuidados', ativo: true, destino_tipo: 'area', atendente_id: null },
  { ordem: 2, rotulo: 'Grupos', area: 'Grupos', ativo: true, destino_tipo: 'atendente', atendente_id: NATASHA },
  { ordem: 3, rotulo: 'Integração', area: 'Integração', ativo: true, destino_tipo: 'area', atendente_id: null },
  { ordem: 4, rotulo: 'Kids', area: 'KIDS', ativo: true, destino_tipo: 'area', atendente_id: null },
  { ordem: 5, rotulo: 'Online', area: 'Online', ativo: true, destino_tipo: 'area', atendente_id: null },
  { ordem: 6, rotulo: 'Voluntariado', area: 'Voluntariado', ativo: true, destino_tipo: 'atendente', atendente_id: ARIEL },
  { ordem: 7, rotulo: 'Batismo', area: 'Integração', ativo: true, destino_tipo: 'area', atendente_id: null },
  { ordem: 8, rotulo: 'Next', area: 'Next', ativo: true, destino_tipo: 'area', atendente_id: null },
];

const AGORA = '2026-08-26T12:00:00.000Z';
const ONTEM = '2026-08-25T12:00:00.000Z';
const base = (extra: Record<string, unknown> = {}) =>
  decidirRoteamento({ contexto: 'grupos.pedido_aprovado', disparoEm: ONTEM, agora: AGORA, setores: SETORES, ...extra });

describe('roteamento da resposta a disparo', () => {
  it('os 4 casos REAIS de grupos caem na Natasha com a tag Grupos', () => {
    // Ana Cristina, Jessica, Thalya e o (21) 98633-5326 vieram destes contextos.
    for (const ctx of ['grupos.pedido_aprovado', 'grupos.inscricao_confirmada']) {
      const r = base({ contexto: ctx });
      expect(r?.area, ctx).toBe('Grupos');
      expect(r?.atendenteId, ctx).toBe(NATASHA);
    }
  });

  it('o lembrete de escala do Syogi cai na Ariel com a tag Voluntariado', () => {
    const r = base({ contexto: 'voluntariado.escala_lembrete' });
    expect(r?.area).toBe('Voluntariado');
    expect(r?.atendenteId).toBe(ARIEL);
  });

  it('⚠️ o aniversário é do VOLUNTARIADO, não do app', () => {
    // `app.aniversario` parece do "app" e o MAPA do whatsappModulo já resolve
    // isso: o cron só envia a quem tem vínculo de voluntário ABERTO. Foi o bug
    // de 05/08 (prefixo do contexto não é módulo) — aqui ele fica travado.
    const r = base({ contexto: 'app.aniversario' });
    expect(r?.area).toBe('Voluntariado');
    expect(r?.atendenteId).toBe(ARIEL);
  });

  it('⚠️ NUNCA sobrescreve área ou dono já definidos por gente', () => {
    expect(base({ area: 'Cuidados' })).toBeNull();
    expect(base({ atribuidoA: 'outra-pessoa' })).toBeNull();
    expect(base({ area: 'Grupos', atribuidoA: NATASHA })).toBeNull();
  });

  it('⚠️ setor de ÁREA etiqueta e NÃO inventa dono', () => {
    const r = base({ contexto: 'kids.resumo' });
    expect(r?.area).toBe('KIDS');
    expect(r?.atendenteId).toBeNull();
  });


  it('⚠️ dono cadastrado com destino_tipo=area NÃO atribui (espelha concluirTriagem)', () => {
    // Cadastro possível e legítimo: "o Fulano é a referência do setor, mas a
    // conversa é da ÁREA". Quem decide atribuir é o `destino_tipo`, exatamente
    // como o menu do bot já faz — duas réguas divergiriam no 1º cadastro assim.
    const meio = SETORES.map(s => (s.area === 'Cuidados' ? { ...s, atendente_id: NATASHA } : s));
    const r = base({ contexto: 'cuidados.contato', setores: meio });
    expect(r?.area).toBe('Cuidados');
    expect(r?.atendenteId).toBeNull();
  });

  it('⚠️ módulo sem setor no menu não roteia (não inventa destino)', () => {
    // membresia/inscricoes/solicitacoes/financeiro/rh não existem em conversas_setores.
    expect(base({ contexto: 'censo.convite' })).toBeNull();
    expect(base({ contexto: 'inscricoes.confirmacao' })).toBeNull();
    expect(base({ contexto: 'rh.aviso' })).toBeNull();
  });

  it('⚠️ área duplicada desempata pela MENOR ordem (Integração, não Batismo)', () => {
    expect(setorDoModulo('integracao', SETORES)?.rotulo).toBe('Integração');
    // e a ordem em que o banco devolve não pode mudar a resposta
    expect(setorDoModulo('integracao', [...SETORES].reverse())?.rotulo).toBe('Integração');
  });

  it('⚠️ setor INATIVO não recebe conversa', () => {
    const off = SETORES.map(s => (s.area === 'Grupos' ? { ...s, ativo: false } : s));
    expect(base({ setores: off })).toBeNull();
  });

  it('⚠️ fora da janela de 7 dias, fica sem etiqueta em vez de chutar dono', () => {
    expect(base({ disparoEm: '2026-08-18T11:00:00.000Z' })).toBeNull(); // 8 dias
    expect(base({ disparoEm: '2026-08-19T13:00:00.000Z' })?.area).toBe('Grupos'); // ~6,96 dias
  });

  it('⚠️ data ilegível ou no futuro é fail-CLOSED', () => {
    expect(dentroDaJanela(null, AGORA)).toBe(false);
    expect(dentroDaJanela('nao-e-data', AGORA)).toBe(false);
    expect(dentroDaJanela('2026-08-27T12:00:00.000Z', AGORA)).toBe(false); // futuro
  });

  it('sem contexto de disparo não há o que rotear', () => {
    expect(base({ contexto: null })).toBeNull();
    expect(base({ contexto: '' })).toBeNull();
  });

  it('acento e caixa não separam o setor do módulo', () => {
    expect(setorDoModulo('integracao', SETORES)?.area).toBe('Integração');
    expect(setorDoModulo('kids', SETORES)?.area).toBe('KIDS');
  });
});
