import {
  LONGITUD_MAXIMA_QR,
  PREFIJO_ID_LUGAR,
  PREFIJO_QR,
} from '@/constantes/qr';
import type { IdLugar } from '@/tipos/lugar';

const PATRON_SUFIJO = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Valida un texto leído por la cámara contra el formato oficial
 * `COLON:lug-<id>`. Devuelve el id del lugar o `null` si el QR es ajeno,
 * está roto o no respeta el formato (spec Área 4).
 */
export function parsearCodigoQr(texto: string | null | undefined): IdLugar | null {
  if (typeof texto !== 'string') {
    return null;
  }

  const limpio = texto.trim();
  if (limpio.length === 0 || limpio.length > LONGITUD_MAXIMA_QR) {
    return null;
  }

  if (!limpio.startsWith(PREFIJO_QR)) {
    return null;
  }

  const id = limpio.slice(PREFIJO_QR.length);
  if (!id.startsWith(PREFIJO_ID_LUGAR)) {
    return null;
  }

  const sufijo = id.slice(PREFIJO_ID_LUGAR.length);
  if (!PATRON_SUFIJO.test(sufijo)) {
    return null;
  }

  return id as IdLugar;
}

export function esCodigoQrValido(texto: string | null | undefined): boolean {
  return parsearCodigoQr(texto) !== null;
}
