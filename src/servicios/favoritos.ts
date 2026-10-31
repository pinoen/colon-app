import Storage from 'expo-sqlite/kv-store';

import {
  abrirBaseDatos,
  guardarLugar,
  obtenerLugar as obtenerLugarCache,
} from '@/servicios/baseDatos';
import {
  peticion,
  peticionLista,
  puedeUsarCache,
} from '@/servicios/clienteApi';
import { obtenerLugar as obtenerLugarServicio } from '@/servicios/lugares';
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

interface FilaCola {
  id: string;
  entidad: string;
  accion: string;
  payload: string;
}

interface OperacionFavorito {
  usuarioId: IdUsuario;
  lugarId: IdLugar;
  favorito: Favorito | null;
}

interface OperacionPendiente {
  id: string;
  accion: 'marcar' | 'desmarcar';
  payload: OperacionFavorito;
}

export interface ResultadoAlternarFavorito {
  esFavorito: boolean;
  favorito: Favorito | null;
}

const ERROR_LECTURA = 'No pudimos leer tus favoritos. Intentá de nuevo.';
const ERROR_GUARDADO =
  'No pudimos guardar el favorito en este dispositivo. Intentá de nuevo.';
const ERROR_QUITAR = 'No pudimos quitar el favorito. Intentá de nuevo.';
const ERROR_LUGAR = 'No encontramos ese lugar o ya no está disponible.';
const CLAVE_SNAPSHOT_FAVORITOS = 'colon.favoritos.snapshot';

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

function idOperacion(usuarioId: IdUsuario, lugarId: IdLugar): string {
  return `favorito:${usuarioId}:${lugarId}`;
}

