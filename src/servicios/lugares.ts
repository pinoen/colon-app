import {
  guardarLugares,
  obtenerCategorias,
  obtenerLugar as obtenerLugarCache,
  obtenerLugares,
} from '@/servicios/baseDatos';
import { listarCategorias } from '@/servicios/categorias';
import {
  peticion,
  peticionLista,
  puedeUsarCache,
} from '@/servicios/clienteApi';
import type { FiltrosLugar } from '@/queries/lugarKeys';
import type { Result } from '@/tipos/api';
import type { IdLugar, Lugar } from '@/tipos/lugar';

const lugaresEnVuelo = new Map<string, Promise<Result<Lugar[]>>>();

function claveFiltros(filtros: FiltrosLugar): string {
  return `${filtros.categoriaId ?? ''}|${filtros.busqueda?.trim() ?? ''}`;
}

function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function filtrarLugares(lugares: Lugar[], filtros: FiltrosLugar): Lugar[] {
  const busqueda = normalizarTexto(filtros.busqueda?.trim() ?? '');

  return lugares
    .filter((lugar) => {
      const coincideCategoria =
        filtros.categoriaId === undefined ||
        lugar.categoriaId === filtros.categoriaId;
      const coincideBusqueda =
        busqueda === '' || normalizarTexto(lugar.nombre).includes(busqueda);
      return lugar.activo && coincideCategoria && coincideBusqueda;
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

async function asegurarCategoriasParaLugares(lugares: Lugar[]): Promise<void> {
  if (lugares.length === 0) {
    return;
  }

  try {
    const existentes = new Set(
      (await obtenerCategorias()).map((categoria) => categoria.id),
    );
    const faltaAlguna = lugares.some(
      (lugar) => !existentes.has(lugar.categoriaId),
    );
    if (faltaAlguna) {
      await listarCategorias();
    }
  } catch {
    // El guardado de lugares es best-effort: si falla la FK, no rompe la UI.
  }
}

async function cargarLugares(
  filtros: FiltrosLugar,
): Promise<Result<Lugar[]>> {
  const params: Record<string, string | number> = { porPagina: 500 };
  const busqueda = filtros.busqueda?.trim();
  if (busqueda !== undefined && busqueda !== '') {
    params.q = busqueda;
  }
  if (filtros.categoriaId !== undefined) {
    params.categoriaId = filtros.categoriaId;
  }

  const respuesta = await peticionLista<Lugar>({
    method: 'GET',
    url: '/lugares',
    params,
  });

  if (respuesta.success) {
    await asegurarCategoriasParaLugares(respuesta.data.datos);
    try {
      await guardarLugares(respuesta.data.datos);
    } catch {
      // La respuesta sigue siendo válida aunque no se pueda cachear.
    }
    return { success: true, data: respuesta.data.datos };
  }

  if (puedeUsarCache(respuesta)) {
    try {
      const cacheados = await obtenerLugares();
      if (cacheados.length > 0) {
        return { success: true, data: filtrarLugares(cacheados, filtros) };
      }
    } catch {
      // Si tampoco hay caché legible, se conserva el error original.
    }
  }

  return respuesta;
}

export function listarLugares(
  filtros: FiltrosLugar = {},
): Promise<Result<Lugar[]>> {
  const clave = claveFiltros(filtros);
  const enVuelo = lugaresEnVuelo.get(clave);
  if (enVuelo !== undefined) {
    return enVuelo;
  }

  const promesa = cargarLugares(filtros);
  lugaresEnVuelo.set(clave, promesa);
  void promesa.then(
    () => {
      if (lugaresEnVuelo.get(clave) === promesa) {
        lugaresEnVuelo.delete(clave);
      }
    },
    () => {
      if (lugaresEnVuelo.get(clave) === promesa) {
        lugaresEnVuelo.delete(clave);
      }
    },
  );
  return promesa;
}

export async function obtenerLugar(id: IdLugar): Promise<Result<Lugar>> {
  const respuesta = await peticion<Lugar>({
    method: 'GET',
    url: `/lugares/${encodeURIComponent(id)}`,
  });

  if (respuesta.success) {
    await asegurarCategoriasParaLugares([respuesta.data]);
    try {
      await guardarLugares([respuesta.data]);
    } catch {
      // La respuesta sigue siendo válida aunque no se pueda cachear.
    }
    return respuesta;
  }

  if (puedeUsarCache(respuesta)) {
    try {
      const cacheado = await obtenerLugarCache(id);
      if (cacheado !== null) {
        return { success: true, data: cacheado };
      }
    } catch {
      // Si tampoco hay caché legible, se conserva el error original.
    }
  }

  return respuesta;
}
