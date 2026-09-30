import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

import { CategoriaError, EnvelopeApi, Result } from '@/tipos/api';

const URL_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.ejemplo.com/v1';

let tokenAcceso: string | null = null;

const cliente = axios.create({
  baseURL: URL_BASE,
  timeout: 10000,
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

export async function peticion<T>(config: AxiosRequestConfig): Promise<Result<T>> {
  try {
    const respuesta = await cliente.request<unknown>(config);
    return normalizarEnvelope<T>(respuesta);
  } catch (error) {
    return { success: false, error: mensajeDeError(error) };
  }
}

function normalizarEnvelope<T>(respuesta: AxiosResponse<unknown>): Result<T> {
  const cuerpo = respuesta.data as EnvelopeApi<T> | null | undefined;
  if (cuerpo === null || cuerpo === undefined) {
    return { success: true, data: cuerpo as T };
  }
  if ('error' in cuerpo) {
    return { success: false, error: cuerpo.error.mensaje };
  }
  return { success: true, data: cuerpo.datos };
}

function categoriaDeError(error: unknown): CategoriaError {
  const errorAxios = error as AxiosError;
  if (errorAxios.response !== undefined) {
    const estado = errorAxios.response.status;
    if (estado === 401 || estado === 403) return 'no-autorizado';
    if (estado === 404) return 'no-encontrado';
    if (estado >= 500) return 'servidor';
    return 'desconocido';
  }
  if (errorAxios.code === 'ECONNABORTED' || errorAxios.request !== undefined) {
    return 'sin-red';
  }
  return 'desconocido';
}

function mensajeDeError(error: unknown): string {
  switch (categoriaDeError(error)) {
    case 'sin-red':
      return 'Sin conexión. Verificá tu señal e intentá de nuevo.';
    case 'no-autorizado':
      return 'Tu sesión expiró. Volvé a ingresar.';
    case 'no-encontrado':
      return 'No se encontró lo que buscabas.';
    case 'servidor':
      return 'El servicio no respondió. Intentá más tarde.';
    default:
      return 'Ocurrió un error inesperado. Intentá de nuevo.';
  }
}