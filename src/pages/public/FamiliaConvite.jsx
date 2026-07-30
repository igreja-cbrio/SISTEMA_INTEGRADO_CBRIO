// ============================================================================
// /f/a/:codigo — página de bounce do CONVITE DE FAMILIAR do app de membros.
//
// Só LEITURA: mostra quem convidou e leva a pessoa a abrir o app CBRio pra
// aceitar (o aceite exige login no app). O código também pode ser digitado
// manualmente em "Minha família" no app. Mobile-first (aberto no celular).
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { familiaPublic } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';
import { Users, Heart, Smartphone, Copy, CheckCircle2, AlertTriangle } from 'lucide-react';

const VERDE = '#00B39D';
const AMBAR = '#f59e0b';
const APP_STORE = 'https://apps.apple.com/app/id6778156310';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=br.com.cbrio.app';

export default function FamiliaConvite() {
  const { codigo } = useParams();
  const { C } = usePublicTheme();
  const [estado, setEstado] = useState('carregando'); // carregando | pronto | usado | erro
  const [dados, setDados] = useState(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!codigo) { setEstado('erro'); return; }
    let vivo = true;
    familiaPublic.conviteInfo(codigo).then((d) => {
      if (!vivo) return;
      if (d?.status === 'pendente') { setDados(d); setEstado('pronto'); }
      else if (['aceito', 'expirado', 'cancelado', 'usado'].includes(d?.status)) { setDados(d); setEstado('usado'); }
      else setEstado('erro');
    }).catch(() => vivo && setEstado('erro'));
    return () => { vivo = false; };
  }, [codigo]);

  const cod = (codigo || '').toUpperCase();
  const deepLink = `cbrio://familia?codigo=${encodeURIComponent(cod)}`;

  const copiar = () => {
    navigator.clipboard?.writeText(cod).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800); }, () => {});
  };

  const wrap = { minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative' };
  const card = { width: '100%', maxWidth: 440, background: C.card, borderRadius: 20, padding: 28, boxShadow: '0 12px 40px rgba(0,0,0,0.12)', border: `1px solid ${C.cardBorder}`, textAlign: 'center', zIndex: 1 };

  return (
    <div style={{ background: C.pageBg, color: C.text, position: 'relative' }}>
      <AnimatedBackground />
      <PublicThemeToggle />
      <div style={wrap}>
        {estado === 'carregando' && (
          <div style={card}><p style={{ color: C.text2 }}>Carregando convite…</p></div>
        )}

        {estado === 'erro' && (
          <div style={card}>
            <AlertTriangle style={{ width: 40, height: 40, color: AMBAR, margin: '0 auto 12px' }} />
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Convite não encontrado</h1>
            <p style={{ color: C.text2, fontSize: 14 }}>Confira o link com quem te convidou — ele pode ter digitado errado ou o convite não existe mais.</p>
          </div>
        )}

        {estado === 'usado' && (
          <div style={card}>
            <CheckCircle2 style={{ width: 40, height: 40, color: VERDE, margin: '0 auto 12px' }} />
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              {dados?.status === 'aceito' ? 'Convite já aceito' : dados?.status === 'expirado' ? 'Convite expirado' : 'Convite indisponível'}
            </h1>
            <p style={{ color: C.text2, fontSize: 14 }}>
              {dados?.status === 'aceito'
                ? 'Este convite já foi usado. Se foi você, já está tudo certo na sua família no app.'
                : 'Peça um novo convite pra quem te chamou.'}
            </p>
          </div>
        )}

        {estado === 'pronto' && dados && (
          <div style={card}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: `${VERDE}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Heart style={{ width: 30, height: 30, color: VERDE }} />
            </div>
            <h1 style={{ fontSize: 21, fontWeight: 700, marginBottom: 6, lineHeight: 1.25 }}>
              {dados.criador_nome} te convidou pra família
            </h1>
            <p style={{ color: C.text2, fontSize: 14, marginBottom: 20 }}>
              como <b style={{ color: C.text }}>{dados.rotulo}</b> no app da CBRio. Abra o app pra confirmar.
            </p>

            <a href={deepLink} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: VERDE, color: '#fff', fontWeight: 700, fontSize: 15, padding: '14px 18px', borderRadius: 12, textDecoration: 'none', marginBottom: 14 }}>
              <Smartphone style={{ width: 18, height: 18 }} /> Abrir no app CBRio
            </a>

            <div style={{ background: C.optionBg, borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: C.text2, marginBottom: 6 }}>Ou entre em <b>Menu → Minha família</b> no app e use o código:</p>
              <button onClick={copiar} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: `1px dashed ${C.cardBorder}`, borderRadius: 10, padding: '8px 14px', cursor: 'pointer', color: C.text, fontSize: 22, fontWeight: 800, letterSpacing: 3 }}>
                {cod} <Copy style={{ width: 16, height: 16, color: C.text2 }} />
              </button>
              {copiado && <p style={{ fontSize: 12, color: VERDE, marginTop: 6 }}>Código copiado!</p>}
            </div>

            <p style={{ fontSize: 12, color: C.text2, marginBottom: 10 }}>Ainda não tem o app?</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <a href={APP_STORE} style={{ fontSize: 13, color: VERDE, fontWeight: 600, textDecoration: 'none' }}>App Store</a>
              <span style={{ color: C.cardBorder }}>·</span>
              <a href={PLAY_STORE} style={{ fontSize: 13, color: VERDE, fontWeight: 600, textDecoration: 'none' }}>Google Play</a>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 20, color: C.text2, fontSize: 12 }}>
              <Users style={{ width: 14, height: 14 }} /> Comunidade CBRio
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
