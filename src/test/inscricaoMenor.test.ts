// Contrato do bloco do RESPONSÁVEL (menor de idade) na inscrição · 2026-08-17.
//
// Origem: as perguntas do retiro 2027 (PDF do Arthur) pedem, "caso for menor de
// idade", nome, CPF, parentesco, celular e e-mail do responsável, mais a
// autorização dele pra a pessoa se batizar.
//
// ⚠️⚠️ O que este arquivo protege:
//   1. **QUEM é menor** decide se um consentimento exigido por lei (LGPD art. 14
//      §1º) é colhido. Errar pra menos é coletar dado de adolescente sem
//      autorização de responsável.
//   2. **O dia é BRT.** Em UTC, das 21h do Rio em diante o dia já virou, e quem
//      completa 18 amanhã apareceria como maior hoje à noite.
//   3. **Tela e servidor têm que concordar** — senão o bloco não aparece e o
//      servidor recusa, ou aparece e não é exigido.
import { describe, it, expect } from 'vitest';
import * as back from '../../backend/utils/inscricaoMenor.js';
import * as front from '../lib/inscricaoMenor.js';

const LADOS: Array<[string, any]> = [['backend', back], ['front', front]];
function nosDoisLados(fn: (m: any, nome: string) => void) {
  for (const [nome, mod] of LADOS) fn(mod, nome);
}

describe('idadeEmAnos · anos COMPLETOS', () => {
  it('conta o aniversário no dia, não no mês', () => {
    nosDoisLados((m, lado) => {
      expect(m.idadeEmAnos('2008-08-17', '2026-08-16'), lado).toBe(17); // véspera
      expect(m.idadeEmAnos('2008-08-17', '2026-08-17'), lado).toBe(18); // no dia
      expect(m.idadeEmAnos('2008-08-17', '2026-08-18'), lado).toBe(18);
    });
  });

  it('29/02 faz aniversário em 01/03 nos anos não bissextos', () => {
    nosDoisLados((m, lado) => {
      expect(m.idadeEmAnos('2008-02-29', '2026-02-28'), lado).toBe(17);
      expect(m.idadeEmAnos('2008-02-29', '2026-03-01'), lado).toBe(18);
    });
  });

  it('devolve null pra data ilegível ou no futuro', () => {
    nosDoisLados((m, lado) => {
      expect(m.idadeEmAnos('', '2026-08-17'), lado).toBe(null);
      expect(m.idadeEmAnos('17/08/2008', '2026-08-17'), lado).toBe(null);
      expect(m.idadeEmAnos('2027-01-01', '2026-08-17'), lado).toBe(null);
    });
  });
});

describe('hojeBRT · o dia é o do RIO', () => {
  it('01:00 UTC ainda é o dia ANTERIOR no Rio', () => {
    // ⚠️ Mutante que este caso mata: usar `toISOString()` do agora sem o -3h.
    // Às 22h de 17/08 no Rio (01:00 UTC de 18/08), quem completa 18 anos no dia
    // 18 seria tratado como MAIOR — e o bloco do responsável não apareceria.
    nosDoisLados((m, lado) => {
      expect(m.hojeBRT(Date.parse('2026-08-18T01:00:00Z')), lado).toBe('2026-08-17');
      expect(m.hojeBRT(Date.parse('2026-08-18T03:00:00Z')), lado).toBe('2026-08-18');
    });
  });

  it('o "hoje" é INJETÁVEL — o teste não depende do relógio da máquina', () => {
    nosDoisLados((m, lado) => {
      expect(typeof m.hojeBRT(), lado).toBe('string');
      expect(m.hojeBRT(Date.parse('2027-02-16T12:00:00Z')), lado).toBe('2027-02-16');
    });
  });
});

describe('ehMenorDeIdade', () => {
  it('menos de 18 é menor; 18 exatos não é', () => {
    nosDoisLados((m, lado) => {
      expect(m.ehMenorDeIdade('2009-03-01', '2026-08-17'), lado).toBe(true);
      expect(m.ehMenorDeIdade('2008-08-18', '2026-08-17'), lado).toBe(true);  // faz 18 amanhã
      expect(m.ehMenorDeIdade('2008-08-17', '2026-08-17'), lado).toBe(false); // fez 18 hoje
      expect(m.ehMenorDeIdade('1990-01-01', '2026-08-17'), lado).toBe(false);
    });
  });

  it('nascimento ilegível NÃO é tratado como menor', () => {
    // ⚠️ Caminho inalcançável pela porta: `validarCamposPadrao` exige nascimento
    // válido e recusa antes. O caso fixa o comportamento pra a decisão ser
    // consciente se algum dia uma porta deixar de exigir nascimento.
    nosDoisLados((m, lado) => {
      expect(m.ehMenorDeIdade('', '2026-08-17'), lado).toBe(false);
      expect(m.ehMenorDeIdade(null as any, '2026-08-17'), lado).toBe(false);
    });
  });
});

