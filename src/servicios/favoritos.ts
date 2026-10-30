import { categoriasMock } from '@/mocks/categorias';
import { lugaresMock } from '@/mocks/lugares';
import { abrirBaseDatos, guardarLugar } from '@/servicios/baseDatos';
import type { Result } from '@/tipos/api';
import type { Favorito, IdFavorito } from '@/tipos/favorito';
import type { IdLugar, Lugar } from '@/tipos/lugar';
import type { IdUsuario, Usuario } from '@/tipos/usuario';

interface FilaFavorito {
  id: IdFavorito;
  usuarioId: IdUsuario;
  lugarId: IdLugar;
  creadoEn: string;
}

export interface ResultadoAlternarFavorito {
  esFavorito: boolean;
  favorito: Favorito | null;
}

const ERROR_LECTURA =
  'No pudimos leer tus favoritos. Intentá de nuevo.';
const ERROR_GUARDADO =
  'No pudimos guardar el favorito en este dispositivo. Intentá de nuevo.';
const ERROR_QUITAR =
  'No pudimos quitar el favorito. Intentá de nuevo.';
const ERROR_LUGAR = 'No encontramos ese lugar o ya no está disponible.';

function generarIdFavorito(): IdFavorito {
  const marca = Date.now().toString(36);
  const azar = Math.random().toString(36).slice(2, 8);
  return `fav-${marca}${azar}`;
}

function aFavorito(fila: FilaFavorito): Favorito {
  return {
    id: fila.id,
    usuarioId: fila.usuarioId,
    lugarId: fila.lugarId,
    creadoEn: fila.creadoEn,
  };
}

function buscarLugarActivo(id: IdLugar): Lugar | null {
  const lugar = lugaresMock.find((candidato) => candidato.id === id);
  return lugar !== undefined && lugar.activo ? lugar : null;
}

/**
 * Los favoritos referencian usuarios y lugares por FK en SQLite. Se cachean
 * las filas mínimas para que el guardado funcione aunque el catálogo todavía
 * no esté precargado (T14).
 */
async function asegurarReferencias(
  usuario: Usuario,
  lugar: Lugar,
): Promise<void> {
  const base = await abrirBaseDatos();
  const categoria = categoriasMock.find(
    (candidata) => candidata.id === lugar.categoriaId,
  );

  if (categoria !== undefined) {
    await base.runAsync(
      `INSERT INTO categorias (id, nombre, icono, color, orden, actualizadoEn)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         nombre = excluded.nombre,
         icono = excluded.icono,
         color = excluded.color,
         orden = excluded.orden,
         actualizadoEn = excluded.actualizadoEn`,
      [
        categoria.id,
        categoria.nombre,
        categoria.icono,
        categoria.color,
        categoria.orden,
        lugar.actualizadoEn,
      ],
    );
  }

  await guardarLugar(lugar);

  await base.runAsync(
    `INSERT INTO usuarios (id, nombre, email, avatarUrl, creadoEn, preferencias)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       nombre = excluded.nombre,
       email = excluded.email,
       avatarUrl = excluded.avatarUrl,
       preferencias = excluded.preferencias`,
    [
      usuario.id,
      usuario.nombre,
      usuario.email,
      usuario.avatarUrl,
      usuario.creadoEn,
      JSON.stringify(usuario.preferencias),
    ],
  );
}

export async function listarFavoritos(
  usuarioId: IdUsuario,
): Promise<Result<Favorito[]>> {
  try {
    const base = await abrirBaseDatos();
    const filas = await base.getAllAsync<FilaFavorito>(
      'SELECT * FROM favoritos WHERE usuarioId = ? ORDER BY creadoEn DESC',
      [usuarioId],
    );
    return { success: true, data: filas.map(aFavorito) };
  } catch {
    return { success: false, error: ERROR_LECTURA };
  }
}

export async function esFavorito(
  usuarioId: IdUsuario,
  lugarId: IdLugar,
): Promise<Result<boolean>> {
  try {
    const base = await abrirBaseDatos();
    const fila = await base.getFirstAsync<{ id: string }>(
      'SELECT id FROM favoritos WHERE usuarioId = ? AND lugarId = ?',
      [usuarioId, lugarId],
    );
    return { success: true, data: fila !== null };
  } catch {
    return { success: false, error: ERROR_LECTURA };
  }
}

export async function agregarFavorito(
  usuario: Usuario,
  lugarId: IdLugar,
): Promise<Result<Favorito>> {
  const lugar = buscarLugarActivo(lugarId);
  if (lugar === null) {
    return { success: false, error: ERROR_LUGAR };
  }

  try {
    await asegurarReferencias(usuario, lugar);

    const base = await abrirBaseDatos();
    const existente = await base.getFirstAsync<FilaFavorito>(
      'SELECT * FROM favoritos WHERE usuarioId = ? AND lugarId = ?',
      [usuario.id, lugarId],
    );
    if (existente !== null) {
      return { success: true, data: aFavorito(existente) };
    }

    const favorito: Favorito = {
      id: generarIdFavorito(),
      usuarioId: usuario.id,
      lugarId,
      creadoEn: new Date().toISOString(),
    };

    await base.runAsync(
      `INSERT INTO favoritos (id, usuarioId, lugarId, creadoEn)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(usuarioId, lugarId) DO NOTHING`,
      [favorito.id, favorito.usuarioId, favorito.lugarId, favorito.creadoEn],
    );

    const guardado = await base.getFirstAsync<FilaFavorito>(
      'SELECT * FROM favoritos WHERE usuarioId = ? AND lugarId = ?',
      [usuario.id, lugarId],
    );

    return guardado === null
      ? { success: false, error: ERROR_GUARDADO }
      : { success: true, data: aFavorito(guardado) };
  } catch {
    return { success: false, error: ERROR_GUARDADO };
  }
}

export async function quitarFavorito(
  usuarioId: IdUsuario,
  lugarId: IdLugar,
): Promise<Result<null>> {
  try {
    const base = await abrirBaseDatos();
    await base.runAsync(
      'DELETE FROM favoritos WHERE usuarioId = ? AND lugarId = ?',
      [usuarioId, lugarId],
    );
    return { success: true, data: null };
  } catch {
    return { success: false, error: ERROR_QUITAR };
  }
}

/**
 * Alterna el favorito en una sola operación para que el botón del detalle no
 * dependa de un estado local que pueda quedar desincronizado.
 */
export async function alternarFavorito(
  usuario: Usuario,
  lugarId: IdLugar,
): Promise<Result<ResultadoAlternarFavorito>> {
  const actual = await esFavorito(usuario.id, lugarId);
  if (!actual.success) {
    return actual;
  }

  if (actual.data) {
    const quitado = await quitarFavorito(usuario.id, lugarId);
    if (!quitado.success) {
      return quitado;
    }
    return { success: true, data: { esFavorito: false, favorito: null } };
  }

  const agregado = await agregarFavorito(usuario, lugarId);
  if (!agregado.success) {
    return agregado;
  }

  return {
    success: true,
    data: { esFavorito: true, favorito: agregado.data },
  };
}
