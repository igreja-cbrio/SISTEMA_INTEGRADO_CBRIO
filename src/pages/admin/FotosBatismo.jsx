import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { batismoFotos as api } from '../../api';
import { Button } from '../../components/ui/button';
import { comprimirImagem } from '../../lib/comprimirImagem';
import { OverlayEnvio } from './Destaques';

const C = {
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', card: 'var(--cbrio-card)', inputBg: 'var(--cbrio-input-bg)',
  primary: '#00B39D',
};

function fmtData(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function FotosBatismo() {
  const [datas, setDatas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecionada, setSelecionada] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [fotosLoading, setFotosLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const fileRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      setDatas(await api.datas());
    } catch (e) {
      toast.error(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function abrir(d) {
    setSelecionada(d);
    setFotosLoading(true);
    try {
      setFotos(await api.fotos(d.data));
    } catch (e) {
      toast.error(e.message);
      setFotos([]);
    }
    setFotosLoading(false);
  }

  async function enviar(e) {
    const arquivos = Array.from(e.target.files || []);
    if (!arquivos.length) return;
    setEnviando(true);
    try {
      // Comprime no navegador (o Vercel rejeita corpo > 4,5 MB — foto de
      // câmera estoura) e envia em lotes pequenos pra caber no limite.
      const comprimidos = [];
      for (let i = 0; i < arquivos.length; i++) {
        setProgresso(`Preparando ${i + 1} de ${arquivos.length}…`);
        comprimidos.push(await comprimirImagem(arquivos[i], { maxLado: 2048 }));
      }
      let enviadas = 0;
      const LOTE = 4;
      for (let i = 0; i < comprimidos.length; i += LOTE) {
        setProgresso(`Enviando ${Math.min(i + LOTE, comprimidos.length)} de ${comprimidos.length}…`);
        const fd = new FormData();
        comprimidos.slice(i, i + LOTE).forEach((f) => fd.append('fotos', f));
        const parcial = await api.upload(selecionada.data, fd);
        enviadas += parcial.enviadas;
      }
      const r = { enviadas };
      toast.success(`${r.enviadas} foto${r.enviadas > 1 ? 's' : ''} no álbum — os batizados desse dia já veem no app`);
      setFotos(await api.fotos(selecionada.data));
      setDatas((arr) => arr.map((d) => (d.data === selecionada.data ? { ...d, fotos: d.fotos + r.enviadas } : d)));
    } catch (err) {
      toast.error(err.message);
    }
    setEnviando(false);
    setProgresso(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function excluir(f) {
    if (!window.confirm('Excluir esta foto do álbum?')) return;
    try {
      await api.remove(selecionada.data, f.nome);
      setFotos((arr) => arr.filter((x) => x.nome !== f.nome));
      setDatas((arr) => arr.map((d) => (d.data === selecionada.data ? { ...d, fotos: Math.max(0, d.fotos - 1) } : d)));
      toast.success('Foto excluída');
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>Fotos de Batismo</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>
          Álbum de cada dia de batismo. Quem se batizou naquele dia vê as fotos na aba Batismo do app — e pode salvar no celular.
        </div>
      </div>

      {!selecionada ? (
        loading ? (
          <div style={{ color: C.text3, fontSize: 13, padding: 32, textAlign: 'center' }}>Carregando...</div>
        ) : datas.length === 0 ? (
          <div style={{ background: C.card, borderRadius: 12, border: `1px dashed ${C.border}`, padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Nenhum batismo com data marcada</div>
            <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>As datas vêm das inscrições de batismo (Integração).</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {datas.map((d) => (
              <button
                key={d.data}
                onClick={() => abrir(d)}
                style={{
                  background: C.card, borderRadius: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow)',
                  padding: '18px 20px', textAlign: 'left', cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>{fmtData(d.data)}</div>
                <div style={{ fontSize: 12, color: C.text2, marginTop: 6 }}>
                  {d.batizandos} batizando{d.batizandos !== 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: 12, marginTop: 2, color: d.fotos > 0 ? C.primary : C.text3, fontWeight: d.fotos > 0 ? 600 : 400 }}>
                  {d.fotos > 0 ? `${d.fotos} foto${d.fotos !== 1 ? 's' : ''} no álbum` : 'Sem fotos ainda'}
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        <div style={{ position: 'relative' }}>
          {enviando && progresso && <OverlayEnvio texto={progresso} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" onClick={() => { setSelecionada(null); setFotos([]); }}>← Voltar</Button>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>{fmtData(selecionada.data)}</div>
            <div style={{ flex: 1 }} />
            <Button onClick={() => fileRef.current?.click()} disabled={enviando}>
              {enviando ? 'Enviando...' : '+ Adicionar fotos'}
            </Button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={enviar} style={{ display: 'none' }} />
          </div>

          {fotosLoading ? (
            <div style={{ color: C.text3, fontSize: 13, padding: 32, textAlign: 'center' }}>Carregando fotos...</div>
          ) : fotos.length === 0 ? (
            <div style={{ background: C.card, borderRadius: 12, border: `1px dashed ${C.border}`, padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Álbum vazio</div>
              <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>
                Adicione as fotos do dia — pode selecionar várias de uma vez (JPG, PNG ou WebP, até 10 MB cada).
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {fotos.map((f) => (
                <div key={f.nome} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}`, aspectRatio: '1' }}>
                  <img src={f.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    onClick={() => excluir(f)}
                    title="Excluir foto"
                    style={{
                      position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13,
                      background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', cursor: 'pointer',
                      fontSize: 13, lineHeight: '26px',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
