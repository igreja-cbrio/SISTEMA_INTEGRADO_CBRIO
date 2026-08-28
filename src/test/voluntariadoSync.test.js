import test from 'node:test';
import assert from 'node:assert/strict';
import integrity from '../../backend/utils/volSyncIntegrity.js';

test('só permite reconciliar quando o roster do Planning Center está completo', () => {
  assert.deepEqual(integrity.decidirReconciliacao({
    tiposComFalha: 0,
    pessoasCompletas: true,
  }), { podeReconciliar: true, motivo: null });
});

test('não arquiva perfis quando qualquer tipo de serviço falha', () => {
  assert.deepEqual(integrity.decidirReconciliacao({
    tiposComFalha: 1,
    pessoasCompletas: true,
  }), { podeReconciliar: false, motivo: 'tipos_de_servico_com_falha' });
});

test('não arquiva perfis quando a lista completa de pessoas falha', () => {
  assert.deepEqual(integrity.decidirReconciliacao({
    tiposComFalha: 0,
    pessoasCompletas: false,
  }), { podeReconciliar: false, motivo: 'pessoas_do_services_incompletas' });
});
