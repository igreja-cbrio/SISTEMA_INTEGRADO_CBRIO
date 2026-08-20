import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

/**
 * ⚠️ `vi.mock` não alcança este serviço: ele é CommonJS e DESESTRUTURA
 * `{ supabase }` no topo, então a referência é capturada no require. O padrão da
 * casa (registrado no CLAUDE.md a partir do núcleo de pagamentos) é trocar o
 * `module.exports` de `utils/supabase` ANTES de exigir o serviço.
 */
const require_ = createRequire(import.meta.url);

const BASE = 'https://x.supabase.co/storage/v1/object/public';

// Storage falsificado: registra o que foi pedido e devolve o que o teste mandar.
let pedidos: string[][] = [];
let prazos: number[] = [];
let resposta: { data: any; error: any } = { data: [], error: null };

const supabaseFake = {
  storage: {
    from(bucket: string) {
      return {
        async createSignedUrls(paths: string[], expiraEm: number) {
          expect(bucket).toBe('log-arquivos');
          pedidos.push(paths);
          prazos.push(expiraEm);
          return resposta;
        },
      };
    },
  },
};

const modSupabase = require_('../../backend/utils/supabase.js');
modSupabase.supabase = supabaseFake;

const {
  assinarLinhas,
  assinarAnexosDeObjetos,
  VALIDADE_SEGUNDOS,
} = require_('../../backend/services/anexosLogArquivos.js');

/** Resposta de sucesso do Storage para os caminhos pedidos. */
const assinaTudo = (paths: string[]) => ({
  data: paths.map((p) => ({ path: p, signedUrl: `https://assinado/${p}?token=abc`, error: null })),
  error: null,
});

beforeEach(() => { pedidos = []; prazos = []; resposta = { data: [], error: null }; });

describe('validade da URL assinada', () => {
  it('⚠️⚠️ é CURTA (no máximo 1h) — link vazado não pode virar acesso permanente', () => {
    // Fechar o bucket existe para que a URL não seja eterna. Uma validade longa
    // recria o problema com outro nome: o link de um documento fiscal circula
    // em print e encaminhamento. Este caso nasceu de um mutante que trocou 1h
    // por 1 ano e passou com 12 verdes.
    expect(VALIDADE_SEGUNDOS).toBeLessThanOrEqual(60 * 60);
    expect(VALIDADE_SEGUNDOS).toBeGreaterThan(0);
  });

  it('o prazo REALMENTE chega ao Storage', async () => {
    resposta = assinaTudo(['a.pdf']);
    await assinarLinhas([{ storage_path: 'a.pdf' }], ['storage_path']);
    expect(prazos[0]).toBe(VALIDADE_SEGUNDOS);
    expect(prazos[0]).toBeLessThanOrEqual(60 * 60);
  });
});

