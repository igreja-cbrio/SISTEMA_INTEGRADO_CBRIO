import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import JornadaTimeline from '../components/jornada/JornadaTimeline';

afterEach(cleanup);

const data = {
  tempo: {
    marcos: [], engajaram: 1, contato_feito: 2,
    mediana_ate_engajar: 20, engajaram_com_data_confiavel: 1,
  },
  itens: [
    {
      id: 'antiga', nome: 'Pessoa com contato recente', data_culto: '2026-01-10',
      dias_desde_conversao: 120, dias_parado: 1, total_marcos: 1,
      total_engajamento: 0, dias_ate_engajar: null,
      marcos: { contato: { alcancado: true, dias: 119, aproximada: false } },
    },
    {
      id: 'nova', nome: 'Pessoa recém-chegada', data_culto: '2026-05-01',
      dias_desde_conversao: 9, dias_parado: 9, total_marcos: 0,
      total_engajamento: 0, dias_ate_engajar: null, marcos: {},
    },
    {
      id: 'engajada', nome: 'Pessoa com engajamento', data_culto: '2026-01-10',
      dias_desde_conversao: 120, dias_parado: 100, total_marcos: 1,
      total_engajamento: 1, dias_ate_engajar: 20,
      marcos: { grupo: { alcancado: true, dias: 20, aproximada: false } },
    },
  ],
};

describe('JornadaTimeline · separa contato de engajamento', () => {
  it('contato recente não reinicia o prazo de quem ainda não engajou', () => {
    render(<JornadaTimeline data={data} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('Pessoa com contato recente')).toBeInTheDocument();
    expect(screen.queryByText('Pessoa recém-chegada')).not.toBeInTheDocument();
    expect(screen.queryByText('Pessoa com engajamento')).not.toBeInTheDocument();
  });

  it('explica que os agregados cobrem o período e permite limpar o filtro', () => {
    render(<JornadaTimeline data={data} />);
    expect(screen.getByText(/Os filtros abaixo alteram apenas a lista/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByText('Pessoa recém-chegada')).toBeInTheDocument();
    expect(screen.getByText('Pessoa com engajamento')).toBeInTheDocument();
  });
});
