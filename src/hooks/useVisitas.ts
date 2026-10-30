import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listarVisitas,
  registrarVisitaManual,
  registrarVisitaPorProximidad,
  registrarVisitaPorQr,
} from '@/servicios/visitas';
import type { IdLugar } from '@/tipos/lugar';
import type { Visita } from '@/tipos/visita';

export const visitaKeys = {
  all: ['visitas'] as const,
};

export type EntradaRegistroVisita =
  | { origen: 'qr'; codigoQr: string }
  | { origen: 'gps'; radioMetros?: number }
  | { origen: 'manual'; lugarId: IdLugar };

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
