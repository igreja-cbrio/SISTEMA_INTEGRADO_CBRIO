// Contrato de desativar/reativar membro · 2026-08-21.
//
// ⚠️⚠️ O QUE ESTE ARQUIVO PROTEGE: `status` é a coluna que TODO o sistema lê
// (14 arquivos do backend + as views de NSM/KPI filtram `membro_ativo`), então
// esta régua decide quem sai das contagens da igreja. Dois erros aqui são
// caros e silenciosos:
//   · desativar mexendo em `deleted_at` — a pessoa some da base e o matcher
//     canônico deixa de reencontrá-la (quem volta nasce duplicado);
//   · reativar assumindo `membro_ativo` — promoveria a membro quem era
//     visitante, ou seja o sistema decidindo membresia.
import { describe, it, expect } from 'vitest';
import {
  STATUS_INATIVO,
  MOTIVO_MAX,
  limparMotivo,
  decidirDesativacao,
  decidirReativacao,
} from '../../backend/utils/desativarMembro.js';

const AGORA = '2026-08-21T22:00:00.000Z';
const USER = '11111111-1111-1111-1111-111111111111';

describe('decidirDesativacao', () => {
  it('⚠️ mexe em `status` e NUNCA em deleted_at/active — é a invariante', () => {
    const r = decidirDesativacao({ status: 'membro_ativo' }, { agora: AGORA });
    expect(r.ok).toBe(true);
    expect(r.patch.status).toBe('inativo');
    expect(r.patch).not.toHaveProperty('deleted_at');
    expect(r.patch).not.toHaveProperty('active');
  });

  it('⚠️ guarda o status ANTERIOR — é o que impede promover visitante ao reativar', () => {
    expect(decidirDesativacao({ status: 'visitante' }, {}).patch.inativado_status_anterior).toBe('visitante');
    expect(decidirDesativacao({ status: 'membro_ativo' }, {}).patch.inativado_status_anterior).toBe('membro_ativo');
  });

  it('o motivo é OPCIONAL e vazio vira null, nunca string vazia', () => {
    for (const m of [undefined, null, '', '   ', '\n\t ']) {
      const r = decidirDesativacao({ status: 'membro_ativo' }, { motivo: m as never });
      expect(r.ok).toBe(true);
      expect(r.patch.inativado_motivo).toBeNull();
    }
  });

  it('apara e colapsa espaço do motivo', () => {
    const r = decidirDesativacao({ status: 'membro_ativo' }, { motivo: '  mudou   de   cidade \n' });
    expect(r.patch.inativado_motivo).toBe('mudou de cidade');
  });

  it('⚠️ corta o motivo no teto — texto longo não pode estourar o update', () => {
    const r = decidirDesativacao({ status: 'membro_ativo' }, { motivo: 'x'.repeat(900) });
    expect(r.patch.inativado_motivo).toHaveLength(MOTIVO_MAX);
    expect(MOTIVO_MAX).toBe(500);
  });

  it('grava quem desativou, e sem autor fica null (nunca inventa)', () => {
    expect(decidirDesativacao({ status: 'membro_ativo' }, { porUsuario: USER }).patch.inativado_por).toBe(USER);
    expect(decidirDesativacao({ status: 'membro_ativo' }, {}).patch.inativado_por).toBeNull();
  });

  it('carimba o instante recebido', () => {
    expect(decidirDesativacao({ status: 'membro_ativo' }, { agora: AGORA }).patch.inativado_em).toBe(AGORA);
  });

  it('⚠️ recusa quem já está inativo — clicar duas vezes não pode reescrever o motivo', () => {
    const r = decidirDesativacao({ status: STATUS_INATIVO, inativado_motivo: 'mudou de cidade' }, { motivo: 'outro' });
    expect(r).toEqual({ ok: false, codigo: 'ja_inativo' });
  });

  it('recusa linha apagada e linha inexistente', () => {
    expect(decidirDesativacao({ status: 'membro_ativo', deleted_at: AGORA }, {}).codigo).toBe('apagado');
    expect(decidirDesativacao(null as never, {}).codigo).toBe('nao_encontrado');
    expect(decidirDesativacao(undefined as never, {}).codigo).toBe('nao_encontrado');
  });
});

describe('decidirReativacao', () => {
  it('⚠️ volta para o status ANTERIOR, não para membro_ativo', () => {
    const r = decidirReativacao({ status: STATUS_INATIVO, inativado_status_anterior: 'visitante' }, {});
    expect(r.ok).toBe(true);
    expect(r.patch.status).toBe('visitante');
    expect(r.statusDestino).toBe('visitante');
  });

  it('⚠️ sem anterior gravado, RECUSA em vez de adivinhar', () => {
    for (const a of [null, undefined, '', '   ']) {
      const r = decidirReativacao({ status: STATUS_INATIVO, inativado_status_anterior: a as never }, {});
      expect(r).toEqual({ ok: false, codigo: 'sem_status_anterior' });
    }
  });

  it('sem anterior, o chamador pode ESCOLHER o destino', () => {
    const r = decidirReativacao({ status: STATUS_INATIVO }, { statusEscolhido: 'membro_ativo' });
    expect(r.ok).toBe(true);
    expect(r.patch.status).toBe('membro_ativo');
  });

  it('⚠️ o anterior gravado VENCE a escolha do chamador — o fato manda sobre o palpite', () => {
    const r = decidirReativacao(
      { status: STATUS_INATIVO, inativado_status_anterior: 'visitante' },
      { statusEscolhido: 'membro_ativo' },
    );
    expect(r.patch.status).toBe('visitante');
  });

  it('reativar para "inativo" é recusado — seria no-op com cara de ação', () => {
    expect(decidirReativacao({ status: STATUS_INATIVO }, { statusEscolhido: STATUS_INATIVO }).codigo)
      .toBe('destino_invalido');
    expect(decidirReativacao({ status: STATUS_INATIVO, inativado_status_anterior: STATUS_INATIVO }, {}).codigo)
      .toBe('destino_invalido');
  });

  it('⚠️ NÃO limpa os campos de inativação — o motivo é o que o pedido queria guardar', () => {
    const r = decidirReativacao({ status: STATUS_INATIVO, inativado_status_anterior: 'membro_ativo' }, {});
    expect(Object.keys(r.patch)).toEqual(['status']);
  });

  it('recusa quem não está inativo, linha apagada e inexistente', () => {
    expect(decidirReativacao({ status: 'membro_ativo' }, {}).codigo).toBe('nao_esta_inativo');
    expect(decidirReativacao({ status: STATUS_INATIVO, deleted_at: AGORA }, {}).codigo).toBe('apagado');
    expect(decidirReativacao(null as never, {}).codigo).toBe('nao_encontrado');
  });
});

describe('limparMotivo', () => {
  it('nunca devolve string vazia', () => {
    for (const v of [null, undefined, '', ' ', '\n']) expect(limparMotivo(v as never)).toBeNull();
    expect(limparMotivo('  saiu  ')).toBe('saiu');
  });
});
