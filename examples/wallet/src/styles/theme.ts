import type { CSSProperties } from 'react';

export const colors = {
  bg: '#0b0d10',
  surface: '#12161c',
  surfaceRaised: '#1a2028',
  border: '#2a3340',
  text: '#e8ecf1',
  textMuted: '#8b95a5',
  accent: '#3dd6c3',
  accentDim: '#2a9d8f',
  rmj: '#e8a838',
  rmjDim: '#c4891f',
  danger: '#f07178',
  success: '#7fd99a',
};

export const layout: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: `radial-gradient(ellipse 120% 80% at 50% -20%, #1a2830 0%, ${colors.bg} 55%)`,
    color: colors.text,
    fontFamily: '"IBM Plex Sans", system-ui, -apple-system, sans-serif',
  },
  shell: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '20px 16px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  card: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    padding: 16,
  },
  btn: {
    border: 'none',
    borderRadius: 12,
    padding: '12px 18px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  btnPrimary: {
    background: `linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentDim} 100%)`,
    color: '#0b0d10',
  },
  btnRmj: {
    background: `linear-gradient(135deg, ${colors.rmj} 0%, ${colors.rmjDim} 100%)`,
    color: '#0b0d10',
  },
  btnGhost: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    color: colors.text,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    background: colors.surfaceRaised,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: '10px 12px',
    color: colors.text,
    fontSize: 15,
    outline: 'none',
  },
};
