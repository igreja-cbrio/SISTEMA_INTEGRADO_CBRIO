// Contrato do link PÚBLICO de convite que o app dos membros compartilha.
//
// ⚠️ O erro caro aqui é SILENCIOSO e chega em quem não é da igreja: o link vai
// pro WhatsApp de outra pessoa, e ninguém do lado de dentro descobre que ele
// está quebrado. Foi o que aconteceu com `/apresentacao-criancas`, que devolvia
// HTTP 200 pelo catch-all do SPA e não renderizava formulário nenhum.
import { describe, it, expect } from 'vitest';
import {
  basePublica, linkDaRota, portasCompartilhaveis, linkDoEvento,
  CHAVES_COMPARTILHAVEIS, BASE_PADRAO,
} from '../../backend/utils/linkInscricaoApp.js';
import { PORTAS_INSCRICAO } from '../../backend/services/inscricaoPortas.js';

describe('a base é constante e imune a ambiente', () => {
  // ⚠️⚠️ Este é o caso que a régua existe pra impedir. `FRONTEND_URL` está
  // setada em produção com valor encriptado, e o link de convite não pode
  // depender dela — nem de `PUBLIC_BASE_URL` local numa máquina de dev.
  it('nenhuma env muda o link compartilhado', () => {
    const antes = basePublica();
    const salvo = { ...process.env };
    try {
      process.env.FRONTEND_URL = 'http://localhost:8080';
      process.env.PUBLIC_BASE_URL = 'https://crmcbrio.vercel.app';
      expect(basePublica()).toBe(antes);
      expect(linkDoEvento('celebra')).toBe(`${BASE_PADRAO}/evento/celebra`);
      for (const p of portasCompartilhaveis()) expect(p.url.startsWith(BASE_PADRAO)).toBe(true);
    } finally {
      process.env = salvo;
    }
  });

  it('é o domínio público da igreja, em https', () => {
    expect(BASE_PADRAO).toBe('https://www.cbrio.org');
    expect(basePublica()).toMatch(/^https:\/\//);
    expect(basePublica().endsWith('/')).toBe(false);   // senão vira `//evento/x`
  });
});

describe('portas compartilháveis', () => {
  it('são as 5 da tela do app, nessa ordem', () => {
    expect(portasCompartilhaveis().map((p: any) => p.chave))
      .toEqual(['batismo', 'grupos', 'next', 'voluntariado', 'apresentacao']);
  });

  // ⚠️ A rota sai do REGISTRO CANÔNICO, não de string escrita aqui. Se alguém
  // mudar a rota pública de uma porta no catálogo, o link do app acompanha.
  it('a URL é a 1ª rota pública do catálogo', () => {
    const doCatalogo = new Map(PORTAS_INSCRICAO.map((p: any) => [p.chave, p.rotasPublicas[0]]));
    for (const p of portasCompartilhaveis()) {
      expect(p.url).toBe(`${BASE_PADRAO}${doCatalogo.get(p.chave)}`);
    }
  });

  it('toda chave declarada existe no catálogo', () => {
    const conhecidas = new Set(PORTAS_INSCRICAO.map((p: any) => p.chave));
    for (const c of CHAVES_COMPARTILHAVEIS) expect(conhecidas.has(c)).toBe(true);
  });

  // ⚠️ `eventos` tem rota `/evento/:slug` — link por EVENTO, não porta fixa; e
  // `grupos_lider` é recrutamento de liderança, não convite de membro. Se uma
  // das duas entrar aqui, o app passa a oferecer um link que não serve.
  it('eventos e líderes ficam FORA', () => {
    const chaves = portasCompartilhaveis().map((p: any) => p.chave);
    expect(chaves).not.toContain('eventos');
    expect(chaves).not.toContain('grupos_lider');
  });

  it('nenhuma URL tem placeholder de rota nem barra dupla', () => {
    for (const p of portasCompartilhaveis()) {
      // `:` só pode aparecer no esquema — `:slug` viraria link literal com
      // dois-pontos, que abre uma página de erro em quem recebeu.
      expect(p.url.slice('https:'.length)).not.toContain(':');
      expect(p.url.replace('https://', '')).not.toContain('//');
      expect(p.nome.length).toBeGreaterThan(0);
    }
  });
});

describe('linkDaRota · a guarda que barra rota de template', () => {
  // ⚠️⚠️ Testada DIRETO, não pelo resultado de `portasCompartilhaveis`: lá a
  // proteção é dupla (a chave `eventos` não está na lista E a rota tem `:`), e
  // cada metade escondia a ausência da outra — dois mutantes sobreviveram por
  // isso. Guarda que só se observa por efeito colateral não está testada.
  it('rota de template NUNCA vira link', () => {
    expect(linkDaRota('/evento/:slug')).toBeNull();
    expect(linkDaRota('/g/a/:token')).toBeNull();
    expect(linkDaRota('/tudo/*')).toBeNull();
  });

  it('rota vazia ou relativa devolve null, nunca link pela metade', () => {
    expect(linkDaRota('')).toBeNull();
    expect(linkDaRota(null)).toBeNull();
    expect(linkDaRota('inscricao-batismo')).toBeNull();   // sem a barra
  });

  it('rota simples vira link absoluto', () => {
    expect(linkDaRota('/inscricao-batismo')).toBe(`${BASE_PADRAO}/inscricao-batismo`);
  });

  // A defesa é dupla de propósito: se um dia `eventos` entrar na lista de
  // chaves por engano, a rota parametrizada dela ainda é barrada aqui.
  it('a lista de chaves e a guarda de rota protegem independentemente', () => {
    const evento = PORTAS_INSCRICAO.find((p: any) => p.chave === 'eventos');
    expect(linkDaRota(evento.rotasPublicas[0])).toBeNull();
  });
});

describe('link de evento', () => {
  it('monta a partir do slug', () => {
    expect(linkDoEvento('celebra')).toBe(`${BASE_PADRAO}/evento/celebra`);
    expect(linkDoEvento('  celebra  ')).toBe(`${BASE_PADRAO}/evento/celebra`);
  });

  // ⚠️ Sem slug devolve null pra a tela ESCONDER o botão. String vazia viraria
  // `/evento/`, um link que abre uma página de erro no aparelho de quem recebeu.
  it('sem slug devolve null, nunca link pela metade', () => {
    expect(linkDoEvento('')).toBeNull();
    expect(linkDoEvento(null)).toBeNull();
    expect(linkDoEvento(undefined)).toBeNull();
  });

  it('slug estranho é escapado em vez de vazar na URL', () => {
    expect(linkDoEvento('a b')).toBe(`${BASE_PADRAO}/evento/a%20b`);
  });
});
