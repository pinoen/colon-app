import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  alternarFavorito,
  listarFavoritos,
  type ResultadoAlternarFavorito,
} from '@/servicios/favoritos';
import type { Favorito } from '@/tipos/favorito';
import type { IdLugar } from '@/tipos/lugar';
import type { IdUsuario, Usuario } from '@/tipos/usuario';

export const favoritoKeys = {
  all: ['favoritos'] as const,
  porUsuario: (usuarioId: IdUsuario | 'usr-anonimo') =>
    ['favoritos', 'usuario', usuarioId] as const,
};

export function useFavoritos(usuario: Usuario | null) {
  return useQuery({
    queryKey: favoritoKeys.porUsuario(usuario?.id ?? 'usr-anonimo'),
    enabled: usuario !== null,
    queryFn: async (): Promise<Favorito[]> => {
      const resultado = await listarFavoritos(usuario as Usuario);
      if (resultado.success) {
        return resultado.data;
      }
      throw new Error(resultado.error);
    },
  });
}

export function useAlternarFavorito(usuario: Usuario | null) {
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: async (
      lugarId: IdLugar,
    ): Promise<ResultadoAlternarFavorito> => {
      if (usuario === null) {
        throw new Error('Iniciá sesión para guardar tus favoritos.');
      }

      const resultado = await alternarFavorito(usuario, lugarId);
      if (!resultado.success) {
        throw new Error(resultado.error);
      }
      return resultado.data;
    },
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: favoritoKeys.all });
    },
  });
}
