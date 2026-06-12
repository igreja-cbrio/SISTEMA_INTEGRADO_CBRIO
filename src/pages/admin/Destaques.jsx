import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { destaques as api } from '../../api';
import { Button } from '../../components/ui/button';

const C = {
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', card: 'var(--cbrio-card)', inputBg: 'var(--cbrio-input-bg)',
  primary: '#00B39D',
};

const inputStyle = {
  padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
  fontSize: 13, background: C.inputBg, color: C.text, width: '100%',
};

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(val) {
  return val ? new Date(val).toISOString() : null;
}

function statusDe(d) {
  const now = Date.now();
  if (!d.ativo) return { label: 'Inativo', color: '#6b7280' };
  if (d.publica_em && new Date(d.publica_em).getTime() > now) return { label: 'Agendado', color: '#f59e0b' };
  if (d.expira_em && new Date(d.expira_em).getTime() <= now) return { label: 'Expirado', color: '#ef4444' };
  return { label: 'No ar', color: C.primary };
}

function CampoData({ label, value, onChange }) {
  return (
    <label style={{ display: 'block', flex: 1 }}>
      <span style={{ fontSize: 12, color: C.text2, display: 'block', marginBottom: 4 }}>{label}</span>
      <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

function FormDestaque({ inicial, onSalvar, onCancelar, salvando, exigirImagem }) {
  const [titulo, setTitulo] = useState(inicial?.titulo || '');
  const [subtitulo, setSubtitulo] = useState(inicial?.subtitulo || '');
  const [link, setLink] = useState(inicial?.link || '');
  const [publicaEm, setPublicaEm] = useState(toLocalInput(inicial?.publica_em));
  const [expiraEm, setExpiraEm] = useState(toLocalInput(inicial?.expira_em));
  const [arquivo, setArquivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  function escolherArquivo(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setArquivo(f);
    setPreview(URL.createObjectURL(f));
  }

  function salvar() {
    if (exigirImagem && !arquivo) { toast.error('Escolha a imagem do destaque'); return; }
    onSalvar({
      titulo, subtitulo, link,
      publica_em: fromLocalInput(publicaEm),
      expira_em: fromLocalInput(expiraEm),
      arquivo,
    });
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        onClick={() => fileRef.current?.click()}
        style={{
          aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
          border: `1px dashed ${C.border}`, background: C.inputBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {preview || inicial?.imagem_url ? (
          <img src={preview || inicial.imagem_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ textAlign: 'center', color: C.text3, fontSize: 13, padding: 16 }}>
            Clique para escolher a imagem
            <div style={{ fontSize: 11, marginTop: 4 }}>Horizontal 16:9 (ex.: 1600×900) — JPG, PNG ou WebP até 8 MB</div>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={escolherArquivo} style={{ display: 'none' }} />
      {(preview || inicial?.imagem_url) && (
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Trocar imagem</Button>
      )}
      <input placeholder="Título (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} style={inputStyle} maxLength={80} />
      <input placeholder="Subtítulo (opcional)" value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} style={inputStyle} maxLength={120} />
      <input placeholder="Link ao tocar (opcional — ex.: https://cbrio.org/evento)" value={link} onChange={(e) => setLink(e.target.value)} style={inputStyle} />
      <div style={{ display: 'flex', gap: 12 }}>
        <CampoData label="Publicar em (vazio = agora)" value={publicaEm} onChange={setPublicaEm} />
        <CampoData label="Expira em (vazio = nunca)" value={expiraEm} onChange={setExpiraEm} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onCancelar && <Button variant="outline" onClick={onCancelar} disabled={salvando}>Cancelar</Button>}
        <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
      </div>
    </div>
  );
}

export default function Destaques() {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [salvando, setSalvando] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setItens(await api.list());
    } catch (e) {
      toast.error(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function montarForm(dados) {
    const fd = new FormData();
    if (dados.arquivo) fd.append('imagem', dados.arquivo);
    fd.append('titulo', dados.titulo || '');
    fd.append('subtitulo', dados.subtitulo || '');
    fd.append('link', dados.link || '');
    fd.append('publica_em', dados.publica_em || '');
    fd.append('expira_em', dados.expira_em || '');
    return fd;
  }

  async function criar(dados) {
    setSalvando(true);
    try {
      await api.create(montarForm(dados));
      toast.success('Destaque publicado — aparece no app em até 10 minutos');
      setCriando(false);
      load();
    } catch (e) {
      toast.error(e.message);
    }
    setSalvando(false);
  }

  async function editar(dados) {
    setSalvando(true);
    try {
      await api.update(editando.id, {
        titulo: dados.titulo,
        subtitulo: dados.subtitulo,
        link: dados.link,
        publica_em: dados.publica_em,
        expira_em: dados.expira_em,
      });
      if (dados.arquivo) {
        const fd = new FormData();
        fd.append('imagem', dados.arquivo);
        await api.trocarImagem(editando.id, fd);
      }
      toast.success('Destaque atualizado');
      setEditando(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
    setSalvando(false);
  }

  async function alternarAtivo(d) {
    try {
      await api.update(d.id, { ativo: !d.ativo });
      setItens((arr) => arr.map((i) => (i.id === d.id ? { ...i, ativo: !d.ativo } : i)));
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function mover(d, dir) {
    const idx = itens.findIndex((i) => i.id === d.id);
    const alvo = itens[idx + dir];
    if (!alvo) return;
    try {
      // Troca as ordens; se empatadas, separa pelos índices atuais
      const ordemD = alvo.ordem === d.ordem ? alvo.ordem + (dir > 0 ? 1 : -1) : alvo.ordem;
      await Promise.all([
        api.update(d.id, { ordem: ordemD }),
        api.update(alvo.id, { ordem: d.ordem }),
      ]);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function excluir(d) {
    if (!window.confirm(`Excluir o destaque "${d.titulo || 'sem título'}"? Ele some do app em até 10 minutos.`)) return;
    try {
      await api.remove(d.id);
      toast.success('Destaque excluído');
      setItens((arr) => arr.filter((i) => i.id !== d.id));
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>Destaques do App</div>
          <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>
            Carrossel de fotos da Home do app de membros. O app atualiza sozinho em até 10 minutos — sem precisar de nova versão na loja.
          </div>
        </div>
        {!criando && <Button onClick={() => setCriando(true)}>+ Novo destaque</Button>}
      </div>

      {criando && (
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 24, maxWidth: 560 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Novo destaque</div>
          <FormDestaque exigirImagem onSalvar={criar} onCancelar={() => setCriando(false)} salvando={salvando} />
        </div>
      )}

      {loading ? (
        <div style={{ color: C.text3, fontSize: 13, padding: 32, textAlign: 'center' }}>Carregando...</div>
      ) : itens.length === 0 && !criando ? (
        <div style={{ background: C.card, borderRadius: 12, border: `1px dashed ${C.border}`, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Nenhum destaque ainda</div>
          <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>
            Publique a primeira foto — ela aparece no carrossel da Home do app de todos os membros.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {itens.map((d, idx) => {
            const st = statusDe(d);
            return (
              <div key={d.id} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', opacity: st.label === 'No ar' ? 1 : 0.75 }}>
                <div style={{ aspectRatio: '16 / 9', background: C.inputBg, position: 'relative' }}>
                  <img src={d.imagem_url} alt={d.titulo || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span style={{
                    position: 'absolute', top: 8, left: 8, fontSize: 11, fontWeight: 700,
                    color: '#fff', background: st.color, padding: '2px 8px', borderRadius: 99,
                  }}>{st.label}</span>
                </div>
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{d.titulo || <span style={{ color: C.text3, fontWeight: 400 }}>Sem título</span>}</div>
                  {d.subtitulo && <div style={{ fontSize: 12, color: C.text2, marginTop: 2 }}>{d.subtitulo}</div>}
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 6 }}>
                    {d.publica_em && `Publica: ${new Date(d.publica_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                    {d.publica_em && d.expira_em && ' · '}
                    {d.expira_em && `Expira: ${new Date(d.expira_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 10, alignItems: 'center' }}>
                    <Button variant="ghost" size="xs" onClick={() => mover(d, -1)} disabled={idx === 0} title="Mover para frente">↑</Button>
                    <Button variant="ghost" size="xs" onClick={() => mover(d, 1)} disabled={idx === itens.length - 1} title="Mover para trás">↓</Button>
                    <div style={{ flex: 1 }} />
                    <Button variant="ghost" size="xs" onClick={() => alternarAtivo(d)}>{d.ativo ? 'Desativar' : 'Ativar'}</Button>
                    <Button variant="ghost" size="xs" onClick={() => setEditando(d)}>Editar</Button>
                    <Button variant="ghost" size="xs" className="text-red-500" onClick={() => excluir(d)}>Excluir</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editando && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setEditando(null); }}
          style={{
            position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div style={{ background: 'var(--cbrio-modal-bg)', borderRadius: 14, border: `1px solid ${C.border}`, padding: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Editar destaque</div>
            <FormDestaque inicial={editando} onSalvar={editar} onCancelar={() => setEditando(null)} salvando={salvando} />
          </div>
        </div>
      )}
    </div>
  );
}
