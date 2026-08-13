// Régua do CHECKOUT EXTERNO de cartão (e-Inscrição) · 2026-08-11.
//
// Ela decide DUAS coisas com consequência real: para qual endereço a pessoa é
// mandada com CPF e cartão na mão, e se o NOSSO checkout ainda oferece cartão.
// A segunda é a que evita a mesma inscrição ser paga em dois lugares.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const C = req('../../backend/utils/checkoutExterno.js');

const eventoPago = (extra: any = {}) => ({
  pagamento_ativo: true,
  pagamento_metodos: ['pix', 'cartao'],
  checkout_externo_url: 'https://www.e-inscricao.com/cbrio/retiro',
  ...extra,
});

describe('linkExternoValido', () => {
  it('aceita https e devolve a URL normalizada', () => {
    expect(C.linkExternoValido(' https://www.e-inscricao.com/x ')).toBe('https://www.e-inscricao.com/x');
  });

  it('⚠️ recusa http — a pessoa digita CARTÃO do outro lado', () => {
    expect(C.linkExternoValido('http://www.e-inscricao.com/x')).toBeNull();
  });

  it('⚠️⚠️ recusa javascript: e data: (o campo vira href/redirect)', () => {
    // Qualquer nível 3 do módulo edita este campo. Sem esta guarda, o formulário
    // do evento vira um injetor de script na página pública.
    expect(C.linkExternoValido('javascript:alert(1)')).toBeNull();
    expect(C.linkExternoValido('data:text/html,<script>x</script>')).toBeNull();
    expect(C.linkExternoValido('  JavaScript:alert(1)')).toBeNull();
  });

  it('⚠️ recusa credencial embutida (disfarça o host real de quem lê o link)', () => {
    expect(C.linkExternoValido('https://e-inscricao.com@evil.example/x')).toBeNull();
  });

  it('recusa vazio, lixo e host sem ponto', () => {
    expect(C.linkExternoValido('')).toBeNull();
    expect(C.linkExternoValido(null)).toBeNull();
    expect(C.linkExternoValido('e-inscricao.com/x')).toBeNull(); // sem esquema
    expect(C.linkExternoValido('https://localhost/x')).toBeNull();
  });
});

describe('metodosProprios · a invariante do cartão', () => {
  it('⚠️⚠️ com checkout externo, "cartao" SAI do que a nossa cobrança oferece', () => {
    // É este array que vira `metodos_ofertados` e que o servidor confere em
    // `decidirForma`. Esconder o botão só na tela deixaria o app e um link
    // antigo de /pagamento/<token> cobrando cartão por dentro.
    expect(C.metodosProprios(['pix', 'cartao', 'boleto'], eventoPago()))
      .toEqual(['pix', 'boleto']);
  });

  it('sem link configurado, nada muda (o fluxo de hoje continua idêntico)', () => {
    expect(C.metodosProprios(['pix', 'cartao'], eventoPago({ checkout_externo_url: null })))
      .toEqual(['pix', 'cartao']);
  });

  it('⚠️ link num evento GRATUITO é resíduo de configuração e é ignorado', () => {
    // O campo some da tela quando o pagamento é desligado; o valor guardado não
    // pode mandar gente pra um checkout de um evento que não cobra nada.
    expect(C.metodosProprios(['pix', 'cartao'], eventoPago({ pagamento_ativo: false })))
      .toEqual(['pix', 'cartao']);
  });

  it('⚠️ link INVÁLIDO não desliga o cartão — senão um typo tiraria a forma de pagar', () => {
    expect(C.metodosProprios(['pix', 'cartao'], eventoPago({ checkout_externo_url: 'ftp://x.com' })))
      .toEqual(['pix', 'cartao']);
  });
});

describe('opcoesPagamento · o que a página pergunta antes do formulário', () => {
  it('sem checkout externo: NÃO pergunta nada (o formulário abre direto)', () => {
    const o = C.opcoesPagamento(eventoPago({ checkout_externo_url: null }));
    expect(o.escolher).toBe(false);
  });

  it('Pix aqui + cartão fora: pergunta, e o Pix segue sendo nosso', () => {
    const o = C.opcoesPagamento(eventoPago());
    expect(o).toMatchObject({ escolher: true, proprios: ['pix'], externo_nome: 'e-Inscrição' });
    expect(o.externo_url).toBe('https://www.e-inscricao.com/cbrio/retiro');
  });

  it('⚠️ evento SÓ cartão terceirizado: não pergunta — todo mundo vai pra fora', () => {
    // Pergunta de uma alternativa só é atrito puro, e a resposta seria sempre a
    // mesma. Quem trata isso é a tela (botão único) e o POST (409 com o link).
    const o = C.opcoesPagamento(eventoPago({ pagamento_metodos: ['cartao'] }));
    expect(o.escolher).toBe(false);
    expect(o.proprios).toEqual([]);
    expect(o.externo_url).toBeTruthy();
  });

  it('nome da plataforma: usa o do evento, cai no padrão quando vazio', () => {
    expect(C.nomeExterno('  Sympla ')).toBe('Sympla');
    expect(C.nomeExterno('')).toBe('e-Inscrição');
    expect(C.nomeExterno(null)).toBe('e-Inscrição');
  });
});
