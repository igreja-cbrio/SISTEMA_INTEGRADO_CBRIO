// Página pública de RETIRADA do Kids · aberta pelo link enviado no WhatsApp ao
// responsável no check-in. Mostra o código de 4 letras + um QR que codifica o
// MESMO código. No portão, o leitor 2D lê esse QR e o /portao/scan já faz o
// checkout. 100% client-side (sem API, sem PII) — o código sozinho é o que o
// portão usa; o nome da criança vai só no texto privado do WhatsApp.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';

export default function KidsRetirada() {
  const { codigo: raw } = useParams();
  const codigo = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const [qr, setQr] = useState('');
  const valido = /^[A-Z0-9]{4}$/.test(codigo);

  useEffect(() => {
    if (!valido) return;
    QRCode.toDataURL(codigo, { width: 640, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [codigo, valido]);

  return (
    <div style={{ minHeight: '100dvh', background: '#0B1F26', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 380, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <div style={{ fontWeight: 800, color: '#EC4899', fontSize: 18, letterSpacing: 0.5 }}>CB Kids · Retirada</div>
        {valido ? (
          <>
            <p style={{ color: '#444', fontSize: 14, margin: '10px 0 16px' }}>
              Mostre este QR no leitor do <b>portão</b> pra retirar seu filho.
            </p>
            {qr
              ? <img src={qr} alt="QR de retirada" style={{ width: 240, height: 240, margin: '0 auto', display: 'block' }} />
              : <div style={{ width: 240, height: 240, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>gerando…</div>}
            <div style={{ marginTop: 16, color: '#111' }}>
              <div style={{ fontSize: 12, color: '#777' }}>Código</div>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 40, fontWeight: 900, letterSpacing: 6 }}>{codigo}</div>
            </div>
            <p style={{ color: '#999', fontSize: 11, marginTop: 14 }}>
              Guarde este link — ele vale enquanto a criança estiver no check-in de hoje.
            </p>
          </>
        ) : (
          <p style={{ color: '#b00', fontSize: 14, margin: '16px 0' }}>Link de retirada inválido.</p>
        )}
      </div>
    </div>
  );
}
