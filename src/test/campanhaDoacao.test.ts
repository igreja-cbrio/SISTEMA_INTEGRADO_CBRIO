// Contrato da doação para campanha (app e site).
//
// ⚠️ O que estes testes protegem, em ordem de dano:
//   1. `metadata.campanha_id` — é a ÚNICA chave que `vw_camp_arrecadacao` casa.
//      Gravar só o nome é o que fazia a doação do site nunca aparecer na barra;
//   2. categoria `campanha` sem escolha NÃO virar oferta em silêncio (a pessoa
//      doou achando que era pra reforma do Kids e o dinheiro iria pro geral);
//   3. `campanha_id` fora da lista ofertável ser RECUSADO (campanha encerrada
//      entre a tela abrir e o toque em doar · id inventado por um cliente);
//   4. a janela reusar `estaNoAr` do núcleo — 2 réguas divergiriam e o app
//      aceitaria doação que a barra considera fora do ar.
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const reg = require('../../backend/utils/campanhaDoacao.js');
const {
  campanhasOfertaveis, paraOApp, validarEscolha, metadataDaDoacao, descricaoDaDoacao,
} = reg;

// Estado REAL de produção medido em 01/09/2026.
const KIDS = {
  id: 'd83174d6-7ce2-4d48-97f9-bdadfa405da9',
  nome: 'Reforma do Espaço Kids',
  status: 'ativa',
  publica: false,
  digito: '12',
  meta_centavos: 50000000,
  data_inicio: '2026-09-01',
  data_fim: '2026-10-31',
  data_lancamento: '2026-09-06',
};

describe('campanhaDoacao · quais campanhas podem receber', () => {
  it('⚠️⚠️ o caso REAL de hoje: ativa e a janela abriu em 01/09', () => {
    expect(campanhasOfertaveis([KIDS], '2026-09-01').map((c: any) => c.id)).toEqual([KIDS.id]);
  });

  it('⚠️⚠️ `publica = false` NÃO impede: o gatilho é `ativa` (decisão do Matheus)', () => {
    expect(campanhasOfertaveis([KIDS], '2026-09-10')).toHaveLength(1);
    expect(KIDS.publica).toBe(false); // e mesmo assim entra
  });

  it('antes da janela não recebe', () => {
    expect(campanhasOfertaveis([KIDS], '2026-08-31')).toEqual([]);
  });

  it('depois da janela não recebe', () => {
    expect(campanhasOfertaveis([KIDS], '2026-11-01')).toEqual([]);
  });

  it('rascunho e pausada não recebem, mesmo dentro da janela', () => {
    expect(campanhasOfertaveis([{ ...KIDS, status: 'rascunho' }], '2026-09-10')).toEqual([]);
    expect(campanhasOfertaveis([{ ...KIDS, status: 'pausada' }], '2026-09-10')).toEqual([]);
    expect(campanhasOfertaveis([{ ...KIDS, status: 'encerrada' }], '2026-09-10')).toEqual([]);
  });

  it('lista vazia ou ausente não estoura', () => {
    expect(campanhasOfertaveis([], '2026-09-10')).toEqual([]);
    expect(campanhasOfertaveis(null, '2026-09-10')).toEqual([]);
  });
});

describe('campanhaDoacao · o que o app recebe', () => {
  it('⚠️ NÃO devolve meta nem arrecadado (a tela de doar não é placar)', () => {
    const p = paraOApp(KIDS);
    expect(Object.keys(p).sort()).toEqual(['descricao_curta', 'id', 'nome']);
    expect(JSON.stringify(p)).not.toContain('50000000');
  });

  it('⚠️ nem o dígito: ele é régua de conciliação, não informação de quem doa pelo app', () => {
    expect(JSON.stringify(paraOApp(KIDS))).not.toContain('12');
  });

  it('descrição curta vazia vira null, nunca string vazia', () => {
    expect(paraOApp({ ...KIDS, descricao_curta: '   ' }).descricao_curta).toBeNull();
    expect(paraOApp(KIDS).descricao_curta).toBeNull();
  });
});

