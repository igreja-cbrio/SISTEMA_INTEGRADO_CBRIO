import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useArrastoKanban } from '../pages/marketing/useArrastoKanban';

// ---------------------------------------------------------------------------
// Exercita o GESTO inteiro (pointerdown → move → up) numa árvore mínima com duas
// colunas. É o teste que faltava: o arrasto antigo era HTML5 DnD, que não roda em
// toque e que nenhum teste cobria — o defeito só aparecia na mão do Pedro.
//
// ⚠️ `document.elementFromPoint` NÃO faz layout no jsdom (devolve null sempre),
// então ele é substituído por um mapa x → coluna. O que está sob teste é a
// CADEIA (ligar os eventos, esconder o fantasma, decidir, chamar de volta), não
// a geometria do navegador.
// ---------------------------------------------------------------------------
const CARD = { id: 'card-1', estado: 'backlog' };

function Quadro({ onMover }: { onMover: (id: string, para: string | null) => void }) {
  const a = useArrastoKanban({
    onMover,
    habilitado: true,
    aceitaColuna: (c: string) => c !== 'triagem',
  });
  return (
    <div ref={a.containerRef}>
      <div data-coluna="backlog">
        <div data-testid="card" onPointerDown={e => a.aoPressionar(e, CARD)}>Card</div>
      </div>
      <div data-coluna="producao" />
      <div data-coluna="triagem" />
      {a.arrastando && <div ref={a.fantasmaRef} data-testid="fantasma">Movendo…</div>}
    </div>
  );
}

// Mapa da posição x → coluna que estaria embaixo do ponteiro.
const COLUNA_EM: Record<number, string> = { 50: 'backlog', 500: 'producao', 900: 'triagem' };

function pointer(tipo: string, x: number, y = 10, pointerId = 1) {
  const ev = new Event(tipo, { bubbles: true, cancelable: true }) as any;
  ev.pointerId = pointerId;
  ev.clientX = x;
  ev.clientY = y;
  ev.pointerType = 'touch';
  ev.button = 0;
  return ev;
}

describe('gesto de arrastar card no Kanban', () => {
  let onMover: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onMover = vi.fn();
    // @ts-expect-error jsdom não implementa
    document.elementFromPoint = (x: number) => {
      const key = Object.keys(COLUNA_EM).map(Number).find(k => Math.abs(k - x) < 40);
      return key === undefined ? null : document.querySelector(`[data-coluna="${COLUNA_EM[key]}"]`);
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it('arrastar até outra coluna MOVE o card', () => {
    render(<Quadro onMover={onMover} />);
    const card = screen.getByTestId('card');
    act(() => { card.dispatchEvent(pointer('pointerdown', 50)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 500)); });
    act(() => { window.dispatchEvent(pointer('pointerup', 500)); });
    expect(onMover).toHaveBeenCalledWith('card-1', 'producao');
  });

  // ⚠️ O card é clicável E arrastável: sem isto, o painel de detalhe pararia de
  // abrir — que é como um "conserto" do arrasto quebraria a tela toda.
  it('toque sem mover ABRE o card (para = null)', () => {
    render(<Quadro onMover={onMover} />);
    const card = screen.getByTestId('card');
    act(() => { card.dispatchEvent(pointer('pointerdown', 50)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 52)); }); // 2px = abaixo do limiar
    act(() => { window.dispatchEvent(pointer('pointerup', 52)); });
    expect(onMover).toHaveBeenCalledWith('card-1', null);
  });

  it('soltar na PRÓPRIA coluna não move nada', () => {
    render(<Quadro onMover={onMover} />);
    const card = screen.getByTestId('card');
    act(() => { card.dispatchEvent(pointer('pointerdown', 50)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 60)); });
    act(() => { window.dispatchEvent(pointer('pointerup', 60)); });
    expect(onMover).not.toHaveBeenCalled();
  });

  // A Triagem não é destino: sair dela é TRIAR (cria entregáveis), não mudar estado.
  it('a coluna Triagem NÃO aceita card', () => {
    render(<Quadro onMover={onMover} />);
    const card = screen.getByTestId('card');
    act(() => { card.dispatchEvent(pointer('pointerdown', 50)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 900)); });
    act(() => { window.dispatchEvent(pointer('pointerup', 900)); });
    expect(onMover).not.toHaveBeenCalled();
  });

  it('pointercancel (o sistema tomou o gesto) não move nada', () => {
    render(<Quadro onMover={onMover} />);
    const card = screen.getByTestId('card');
    act(() => { card.dispatchEvent(pointer('pointerdown', 50)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 500)); });
    act(() => { window.dispatchEvent(pointer('pointercancel', 500)); });
    act(() => { window.dispatchEvent(pointer('pointerup', 500)); });
    expect(onMover).not.toHaveBeenCalled();
  });

  // ⚠️ Um segundo dedo na tela não pode sequestrar o arrasto do primeiro.
  it('ignora eventos de OUTRO pointerId', () => {
    render(<Quadro onMover={onMover} />);
    const card = screen.getByTestId('card');
    act(() => { card.dispatchEvent(pointer('pointerdown', 50, 10, 1)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 500, 10, 99)); });
    act(() => { window.dispatchEvent(pointer('pointerup', 500, 10, 99)); });
    expect(onMover).not.toHaveBeenCalled();
  });

  it('o fantasma aparece só durante o arrasto', () => {
    render(<Quadro onMover={onMover} />);
    const card = screen.getByTestId('card');
    expect(screen.queryByTestId('fantasma')).toBeNull();
    act(() => { card.dispatchEvent(pointer('pointerdown', 50)); });
    act(() => { window.dispatchEvent(pointer('pointermove', 500)); });
    expect(screen.getByTestId('fantasma')).toBeTruthy();
    act(() => { window.dispatchEvent(pointer('pointerup', 500)); });
    expect(screen.queryByTestId('fantasma')).toBeNull();
  });
});
