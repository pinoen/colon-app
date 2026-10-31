import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

import type { EnvelopeApi, ErrorEnvelope, Meta, Result } from '@/tipos/api';

const URL_BASE_CONFIGURADA = process.env.EXPO_PUBLIC_API_URL?.trim();
const URL_BASE = (
  URL_BASE_CONFIGURADA !== undefined && URL_BASE_CONFIGURADA !== ''
    ? URL_BASE_CONFIGURADA
    : 'http://localhost:3000'
).replace(/\/+$/, '');

let tokenAcceso: string | null = null;
let manejadorNoAutorizado: (() => void) | null = null;

const cliente = axios.create({
  baseURL: URL_BASE,
  timeout: 15000,
});

cliente.interceptors.request.use((config) => {
  if (tokenAcceso !== null) {
    config.headers.Authorization = `Bearer ${tokenAcceso}`;
  }
  return config;
});

export function fijarTokenAcceso(token: string | null): void {
  tokenAcceso = token;
}

/**
 * Permite que AuthContext cierre la sesión local cuando la API responde
 * `NO_AUTENTICADO`. No se dispara para errores de login
 * (`CREDENCIALES_INVALIDAS`) ni de permisos (`SIN_PERMISO`).
 */
export function registrarManejadorNoAutorizado(
  manejador: (() => void) | null,
): void {
  manejadorNoAutorizado = manejador;
}

export async function peticion<T>(
  config: AxiosRequestConfig,
): Promise<Result<T>> {
  try {
    const respuesta = await cliente.request<unknown>(config);
    return normalizarEnvelope<T>(respuesta);
  } catch (error) {
    return resultadoDeError(error);
  }
}

/**
 * Indica si un fallo permite recurrir a la copia local: sin red, timeout o
 * servidor caído. Los 4xx (validación, permisos, 404) se devuelven tal cual.
 */
export function puedeUsarCache(resultado: Result<unknown>): boolean {
  return (
    !resultado.success &&
    (resultado.estado === undefined || resultado.estado >= 500)
  );
}

export async function peticionLista<T>(
  config: AxiosRequestConfig,
): Promise<Result<{ datos: T[]; meta: Meta }>> {
  try {
    const respuesta = await cliente.request<unknown>(config);
    const normalizada = normalizarEnvelope<T[]>(respuesta);
    if (!normalizada.success) {
      return normalizada;
    }
    if (!Array.isArray(normalizada.data)) {
      return {
        success: false,
        error: 'La respuesta de la API no tiene una lista válida.',
        codigo: 'RESPUESTA_INVALIDA',
        estado: respuesta.status,
      };
    }

    const meta = leerMeta(respuesta.data);
    if (meta === null) {
      return {
        success: false,
        error: 'La respuesta de la API no incluye la paginación esperada.',
        codigo: 'RESPUESTA_INVALIDA',
        estado: respuesta.status,
      };
    }

    return { success: true, data: { datos: normalizada.data, meta } };
  } catch (error) {
    return resultadoDeError(error);
  }
}

function normalizarEnvelope<T>(respuesta: AxiosResponse<unknown>): Result<T> {
  const { data, status } = respuesta;

  if (status === 204 || data === null || data === undefined || data === '') {
    return { success: true, data: null as T };
  }

  if (esRegistro(data)) {
    const posibleEnvelope = data as EnvelopeApi<T>;

    if ('error' in posibleEnvelope && esErrorEnvelope(posibleEnvelope.error)) {
      if (posibleEnvelope.error.codigo === 'NO_AUTENTICADO') {
        notificarNoAutorizado();
      }
      return {
        success: false,
        error: posibleEnvelope.error.mensaje,
        codigo: posibleEnvelope.error.codigo,
        estado: status,
      };
    }

    if ('datos' in posibleEnvelope) {
      return { success: true, data: posibleEnvelope.datos as T };
    }
  }

  return {
    success: false,
    error: 'La respuesta de la API no tiene el formato esperado.',
    codigo: 'RESPUESTA_INVALIDA',
    estado: status,
  };
}

function leerMeta(valor: unknown): Meta | null {
  if (!esRegistro(valor) || !esRegistro(valor.meta)) {
    return null;
  }

  const { total, pagina, porPagina } = valor.meta;
  if (
    typeof total !== 'number' ||
    typeof pagina !== 'number' ||
    typeof porPagina !== 'number'
  ) {
    return null;
  }

  return { total, pagina, porPagina };
}

function resultadoDeError(error: unknown): Result<never> {
  const errorApi = extraerErrorApi(error);
  if (errorApi !== null) {
    if (errorApi.codigo === 'NO_AUTENTICADO') {
      notificarNoAutorizado();
    }
    return {
      success: false,
      error: errorApi.mensaje,
      codigo: errorApi.codigo,
      estado: errorApi.estado,
    };
  }

  const estado = axios.isAxiosError(error) ? error.response?.status : undefined;

  if (estado === 401) {
    notificarNoAutorizado();
    return {
      success: false,
      error: 'Tu sesión venció o no es válida. Ingresá de nuevo.',
      estado,
    };
  }
  if (estado === 403) {
    return {
      success: false,
      error: 'No tenés permiso para hacer esto.',
      estado,
    };
  }
  if (estado === 404) {
    return {
      success: false,
      error: 'No se encontró lo que buscabas.',
      estado,
    };
  }
  if (estado !== undefined && estado >= 500) {
    return {
      success: false,
      error: 'El servicio no respondió. Intentá más tarde.',
      estado,
    };
  }
  if (estado !== undefined) {
    return {
      success: false,
      error: 'Ocurrió un error inesperado. Intentá de nuevo.',
      estado,
    };
  }

  if (
    axios.isAxiosError(error) &&
    (error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ERR_NETWORK' ||
      error.request !== undefined)
  ) {
    return {
      success: false,
      error: 'Sin conexión. Verificá tu señal e intentá de nuevo.',
    };
  }

  return {
    success: false,
    error: 'Ocurrió un error inesperado. Intentá de nuevo.',
  };
}

interface ErrorApi {
  codigo: string;
  mensaje: string;
  estado?: number;
}

function extraerErrorApi(error: unknown): ErrorApi | null {
  if (!axios.isAxiosError(error)) {
    return null;
  }

  const cuerpo = error.response?.data;
  if (!esRegistro(cuerpo) || !esErrorEnvelope(cuerpo.error)) {
    return null;
  }

  return {
    codigo: cuerpo.error.codigo,
    mensaje: cuerpo.error.mensaje,
    estado: error.response?.status,
  };
}

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esErrorEnvelope(valor: unknown): valor is ErrorEnvelope {
  return (
    esRegistro(valor) &&
    typeof valor.codigo === 'string' &&
    typeof valor.mensaje === 'string'
  );
}

function notificarNoAutorizado(): void {
  manejadorNoAutorizado?.();
}
