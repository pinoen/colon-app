import { useQuery } from '@tanstack/react-query';

import type { FiltrosLugar } from '@/queries/lugarKeys';
import { lugarKeys } from '@/queries/lugarKeys';
import { listarLugares } from '@/servicios/lugares';

export function useLugares(filtros: FiltrosLugar = {}) {
  return useQuery({
    queryKey: lugarKeys.listar(filtros),
    queryFn: async () => {
      const resultado = await listarLugares(filtros);
      if (resultado.success) {
        return resultado.data;
      }
      throw new Error(resultado.error);
    },
  });
}