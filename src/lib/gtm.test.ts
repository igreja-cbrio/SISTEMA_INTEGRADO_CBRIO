// A trava de LGPD do dataLayer é o ponto que não pode regredir em silêncio:
// se um campo de PII passar, ele viaja pro GTM e de lá pra ferramenta de
// anúncio, e não tem como "despublicar". Por isso ela tem teste.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { carregarGtm, medirInscricaoConcluida, desfechoInscricaoGrupos } from './gtm';

type Janela = typeof window & { dataLayer?: Record<string, unknown>[] };

function eventos(): Record<string, unknown>[] {
  return ((window as Janela).dataLayer || []) as Record<string, unknown>[];
}

describe('gtm · dataLayer das portas de inscrição', () => {
  beforeEach(() => {
    (window as Janela).dataLayer = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('deixa passar só os campos da lista permitida', () => {
    medirInscricaoConcluida('grupos', { grupo_id: 'g1', categoria: 'Casais', pessoas: 2 });
    expect(eventos()[0]).toEqual({
      event: 'inscricao_concluida', porta: 'grupos',
      grupo_id: 'g1', categoria: 'Casais', pessoas: 2,
    });
  });

  it('DESCARTA dado pessoal, inclusive o do cônjuge', () => {
    medirInscricaoConcluida('grupos', {
      grupo_id: 'g1',
      nome: 'Fulano de Tal', cpf: '12345678901', email: 'a@b.com',
      telefone: '21999999999', data_nascimento: '1990-01-01',
      endereco: 'Rua X, 10', foto_url: 'https://…/f.jpg',
      conjuge_nome: 'Beltrana', conjuge_cpf: '98765432100',
    } as Record<string, unknown>);
    const ev = eventos()[0];
    expect(ev).toEqual({ event: 'inscricao_concluida', porta: 'grupos', grupo_id: 'g1' });
    // rede de segurança pra campo novo com outro nome: nada de PII no JSON.
    expect(JSON.stringify(ev)).not.toMatch(/Fulano|Beltrana|12345678901|98765432100|a@b\.com|21999999999/);
  });

  it('não manda chave com valor nulo (vira "undefined" no relatório)', () => {
    medirInscricaoConcluida('grupos', { grupo_id: 'g1', categoria: null });
    expect(eventos()[0]).not.toHaveProperty('categoria');
  });

  it('carrega o container uma vez só, mesmo chamando de novo', () => {
    const antes = document.getElementsByTagName('script').length;
    carregarGtm('GTM-TESTE01');
    carregarGtm('GTM-TESTE01');
    const tags = Array.from(document.getElementsByTagName('script'))
      .filter((s) => (s.src || '').includes('googletagmanager.com/gtm.js'));
    expect(tags).toHaveLength(1);
    expect(tags[0].src).toContain('id=GTM-TESTE01');
    expect(document.getElementsByTagName('script').length).toBe(antes + 1);
  });
});

// Estes formatos são os que `POST /public/grupos/inscrever` devolve de verdade
// (backend/routes/publicGrupos.js). Se o backend mudar, é aqui que quebra —
// antes de a conversão passar meses contando reenvio como inscrição nova.
describe('gtm · o que conta como conversão em grupos', () => {
  it('criou → 1 pessoa', () => {
    expect(desfechoInscricaoGrupos({ pedido_id: 'p1' })).toEqual({ resultado: 'criado', pessoas: 1 });
  });

  it('casal num POST só → 2 pessoas', () => {
    expect(desfechoInscricaoGrupos({ pedido_id: 'p1', conjuge: { pedido_id: 'p2' } }))
      .toEqual({ resultado: 'criado', pessoas: 2 });
  });

  it('cônjuge que já era membro não vira gente nova', () => {
    expect(desfechoInscricaoGrupos({ pedido_id: 'p1', conjuge: { pedido_id: null } }))
      .toEqual({ resultado: 'criado', pessoas: 1 });
  });

  it('reenvio de quem já é membro NÃO é conversão', () => {
    expect(desfechoInscricaoGrupos({ ja_membro: true, mensagem: 'já está no grupo' } as never)).toBeNull();
  });

  it('reenvio de quem já tinha pedido NÃO é conversão', () => {
    expect(desfechoInscricaoGrupos({ ja_pedido: true, mensagem: 'já recebemos' } as never)).toBeNull();
  });

  it('resposta do honeypot (bot) NÃO é conversão', () => {
    expect(desfechoInscricaoGrupos({ ok: true } as never)).toBeNull();
  });

  it('renovação conta à parte, sem inscrição nova', () => {
    expect(desfechoInscricaoGrupos({ ja_membro: true, renovado: true } as never))
      .toEqual({ resultado: 'renovado', pessoas: 0 });
  });

  it('resposta vazia não quebra', () => {
    expect(desfechoInscricaoGrupos(null)).toBeNull();
    expect(desfechoInscricaoGrupos(undefined)).toBeNull();
  });
});
