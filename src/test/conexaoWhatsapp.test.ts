// Contrato do card "Conexão" da Comunicação (F4 · 09/09/2026). No `npm test` (gate).
import { describe, it, expect } from 'vitest';
import {
  SILENCIO_INBOUND_H, SYNC_TEMPLATES_H, horasDesde, avaliarConexao, textoAlerta,
} from '../../backend/utils/conexaoWhatsapp';

const AGORA = Date.parse('2026-09-09T15:00:00Z');
const h = (n: number) => new Date(AGORA - n * 3_600_000).toISOString();
const saudavel = {
  envPhoneId: '123456789', wabaId: '987', numeros: [], webhookLigado: true, modo: 'menu',
  ultimoInboundEm: h(2), ultimoOutboundEm: h(1), ultimoSyncTemplatesEm: h(0.5),
  templatesAprovados: 29, templatesTotal: 31, agoraMs: AGORA,
};

describe('conexaoWhatsapp · horasDesde', () => {
  it('arredonda a 1 decimal, nunca negativo, null para nada/ilegível', () => {
    expect(horasDesde(h(2), AGORA)).toBe(2);
    expect(horasDesde(h(1.25), AGORA)).toBe(1.3);
    expect(horasDesde(h(-5), AGORA)).toBe(0); // instante no futuro (relógio adiantado) não vira negativo
    expect(horasDesde(null, AGORA)).toBeNull();
    expect(horasDesde('ontem', AGORA)).toBeNull();
  });
});

describe('conexaoWhatsapp · avaliarConexao', () => {
  it('conexão saudável: número da env em uso, webhook ligado, sem alerta, saúde ok', () => {
    const r = avaliarConexao(saudavel);
    expect(r.numero).toEqual({ phone_number_id: '123456789', origem: 'env', waba_id: '987' });
    expect(r.webhook).toBe('ligado');
    expect(r.quem_responde).toBe('menu');
    expect(r.sinais).toEqual({ inbound_h: 2, outbound_h: 1, sync_templates_h: 0.5, templates_aprovados: 29, templates_total: 31 });
    expect(r.alertas).toEqual([]);
    expect(r.saude).toBe('ok');
  });
  it('o número em uso é SEMPRE o da env — cadastro só conta como cadastro', () => {
    const r = avaliarConexao({ ...saudavel, numeros: [{ id: 'a', phone_number_id: '111', is_default: true, ativo: true }] });
    expect(r.numero.phone_number_id).toBe('123456789');
    expect(r.cadastrados).toBe(1);
    expect(r.alertas).toEqual([]);
  });
  it('sem env: sem_numero e saúde em atenção', () => {
    const r = avaliarConexao({ ...saudavel, envPhoneId: null });
    expect(r.numero).toEqual({ phone_number_id: null, origem: null, waba_id: '987' });
    expect(r.alertas).toContain('sem_numero');
    expect(r.saude).toBe('atencao');
  });
  it('webhook desligado é alerta e CALA o alerta de silêncio (um explica o outro)', () => {
    const r = avaliarConexao({ ...saudavel, webhookLigado: false, ultimoInboundEm: null });
    expect(r.webhook).toBe('desligado');
    expect(r.alertas).toEqual(['webhook_desligado']);
    expect(r.saude).toBe('atencao');
  });
  it('silêncio de entrada: acima de 72h (ou nunca) alerta; abaixo não', () => {
    // ⚠️ Cortes ABSOLUTOS, não relativos à constante: um teste que só usa
    // `SILENCIO_INBOUND_H + 1` sobrevive a alguém trocar 72 por 720 (mutante M3
    // sobreviveu à 1ª rodada exatamente assim — a lição do membrosPagina.test.ts).
    // 72h = 3 dias: 216 conversas em 90 dias medidas em 08/09 → silêncio de 3
    // dias no número da igreja é webhook quebrado, não a igreja calada.
    expect(SILENCIO_INBOUND_H).toBe(72);
    expect(SYNC_TEMPLATES_H).toBe(3);
    expect(avaliarConexao({ ...saudavel, ultimoInboundEm: h(73) }).alertas).toEqual(['sem_inbound_recente']);
    expect(avaliarConexao({ ...saudavel, ultimoInboundEm: null }).alertas).toEqual(['sem_inbound_recente']);
    expect(avaliarConexao({ ...saudavel, ultimoInboundEm: h(71) }).alertas).toEqual([]);
  });
  it('sync de templates: o cron é horário — mais de 3h (ou nunca) alerta; não pinta a saúde', () => {
    const r = avaliarConexao({ ...saudavel, ultimoSyncTemplatesEm: h(SYNC_TEMPLATES_H + 0.5) });
    expect(r.alertas).toEqual(['templates_sem_sync']);
    expect(r.saude).toBe('ok');
    expect(avaliarConexao({ ...saudavel, ultimoSyncTemplatesEm: null }).alertas).toEqual(['templates_sem_sync']);
    expect(avaliarConexao({ ...saudavel, ultimoSyncTemplatesEm: h(2.9) }).alertas).toEqual([]);
  });
  it('catálogo vazio × nenhum aprovado são alertas diferentes', () => {
    expect(avaliarConexao({ ...saudavel, templatesAprovados: 0, templatesTotal: 0 }).alertas).toEqual(['catalogo_vazio']);
    expect(avaliarConexao({ ...saudavel, templatesAprovados: 0, templatesTotal: 5 }).alertas).toEqual(['sem_template_aprovado']);
  });
  it('dois números padrão ATIVOS é smell de dado (âmbar leve, saúde ok); inativo não conta', () => {
    const dois = [{ id: 'a', is_default: true, ativo: true }, { id: 'b', is_default: true, ativo: true }];
    const r = avaliarConexao({ ...saudavel, numeros: dois });
    expect(r.alertas).toEqual(['dois_numeros_padrao']);
    expect(r.saude).toBe('ok');
    const umInativo = [{ id: 'a', is_default: true, ativo: true }, { id: 'b', is_default: true, ativo: false }];
    expect(avaliarConexao({ ...saudavel, numeros: umInativo }).alertas).toEqual([]);
  });
  it('modo desconhecido cai em "ninguem" (fail-closed), nunca vaza cru', () => {
    expect(avaliarConexao({ ...saudavel, modo: 'xpto' }).quem_responde).toBe('ninguem');
    expect(avaliarConexao({ ...saudavel, modo: 'ia' }).quem_responde).toBe('ia');
  });
  it('todo alerta tem frase em português', () => {
    for (const c of ['sem_numero', 'webhook_desligado', 'sem_inbound_recente', 'templates_sem_sync', 'catalogo_vazio', 'sem_template_aprovado', 'dois_numeros_padrao']) {
      expect(textoAlerta(c), c).not.toBe(c);
    }
  });
});
