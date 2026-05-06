// ============================================================================
// /admin/grupos/qrcode-inscricao — gera o QR code para a campanha de
// inscricao em grupos. Imprimir e distribuir nos cultos / divulgar nas
// redes sociais. Aponta pra /inscricao-grupos?temporada=T1-2026.
// ============================================================================

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { grupos as api } from '../../api';
import { Button } from '../../components/ui/button';
import { Download, ExternalLink, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D',
};

export default function InscricaoGruposQRCode() {
  const [temporadas, setTemporadas] = useState([]);
  const [temporadaId, setTemporadaId] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.temporadas().then(ts => {
      setTemporadas(ts || []);
      const ativa = (ts || []).find(t => t.ativa);
      if (ativa) setTemporadaId(ativa.id);
    }).catch(() => {});
  }, []);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${baseUrl}/inscricao-grupos${temporadaId ? `?temporada=${temporadaId}` : ''}`;

  const copyUrl = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadQr = () => {
    const svg = document.getElementById('qr-inscricao');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cbrio-inscricao-grupos-${temporadaId || 'geral'}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('QR baixado em SVG');
  };

  const printQr = () => {
    window.print();
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
          QR Code de Inscrição em Grupos
        </h1>
        <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
          Imprima e distribua nos cultos, ou compartilhe o link nas redes sociais
          durante o período de inscrição. As pessoas escaneiam, escolhem o grupo
          (busca por líder, bairro, CEP ou mapa) e o líder aprova.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }} className="qr-print-grid">
        <div style={{ background: C.card, borderRadius: 12, padding: 20, border: `1px solid ${C.border}` }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 6, display: 'block' }}>
            Temporada vinculada (opcional)
          </label>
          <select value={temporadaId} onChange={e => setTemporadaId(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text, fontSize: 13 }}>
            <option value="">Sem filtro (mostra a temporada ativa)</option>
            {temporadas.map(t => (
              <option key={t.id} value={t.id}>{t.label}{t.ativa ? ' (atual)' : ''}</option>
            ))}
          </select>

          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 6, display: 'block' }}>
              Link da inscrição
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={url} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--cbrio-input-bg)', color: C.text, fontSize: 12 }} />
              <Button size="sm" variant="outline" onClick={copyUrl}>
                {copied ? <><Check size={14} style={{ marginRight: 4 }} /> Copiado</> : <><Copy size={14} style={{ marginRight: 4 }} /> Copiar</>}
              </Button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button size="sm" onClick={() => window.open(url, '_blank')}>
              <ExternalLink size={14} style={{ marginRight: 4 }} /> Abrir formulário
            </Button>
            <Button size="sm" variant="outline" onClick={downloadQr}>
              <Download size={14} style={{ marginRight: 4 }} /> Baixar SVG
            </Button>
            <Button size="sm" variant="outline" onClick={printQr}>
              Imprimir
            </Button>
          </div>

          <div style={{ marginTop: 20, padding: 12, background: 'rgba(0,179,157,0.06)', border: `1px solid ${C.primary}40`, borderRadius: 10, fontSize: 12, color: C.t2 }}>
            <strong style={{ color: C.text }}>Como funciona:</strong>
            <ol style={{ margin: 6, paddingLeft: 18, lineHeight: 1.6 }}>
              <li>Pessoa escaneia o QR no culto / ve o link na rede social</li>
              <li>Abre o formulário público — pode buscar grupos por líder, bairro, CEP ou mapa</li>
              <li>Escolhe o grupo, preenche dados básicos, aceita os termos</li>
              <li>O líder do grupo recebe notificação em <strong>/grupos/pedidos</strong></li>
              <li>Aprovação cria a participação e notifica a pessoa</li>
            </ol>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 20, textAlign: 'center', border: `1px solid ${C.border}` }} className="qr-print-card">
          <div style={{ fontSize: 14, fontWeight: 700, color: '#000', marginBottom: 12 }}>
            Quero entrar em um grupo
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: 8, background: '#fff' }}>
            <QRCodeSVG id="qr-inscricao" value={url} size={240} level="M" includeMargin={false} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 12 }}>
            Igreja CBRio · Grupos de Conexão
            {temporadaId && <div style={{ fontFamily: 'monospace', marginTop: 4 }}>{temporadaId}</div>}
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .qr-print-card, .qr-print-card * { visibility: visible; }
          .qr-print-card { position: absolute; left: 0; top: 0; width: 100%; }
          .qr-print-grid { display: block; }
        }
      `}</style>
    </div>
  );
}
