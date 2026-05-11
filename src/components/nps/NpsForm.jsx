import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';

const C = {
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', inputBg: 'var(--cbrio-input-bg)',
  cyan: '#06b6d4', red: '#ef4444', amber: '#f59e0b', green: '#10b981',
};

const inp = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.inputBg,
  color: C.text, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit',
};

function corDoScore(n) {
  if (n <= 6) return C.red;
  if (n <= 8) return C.amber;
  return C.green;
}

/**
 * Formulário NPS reutilizável (logado e público).
 * pesquisa.perguntas = { pergunta_nps, perguntas_extras: [{id, tipo, texto}] }
 * onSubmit({ score, respostas, comentario }) — comentario é a resposta da
 *   pergunta cujo id começa com "motivo" ou a primeira texto_longo.
 */
export default function NpsForm({ pesquisa, onSubmit, enviando, extraHeader }) {
  const [score, setScore] = useState(null);
  const [respostas, setRespostas] = useState({});

  const perguntasExtras = pesquisa?.perguntas?.perguntas_extras || [];
  const perguntaNps = pesquisa?.perguntas?.pergunta_nps || { texto: 'De 0 a 10, como você avalia?' };

  function setRespostaPergunta(pid, valor) {
    setRespostas(prev => ({ ...prev, [pid]: valor }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (score === null) {
      alert('Selecione uma nota de 0 a 10.');
      return;
    }
    // Extrai comentário principal (primeira pergunta texto_longo com algum motivo)
    const perguntaMotivo = perguntasExtras.find(p => p.id?.includes('motivo')) || perguntasExtras.find(p => p.tipo === 'texto_longo');
    const comentario = perguntaMotivo ? (respostas[perguntaMotivo.id] || null) : null;
    onSubmit({ score, respostas, comentario });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {extraHeader}

      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>
          {perguntaNps.texto}
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Array.from({ length: 11 }).map((_, n) => (
            <button key={n} type="button" onClick={() => setScore(n)}
              style={{
                width: 44, height: 44, borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer',
                border: `2px solid ${score === n ? corDoScore(n) : C.border}`,
                background: score === n ? corDoScore(n) : 'transparent',
                color: score === n ? '#fff' : C.t2,
                transition: 'all .12s',
              }}>
              {n}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: C.t3 }}>
          <span>Muito ruim</span>
          <span>Muito bom</span>
        </div>
      </div>

      {perguntasExtras.map(p => (
        <div key={p.id}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>
            {p.texto}
          </label>
          {p.tipo === 'texto_longo' && (
            <textarea rows={3} value={respostas[p.id] || ''}
              onChange={e => setRespostaPergunta(p.id, e.target.value)}
              placeholder="Sua resposta..." style={{ ...inp, resize: 'vertical', minHeight: 70 }} />
          )}
          {p.tipo === 'texto_curto' && (
            <input value={respostas[p.id] || ''}
              onChange={e => setRespostaPergunta(p.id, e.target.value)}
              placeholder="Sua resposta..." style={inp} />
          )}
          {p.tipo === 'escala_5' && (
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" onClick={() => setRespostaPergunta(p.id, n)}
                  style={{
                    width: 44, height: 44, borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    border: `2px solid ${respostas[p.id] === n ? C.cyan : C.border}`,
                    background: respostas[p.id] === n ? C.cyan : 'transparent',
                    color: respostas[p.id] === n ? '#fff' : C.t2,
                  }}>{n}</button>
              ))}
            </div>
          )}
        </div>
      ))}

      <button type="submit" disabled={enviando}
        style={{
          padding: '12px 24px', borderRadius: 10, background: C.cyan, color: '#fff',
          border: 'none', fontSize: 14, fontWeight: 700, cursor: enviando ? 'not-allowed' : 'pointer',
          opacity: enviando ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center',
        }}>
        {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        {enviando ? 'Enviando...' : 'Enviar resposta'}
      </button>
    </form>
  );
}
