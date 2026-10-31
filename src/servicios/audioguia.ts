import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { Result } from '@/tipos/api';
import type { IdLugar } from '@/tipos/lugar';

const CARPETA_AUDIOS = 'audioguias';
const EXTENSION_POR_DEFECTO = '.mp3';

export interface EstadoAudioguia {
  descargada: boolean;
  /** URI local (`file://`) de la audioguía descargada, o `null`. */
  uri: string | null;
}

export interface ProgresoDescargaAudioguia {
  bytesEscritos: number;
  bytesTotales: number;
  /** Porcentaje 0–100, o `null` si el servidor no informa el tamaño total. */
  porcentaje: number | null;
}

function esUrlValida(url: string): boolean {
  return url.startsWith('https://');
}

function extensionDesdeUrl(url: string): string {
  const sinParametros = url.split(/[?#]/)[0];
  const coincidencia = /\.([a-z0-9]{1,5})$/i.exec(sinParametros);
  return coincidencia === null ? EXTENSION_POR_DEFECTO : `.${coincidencia[1].toLowerCase()}`;
}

function obtenerDirectorio(): Directory {
  const directorio = new Directory(Paths.document, CARPETA_AUDIOS);
  if (!directorio.exists) {
    directorio.create({ intermediates: true, idempotent: true });
  }
  return directorio;
}

function obtenerArchivo(lugarId: IdLugar, url: string): File {
  return new File(obtenerDirectorio(), `${lugarId}${extensionDesdeUrl(url)}`);
}

function errorDescarga(): string {
  return 'No se pudo descargar la audioguía. Verificá tu conexión e intentá de nuevo.';
}

/**
 * Indica si la audioguía del lugar ya está guardada en el dispositivo.
 * La ruta es determinística (`documentos/audioguias/<lugarId>.<ext>`), por lo
 * que se conserva entre reinicios de la app.
 */
export async function consultarDescargaAudioguia(
  lugarId: IdLugar,
  url: string,
): Promise<Result<EstadoAudioguia>> {
  try {
    if (Platform.OS === 'web') {
      return { success: true, data: { descargada: false, uri: null } };
    }
    const archivo = obtenerArchivo(lugarId, url);
    if (!archivo.exists) {
      return { success: true, data: { descargada: false, uri: null } };
    }
    if (archivo.size === 0) {
      archivo.delete();
      return { success: true, data: { descargada: false, uri: null } };
    }
    return { success: true, data: { descargada: true, uri: archivo.uri } };
  } catch {
    return { success: false, error: 'No se pudo verificar la audioguía descargada.' };
  }
}

/**
 * Descarga la audioguía con la API nueva de `expo-file-system`
 * (`File.downloadFileAsync` + `Paths.document`) para poder reproducirla sin red.
 */
export async function descargarAudioguia(
  lugarId: IdLugar,
  url: string,
  alProgresar?: (progreso: ProgresoDescargaAudioguia) => void,
): Promise<Result<EstadoAudioguia>> {
  if (!esUrlValida(url)) {
    return { success: false, error: 'La audioguía no tiene una dirección válida.' };
  }
  if (Platform.OS === 'web') {
    return {
      success: false,
      error: 'La descarga para uso sin conexión no está disponible en la versión web.',
    };
  }

  try {
    const archivo = obtenerArchivo(lugarId, url);
    if (archivo.exists && archivo.size !== 0) {
      return { success: true, data: { descargada: true, uri: archivo.uri } };
    }
    if (archivo.exists) {
      archivo.delete();
    }

    const descargado = await File.downloadFileAsync(url, archivo, {
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (alProgresar === undefined) {
          return;
        }
        alProgresar({
          bytesEscritos: bytesWritten,
          bytesTotales: totalBytes,
          porcentaje:
            totalBytes > 0
              ? Math.min(100, Math.round((bytesWritten / totalBytes) * 100))
              : null,
        });
      },
    });

    if (!descargado.exists || descargado.size === 0) {
      if (descargado.exists) {
        descargado.delete();
      }
      return { success: false, error: errorDescarga() };
    }

    return {
      success: true,
      data: { descargada: true, uri: descargado.uri },
    };
  } catch {
    // En Android una descarga fallida puede dejar un archivo parcial.
    try {
      const parcial = obtenerArchivo(lugarId, url);
      if (parcial.exists) {
        parcial.delete();
      }
    } catch {
      // Si tampoco se puede limpiar, el error amigable ya cubre el caso.
    }
    return { success: false, error: errorDescarga() };
  }
}

/** Borra la copia local para liberar espacio en el dispositivo. */
export async function eliminarDescargaAudioguia(
  lugarId: IdLugar,
  url: string,
): Promise<Result<EstadoAudioguia>> {
  try {
    if (Platform.OS === 'web') {
      return { success: true, data: { descargada: false, uri: null } };
    }
    const archivo = obtenerArchivo(lugarId, url);
    if (archivo.exists) {
      archivo.delete();
    }
    return { success: true, data: { descargada: false, uri: null } };
  } catch {
    return { success: false, error: 'No se pudo eliminar la audioguía descargada.' };
  }
}
