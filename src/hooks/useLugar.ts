import { useQuery } from '@tanstack/react-query';

import { lugarKeys } from '@/queries/lugarKeys';
import { obtenerLugar } from '@/servicios/lugares';
import type { IdLugar } from '@/tipos/lugar';

export function useLugar(id: IdLugar | undefined) {
  return useQuery({
    queryKey: lugarKeys.detalle(id ?? 'lug-sin-definir'),
    enabled: id !== undefined,
    queryFn: async () => {
      const resultado = await obtenerLugar(id as IdLugar);
      if (resultado.success) {
        return resultado.data;
      }
      throw new Error(resultado.error);
    },
  });
}