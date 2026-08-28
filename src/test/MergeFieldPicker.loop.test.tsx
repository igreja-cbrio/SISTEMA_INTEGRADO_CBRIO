// ⚠️⚠️ ESTE TESTE EXISTE POR UM BUG REAL (21/08/2026): o Matheus reportou que
// no diálogo "Confirmar fusão" (/entradas) *"fica quicando o card dos nomes"*
// enquanto o bloco de cadastros parecidos carrega.
//
// Não era animação nem o modal centralizado do Radix: era LAÇO DE RENDER
// INFINITO. Dentro de `MergeFieldPicker`:
//   · `others` é um array literal NOVO a cada render;
//   · `camposConf` depende de `others`, então também é novo a cada render;
//   · o `useEffect` depende de `camposConf` e chama `onCampos({...})` com um
//     objeto NOVO;
//   · o pai faz `setMergeCampos(...)`, re-renderiza, e recomeça.
//
// A invariante que este arquivo vigia: **com as mesmas props, `onCampos` é
// chamado UMA vez.** Sem isso o diálogo re-renderiza sem parar — e os três
// consumidores (Entradas, Membresia > Duplicados, Grupos > Duplicatas) tremem
// junto, gastando CPU do aparelho de quem está decidindo uma fusão permanente.
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, act } from '@testing-library/react';
import MergeFieldPicker from '../components/dedup/MergeFieldPicker';

/* eslint-disable @typescript-eslint/no-explicit-any */

const KEEP: any = {
  id: 'k', nome: 'Antonio José de Lima', cpf: null, telefone: '21999999999',
  email: null, data_nascimento: null,
};
const DROP: any = {
  id: 'd', nome: 'Antônio José de Oliveira', cpf: null, telefone: null,
  email: 'a@b.com', data_nascimento: null,
};

/** Espelha o uso real: o pai guarda o resultado em estado, como os 3 fazem. */
function Pai({ onCampos, outrosInline }: { onCampos: (c: unknown) => void; outrosInline?: boolean }) {
  const [, setCampos] = useState<Record<string, unknown>>({});
  return (
    <MergeFieldPicker
      keep={KEEP}
      // ⚠️ `GruposDuplicatas` monta esta lista com `.filter()` INLINE, então a
      // identidade muda a cada render — o caso mais hostil, e é o real.
      {...(outrosInline ? { outros: [DROP] } : { drop: DROP })}
      onCampos={(c: Record<string, unknown>) => { setCampos(c); onCampos(c); }}
    />
  );
}

describe('MergeFieldPicker · não pode entrar em laço de render', () => {
  it('⚠️ com props estáveis, avisa o pai UMA vez — é a invariante', async () => {
    const onCampos = vi.fn();
    await act(async () => { render(<Pai onCampos={onCampos} />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(onCampos).toHaveBeenCalledTimes(1);
  });

  it('⚠️ nem com a lista de absorvidos remontada a cada render (caso do Grupos)', async () => {
    const onCampos = vi.fn();
    await act(async () => { render(<Pai onCampos={onCampos} outrosInline />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(onCampos).toHaveBeenCalledTimes(1);
  });

  it('avisa o pai com o override real — o conteúdo não pode se perder no conserto', async () => {
    const onCampos = vi.fn();
    await act(async () => { render(<Pai onCampos={onCampos} />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    // 'nome' diverge e a régua escolhe o MAIS LONGO, que aqui é o do absorvido.
    expect(onCampos).toHaveBeenCalledWith({ nome: 'Antônio José de Oliveira' });
  });

  it('sem campo divergente, não renderiza nada e ainda assim avisa uma vez só', async () => {
    const onCampos = vi.fn();
    const iguais: any = { id: 'x', nome: 'Ana Souza', cpf: null, telefone: null, email: null, data_nascimento: null };
    await act(async () => {
      render(<MergeFieldPicker keep={iguais} drop={{ ...iguais, id: 'y' }} onCampos={onCampos} />);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(onCampos).toHaveBeenCalledTimes(1);
    expect(onCampos).toHaveBeenCalledWith({});
  });
});
