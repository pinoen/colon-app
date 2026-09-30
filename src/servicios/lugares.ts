import { lugaresMock } from '@/mocks/lugares';
import type { FiltrosLugar } from '@/queries/lugarKeys';
import type { Result } from '@/tipos/api';
import type { Lugar } from '@/tipos/lugar';

const demoraMock = () => new Promise((resolver) => setTimeout(resolver, 250));

export async function listarLugares(
  filtros: FiltrosLugar = {},
): Promise<Result<Lugar[]>> {
  await demoraMock();
  const busqueda = filtros.busqueda?.trim().toLowerCase() ?? '';
  const resultados = lugaresMock.filter((lugar) => {
    const coincideCategoria =
      filtros.categoriaId === undefined || lugar.categoriaId === filtros.categoriaId;
    const coincideBusqueda =
      busqueda === '' || lugar.nombre.toLowerCase().includes(busqueda);
    return lugar.activo && coincideCategoria && coincideBusqueda;
  });
  return { success: true, data: resultados };
}