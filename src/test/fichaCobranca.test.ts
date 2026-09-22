import { describe, it, expect } from 'vitest';
import {
  diaBRT, diasEntre, canaisDe, decidirCobranca, montarRodada, MAX_COBRANCAS, ESCADA_DIAS,
} from '../../backend/utils/fichaCobranca.js';

const AGORA = new Date('2026-09-21T15:00:00Z');
const PJ = { email: 'fulano@exemplo.com', telefone: '21999998888' };
const INCOMPLETA = { aplicavel: true, completa: false };

function cobrado(diasAtras: number[], base = PJ) {
  return {
    ...base,
    ficha_contratada_cobrancas: diasAtras.map((d) => ({
      em: new Date(AGORA.getTime() - d * 86400000).toISOString(), canal: 'email', rodada: 1,
    })),
  };
}

describe('diaBRT · o dia é o da IGREJA', () => {
  it('⚠️⚠️ às 21h BRT o dia UTC já virou — e o nosso não', () => {
    // 2026-09-21 23:30 BRT = 2026-09-22 02:30 UTC.
    expect(diaBRT(new Date('2026-09-22T02:30:00Z'))).toBe('2026-09-21');
  });

  it('data ilegível devolve null, nunca uma data inventada', () => {
    expect(diaBRT('xx')).toBeNull();
  });
});

describe('canaisDe · notificação no sistema + e-mail', () => {
  it('⚠️⚠️ quem tem CONTA recebe pela notificação do sistema', () => {
    // Medido em 22/09: 28 dos 32 PJ têm conta ativa. Não aumenta o alcance
    // (29 × 29), aumenta a chance de ser VISTO — o gargalo medido é a mensagem
    // não chegar aos olhos, não o formulário.
    expect(canaisDe({ profile_id: 'p1', email: 'a@b.com' })).toEqual(['sistema', 'email']);
  });

  it('⚠️ sem conta, só e-mail — e sem e-mail, só a conta', () => {
    expect(canaisDe({ email: 'a@b.com' })).toEqual(['email']);
    expect(canaisDe({ profile_id: 'p1' })).toEqual(['sistema']);
  });

  it('⚠️ sem conta e sem e-mail NÃO há canal (não é "não respondeu")', () => {
    expect(canaisDe({})).toEqual([]);
  });
});

describe('canaisDe · e-mail', () => {
  it('e-mail entra mesmo sem template de WhatsApp', () => {
    // O disparo irmão é WhatsApp-only e 40 de 46 têm e-mail — era o alcance
    // que estava sendo jogado fora.
    expect(canaisDe({ email: 'a@b.com', telefone: '21999998888' })).toEqual(['email']);
  });

  it('WhatsApp só entra COM template aprovado', () => {
    expect(canaisDe(PJ, { temTemplateWhatsapp: true })).toEqual(['email', 'whatsapp']);
  });

  it('⚠️ relay do "Entrar com Apple" NÃO é canal', () => {
    // Caixa técnica que a pessoa não lê: mandar ali a marcaria como cobrada
    // sem ela nunca ter visto.
    expect(canaisDe({ email: 'x@privaterelay.appleid.com' })).toEqual([]);
  });

  it('telefone inválido não vira canal', () => {
    expect(canaisDe({ telefone: '99999' }, { temTemplateWhatsapp: true })).toEqual([]);
  });

  it('telefone com 55 do país é aceito', () => {
    expect(canaisDe({ telefone: '5521999998888' }, { temTemplateWhatsapp: true })).toEqual(['whatsapp']);
  });
});

