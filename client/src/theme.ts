export const colors = {
  bg0: '#08090A',
  bg1: '#0F1011',
  bg2: '#141516',
  bg3: '#1C1C1F',
  bg4: '#232326',
  text1: '#F7F8F8',
  text2: '#D0D6E0',
  text3: '#8A8F98',
  text4: '#62666D',
  accent: '#5E6AD2',
  accentHover: '#828FFF',
  accentActive: '#7070FF',
  agent: '#00B8CC',
  success: '#27A644',
  warning: '#F0BF00',
  error: '#EB5757',
  info: '#4EA7FC',
  court: '#FC7840',
  borderHairline: 'rgba(255, 255, 255, 0.06)',
  borderStrong: 'rgba(255, 255, 255, 0.10)',
} as const;

export const radii = {
  control: 8,
  card: 12,
  panel: 16,
  pill: 9999,
} as const;

export const fonts = {
  sans:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono:
    "'Geist Mono', 'Berkeley Mono', 'JetBrains Mono', ui-monospace, 'SF Mono', monospace",
} as const;

export const shadows = {
  elevBorder: '0 0 0 1px rgba(255, 255, 255, 0.06)',
  elevBorderStrong: '0 0 0 1px rgba(255, 255, 255, 0.10)',
  elevLow: '0 0 0 1px rgba(255, 255, 255, 0.06), 0 1px 4px -1px rgba(0, 0, 0, 0.3)',
  elevHigh: '0 0 0 1px rgba(255, 255, 255, 0.10), 0 7px 32px rgba(0, 0, 0, 0.45)',
} as const;

export const motion = {
  base: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  fast: '100ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const;
