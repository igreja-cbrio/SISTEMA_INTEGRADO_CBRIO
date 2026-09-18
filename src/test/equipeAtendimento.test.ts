// Contrato da equipe de atendimento do inbox (titular + suplente por área).
// Roda no `npm test` (gate de deploy). Sem banco, sem rede, sem relógio.
import { describe, it, expect } from 'vitest';
import {
  ENTRADA, chaveDaArea, decidirResponsavel, podeAutoAtribuir, validarEquipe, textoAviso, montarLinhas,
} from '../../backend/utils/equipeAtendimento';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const EQUIPE = [
  { area: 'Grupos', titular_id: A, suplente_id: B },
  { area: 'Integração', titular_id: null, suplente_id: C },
  { area: 'Entrada', titular_id: C, suplente_id: null },
  { area: 'KIDS', titular_id: null, suplente_id: null },
];

describe('equipeAtendimento · chaveDaArea', () => {
  it('conversa sem área é da Entrada', () => {
    expect(chaveDaArea(null)).toBe(ENTRADA);
    expect(chaveDaArea('')).toBe(ENTRADA);
    expect(chaveDaArea('   ')).toBe(ENTRADA);
  });
  it('área com espaço sobrando é limpa', () => {
    expect(chaveDaArea(' Grupos ')).toBe('Grupos');
  });
});

describe('equipeAtendimento · decidirResponsavel', () => {
  it('o TITULAR recebe', () => {
    expect(decidirResponsavel({ area: 'Grupos', equipe: EQUIPE })).toEqual({ profileId: A, papel: 'titular', area: 'Grupos' });
  });
  it('casa a área sem acento e sem caixa (o nome vem de duas tabelas)', () => {
    expect(decidirResponsavel({ area: 'integracao', equipe: EQUIPE })?.profileId).toBe(C);
    expect(decidirResponsavel({ area: 'GRUPOS', equipe: EQUIPE })?.profileId).toBe(A);
  });
  it('sem titular, o SUPLENTE recebe — e o papel diz isso', () => {
    expect(decidirResponsavel({ area: 'Integração', equipe: EQUIPE })).toEqual({ profileId: C, papel: 'suplente', area: 'Integração' });
  });
  it('titular indisponível ⇒ suplente; os dois indisponíveis ⇒ ninguém', () => {
    expect(decidirResponsavel({ area: 'Grupos', equipe: EQUIPE, indisponiveis: [A] })?.profileId).toBe(B);
    expect(decidirResponsavel({ area: 'Grupos', equipe: EQUIPE, indisponiveis: [A, B] })).toBeNull();
  });
  // ⚠️ null aqui é o que faz o comportamento ANTIGO valer (avisa a área toda,
  // ninguém atribuído). Inventar responsável é pior que não ter.
  it('área sem linha, ou linha sem ninguém, devolve null', () => {
    expect(decidirResponsavel({ area: 'Online', equipe: EQUIPE })).toBeNull();
    expect(decidirResponsavel({ area: 'KIDS', equipe: EQUIPE })).toBeNull();
    expect(decidirResponsavel({ area: 'Grupos', equipe: [] })).toBeNull();
    expect(decidirResponsavel({ area: 'Grupos', equipe: undefined as any })).toBeNull();
  });
  it('conversa SEM área cai no titular da Entrada', () => {
    expect(decidirResponsavel({ area: null, equipe: EQUIPE })).toEqual({ profileId: C, papel: 'titular', area: ENTRADA });
  });
  it('id que não é uuid na linha é ignorado (não vira atribuição quebrada)', () => {
    expect(decidirResponsavel({ area: 'X', equipe: [{ area: 'X', titular_id: 'lixo', suplente_id: B }] })?.profileId).toBe(B);
  });
});

describe('equipeAtendimento · podeAutoAtribuir', () => {
  it('só entra onde ninguém decidiu ainda', () => {
    expect(podeAutoAtribuir({ atribuido_a: null })).toBe(true);
    expect(podeAutoAtribuir({ atribuido_a: A })).toBe(false);
    expect(podeAutoAtribuir(null)).toBe(false);
  });
});

