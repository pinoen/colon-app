import type { IdCategoria } from '@/tipos/categoria';

export const categoriaKeys = {
  all: ['categorias'] as const,
  listar: () => ['categorias', 'lista'] as const,
  detalle: (id: IdCategoria) => ['categorias', 'detalle', id] as const,
};