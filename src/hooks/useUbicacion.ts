import { useQuery } from '@tanstack/react-query';

import { obtenerUbicacionActual } from '@/servicios/ubicacion';

const ubicacionKeys = {
  actual: ['ubicacion', 'actual'] as const,
};

export function useUbicacion() {
  return useQuery({
    queryKey: ubicacionKeys.actual,
    queryFn: async () => {
      const resultado = await obtenerUbicacionActual();
      if (resultado.success) {
        return resultado.data;
      }
      throw new Error(resultado.error);
    },
    staleTime: Infinity,
  });
}