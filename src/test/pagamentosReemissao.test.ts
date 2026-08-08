import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// Cobre a regra que faltava em `cobrancas.criarCobranca`: cobrança TERMINAL sem
// dinheiro dentro (`expirada`/`cancelada`/`falhou`) não pode ser devolvida como
// se ainda servisse — esses estados são ABSORVENTES, então a pessoa ficava com
// uma cobrança impagável na mão e sem nenhum caminho de pagamento (medido na
// re-inscrição de CBR-2026-000141: a inscrição voltava a `recebida`, ocupando
// vaga, e a tela ainda dizia "a vaga voltou para a fila").
//
// O banco é falsificado aqui de propósito: o que está sob teste é a DECISÃO
// (reaproveitar × retomar × reemitir), não o PostgREST.

// ── Supabase de mentira ───────────────────────────────────────────────────
// Só o suficiente pro que `cobrancas.js` usa: select com eq/is/like/order/limit,
// insert com UNIQUE de `referencia`, e update por id.
const store: { rows: any[] } = { rows: [] };
let seq = 0;

class Builder {
  filtros: Array<(r: any) => boolean> = [];
  modo: 'select' | 'insert' | 'update' = 'select';
  payload: any = null;
  ordem: { col: string; asc: boolean } | null = null;
  max: number | null = null;

  select() { return this; }
  eq(c: string, v: any) { this.filtros.push((r) => r[c] === v); return this; }
  neq(c: string, v: any) { this.filtros.push((r) => r[c] !== v); return this; }
  is(c: string, v: any) { this.filtros.push((r) => (r[c] ?? null) === v); return this; }
  in(c: string, arr: any[]) { this.filtros.push((r) => arr.includes(r[c])); return this; }
  not(c: string, _op: string, v: any) { this.filtros.push((r) => (r[c] ?? null) !== v); return this; }
  like(c: string, padrao: string) {
    const rx = new RegExp(`^${padrao.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`);
    this.filtros.push((r) => rx.test(String(r[c] ?? '')));
    return this;
  }
  order(col: string, opts: any = {}) { this.ordem = { col, asc: opts.ascending !== false }; return this; }
  limit(n: number) { this.max = n; return this; }
  insert(obj: any) { this.modo = 'insert'; this.payload = obj; return this; }
  update(obj: any) { this.modo = 'update'; this.payload = obj; return this; }

  private casa() {
    let rows = store.rows.filter((r) => this.filtros.every((f) => f(r)));
    if (this.ordem) {
      const { col, asc } = this.ordem;
      rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    if (this.max != null) rows = rows.slice(0, this.max);
    return rows;
  }

  private executar(): { data: any; error: any } {
    if (this.modo === 'insert') {
      const ref = this.payload.referencia ?? null;
      if (ref && store.rows.some((r) => r.referencia === ref)) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } };
      }
      seq += 1;
      const linha = {
        id: `cob-${seq}`,
        public_token: `tok-${seq}`,
        valor_pago_centavos: 0,
        provider_cobranca_id: null,
        created_at: new Date(2026, 0, seq).toISOString(),
        deleted_at: null,
        ...this.payload,
      };
      store.rows.push(linha);
      return { data: linha, error: null };
    }
    if (this.modo === 'update') {
      const alvo = this.casa();
      alvo.forEach((r) => Object.assign(r, this.payload));
      return { data: alvo[0] ?? null, error: null };
    }
    return { data: this.casa(), error: null };
  }

  then(res: any, rej?: any) {
    const r = this.executar();
    return Promise.resolve(this.modo === 'select' ? r : { data: r.data, error: r.error }).then(res, rej);
  }
  async maybeSingle() { const r = this.executar(); return { data: (r.data as any[])?.[0] ?? null, error: r.error }; }
  async single() {
    const r = this.executar();
    const d = Array.isArray(r.data) ? r.data[0] : r.data;
    return { data: d ?? null, error: r.error };
  }
}

// ⚠️ `require` de verdade, não `vi.mock`: `cobrancas.js` é CommonJS e
// DESESTRUTURA o cliente no topo (`const { supabase } = require(...)`), então a
// troca precisa acontecer no module.exports ANTES de ele ser carregado — coisa
// que o mock do Vitest (que trabalha no grafo do Vite) não alcança daqui.
const req = createRequire(import.meta.url);
req('../../backend/utils/supabase.js').supabase = { from: () => new Builder() };