async function asegurarUsuario(usuario: Usuario): Promise<void> {
  const base = await abrirBaseDatos();
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

async function asegurarReferencias(
  usuario: Usuario,
  lugar: Lugar,
): Promise<void> {
  await guardarLugar(lugar);
  await asegurarUsuario(usuario);
}

async function buscarLugarActivo(id: IdLugar): Promise<Lugar | null> {
  try {
    const lugar = await obtenerLugarCache(id);
    return lugar !== null && lugar.activo ? lugar : null;
  } catch {
    return null;
  }
}

async function buscarLugarParaCache(id: IdLugar): Promise<Lugar | null> {
  try {
    const cacheado = await obtenerLugarCache(id);
    if (cacheado !== null) {
      return cacheado;
    }
    const resultado = await obtenerLugarServicio(id);
    return resultado.success ? resultado.data : null;
  } catch {
    return null;
  }
}

async function insertarFavoritoLocal(
  usuario: Usuario,
  favorito: Favorito,
): Promise<void> {
  const lugar = await obtenerLugarCache(favorito.lugarId);
  if (lugar === null) {
    throw new Error(ERROR_LUGAR);
  }
  await asegurarReferencias(usuario, lugar);

  const base = await abrirBaseDatos();
  await base.runAsync(
    `INSERT INTO favoritos (id, usuarioId, lugarId, creadoEn)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(usuarioId, lugarId) DO UPDATE SET
       id = excluded.id,
       creadoEn = excluded.creadoEn`,
    [favorito.id, favorito.usuarioId, favorito.lugarId, favorito.creadoEn],
  );
}

async function leerPendientes(
  usuarioId: IdUsuario,
): Promise<OperacionPendiente[]> {
  const base = await abrirBaseDatos();
  const filas = await base.getAllAsync<FilaCola>(
    `SELECT id, entidad, accion, payload
     FROM cola_sincronizacion
     WHERE entidad = 'favorito'
     ORDER BY creadoEn ASC`,
  );

  const pendientes: OperacionPendiente[] = [];
  for (const fila of filas) {
    if (fila.accion !== 'marcar' && fila.accion !== 'desmarcar') {
      continue;
    }
    try {
      const payload: unknown = JSON.parse(fila.payload);
      if (
        typeof payload !== 'object' ||
        payload === null ||
        (payload as Record<string, unknown>).usuarioId !== usuarioId ||
        typeof (payload as Record<string, unknown>).lugarId !== 'string'
      ) {
        continue;
      }
      pendientes.push({
        id: fila.id,
        accion: fila.accion,
        payload: payload as OperacionFavorito,
      });
    } catch {
      // Una operación corrupta no evita procesar el resto de la cola.
    }
  }
  return pendientes;
}

async function guardarPendiente(
  accion: OperacionPendiente['accion'],
  payload: OperacionFavorito,
): Promise<void> {
  const base = await abrirBaseDatos();
  const id = idOperacion(payload.usuarioId, payload.lugarId);
  await base.runAsync(
    `INSERT INTO cola_sincronizacion (id, entidad, accion, payload, intentos, creadoEn)
     VALUES (?, 'favorito', ?, ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET
       entidad = excluded.entidad,
       accion = excluded.accion,
       payload = excluded.payload,
       intentos = 0,
       creadoEn = excluded.creadoEn`,
    [id, accion, JSON.stringify(payload), new Date().toISOString()],
  );
}

async function quitarPendiente(id: string): Promise<void> {
  const base = await abrirBaseDatos();
  await base.runAsync('DELETE FROM cola_sincronizacion WHERE id = ?', [id]);
}

async function sincronizarPendientes(
  usuario: Usuario,
): Promise<Result<null>> {
  const pendientes = await leerPendientes(usuario.id);
  for (const pendiente of pendientes) {
    const { lugarId } = pendiente.payload;
    const resultado =
      pendiente.accion === 'marcar'
        ? await peticion<Favorito>({
            method: 'PUT',
            url: `/yo/favoritos/${encodeURIComponent(lugarId)}`,
          })
        : await peticion<null>({
            method: 'DELETE',
            url: `/yo/favoritos/${encodeURIComponent(lugarId)}`,
          });

    if (!resultado.success) {
      return resultado;
    }
    await quitarPendiente(pendiente.id);
  }
  return { success: true, data: null };
}

function combinarFavoritos(
  remotos: Favorito[],
  pendientes: OperacionPendiente[],
): Favorito[] {
  const porLugar = new Map(
    remotos.map((favorito) => [favorito.lugarId, favorito]),
  );
  for (const pendiente of pendientes) {
    if (pendiente.accion === 'desmarcar') {
      porLugar.delete(pendiente.payload.lugarId);
    } else if (
      pendiente.payload.favorito !== null &&
      !porLugar.has(pendiente.payload.lugarId)
    ) {
      porLugar.set(pendiente.payload.lugarId, pendiente.payload.favorito);
    }
  }
  return [...porLugar.values()].sort(
    (a, b) => Date.parse(b.creadoEn) - Date.parse(a.creadoEn),
  );
}

async function cachearFavoritos(
  usuario: Usuario,
  favoritos: Favorito[],
): Promise<void> {
  const cacheables: Favorito[] = [];
  let cacheCompleta = true;
  for (const favorito of favoritos) {
    const lugar = await buscarLugarParaCache(favorito.lugarId);
    if (lugar === null) {
      cacheCompleta = false;
      continue;
    }
    await asegurarReferencias(usuario, lugar);
    cacheables.push(favorito);
  }

  if (!cacheCompleta) {
    return;
  }

  const base = await abrirBaseDatos();
  await base.withTransactionAsync(async () => {
    await base.runAsync('DELETE FROM favoritos WHERE usuarioId = ?', [
      usuario.id,
    ]);
    for (const favorito of cacheables) {
      await base.runAsync(
        `INSERT INTO favoritos (id, usuarioId, lugarId, creadoEn)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(usuarioId, lugarId) DO UPDATE SET
           id = excluded.id,
           creadoEn = excluded.creadoEn`,
        [favorito.id, favorito.usuarioId, favorito.lugarId, favorito.creadoEn],
      );
    }
  });

  try {
    await Storage.setItemAsync(CLAVE_SNAPSHOT_FAVORITOS, usuario.id);
  } catch {
    // SQLite sigue siendo la fuente local; el marcador sólo diferencia caché vacía de no cargada.
  }
}

async function obtenerFavoritosRemotos(): Promise<Result<Favorito[]>> {
  const favoritos: Favorito[] = [];
  let pagina = 1;

  while (true) {
    const respuesta = await peticionLista<Favorito>({
      method: 'GET',
      url: '/yo/favoritos',
      params: { pagina, porPagina: 100 },
    });
    if (!respuesta.success) {
      return respuesta;
    }
    favoritos.push(...respuesta.data.datos);
    if (
      favoritos.length >= respuesta.data.meta.total ||
      respuesta.data.datos.length === 0
    ) {
      return { success: true, data: favoritos };
    }
    pagina += 1;
  }
}

async function obtenerCacheLocal(
  usuarioId: IdUsuario,
  errorOriginal: Result<Favorito[]>,
): Promise<Result<Favorito[]>> {
  try {
    const base = await abrirBaseDatos();
    const filas = await base.getAllAsync<FilaFavorito>(
      'SELECT * FROM favoritos WHERE usuarioId = ? ORDER BY creadoEn DESC',
      [usuarioId],
    );
    const pendientes = await leerPendientes(usuarioId);
    const snapshot =
      (await Storage.getItemAsync(CLAVE_SNAPSHOT_FAVORITOS)) === usuarioId;
    if (filas.length > 0 || pendientes.length > 0 || snapshot) {
      return { success: true, data: filas.map(aFavorito) };
    }
  } catch {
    // Se devuelve el error de red si la copia local tampoco está disponible.
  }
  return errorOriginal;
}

export async function listarFavoritos(
  usuario: Usuario,
): Promise<Result<Favorito[]>> {
  try {
    await asegurarUsuario(usuario);
    const sincronizacion = await sincronizarPendientes(usuario);
    if (!sincronizacion.success) {
      const errorSincronizacion: Result<Favorito[]> = {
        success: false,
        error: sincronizacion.error,
        codigo: sincronizacion.codigo,
        estado: sincronizacion.estado,
      };
      return puedeUsarCache(sincronizacion)
        ? obtenerCacheLocal(usuario.id, errorSincronizacion)
        : errorSincronizacion;
    }

    const remotos = await obtenerFavoritosRemotos();
    if (!remotos.success) {
      return puedeUsarCache(remotos)
        ? obtenerCacheLocal(usuario.id, remotos)
        : remotos;
    }

    const pendientes = await leerPendientes(usuario.id);
    const favoritos = combinarFavoritos(remotos.data, pendientes);
    try {
      await cachearFavoritos(usuario, favoritos);
    } catch {
      // Los datos remotos igual se muestran aunque falle la escritura local.
    }
    return { success: true, data: favoritos };
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
  const lugar = await buscarLugarActivo(lugarId);
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
    await insertarFavoritoLocal(usuario, favorito);
    const operacion: OperacionFavorito = {
      usuarioId: usuario.id,
      lugarId,
      favorito,
    };
    await guardarPendiente('marcar', operacion);

    const remoto = await peticion<Favorito>({
      method: 'PUT',
      url: `/yo/favoritos/${encodeURIComponent(lugarId)}`,
    });
    if (remoto.success) {
      await insertarFavoritoLocal(usuario, remoto.data);
      await quitarPendiente(idOperacion(usuario.id, lugarId));
      return remoto;
    }

    if (puedeUsarCache(remoto)) {
      return { success: true, data: favorito };
    }

    await quitarPendiente(idOperacion(usuario.id, lugarId));
    await base.runAsync(
      'DELETE FROM favoritos WHERE usuarioId = ? AND lugarId = ?',
      [usuario.id, lugarId],
    );
    return remoto;
  } catch {
    return { success: false, error: ERROR_GUARDADO };
  }
}

export async function quitarFavorito(
  usuario: Usuario,
  lugarId: IdLugar,
): Promise<Result<null>> {
  try {
    const base = await abrirBaseDatos();
    const fila = await base.getFirstAsync<FilaFavorito>(
      'SELECT * FROM favoritos WHERE usuarioId = ? AND lugarId = ?',
      [usuario.id, lugarId],
    );
    await guardarPendiente('desmarcar', {
      usuarioId: usuario.id,
      lugarId,
      favorito: null,
    });
    await base.runAsync(
      'DELETE FROM favoritos WHERE usuarioId = ? AND lugarId = ?',
      [usuario.id, lugarId],
    );

    const remoto = await peticion<null>({
      method: 'DELETE',
      url: `/yo/favoritos/${encodeURIComponent(lugarId)}`,
    });
    if (remoto.success) {
      await quitarPendiente(idOperacion(usuario.id, lugarId));
      return { success: true, data: null };
    }

    if (puedeUsarCache(remoto)) {
      return { success: true, data: null };
    }

    await quitarPendiente(idOperacion(usuario.id, lugarId));
    if (fila !== null) {
      await insertarFavoritoLocal(usuario, aFavorito(fila));
    }
    return remoto;
  } catch {
    return { success: false, error: ERROR_QUITAR };
  }
}

/** Alterna el favorito usando el estado local ya hidratado desde la API. */
export async function alternarFavorito(
  usuario: Usuario,
  lugarId: IdLugar,
): Promise<Result<ResultadoAlternarFavorito>> {
  const actual = await esFavorito(usuario.id, lugarId);
  if (!actual.success) {
    return actual;
  }

  if (actual.data) {
    const quitado = await quitarFavorito(usuario, lugarId);
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
