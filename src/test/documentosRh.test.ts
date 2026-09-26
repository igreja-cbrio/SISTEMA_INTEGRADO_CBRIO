import { describe, it, expect } from 'vitest';
import {
  DOCS_CLT, DOCS_PJ, conjuntoDe, entregue, faltando, foraDoCatalogo, tipoEhExtensao,
} from '../lib/documentosRh';

describe('conjuntoDe', () => {
  it('PJ e PJ+ usam o conjunto PJ', () => {
    expect(conjuntoDe('PJ')).toBe(DOCS_PJ);
    expect(conjuntoDe('PJ+')).toBe(DOCS_PJ);
    expect(conjuntoDe('pj')).toBe(DOCS_PJ);
  });

  it('CLT, PREBENDA e vazio usam o conjunto CLT', () => {
    expect(conjuntoDe('CLT')).toBe(DOCS_CLT);
    expect(conjuntoDe('PREBENDA')).toBe(DOCS_CLT);
    expect(conjuntoDe(null)).toBe(DOCS_CLT);
  });
});

describe('entregue · casa por tipo EXATO', () => {
  it('tipo igual conta', () => {
    expect(entregue([{ tipo: 'cnpj' }], 'cnpj')).toBe(true);
    expect(entregue([{ tipo: 'CNPJ' }], 'cnpj')).toBe(true); // caixa não importa
  });

  it('⚠️⚠️ NÃO casa por substring — "rg" não pode casar dentro de "encargos"', () => {
    // O código antigo fazia `t.includes(req.tipo)`: um documento errado pintava
    // o checklist de verde, que é pior que o vermelho honesto.
    expect(entregue([{ tipo: 'encargos' }], 'rg')).toBe(false);
    expect(entregue([{ tipo: 'rg_antigo' }], 'rg')).toBe(false);
  });

  it('⚠️⚠️ tipo vindo da EXTENSÃO não conta como documento entregue', () => {
    // É o bug inteiro: todo PDF virava `tipo='contrato'` e todo JPEG `tipo='jpg'`.
    expect(entregue([{ tipo: 'pdf' }], 'cnpj')).toBe(false);
    expect(entregue([{ tipo: 'jpg' }], 'rg')).toBe(false);
  });

  it('lista vazia, nula e tipo vazio', () => {
    expect(entregue([], 'cnpj')).toBe(false);
    expect(entregue(null, 'cnpj')).toBe(false);
    expect(entregue([{ tipo: 'cnpj' }], '')).toBe(false);
  });
});

describe('faltando', () => {
  it('sem documento nenhum, falta o conjunto inteiro', () => {
    expect(faltando([], 'PJ')).toHaveLength(DOCS_PJ.length);
  });

  it('⚠️ o PDF gravado como "contrato" pelo bug antigo satisfaz só CONTRATO', () => {
    // Era exatamente isto que fazia o checklist parecer meio cheio e nunca
    // fechar: o Cartão CNPJ em PDF virava "contrato".
    const f = faltando([{ tipo: 'contrato' }], 'PJ');
    expect(f.map((d) => d.tipo)).not.toContain('contrato');
    expect(f.map((d) => d.tipo)).toContain('cnpj');
  });

  it('checklist completo devolve lista vazia', () => {
    const todos = DOCS_PJ.map((d) => ({ tipo: d.tipo }));
    expect(faltando(todos, 'PJ')).toEqual([]);
  });

  it('⚠️ PJ pede os anexos do Anexo II', () => {
    const tipos = DOCS_PJ.map((d) => d.tipo);
    expect(tipos).toContain('cnpj');
    expect(tipos).toContain('contrato_social');
    expect(tipos).toContain('comprovante_bancario');
  });

  it('⚠️⚠️ comprovante de ENDEREÇO não é pedido do PJ (cortado, 21/09)', () => {
    // Redundante com o cartão CNPJ e normalmente em nome de terceiro — importaria
    // um titular sem base legal (LGPD art. 6º III + art. 9º).
    expect(DOCS_PJ.map((d) => d.tipo)).not.toContain('comprovante_residencia');
    // ...mas para CLT continua sendo obrigatório.
    expect(DOCS_CLT.map((d) => d.tipo)).toContain('comprovante_residencia');
  });
});

describe('foraDoCatalogo · o passivo aparece, não some', () => {
  it('⚠️⚠️ arquivo com tipo de extensão é DECLARADO', () => {
    // Esconder faria a pessoa reenviar o que já está lá — e reenvio é o que
    // ninguém faz.
    const fora = foraDoCatalogo([{ tipo: 'jpg' }, { tipo: 'cnpj' }], 'PJ');
    expect(fora).toHaveLength(1);
    expect(fora[0].tipo).toBe('jpg');
  });

  it('documento do catálogo não entra no passivo', () => {
    expect(foraDoCatalogo(DOCS_PJ.map((d) => ({ tipo: d.tipo })), 'PJ')).toEqual([]);
  });

  it('⚠️ o catálogo é o DO CONTRATO: CTPS é válida no CLT e passivo no PJ', () => {
    expect(foraDoCatalogo([{ tipo: 'ctps' }], 'CLT')).toEqual([]);
    expect(foraDoCatalogo([{ tipo: 'ctps' }], 'PJ')).toHaveLength(1);
  });
});

describe('tipoEhExtensao · a assinatura do bug antigo', () => {
  it('reconhece as extensões que o upload gravava', () => {
    for (const e of ['pdf', 'jpg', 'JPEG', 'png', 'docx', 'xlsx']) {
      expect(tipoEhExtensao(e)).toBe(true);
    }
  });

  it('tipo de verdade não é extensão', () => {
    expect(tipoEhExtensao('cnpj')).toBe(false);
    expect(tipoEhExtensao('contrato_social')).toBe(false);
    expect(tipoEhExtensao(null)).toBe(false);
  });
});
