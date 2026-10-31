import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
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
  porUsuario: (usuarioId: string | 'usr-local') =>
    ['visitas', 'usuario', usuarioId] as const,
  detalle: (id: IdVisita, usuarioId: string | 'usr-local') =>
    ['visitas', 'detalle', usuarioId, id] as const,
};

export type EntradaRegistroVisita =
  | { origen: 'qr'; codigoQr: string }
  | { origen: 'gps'; radioMetros?: number }
  | { origen: 'manual'; lugarId: IdLugar };

export type { CambiosVisita };

export function useVisitas() {
  const { usuario } = useAuth();
  return useQuery({
    queryKey: visitaKeys.porUsuario(usuario?.id ?? 'usr-local'),
    queryFn: async () => {
      const resultado = await listarVisitas(usuario);
      if (resultado.success) {
        return resultado.data;
      }
      throw new Error(resultado.error);
    },
  });
}

export function useVisita(id: IdVisita | undefined) {
  const { usuario } = useAuth();
  return useQuery({
    queryKey: visitaKeys.detalle(
      id ?? 'vis-sin-definir',
      usuario?.id ?? 'usr-local',
    ),
    enabled: id !== undefined,
    queryFn: async () => {
      const resultado = await obtenerVisita(id as IdVisita, usuario);
      if (resultado.success) {
        return resultado.data;
      }
      throw new Error(resultado.error);
    },
  });
}

export function useRegistrarVisita() {
  const cliente = useQueryClient();
  const { usuario } = useAuth();

  return useMutation({
    mutationFn: async (entrada: EntradaRegistroVisita): Promise<Visita> => {
      const resultado =
        entrada.origen === 'qr'
          ? await registrarVisitaPorQr(entrada.codigoQr, usuario)
          : entrada.origen === 'gps'
            ? await registrarVisitaPorProximidad(entrada.radioMetros, usuario)
            : await registrarVisitaManual(entrada.lugarId, usuario);

      if (!resultado.success) {
        throw new Error(resultado.error);
      }

      return resultado.data;
    },
    onSettled: () => {
      void cliente.invalidateQueries({ queryKey: visitaKeys.all });
    },
  });
}

export function useActualizarVisita(id: IdVisita | undefined) {
  const cliente = useQueryClient();
  const { usuario } = useAuth();

  return useMutation({
    mutationFn: async (cambios: CambiosVisita): Promise<Visita> => {
      if (id === undefined) {
        throw new Error('No encontramos esa visita.');
      }

      const resultado = await actualizarVisita(id, cambios, usuario);
      if (!resultado.success) {
        throw new Error(resultado.error);
      }

      return resultado.data;
    },
    onSettled: () => {
      void cliente.invalidateQueries({ queryKey: visitaKeys.all });
    },
  });
}
