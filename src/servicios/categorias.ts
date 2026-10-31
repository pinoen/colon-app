import { guardarCategorias, obtenerCategorias } from '@/servicios/baseDatos';
import { peticionLista, puedeUsarCache } from '@/servicios/clienteApi';
import type { Result } from '@/tipos/api';
import type { Categoria } from '@/tipos/categoria';

let categoriasEnVuelo: Promise<Result<Categoria[]>> | null = null;

async function cargarCategorias(): Promise<Result<Categoria[]>> {
  const respuesta = await peticionLista<Categoria>({
    method: 'GET',
    url: '/categorias',
    params: { porPagina: 100 },
  });

  if (respuesta.success) {
    try {
      await guardarCategorias(respuesta.data.datos);
    } catch {
      // La respuesta sigue siendo válida aunque no se pueda cachear.
    }
    return { success: true, data: respuesta.data.datos };
  }

  if (puedeUsarCache(respuesta)) {
    try {
      const cacheadas = await obtenerCategorias();
      if (cacheadas.length > 0) {
        return { success: true, data: cacheadas };
      }
    } catch {
      // Si tampoco hay caché legible, se conserva el error original.
    }
  }

  return respuesta;
}

export function listarCategorias(): Promise<Result<Categoria[]>> {
  if (categoriasEnVuelo !== null) {
    return categoriasEnVuelo;
  }

  const promesa = cargarCategorias();
  categoriasEnVuelo = promesa;
  void promesa.then(
    () => {
      if (categoriasEnVuelo === promesa) {
        categoriasEnVuelo = null;
      }
    },
    () => {
      if (categoriasEnVuelo === promesa) {
        categoriasEnVuelo = null;
      }
    },
  );
  return promesa;
}
