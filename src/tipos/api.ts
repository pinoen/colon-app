export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type CategoriaError =
  | 'sin-red'
  | 'no-autorizado'
  | 'no-encontrado'
  | 'servidor'
  | 'desconocido';

export interface ErrorEnvelope {
  codigo: string;
  mensaje: string;
}

export interface EnvelopeExito<T> {
  datos: T;
  meta?: Record<string, unknown>;
}

export type EnvelopeApi<T> = EnvelopeExito<T> | { error: ErrorEnvelope };