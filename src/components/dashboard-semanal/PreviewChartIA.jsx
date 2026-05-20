import { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from 'recharts';
import MetaGauge from './MetaGauge';

const PALETA = ['#00B39D', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

/**
 * Renderiza um preview chart baseado no tipo de grafico sugerido pela IA.
 * Usa dados placeholder de exemplo · serve como referencia visual do que
 * o indicador ficaria quando implementado.
 */
export default function PreviewChartIA({ tipoGrafico, height = 160, semente = 1 }) {
  const dadosBar = useMemo(() => MESES.slice(0, 6).map((m, i) => ({
    nome: m,
    val: 50 + Math.round(Math.sin(i + semente) * 30 + Math.random() * 20 + 30),
  })), [semente]);

  const dadosLinha = useMemo(() => MESES.map((m, i) => ({
    nome: m,
    val: 100 + Math.round(Math.sin((i + semente) * 0.7) * 50 + i * 4),
  })), [semente]);

  const dadosPizza = useMemo(() => ['A','B','C','D'].map((k, i) => ({
    name: k, value: 20 + Math.round(Math.random() * 30) + i * 5,
  })), [semente]);

  const dadosRadar = useMemo(() => ['Frequência','Online','Conexão','Servir','Devocional','Geração'].map((k, i) => ({
    eixo: k, val: 40 + Math.round(Math.sin((i + semente) * 0.5) * 25 + 30),
  })), [semente]);

  const wrapperStyle = { width: '100%', height };

  switch (tipoGrafico) {
    case 'gauge':
      return (
        <div className="flex justify-center">
          <MetaGauge atual={65} meta={100} size={170} label="Preview" duration={1.2} />
        </div>
      );

    case 'linha':
      return (
        <div style={wrapperStyle}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dadosLinha} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="nome" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6 }} />
              <Line
                type="monotone"
                dataKey="val"
                stroke={PALETA[0]}
                strokeWidth={2.5}
                dot={{ r: 3, fill: PALETA[0], strokeWidth: 0 }}
                animationDuration={1200}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );

    case 'area':
      return (
        <div style={wrapperStyle}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dadosLinha} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id={`g-area-${semente}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETA[0]} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={PALETA[0]} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="nome" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6 }} />
              <Area
                type="monotone"
                dataKey="val"
                stroke={PALETA[0]}
                strokeWidth={2}
                fill={`url(#g-area-${semente})`}
                animationDuration={1200}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );

    case 'pizza':
      return (
        <div style={wrapperStyle}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={dadosPizza}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={60}
                paddingAngle={2}
                animationDuration={1200}
              >
                {dadosPizza.map((_, i) => (
                  <Cell key={i} fill={PALETA[i % PALETA.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );

    case 'radar':
      return (
        <div style={wrapperStyle}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={dadosRadar} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="eixo" tick={{ fontSize: 9 }} />
              <PolarRadiusAxis tick={{ fontSize: 8 }} />
              <Radar
                dataKey="val"
                stroke={PALETA[2]}
                fill={PALETA[2]}
                fillOpacity={0.45}
                animationDuration={1300}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      );

    case 'barra':
    default:
      return (
        <div style={wrapperStyle}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dadosBar} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="nome" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6 }} />
              <Bar dataKey="val" fill={PALETA[0]} radius={[4, 4, 0, 0]} animationDuration={1100} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
  }
}
