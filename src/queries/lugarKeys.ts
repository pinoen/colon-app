import type { IdLugar } from '@/tipos/lugar';

export interface FiltrosLugar {
  categoriaId?: string;
  busqueda?: string;
}

export const lugarKeys = {
  all: ['lugares'] as const,
  listar: (filtros: FiltrosLugar = {}) => ['lugares', 'lista', filtros] as const,
  listarPorCategoria: (categoriaId: string) =>
    ['lugares', 'lista', { categoriaId }] as const,
  buscar: (texto: string) => ['lugares', 'lista', { busqueda: texto }] as const,
  detalle: (id: IdLugar) => ['lugares', 'detalle', id] as const,
};