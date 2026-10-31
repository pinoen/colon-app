import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import {
  consultarDescargaAudioguia,
  descargarAudioguia,
  eliminarDescargaAudioguia,
  type ProgresoDescargaAudioguia,
} from '@/servicios/audioguia';
import type { Audioguia, IdLugar } from '@/tipos/lugar';

export const audioguiaKeys = {
  all: ['audioguia'] as const,
  detalle: (lugarId: IdLugar, url: string | null) =>
    ['audioguia', lugarId, url] as const,
};

/**
 * Estado y acciones de la audioguía de un lugar. La fuente de reproducción es
 * el archivo local cuando ya fue descargado; si no, la URL remota.
 */
export function useAudioguia(lugarId: IdLugar, audioguia: Audioguia | null) {
  const queryClient = useQueryClient();
  const url = audioguia?.url ?? null;
  const [progreso, setProgreso] = useState<ProgresoDescargaAudioguia | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  const estadoQuery = useQuery({
    queryKey: audioguiaKeys.detalle(lugarId, url),
    enabled: url !== null,
    queryFn: async () => {
      const resultado = await consultarDescargaAudioguia(lugarId, url as string);
      if (!resultado.success) {
        throw new Error(resultado.error);
      }
      return resultado.data;
    },
  });

  const invalidar = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: audioguiaKeys.detalle(lugarId, url),
    });
  }, [lugarId, queryClient, url]);

  const descarga = useMutation({
    mutationFn: async () => {
      if (url === null) {
        throw new Error('Este lugar no tiene audioguía.');
      }
      setErrorDescarga(null);
      setProgreso(null);
      const resultado = await descargarAudioguia(lugarId, url, setProgreso);
      if (!resultado.success) {
        throw new Error(resultado.error);
      }
      return resultado.data;
    },
    onSuccess: async () => {
      setProgreso(null);
      await invalidar();
    },
    onError: (error: Error) => {
      setProgreso(null);
      setErrorDescarga(error.message);
      void invalidar();
    },
  });

  const eliminacion = useMutation({
    mutationFn: async () => {
      if (url === null) {
        throw new Error('Este lugar no tiene audioguía.');
      }
      const resultado = await eliminarDescargaAudioguia(lugarId, url);
      if (!resultado.success) {
        throw new Error(resultado.error);
      }
      return resultado.data;
    },
    onSuccess: async () => {
      setErrorDescarga(null);
      await invalidar();
    },
    onError: (error: Error) => {
      setErrorDescarga(error.message);
    },
  });

  const estado = estadoQuery.data;
  const uriLocal = estado?.descargada === true ? estado.uri : null;
  const descargada = uriLocal !== null;

  return {
    /** Ruta local si ya está descargada; si no, la URL remota. */
    fuente: uriLocal ?? url,
    descargada,
    descargando: descarga.isPending,
    eliminando: eliminacion.isPending,
    progreso,
    errorDescarga:
      errorDescarga ??
      (estadoQuery.isError
        ? 'No se pudo verificar la audioguía descargada.'
        : null),
    descargar: () => {
      if (url !== null && !descarga.isPending) {
        descarga.mutate();
      }
    },
    eliminar: () => {
      if (url !== null && !eliminacion.isPending) {
        eliminacion.mutate();
      }
    },
  };
}
