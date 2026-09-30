import { categoriasMock } from '@/mocks/categorias';
import type { Result } from '@/tipos/api';
import type { Categoria } from '@/tipos/categoria';

const demoraMock = () => new Promise((resolver) => setTimeout(resolver, 150));

export async function listarCategorias(): Promise<Result<Categoria[]>> {
  await demoraMock();
  return { success: true, data: categoriasMock };
}