describe('decidirCobranca', () => {
  it('nunca cobrado + tem canal = primeira via', () => {
    const d = decidirCobranca(PJ, { agora: AGORA, estado: INCOMPLETA });
    expect(d).toMatchObject({ acao: 'enviar', rodada: 1, motivo: 'primeira_via' });
  });

  it('⚠️⚠️ quem já entregou NÃO é cobrado', () => {
    const d = decidirCobranca(PJ, { agora: AGORA, estado: { aplicavel: true, completa: true } });
    expect(d.acao).toBe('parar');
    expect(d.motivo).toBe('ja_entregou');
  });

  it('⚠️⚠️ CLT não é cobrado (e não é "pendência")', () => {
    const d = decidirCobranca(PJ, { agora: AGORA, estado: { aplicavel: false } });
    expect(d).toMatchObject({ acao: 'parar', motivo: 'nao_e_pj' });
  });

  it('⚠️⚠️ sem canal NUNCA devolve "enviar"', () => {
    // Envio que não envia ninguém não pode aparecer como sucesso (lei do censo).
    const d = decidirCobranca({ email: '', telefone: '' }, { agora: AGORA, estado: INCOMPLETA });
    expect(d).toMatchObject({ acao: 'parar', motivo: 'sem_canal' });
    expect(d.canais).toEqual([]);
  });

  it('cobrado ontem AGUARDA (o intervalo é de 3 dias)', () => {
    const d = decidirCobranca(cobrado([1]), { agora: AGORA, estado: INCOMPLETA });
    expect(d.acao).toBe('aguardar');
  });

  it('cobrado há 3 dias vira lembrete (rodada 2)', () => {
    const d = decidirCobranca(cobrado([3]), { agora: AGORA, estado: INCOMPLETA });
    expect(d).toMatchObject({ acao: 'enviar', rodada: 2, motivo: 'lembrete' });
  });

  it('⚠️ o 2º lembrete respeita o intervalo MAIOR da escada', () => {
    // Escada [3, 7]: depois da 2ª cobrança, espera 7 dias — não 3 de novo.
    expect(decidirCobranca(cobrado([10, 3]), { agora: AGORA, estado: INCOMPLETA }).acao).toBe('aguardar');
    expect(decidirCobranca(cobrado([14, 7]), { agora: AGORA, estado: INCOMPLETA }).acao).toBe('enviar');
    expect(ESCADA_DIAS).toEqual([3, 7]);
  });

  it('⚠️⚠️ a escada TERMINA — cobrança que não acaba vira perseguição', () => {
    const d = decidirCobranca(cobrado([30, 20, 10]), { agora: AGORA, estado: INCOMPLETA });
    expect(d).toMatchObject({ acao: 'parar', motivo: 'escada_esgotada' });
    expect(MAX_COBRANCAS).toBe(3);
  });

  it('⚠️ data de cobrança ilegível PARA — errar para o lado do spam é pior', () => {
    const f = { ...PJ, ficha_contratada_cobrancas: [{ em: 'nao-e-data', canal: 'email' }] };
    expect(decidirCobranca(f, { agora: AGORA, estado: INCOMPLETA })).toMatchObject({ acao: 'parar', motivo: 'data_ilegivel' });
  });
});

describe('montarRodada', () => {
  const estadoDe = (f: any) => (f.pronta ? { aplicavel: true, completa: true } : INCOMPLETA);

  it('⚠️ primeira via vem ANTES de lembrete', () => {
    const r = montarRodada([cobrado([5]), PJ], { agora: AGORA, estadoDe, teto: 10 });
    expect(r.enviar[0].rodada).toBe(1);
  });

  it('⚠️⚠️ teto respeitado E o que ficou de fora é DECLARADO', () => {
    // Sem teto, a função morre no meio e não registra o que já saiu — a
    // próxima rodada repete tudo (lei de 04/08).
    const lista = Array.from({ length: 7 }, (_, i) => ({ ...PJ, id: i }));
    const r = montarRodada(lista, { agora: AGORA, estadoDe, teto: 3 });
    expect(r.enviar).toHaveLength(3);
    expect(r.adiados).toBe(4);
  });

  it('o resumo separa os motivos de NÃO enviar', () => {
    const r = montarRodada(
      [PJ, { ...PJ, pronta: true }, { email: '', telefone: '' }, cobrado([1])],
      { agora: AGORA, estadoDe, teto: 10 },
    );
    expect(r.enviar).toHaveLength(1);
    expect(r.resumo).toMatchObject({ ja_entregou: 1, sem_canal: 1, aguardando: 1 });
  });

  it('lista vazia não quebra', () => {
    expect(montarRodada([], { agora: AGORA, estadoDe }).enviar).toEqual([]);
  });
});

describe('diasEntre', () => {
  it('conta dias inteiros', () => {
    expect(diasEntre(new Date('2026-09-21T00:00:00Z'), '2026-09-18T00:00:00Z')).toBe(3);
  });
  it('data ilegível devolve null', () => {
    expect(diasEntre(AGORA, 'xx')).toBeNull();
  });
});