describe('exigeResponsavel · evento + pessoa', () => {
  it('precisa das DUAS coisas', () => {
    nosDoisLados((m, lado) => {
      const pede = { exige_dados_menor: true };
      const naoPede = { exige_dados_menor: false };
      expect(m.exigeResponsavel(pede, '2010-01-01', '2026-08-17'), lado).toBe(true);
      expect(m.exigeResponsavel(pede, '1990-01-01', '2026-08-17'), lado).toBe(false);
      expect(m.exigeResponsavel(naoPede, '2010-01-01', '2026-08-17'), lado).toBe(false);
      expect(m.exigeResponsavel(null, '2010-01-01', '2026-08-17'), lado).toBe(false);
    });
  });

  it('evento SEM a coluna (migration não aplicada) não pede nada', () => {
    // `anexarConfigMenor` devolve false quando a coluna não existe — o formulário
    // segue funcionando como antes, sem bloco nenhum.
    nosDoisLados((m, lado) => {
      expect(m.exigeResponsavel({}, '2010-01-01', '2026-08-17'), lado).toBe(false);
    });
  });

  it('o corte é o do RETIRO: quem faz 18 ANTES da viagem ainda preenche', () => {
    // Decisão declarada: a referência é a data da INSCRIÇÃO (é a coleta que a
    // LGPD governa), e "menor hoje" cobre "menor no evento". Aqui a pessoa tem
    // 17 na inscrição e 18 no retiro (16/02/2027) — e preenche o bloco.
    nosDoisLados((m, lado) => {
      expect(m.exigeResponsavel({ exige_dados_menor: true }, '2009-01-10', '2026-08-17'), lado).toBe(true);
    });
  });
});

// ── validarResponsavel · só no backend (é ele que decide) ──────────────────
const BASE = {
  responsavel_nome: 'Ana Paula Souza',
  responsavel_cpf: '111.444.777-35',   // CPF sintético com DV válido
  responsavel_parentesco: 'Mãe',
  responsavel_telefone: '(21) 99999-8888',
  responsavel_email: 'ANA@Exemplo.com',
};

describe('validarResponsavel', () => {
  it('aceita o bloco completo e NORMALIZA', () => {
    const { erros, valores } = back.validarResponsavel(BASE);
    expect(erros).toEqual({});
    expect(valores.responsavelCpf).toBe('11144477735');       // digits-only
    expect(valores.responsavelTelefone).toBe('21999998888');
    expect(valores.responsavelEmail).toBe('ana@exemplo.com'); // minúsculo
  });

  it('exige DV do CPF do responsável', () => {
    // ⚠️ Mesma régua do CPF da pessoa: sem DV, erro de digitação vira identidade
    // errada, e é por CPF que o matcher canônico liga gente.
    expect(back.validarResponsavel({ ...BASE, responsavel_cpf: '12345678900' }).erros)
      .toHaveProperty('responsavel_cpf');
    expect(back.validarResponsavel({ ...BASE, responsavel_cpf: '11111111111' }).erros)
      .toHaveProperty('responsavel_cpf');
  });

  it('recusa nome abreviado do responsável', () => {
    expect(back.validarResponsavel({ ...BASE, responsavel_nome: 'Ana P. Souza' }).erros)
      .toHaveProperty('responsavel_nome');
    expect(back.validarResponsavel({ ...BASE, responsavel_nome: 'Ana' }).erros)
      .toHaveProperty('responsavel_nome');
  });

  it('tira o 55 do telefone só quando sobra telefone completo', () => {
    // DDD 55 é Santa Maria/RS e precisa passar intacto.
    expect(back.validarResponsavel({ ...BASE, responsavel_telefone: '5521999998888' }).valores.responsavelTelefone)
      .toBe('21999998888');
    expect(back.validarResponsavel({ ...BASE, responsavel_telefone: '55999998888' }).valores.responsavelTelefone)
      .toBe('55999998888');
  });

  it('todos os campos em falta viram erro NOMEADO (a tela aponta o input)', () => {
    const { erros } = back.validarResponsavel({});
    expect(Object.keys(erros).sort()).toEqual([
      'responsavel_cpf', 'responsavel_email', 'responsavel_nome',
      'responsavel_parentesco', 'responsavel_telefone',
    ]);
  });

  it('autorização de batismo é TRI-ESTADO e nunca chuta', () => {
    // ⚠️ Ausente ≠ negado ≠ autorizado. A pergunta é sobre INTERESSE em batizar;
    // quem não pretende não precisa responder — e NULL nunca é "autorizado".
    expect(back.validarResponsavel(BASE).valores.responsavelAutorizaBatismo).toBe(null);
    expect(back.validarResponsavel({ ...BASE, responsavel_autoriza_batismo: 'Sim' }).valores.responsavelAutorizaBatismo).toBe(true);
    expect(back.validarResponsavel({ ...BASE, responsavel_autoriza_batismo: 'Não' }).valores.responsavelAutorizaBatismo).toBe(false);
    expect(back.validarResponsavel({ ...BASE, responsavel_autoriza_batismo: true }).valores.responsavelAutorizaBatismo).toBe(true);
    expect(back.validarResponsavel({ ...BASE, responsavel_autoriza_batismo: false }).valores.responsavelAutorizaBatismo).toBe(false);
    // Texto solto NÃO vira autorização — vira erro.
    expect(back.validarResponsavel({ ...BASE, responsavel_autoriza_batismo: 'talvez' }).erros)
      .toHaveProperty('responsavel_autoriza_batismo');
  });

  it('e-mail inválido é recusado', () => {
    expect(back.validarResponsavel({ ...BASE, responsavel_email: 'ana@' }).erros)
      .toHaveProperty('responsavel_email');
  });
});

describe('catálogo de parentesco', () => {
  it('tem escape "Outro" — a lista não pode excluir arranjo familiar real', () => {
    nosDoisLados((m, lado) => {
      expect(m.PARENTESCOS, lado).toContain('Outro');
      expect(m.PARENTESCOS, lado).toContain('Mãe');
      expect(m.PARENTESCOS, lado).toContain('Responsável legal');
    });
  });

  it('backend e front oferecem a MESMA lista', () => {
    expect(front.PARENTESCOS).toEqual(back.PARENTESCOS);
    expect(front.MAIORIDADE).toEqual(back.MAIORIDADE);
  });
});
