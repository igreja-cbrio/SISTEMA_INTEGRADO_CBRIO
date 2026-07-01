import { useEffect, useState } from 'react';
import { batismoPublico } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';

type Foto = { nome: string; url: string };
type Dados = { nome: string; data_batismo: string | null; fotos: Foto[] };

function primeiroNome(nome: string) {
  return (nome || '').trim().split(/\s+/)[0] || '';
}

function formatarData(iso: string | null) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${d} de ${meses[m - 1]} de ${y}`;
}

export default function BatismoAcesso() {
  const { C } = usePublicTheme();
  const [estado, setEstado] = useState<'carregando' | 'erro' | 'ok'>('carregando');
  const [erroMsg, setErroMsg] = useState('');
  const [dados, setDados] = useState<Dados | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    if (!token) {
      setEstado('erro');
      setErroMsg('Link inválido. Use o QR Code da sua etiqueta.');
      return;
    }
    let vivo = true;
    batismoPublico.acesso(token)
      .then((d: Dados) => { if (vivo) { setDados(d); setEstado('ok'); } })
      .catch((e: Error) => {
        if (!vivo) return;
        setEstado('erro');
        setErroMsg(e?.message || 'Não foi possível abrir suas fotos.');
      });
    return () => { vivo = false; };
  }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      padding: '40px 16px', background: C.pageBg,
    }}>
      <AnimatedBackground />
      <PublicThemeToggle />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 920,
        background: C.card, backdropFilter: 'blur(24px)',
        border: `1px solid ${C.cardBorder}`, borderRadius: 20,
        padding: 'clamp(24px, 5vw, 40px) clamp(18px, 5vw, 36px)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo-cbrio-icon.png" alt="CBRio"
            style={{ width: 64, height: 64, marginBottom: 12, display: 'inline-block' }} />

          {estado === 'ok' && dados && (
            <>
              <h1 style={{
                fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5,
                background: 'linear-gradient(90deg, #00B39D, #00d9bd)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>
                Parabéns pelo seu batismo{primeiroNome(dados.nome) ? `, ${primeiroNome(dados.nome)}` : ''}! 🎉
              </h1>
              <p style={{ fontSize: 14, color: C.text3, marginTop: 8, lineHeight: 1.5 }}>
                {dados.data_batismo
                  ? `Fotos do seu batismo · ${formatarData(dados.data_batismo)}`
                  : 'As fotos do seu batismo'}
              </p>
            </>
          )}

          {estado === 'carregando' && (
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: C.text }}>Abrindo suas fotos…</h1>
          )}

          {estado === 'erro' && (
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: C.text }}>Ops…</h1>
          )}
        </div>

        {estado === 'carregando' && (
          <p style={{ textAlign: 'center', color: C.text3, fontSize: 14 }}>Só um instante…</p>
        )}

        {estado === 'erro' && (
          <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
            <p style={{ color: C.text2, fontSize: 15, lineHeight: 1.6, margin: 0 }}>{erroMsg}</p>
            <p style={{ color: C.text3, fontSize: 13, marginTop: 14, lineHeight: 1.5 }}>
              Procure a equipe da Integração no dia do batismo — eles reenviam o seu acesso.
            </p>
          </div>
        )}

        {estado === 'ok' && dados && dados.fotos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ color: C.text2, fontSize: 15, lineHeight: 1.6 }}>
              As fotos do seu batismo ainda estão sendo preparadas. 💛<br />
              Volte em breve — assim que o álbum chegar, ele aparece aqui.
            </p>
          </div>
        )}

        {estado === 'ok' && dados && dados.fotos.length > 0 && (
          <>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10,
            }}>
              {dados.fotos.map((f) => (
                <a key={f.nome} href={f.url} target="_blank" rel="noreferrer"
                  style={{
                    display: 'block', borderRadius: 12, overflow: 'hidden',
                    border: `1px solid ${C.cardBorder}`, aspectRatio: '1 / 1', background: C.optionBg,
                  }}>
                  <img src={f.url} alt="Foto do batismo" loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </a>
              ))}
            </div>
            <p style={{ textAlign: 'center', color: C.text3, fontSize: 12.5, marginTop: 18, lineHeight: 1.5 }}>
              Toque numa foto pra abrir em tamanho cheio e salvar. {dados.fotos.length} foto{dados.fotos.length > 1 ? 's' : ''}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
