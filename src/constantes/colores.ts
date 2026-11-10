/**
 * Tokens semánticos con contraste AA sobre sus fondos habituales.
 * Los pares texto/fondo se revisaron para claro y oscuro; los tonos
 * "claros" se usan sobre superficies oscuras.
 */
export const paleta = {
  primario: '#00694E',
  // 5.56:1 sobre fondo-oscuro (texto/íconos) y buen contraste como acento.
  'primario-claro': '#3B9C7C',
  'primario-oscuro': '#003D2E',
  acento: '#E8A33D',
  blanco: '#FFFFFF',
  fondo: '#FFFFFF',
  'fondo-oscuro': '#121212',
  superficie: '#F2F4F7',
  'superficie-oscura': '#1E1E1E',
  texto: '#111111',
  'texto-oscuro': '#F4F4F5',
  // 7.5:1 sobre blanco y 6.8:1 sobre superficie clara.
  'texto-secundario': '#4B5563',
  // 10.8:1 sobre fondo-oscuro y 9.6:1 sobre superficie oscura.
  'texto-secundario-oscuro': '#C4C4CC',
  borde: '#D0D5DD',
  'borde-oscuro': '#3F3F46',
  exito: '#2E7D32',
  peligro: '#C62828',
  // Variante para mensajes/íconos de error en tema oscuro (8.2:1).
  'peligro-claro': '#FF8A80',
} as const;