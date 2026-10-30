import type { IdLugar } from '@/tipos/lugar';

export const ESQUEMA_QR = 'COLON';
export const SEPARADOR_QR = ':';
export const PREFIJO_ID_LUGAR = 'lug-';

/** Prefijo completo tal como viaja en el QR: "COLON:". */
export const PREFIJO_QR = `${ESQUEMA_QR}${SEPARADOR_QR}`;

/** Los QRs ajenos o gigantes se descartan antes de procesarlos. */
export const LONGITUD_MAXIMA_QR = 128;

export function construirCodigoQr(id: IdLugar): string {
  return `${PREFIJO_QR}${id}`;
}
