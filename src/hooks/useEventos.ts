import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { FiltrosEvento } from '@/queries/eventoKeys';
import { eventoKeys } from '@/queries/eventoKeys';
import {
  guardarEventoConRecordatorio,
  listarEventos,
  listarRecordatoriosEventos,
  quitarRecordatorioEvento,
} from '@/servicios/eventos';
import type { Evento, IdEvento } from '@/tipos/evento';

export const recordatorioEventoKeys = {
  all: ['eventos', 'recordatorios'] as const,
};

export function useEventos(filtros: FiltrosEvento = {}) {
  return useQuery({
    queryKey: eventoKeys.listar(filtros),
    queryFn: async () => {
      const resultado = await listarEventos(filtros);
      if (resultado.success) {
        return resultado.data;
      }
      throw new Error(resultado.error);
    },
  });
}

export function useRecordatoriosEventos() {
  return useQuery({
    queryKey: recordatorioEventoKeys.all,
    queryFn: async () => {
      const resultado = await listarRecordatoriosEventos();
      if (resultado.success) {
        return resultado.data;
      }
      throw new Error(resultado.error);
    },
  });
}

export function useGuardarEvento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (evento: Evento) => {
      const resultado = await guardarEventoConRecordatorio(evento);
      if (!resultado.success) {
        throw new Error(resultado.error);
      }
      return resultado.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: recordatorioEventoKeys.all,
      });
    },
  });
}

export function useQuitarRecordatorioEvento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventoId: IdEvento) => {
      const resultado = await quitarRecordatorioEvento(eventoId);
      if (!resultado.success) {
        throw new Error(resultado.error);
      }
      return resultado.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: recordatorioEventoKeys.all,
      });
    },
  });
}
