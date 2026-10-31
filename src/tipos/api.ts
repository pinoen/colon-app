import type { Usuario } from '@/tipos/usuario';

export type Result<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      /** Código estable devuelto por la API (`NO_AUTENTICADO`, etc.). */
      codigo?: string;
      /** Estado HTTP, cuando el error vino de una respuesta del servidor. */
      estado?: number;
    };

export type CategoriaError =
  | 'sin-red'
  | 'no-autorizado'
  | 'no-encontrado'
  | 'servidor'
  | 'desconocido';

export interface Meta {
  total: number;
  pagina: number;
  porPagina: number;
}

export interface ErrorEnvelope {
  codigo: string;
  mensaje: string;
}

export interface EnvelopeExito<T> {
  datos: T;
  meta?: Meta | null;
}

export type EnvelopeApi<T> = EnvelopeExito<T> | { error: ErrorEnvelope };

/** Respuesta de POST /auth/registro y POST /auth/ingreso. */
export interface Sesion {
  token: string;
  usuario: Usuario;
}

export type TipoArchivo = 'imagen' | 'audio' | 'video';

/** Respuesta de POST /archivos. */
export interface ArchivoSubido {
  url: string;
  tipo: TipoArchivo;
  bytes: number;
}

/** Respuesta de GET /salud. */
export interface Salud {
  estado: string;
  motor: string;
  almacen: string;
  version: string;
}