describe('campanhaDoacao · a escolha vale?', () => {
  const ofertaveis = [KIDS];

  it('dízimo e oferta passam sem campanha', () => {
    expect(validarEscolha({ categoria: 'dizimo', ofertaveis })).toEqual({
      ok: true, categoria: 'dizimo', campanha_id: null,
    });
    expect(validarEscolha({ categoria: 'oferta', ofertaveis }).ok).toBe(true);
  });

  it('⚠️ categoria que não é campanha ZERA o campanha_id mesmo que ele venha', () => {
    const r = validarEscolha({ categoria: 'dizimo', campanha_id: KIDS.id, ofertaveis });
    expect(r.campanha_id).toBeNull();
  });

  it('campanha com id válido passa e traz o nome (snapshot)', () => {
    const r = validarEscolha({ categoria: 'campanha', campanha_id: KIDS.id, ofertaveis });
    expect(r.ok).toBe(true);
    expect(r.campanha_id).toBe(KIDS.id);
    expect(r.campanha_nome).toBe('Reforma do Espaço Kids');
  });

  it('⚠️⚠️ categoria campanha SEM escolha é RECUSA, nunca vira oferta', () => {
    for (const v of [undefined, null, '', '   ']) {
      const r = validarEscolha({ categoria: 'campanha', campanha_id: v, ofertaveis });
      expect(r.ok).toBe(false);
      expect(r.motivo).toBe('campanha_nao_escolhida');
      expect(r.categoria).toBeUndefined();
    }
  });

  it('⚠️⚠️ id FORA da lista ofertável é RECUSA (campanha encerrou no meio)', () => {
    const r = validarEscolha({ categoria: 'campanha', campanha_id: KIDS.id, ofertaveis: [] });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('campanha_indisponivel');
  });

  it('⚠️ id inventado por um cliente é recusado', () => {
    const r = validarEscolha({
      categoria: 'campanha', campanha_id: '00000000-0000-0000-0000-000000000000', ofertaveis,
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('campanha_indisponivel');
  });

  it('categoria inválida é recusada', () => {
    for (const c of [undefined, 'retiro', 'CAMPANHA', 1]) {
      expect(validarEscolha({ categoria: c, ofertaveis }).motivo).toBe('categoria_invalida');
    }
  });
});

describe('campanhaDoacao · metadata da cobrança', () => {
  it('⚠️⚠️ grava `campanha_id` — a ÚNICA chave que a barrinha casa', () => {
    const m = metadataDaDoacao({
      categoria: 'campanha', campanha_id: KIDS.id, campanha_nome: KIDS.nome, canal: 'app',
    });
    expect(m.campanha_id).toBe(KIDS.id);
    expect(m.categoria).toBe('campanha');
    expect(m.canal).toBe('app');
  });

  it('⚠️ grava o NOME ao lado: snapshot do que a pessoa viu (renomear não apaga)', () => {
    const m = metadataDaDoacao({
      categoria: 'campanha', campanha_id: KIDS.id, campanha_nome: KIDS.nome, canal: 'web',
    });
    expect(m.campanha).toBe('Reforma do Espaço Kids');
  });

  it('dízimo grava as duas chaves como null (nunca ausentes)', () => {
    const m = metadataDaDoacao({ categoria: 'dizimo', canal: 'app' });
    expect(m).toHaveProperty('campanha_id', null);
    expect(m).toHaveProperty('campanha', null);
  });

  it('extra é preservado e NÃO sobrescreve as chaves da régua', () => {
    const m = metadataDaDoacao({
      categoria: 'dizimo', canal: 'app',
      extra: { nome_abreviado: 'M. T.', categoria: 'hack', campanha_id: 'hack' },
    });
    expect(m.nome_abreviado).toBe('M. T.');
    expect(m.categoria).toBe('dizimo');
    expect(m.campanha_id).toBeNull();
  });
});

describe('campanhaDoacao · descrição', () => {
  it('campanha leva o nome', () => {
    expect(descricaoDaDoacao({ categoria: 'campanha', campanha_nome: 'Reforma do Espaço Kids' }))
      .toBe('Campanha: Reforma do Espaço Kids');
  });
  it('dízimo e oferta têm texto próprio', () => {
    expect(descricaoDaDoacao({ categoria: 'dizimo' })).toBe('Dízimo');
    expect(descricaoDaDoacao({ categoria: 'oferta' })).toBe('Oferta');
  });
  it('campanha sem nome não escreve "null"', () => {
    expect(descricaoDaDoacao({ categoria: 'campanha' })).toBe('Campanha: CBRio');
  });
});

describe('campanhaDoacao · aceita_online', () => {
  const HOJE = '2026-09-10';
  it('⚠️⚠️ `aceita_online = false` NÃO é ofertável, mesmo ativa e no ar', () => {
    expect(campanhasOfertaveis([{ ...KIDS, aceita_online: false }], HOJE)).toEqual([]);
  });

  it('⚠️ ausente/nulo conta como TRUE (é o default da coluna)', () => {
    expect(campanhasOfertaveis([{ ...KIDS, aceita_online: undefined }], HOJE)).toHaveLength(1);
    expect(campanhasOfertaveis([{ ...KIDS, aceita_online: null }], HOJE)).toHaveLength(1);
  });

  it('true explícito passa (o caso real do Kids em 01/09)', () => {
    expect(campanhasOfertaveis([{ ...KIDS, aceita_online: true }], HOJE)).toHaveLength(1);
  });

  it('⚠️ e a escolha também é recusada quando a campanha não aceita online', () => {
    const r = validarEscolha({
      categoria: 'campanha', campanha_id: KIDS.id,
      ofertaveis: campanhasOfertaveis([{ ...KIDS, aceita_online: false }], HOJE),
    });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('campanha_indisponivel');
  });
});