const cobrancas = req('../../backend/services/pagamentos/cobrancas.js');
const providers = req('../../backend/services/pagamentos/providers/index.js');
const { STATUS } = req('../../backend/services/pagamentos/tipos.js');

const REF = 'inscricao:11111111-1111-1111-1111-111111111111';

function semear(over: any = {}) {
  seq += 1;
  const linha = {
    id: `seed-${seq}`,
    public_token: `seed-tok-${seq}`,
    origem_tipo: 'inscricao',
    origem_id: '11111111-1111-1111-1111-111111111111',
    referencia: REF,
    valor_centavos: 50000,
    valor_pago_centavos: 0,
    provider: 'manual',
    provider_cobranca_id: 'PSP-ANTIGA',
    status: STATUS.EXPIRADA,
    metadata: {},
    created_at: new Date(2026, 0, seq).toISOString(),
    deleted_at: null,
    ...over,
  };
  store.rows.push(linha);
  return linha;
}

const pedido = {
  origem_tipo: 'inscricao',
  origem_id: '11111111-1111-1111-1111-111111111111',
  referencia: REF,
  valor_centavos: 50000,
  provider: 'manual',
  descricao: 'Inscrição · RETIRO',
};

describe('pagamentos · reemissão de cobrança terminal', () => {
  beforeEach(() => { store.rows = []; seq = 0; });
  afterEach(() => { vi.restoreAllMocks(); });

  for (const terminal of [STATUS.EXPIRADA, STATUS.CANCELADA, STATUS.FALHOU]) {
    it(`\`${terminal}\` sem dinheiro é REEMITIDA, não devolvida`, async () => {
      const antiga = semear({ status: terminal });

      const r = await cobrancas.criarCobranca(pedido);

      // O que o bug fazia: devolver a antiga. Terminal é absorvente — quem
      // recebesse essa cobrança de volta não teria como pagar por caminho nenhum.
      expect(r.cobranca.id).not.toBe(antiga.id);
      expect(r.reemitida).toBe(true);
      expect(r.anterior_id).toBe(antiga.id);
      expect([STATUS.CRIADA, STATUS.AGUARDANDO]).toContain(r.cobranca.status);

      // Referência VERSIONADA: `inscricao:<id>` é UNIQUE e é ela que impede
      // pagar duas vezes — a nova não pode reusá-la.
      expect(r.cobranca.referencia).not.toBe(REF);
      expect(r.cobranca.referencia.startsWith(`${REF}:`)).toBe(true);

      // A antiga fica intacta (é o registro de que a 1ª tentativa morreu).
      expect(store.rows.find((x) => x.id === antiga.id).status).toBe(terminal);
      expect(r.cobranca.metadata.reemitida_de).toBe(antiga.id);
    });
  }

  it('cobrança ABERTA segue sendo reaproveitada (nada de cobrança nova)', async () => {
    const viva = semear({ status: STATUS.AGUARDANDO });
    const r = await cobrancas.criarCobranca(pedido);
    expect(r.cobranca.id).toBe(viva.id);
    expect(r.reaproveitada).toBe(true);
    expect(r.reemitida).toBeUndefined();
    expect(store.rows).toHaveLength(1);
  });

  it('terminal COM dinheiro dentro NUNCA é reemitida', async () => {
    // `estornado` zera a soma (liquidação − estorno = 0) mas o dinheiro ENTROU e
    // voltou por decisão de alguém. Reemitir sozinho aqui viraria cobrar de novo.
    const paga = semear({ status: STATUS.ESTORNADO, valor_pago_centavos: 0 });
    const r = await cobrancas.criarCobranca(pedido);
    expect(r.cobranca.id).toBe(paga.id);
    expect(r.reemitida).toBeUndefined();
    expect(store.rows).toHaveLength(1);
  });

  it('pago_parcial (aberta, com dinheiro) é devolvida como está', async () => {
    const parcial = semear({ status: STATUS.PAGO_PARCIAL, valor_pago_centavos: 10000 });
    const r = await cobrancas.criarCobranca(pedido);
    expect(r.cobranca.id).toBe(parcial.id);
    expect(store.rows).toHaveLength(1);
  });

  it('reemissão ANTERIOR ainda viva vence — não nasce uma terceira cobrança', async () => {
    // O 2º reenvio do formulário: `porReferencia` só enxerga a base morta, então
    // sem olhar a família cada reenvio emitiria outra cobrança pagável.
    semear({ status: STATUS.EXPIRADA });
    semear({
      id: 'reemitida-1', referencia: `${REF}:r1700000000000`,
      status: STATUS.AGUARDANDO, provider_cobranca_id: 'PSP-NOVA',
    });

    const r = await cobrancas.criarCobranca(pedido);

    expect(r.cobranca.id).toBe('reemitida-1');
    expect(r.reaproveitada).toBe(true);
    expect(store.rows).toHaveLength(2);
  });

  it('cobrança da BOLSA já paga vence a base expirada', async () => {
    semear({ status: STATUS.CANCELADA });
    semear({
      id: 'bolsa-1', referencia: `${REF}:bolsa:1700000000000`,
      status: STATUS.PAGO, valor_pago_centavos: 20000,
    });

    const r = await cobrancas.criarCobranca(pedido);

    expect(r.cobranca.id).toBe('bolsa-1');
    expect(store.rows).toHaveLength(2);
  });

  it('a anterior é cancelada NO PROVEDOR antes de reemitir', async () => {
    // Terminal aqui não é terminal lá: o QR do Pix e o boleto podem seguir
    // pagáveis no PSP, e duas cobranças vivas pela mesma inscrição é o estrago
    // que a UNIQUE de referência existe pra evitar.
    const adapter = providers.obter('manual');
    const spy = vi.spyOn(adapter, 'cancelarCobranca').mockResolvedValue({} as any);
    const antiga = semear({ status: STATUS.EXPIRADA, provider_cobranca_id: 'PSP-ANTIGA' });

    await cobrancas.criarCobranca(pedido);

    expect(spy).toHaveBeenCalledTimes(1);
    // O argumento chega como `unknown` (o mock foi tipado com `as any`).
    // Nomear o formato aqui é melhor que espalhar `any` pelo teste.
    expect((spy.mock.calls[0][0] as { id: string }).id).toBe(antiga.id);
  });

  it('falha ao cancelar no provedor NÃO impede a reemissão', async () => {
    // Cobrança que o PSP mantém aberta e a gente fechou é conciliável; ficar sem
    // caminho de pagamento não é.
    const adapter = providers.obter('manual');
    vi.spyOn(adapter, 'cancelarCobranca').mockRejectedValue(new Error('PSP fora do ar'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    semear({ status: STATUS.EXPIRADA });

    const r = await cobrancas.criarCobranca(pedido);
    expect(r.reemitida).toBe(true);
  });

  it('cobrança meio-criada continua sendo RETOMADA, não reemitida', async () => {
    // Linha existe, chamada ao PSP falhou: status `criada` e sem
    // provider_cobranca_id. Aqui o certo é chamar o PSP de novo sobre a MESMA
    // linha — reemitir deixaria lixo.
    const meia = semear({ status: STATUS.CRIADA, provider_cobranca_id: null });
    const r = await cobrancas.criarCobranca(pedido);
    expect(r.cobranca.id).toBe(meia.id);
    expect(r.retomada).toBe(true);
    expect(store.rows).toHaveLength(1);
  });

  it('sem cobrança anterior, cria normalmente com a referência original', async () => {
    const r = await cobrancas.criarCobranca(pedido);
    expect(r.reaproveitada).toBe(false);
    expect(r.cobranca.referencia).toBe(REF);
  });
});

describe('pagamentos · podeReemitir (régua pura)', () => {
  it('só os 3 terminais sem dinheiro', () => {
    for (const s of [STATUS.EXPIRADA, STATUS.CANCELADA, STATUS.FALHOU]) {
      expect(cobrancas.podeReemitir({ status: s, valor_pago_centavos: 0 })).toBe(true);
      // Um centavo dentro já basta pra proibir: reemitir seria cobrar de novo.
      expect(cobrancas.podeReemitir({ status: s, valor_pago_centavos: 1 })).toBe(false);
    }
    for (const s of [STATUS.CRIADA, STATUS.AGUARDANDO, STATUS.PAGO, STATUS.PAGO_PARCIAL,
      STATUS.ESTORNADO, STATUS.ESTORNADO_PARCIAL, STATUS.CHARGEBACK]) {
      expect(cobrancas.podeReemitir({ status: s, valor_pago_centavos: 0 })).toBe(false);
    }
    expect(cobrancas.podeReemitir(null)).toBe(false);
  });
});
