// ⚠️⚠️ QUAL DATA DE BATISMO A PESSOA PODE ESCOLHER.
//
// Pedido do Matheus (25/09/2026): *"preciso que na inscrição de batismo tenha
// como escolher o mês... isso deve refletir tanto no formulário público quanto
// no app dos membros."*
//
// ⚠️⚠️ ATÉ AQUI A DATA NÃO ERA UM DADO, ERA UMA CONTA (`fn_proximo_quarto_domingo`).
// Medido nas 32 cerimônias desde fev/2024: a fórmula acerta 31. A que falhou
// foi **dez/2024, antecipado para 15/12**. Com 3 meses abertos, alguém reserva
// em setembro uma data que a igreja ainda pode mover — e conta não se move.
import { describe, it, expect } from 'vitest';
import {
  DATAS_ABERTAS_PADRAO, dataIso, resolverDataBatismo, mensagemData,
} from '../../backend/utils/batismoData.js';

// As três datas reais abertas em 25/09/2026 (medidas em `batismo_eventos`).
const ABERTAS = ['2026-09-27', '2026-10-25', '2026-11-22'];

describe('a data escolhida', () => {
  it('vale quando está na janela aberta', () => {
    expect(resolverDataBatismo('2026-11-22', ABERTAS)).toEqual({ data: '2026-11-22', motivo: null });
  });

  it('a primeira data continua valendo (o caso de hoje)', () => {
    expect(resolverDataBatismo('2026-09-27', ABERTAS).data).toBe('2026-09-27');
  });

  // ⚠️⚠️ ESTE É O CASO QUE MANTÉM O APP EM CAMPO VIVO. O bundle distribuído não
  // sabe mandar data; se ausência fosse erro, o OTA trancaria a inscrição de
  // quem não atualizou — o mesmo portão que travou a frota em 06/08.
  it('SEM data cai na primeira aberta, não em erro', () => {
    expect(resolverDataBatismo(undefined, ABERTAS)).toEqual({ data: '2026-09-27', motivo: null });
    expect(resolverDataBatismo(null, ABERTAS).data).toBe('2026-09-27');
    expect(resolverDataBatismo('', ABERTAS).data).toBe('2026-09-27');
  });

  // ⚠️ Mas mandar LIXO é diferente de não mandar: é erro do cliente, e calar
  // sobre ele grava a pessoa numa data que ela não escolheu.
  it('lixo no campo é erro, não ausência', () => {
    expect(resolverDataBatismo('amanha', ABERTAS)).toEqual({ data: null, motivo: 'data_invalida' });
    expect(resolverDataBatismo('27/09/2026', ABERTAS).motivo).toBe('data_invalida');
  });

  it('data que existe no calendário mas não na janela é recusada', () => {
    expect(resolverDataBatismo('2026-12-27', ABERTAS))
      .toEqual({ data: null, motivo: 'data_fora_da_janela' });
  });

  // ⚠️ Aceitar a data sem conferir seria repetir o buraco de 11/08, quando o
  // POST aceitava horário que o catálogo não tinha e uma cerimônia terminou
  // com 12 pessoas num limite de 11.
  it('data do passado não passa só por ser ISO válida', () => {
    expect(resolverDataBatismo('2020-01-05', ABERTAS).motivo).toBe('data_fora_da_janela');
  });

  // ⚠️⚠️ FALHA FECHADA: sem lista, não devolve a escolhida nem inventa.
  it('sem datas abertas não grava nada', () => {
    expect(resolverDataBatismo('2026-11-22', [])).toEqual({ data: null, motivo: 'sem_datas_abertas' });
    expect(resolverDataBatismo(undefined, []).motivo).toBe('sem_datas_abertas');
    expect(resolverDataBatismo('2026-11-22', null as never).motivo).toBe('sem_datas_abertas');
  });
});

describe('a validação de data ISO', () => {
  it('aceita só YYYY-MM-DD real', () => {
    expect(dataIso('2026-11-22')).toBe('2026-11-22');
    expect(dataIso('2026-1-5')).toBeNull();
    expect(dataIso('22/11/2026')).toBeNull();
  });

  // ⚠️ 31/02 passa em qualquer regex e ESTOURA num cast de data. É o payload
  // que derrubaria o fan-out inteiro (voluntariado junto) se não fosse barrado.
  it('rejeita dia que não existe', () => {
    expect(dataIso('2026-02-31')).toBeNull();
    expect(dataIso('2026-13-01')).toBeNull();
    expect(dataIso('2026-04-31')).toBeNull();
  });

  it('aceita 29/02 em ano bissexto e recusa fora dele', () => {
    expect(dataIso('2028-02-29')).toBe('2028-02-29');
    expect(dataIso('2026-02-29')).toBeNull();
  });

  it('lista com datas tortas não contamina a janela', () => {
    expect(resolverDataBatismo('2026-11-22', ['lixo', '2026-11-22']).data).toBe('2026-11-22');
    expect(resolverDataBatismo('lixo', ['lixo', '2026-11-22']).motivo).toBe('data_invalida');
  });
});

describe('a frase que a pessoa lê', () => {
  it('cada motivo tem mensagem própria', () => {
    expect(mensagemData('sem_datas_abertas')).toContain('ainda não foram abertas');
    expect(mensagemData('data_fora_da_janela')).toContain('não está mais disponível');
    expect(mensagemData('data_invalida')).toContain('inválida');
    expect(mensagemData(null)).toBeNull();
  });
});

describe('o horizonte', () => {
  // 3 = o mês corrente e os dois seguintes. É o que o pedido descreve
  // ("um batismo do mês que vem") e o que foi semeado no banco.
  it('a janela padrão é de 3 datas', () => {
    expect(DATAS_ABERTAS_PADRAO).toBe(3);
  });
});