describe('equipeAtendimento · validarEquipe', () => {
  it('aceita titular + suplente distintos e normaliza vazio para null', () => {
    expect(validarEquipe({ area: ' Grupos ', titular_id: A, suplente_id: '' })).toEqual({ ok: true, valor: { area: 'Grupos', titular_id: A, suplente_id: null } });
    expect(validarEquipe({ area: 'Grupos', titular_id: null, suplente_id: undefined }).valor).toEqual({ area: 'Grupos', titular_id: null, suplente_id: null });
  });
  it('recusa a mesma pessoa nos dois papéis', () => {
    const r = validarEquipe({ area: 'Grupos', titular_id: A, suplente_id: A.toUpperCase() });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/mesma pessoa/);
  });
  it('recusa id que não é uuid e área vazia', () => {
    expect(validarEquipe({ area: 'Grupos', titular_id: 'abc' }).ok).toBe(false);
    expect(validarEquipe({ area: '', titular_id: A }).ok).toBe(false);
    expect(validarEquipe({ area: 'x'.repeat(81) }).ok).toBe(false);
  });
});

describe('equipeAtendimento · textoAviso', () => {
  it('diz de onde a conversa veio e que foi atribuída a quem lê', () => {
    expect(textoAviso({ nome: 'Ana', area: 'Grupos', papel: 'titular', origem: 'menu' }))
      .toEqual({ titulo: 'Nova conversa · Grupos', mensagem: 'Ana quer falar com Grupos — atribuída a você.' });
    expect(textoAviso({ nome: 'Ana', area: 'Grupos', papel: 'suplente', origem: 'triagem' }).mensagem)
      .toBe('Ana foi movida para Grupos — atribuída a você (você é o suplente da área).');
    expect(textoAviso({ nome: 'Ana', area: 'Grupos', origem: 'disparo' }).mensagem).toContain('respondeu um disparo de Grupos');
  });
  it('na Entrada não fala em área; sem cadastro leva a marca', () => {
    const t = textoAviso({ nome: 'Ana', area: null, papel: 'titular', cadastrada: false });
    expect(t.titulo).toBe('Nova conversa · Entrada');
    expect(t.mensagem).toBe('Ana (⚠️ não cadastrado na membresia) escreveu e a conversa ainda não tem área — atribuída a você.');
  });
  it('sem nome vira "Contato", nunca string vazia', () => {
    expect(textoAviso({ nome: '  ', area: 'Grupos' }).mensagem.startsWith('Contato ')).toBe(true);
  });
});

describe('equipeAtendimento · montarLinhas', () => {
  it('Entrada primeiro, depois o catálogo, com o que está configurado', () => {
    const l = montarLinhas({ areas: ['Grupos', 'KIDS', 'Online'], equipe: EQUIPE });
    expect(l.map(x => x.area)).toEqual([ENTRADA, 'Grupos', 'KIDS', 'Online', 'Integração']);
    expect(l[0]).toMatchObject({ titular_id: C, configurada: true });
    expect(l[1]).toMatchObject({ titular_id: A, suplente_id: B, configurada: true });
    expect(l[2]).toMatchObject({ titular_id: null, suplente_id: null, configurada: false });
    expect(l[3]).toMatchObject({ configurada: false });
  });
  it('área configurada fora do catálogo continua aparecendo, marcada', () => {
    const l = montarLinhas({ areas: ['Grupos'], equipe: EQUIPE });
    const integ = l.find(x => x.area === 'Integração');
    expect(integ).toMatchObject({ suplente_id: C, fora_do_catalogo: true });
  });
  it('duplicata por acento/caixa no catálogo vira UMA linha', () => {
    const l = montarLinhas({ areas: ['Integração', 'integracao', 'Entrada'], equipe: [] });
    expect(l.map(x => x.area)).toEqual([ENTRADA, 'Integração']);
  });
});