describe('assinarLinhas · campo de string', () => {
  it('troca caminho cru por URL assinada', async () => {
    resposta = assinaTudo(['notas-fiscais/CHAVE/danfe.pdf']);
    const [linha] = await assinarLinhas(
      [{ id: 1, storage_path: 'notas-fiscais/CHAVE/danfe.pdf' }], ['storage_path']);
    expect(linha.storage_path).toContain('https://assinado/');
  });

  it('⚠️ aceita URL PÚBLICA do histórico — é o que dispensa migrar dado', async () => {
    resposta = assinaTudo(['notas-fiscais/antiga.pdf']);
    const [linha] = await assinarLinhas(
      [{ id: 1, storage_path: `${BASE}/log-arquivos/notas-fiscais/antiga.pdf` }], ['storage_path']);
    expect(pedidos[0]).toEqual(['notas-fiscais/antiga.pdf']);
    expect(linha.storage_path).toContain('https://assinado/');
  });

  it('⚠️ NÃO toca link de terceiro nem de outro bucket', async () => {
    const linhas = [
      { id: 1, storage_path: 'https://cbrio.sharepoint.com/doc.pdf' },
      { id: 2, storage_path: `${BASE}/rh-fotos/documentos/a.pdf` },
    ];
    const saida = await assinarLinhas(linhas, ['storage_path']);
    expect(pedidos).toHaveLength(0);           // nada foi pedido ao Storage
    expect(saida[0].storage_path).toBe(linhas[0].storage_path);
    expect(saida[1].storage_path).toBe(linhas[1].storage_path);
  });

  it('assina em LOTE, sem repetir caminho', async () => {
    resposta = assinaTudo(['a.pdf', 'b.pdf']);
    await assinarLinhas(
      [{ storage_path: 'a.pdf' }, { storage_path: 'b.pdf' }, { storage_path: 'a.pdf' }],
      ['storage_path']);
    expect(pedidos).toHaveLength(1);            // uma chamada para a página toda
    expect(pedidos[0].sort()).toEqual(['a.pdf', 'b.pdf']);
  });

  it('⚠️⚠️ falha do Storage devolve as linhas ORIGINAIS, nunca linha sem anexo', async () => {
    // "esta nota não tem PDF" é afirmação diferente de "não consegui gerar o
    // link", e a primeira faz quem concilia decidir sem ver o documento.
    resposta = { data: null, error: { message: 'boom' } };
    const [linha] = await assinarLinhas([{ storage_path: 'x.pdf' }], ['storage_path']);
    expect(linha.storage_path).toBe('x.pdf');
  });

  it('⚠️ arquivo apagado (item com erro) mantém o valor original', async () => {
    resposta = { data: [{ path: 'sumiu.pdf', signedUrl: null, error: 'not found' }], error: null };
    const [linha] = await assinarLinhas([{ storage_path: 'sumiu.pdf' }], ['storage_path']);
    expect(linha.storage_path).toBe('sumiu.pdf');
  });

  it('não muta a linha que veio do banco', async () => {
    resposta = assinaTudo(['a.pdf']);
    const original = { storage_path: 'a.pdf' };
    const [saida] = await assinarLinhas([original], ['storage_path']);
    expect(original.storage_path).toBe('a.pdf');
    expect(saida.storage_path).not.toBe('a.pdf');
  });

  it('lista vazia não chama o Storage', async () => {
    expect(await assinarLinhas([], ['storage_path'])).toEqual([]);
    expect(pedidos).toHaveLength(0);
  });
});

describe('assinarAnexosDeObjetos · fin_transacoes.anexos_url', () => {
  it('assina o `url` dentro de cada objeto, preservando os outros campos', async () => {
    resposta = assinaTudo(['fin-comprovantes/1.pdf']);
    const [linha] = await assinarAnexosDeObjetos(
      [{ id: 't1', anexos_url: [{ url: 'fin-comprovantes/1.pdf', nome: 'recibo.pdf', tipo: 'application/pdf' }] }],
      'anexos_url');
    expect(linha.anexos_url[0].url).toContain('https://assinado/');
    expect(linha.anexos_url[0].nome).toBe('recibo.pdf');
    expect(linha.anexos_url[0].tipo).toBe('application/pdf');
  });

  it('anexo de terceiro no meio da lista passa intacto', async () => {
    resposta = assinaTudo(['nosso.pdf']);
    const [linha] = await assinarAnexosDeObjetos(
      [{ anexos_url: [
        { url: 'nosso.pdf' },
        { url: 'https://banco.com.br/comprovante.pdf' },
      ] }],
      'anexos_url');
    expect(linha.anexos_url[0].url).toContain('https://assinado/');
    expect(linha.anexos_url[1].url).toBe('https://banco.com.br/comprovante.pdf');
  });

  it('não muta o objeto que veio do banco', async () => {
    // ⚠️ Este caso existe porque um mutante SOBREVIVEU sem ele (20/08): a
    // asserção de não-mutação só cobria `assinarLinhas`, e trocar o `map` desta
    // função por um `for` que reatribui `anexo.url` passava com 11 verdes.
    // A mesma linha pode ser reusada noutro ponto da resposta, e assinar duas
    // vezes produziria URL de URL.
    resposta = assinaTudo(['a.pdf']);
    const anexo = { url: 'a.pdf', nome: 'r.pdf' };
    const linha = { id: 1, anexos_url: [anexo] };
    const [saida] = await assinarAnexosDeObjetos([linha], 'anexos_url');
    expect(anexo.url).toBe('a.pdf');                       // objeto interno intacto
    expect(linha.anexos_url[0].url).toBe('a.pdf');         // array intacto
    expect(saida.anexos_url[0].url).toContain('https://assinado/');
  });

  it('campo ausente ou não-array não quebra', async () => {
    const saida = await assinarAnexosDeObjetos(
      [{ id: 1 }, { id: 2, anexos_url: null }, { id: 3, anexos_url: 'nao-e-array' }],
      'anexos_url');
    expect(saida).toHaveLength(3);
    expect(pedidos).toHaveLength(0);
  });
});
