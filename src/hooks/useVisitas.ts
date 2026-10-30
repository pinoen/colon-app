import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  actualizarVisita,
  listarVisitas,
  obtenerVisita,
  registrarVisitaManual,
  registrarVisitaPorProximidad,
  registrarVisitaPorQr,
  type CambiosVisita,
} from '@/servicios/visitas';
import type { IdLugar } from '@/tipos/lugar';
import type { IdVisita, Visita } from '@/tipos/visita';

export const visitaKeys = {
  all: ['visitas'] as const,
  detalle: (id: IdVisita) => ['visitas', 'detalle', id] as const,
};

export type EntradaRegistroVisita =
  | { origen: 'qr'; codigoQr: string }
  | { origen: 'gps'; radioMetros?: number }
  | { origen: 'manual'; lugarId: IdLugar };

export type { CambiosVisita };

export function useVisitas() {
  return useQuery({
    queryKey: visitaKeys.all,
    queryFn: async () => {
      const resultado = await listarVisitas();
      if (resultado.success) {
        return resultado.data;
      }
      throw new Error(resultado.error);
    },
  });
}

export function useVisita(id: IdVisita | undefined) {
  return useQuery({
    queryKey: visitaKeys.detalle(id ?? 'vis-sin-definir'),
    enabled: id !== undefined,
    queryFn: async () => {
      const resultado = await obtenerVisita(id as IdVisita);
      if (resultado.success) {
        return resultado.data;
      }
      throw new Error(resultado.error);
    },
  });
}

export function useRegistrarVisita() {
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: async (entrada: EntradaRegistroVisita): Promise<Visita> => {
      const resultado =
        entrada.origen === 'qr'
          ? await registrarVisitaPorQr(entrada.codigoQr)
          : entrada.origen === 'gps'
            ? await registrarVisitaPorProximidad(entrada.radioMetros)
            : await registrarVisitaManual(entrada.lugarId);

      if (!resultado.success) {
        throw new Error(resultado.error);
      }

      return resultado.data;
    },
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: visitaKeys.all });
    },
  });
}

export function useActualizarVisita(id: IdVisita | undefined) {
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: async (cambios: CambiosVisita): Promise<Visita> => {
      if (id === undefined) {
        throw new Error('No encontramos esa visita.');
      }

      const resultado = await actualizarVisita(id, cambios);
      if (!resultado.success) {
        throw new Error(resultado.error);
      }

      return resultado.data;
    },
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: visitaKeys.all });
    },
  });
}
