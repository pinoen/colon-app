import Storage from 'expo-sqlite/kv-store';

import {
  abrirBaseDatos,
  guardarLugar,
  guardarUrlFotoSubidaVisita,
  guardarVisita,
  obtenerLugar as obtenerLugarCache,
  obtenerLugares,
  obtenerUrlFotoSubidaVisita,
  obtenerVisita as obtenerVisitaGuardada,
  obtenerVisitas,
} from '@/servicios/baseDatos';
import {
  peticion,
  peticionLista,
  puedeUsarCache,
  subirArchivo,
} from '@/servicios/clienteApi';
import { obtenerLugar as obtenerLugarServicio } from '@/servicios/lugares';
import { obtenerUbicacionActual } from '@/servicios/ubicacion';
import type { Result } from '@/tipos/api';
import type { Coordenadas, IdLugar, Lugar } from '@/tipos/lugar';
import type { IdUsuario, Usuario } from '@/tipos/usuario';
import type { IdVisita, OrigenVisita, Visita } from '@/tipos/visita';
import { distanciaMetros } from '@/utilidades/distancia';
import { parsearCodigoQr } from '@/utilidades/validacionQr';

/** Radio por defecto usado por la proximidad GPS (preferencia editable en T12). */
export const RADIO_PROXIMIDAD_METROS = 250;

/** Visitas creadas sin conexión o sin sesión se reasocian al iniciar sesión. */
export const ID_USUARIO_LOCAL: IdUsuario = 'usr-000';

const PREFERENCIAS_LOCAL = JSON.stringify({
  categoriasFavoritas: [],
  avisarProximidad: true,
  radioAvisoMetros: RADIO_PROXIMIDAD_METROS,
  tema: 'sistema',
});

const ERROR_GUARDADO =
  'No pudimos guardar la visita en este dispositivo. Intentá de nuevo.';
const ERROR_QR_INVALIDO =
  'El código QR no es válido o no pertenece a la Guía Turística de Colón.';
const ERROR_QR_NO_DISPONIBLE =
  'El lugar de este código QR no está disponible en este momento.';
const ERROR_SIN_UBICACION =
  'Necesitamos permiso de ubicación para registrar por proximidad. También podés registrar la visita de forma manual.';
const ERROR_FOTO_INVALIDA =
  'No pudimos guardar la foto elegida. Probá con otra imagen.';
const CLAVE_SNAPSHOT_VISITAS = 'colon.visitas.snapshot:';

interface FilaCola {
  id: string;
  entidad: string;
  accion: string;
  payload: string;
}

interface PayloadColaVisita {
  usuarioId: IdUsuario;
  visitaId: IdVisita;
  visita?: Visita;
  cambios?: CambiosVisita;
}

interface OperacionPendienteVisita {
  id: string;
  accion: 'crear' | 'actualizar';
  payload: PayloadColaVisita;
}

function generarIdVisita(): IdVisita {
  const marca = Date.now().toString(36);
  const azar = Math.random().toString(36).slice(2, 8);
  return `vis-${marca}${azar}`;
}

function idOperacionVisita(usuarioId: IdUsuario, visitaId: IdVisita): string {
  return `visita:${usuarioId}:${visitaId}`;
}

async function asegurarUsuario(usuario: Usuario | null): Promise<void> {
  const base = await abrirBaseDatos();
  if (usuario !== null) {
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
    return;
  }

  await base.runAsync(
    `INSERT INTO usuarios (id, nombre, email, avatarUrl, creadoEn, preferencias)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    [
      ID_USUARIO_LOCAL,
      'Visitante local',
      'visitante.local@colon.app',
      null,
      new Date().toISOString(),
      PREFERENCIAS_LOCAL,
    ],
  );
}

async function asegurarReferencias(
  lugar: Lugar,
  usuario: Usuario | null,
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

async function guardarPendienteCrear(visita: Visita): Promise<void> {
  const base = await abrirBaseDatos();
  const id = idOperacionVisita(visita.usuarioId, visita.id);
  const payload: PayloadColaVisita = {
    usuarioId: visita.usuarioId,
    visitaId: visita.id,
    visita,
  };
  await base.runAsync(
    `INSERT INTO cola_sincronizacion (id, entidad, accion, payload, intentos, creadoEn)
     VALUES (?, 'visita', 'crear', ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET
       entidad = 'visita',
       accion = 'crear',
       payload = excluded.payload,
       intentos = 0,
       creadoEn = excluded.creadoEn`,
    [id, JSON.stringify(payload), new Date().toISOString()],
  );
}

async function leerOperacion(
  usuarioId: IdUsuario,
  visitaId: IdVisita,
): Promise<OperacionPendienteVisita | null> {
  const base = await abrirBaseDatos();
  const fila = await base.getFirstAsync<FilaCola>(
    `SELECT id, entidad, accion, payload FROM cola_sincronizacion
     WHERE id = ? AND entidad = 'visita'`,
    [idOperacionVisita(usuarioId, visitaId)],
  );
  if (
    fila === null ||
    (fila.accion !== 'crear' && fila.accion !== 'actualizar')
  ) {
    return null;
  }
  try {
    const payload: unknown = JSON.parse(fila.payload);
    if (typeof payload !== 'object' || payload === null) {
      return null;
    }
    return {
      id: fila.id,
      accion: fila.accion,
      payload: payload as PayloadColaVisita,
    };
  } catch {
    return null;
  }
}

async function guardarPendienteActualizar(
  usuarioId: IdUsuario,
  visita: Visita,
  cambios: CambiosVisita,
): Promise<void> {
  const id = idOperacionVisita(usuarioId, visita.id);
  const existente = await leerOperacion(usuarioId, visita.id);
  const base = await abrirBaseDatos();

  if (existente?.accion === 'crear' && existente.payload.visita !== undefined) {
    const visitaPendiente: Visita = {
      ...existente.payload.visita,
      ...cambios,
      sincronizada: false,
    };
    const payload: PayloadColaVisita = {
      usuarioId,
      visitaId: visita.id,
      visita: visitaPendiente,
    };
    await base.runAsync(
      `UPDATE cola_sincronizacion SET payload = ?, intentos = 0, creadoEn = ?
       WHERE id = ?`,
      [JSON.stringify(payload), new Date().toISOString(), id],
    );
    return;
  }

  const cambiosPrevios = existente?.payload.cambios ?? {};
  const payload: PayloadColaVisita = {
    usuarioId,
    visitaId: visita.id,
    cambios: { ...cambiosPrevios, ...cambios },
  };
  await base.runAsync(
    `INSERT INTO cola_sincronizacion (id, entidad, accion, payload, intentos, creadoEn)
     VALUES (?, 'visita', 'actualizar', ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET
       entidad = 'visita',
       accion = 'actualizar',
       payload = excluded.payload,
       intentos = 0,
       creadoEn = excluded.creadoEn`,
    [id, JSON.stringify(payload), new Date().toISOString()],
  );
}

async function quitarPendienteVisita(id: string): Promise<void> {
  const base = await abrirBaseDatos();
  await base.runAsync('DELETE FROM cola_sincronizacion WHERE id = ?', [id]);
}

async function leerPendientesVisitas(
  usuarioId: IdUsuario,
): Promise<OperacionPendienteVisita[]> {
  const base = await abrirBaseDatos();
  const filas = await base.getAllAsync<FilaCola>(
    `SELECT id, entidad, accion, payload FROM cola_sincronizacion
     WHERE entidad = 'visita' ORDER BY creadoEn ASC`,
  );
  const pendientes: OperacionPendienteVisita[] = [];
  for (const fila of filas) {
    if (fila.accion !== 'crear' && fila.accion !== 'actualizar') {
      continue;
    }
    try {
      const payload: unknown = JSON.parse(fila.payload);
      if (
        typeof payload !== 'object' ||
        payload === null ||
        (payload as Record<string, unknown>).usuarioId !== usuarioId ||
        typeof (payload as Record<string, unknown>).visitaId !== 'string'
      ) {
        continue;
      }
      pendientes.push({
        id: fila.id,
        accion: fila.accion,
        payload: payload as PayloadColaVisita,
      });
    } catch {
      // Una fila corrupta no evita sincronizar las demás.
    }
  }
  return pendientes;
}

function archivoFoto(uri: string, visitaId: IdVisita): {
  nombre: string;
  mimeType: string;
} {
  const ruta = uri.split(/[?#]/, 1)[0] ?? uri;
  const extensionCruda = ruta.split('.').pop()?.toLowerCase();
  if (extensionCruda === 'png') {
    return { nombre: `${visitaId}.png`, mimeType: 'image/png' };
  }
  if (extensionCruda === 'webp') {
    return { nombre: `${visitaId}.webp`, mimeType: 'image/webp' };
  }
  return { nombre: `${visitaId}.jpg`, mimeType: 'image/jpeg' };
}

async function prepararUrlFoto(
  visita: Visita,
): Promise<Result<string | null>> {
  const uri = visita.fotoUri;
  if (uri === null || !uri.startsWith('file://')) {
    return { success: true, data: uri };
  }

  try {
    const cacheada = await obtenerUrlFotoSubidaVisita(visita.id);
    if (cacheada !== null) {
      return { success: true, data: cacheada };
    }

    const archivo = archivoFoto(uri, visita.id);
    const subida = await subirArchivo({ uri, ...archivo });
    if (!subida.success) {
      return subida;
    }
    await guardarUrlFotoSubidaVisita(visita.id, subida.data.url);
    return { success: true, data: subida.data.url };
  } catch {
    return {
      success: false,
      error: 'No pudimos subir la foto. Se conserva en el dispositivo para reintentar.',
    };
  }
}

function conservarFotoLocal(remota: Visita, local: Visita): Visita {
  return {
    ...remota,
    fotoUri:
      local.fotoUri?.startsWith('file://') === true && remota.fotoUri !== null
        ? local.fotoUri
        : remota.fotoUri,
    sincronizada: true,
  };
}

async function sincronizarOperacionVisita(
  usuario: Usuario,
  operacion: OperacionPendienteVisita,
): Promise<Result<Visita | null>> {
  const local = await obtenerVisitaGuardada(operacion.payload.visitaId);
  if (local === null) {
    await quitarPendienteVisita(operacion.id);
    return { success: true, data: null };
  }

  if (operacion.accion === 'crear') {
    const foto = await prepararUrlFoto(local);
    if (!foto.success) {
      return foto;
    }
    const datos = {
      id: local.id,
      lugarId: local.lugarId,
      fechaHora: local.fechaHora,
      origen: local.origen,
      fotoUri: foto.data,
      nota: local.nota,
    };
    const creada = await peticion<Visita>({
      method: 'POST',
      url: '/yo/visitas',
      data: datos,
    });
    if (!creada.success) {
      return creada;
    }

    let remota = creada.data;
    const cambiosPosteriores: { fotoUri?: string | null; nota?: string | null } = {};
    if (remota.fotoUri !== foto.data) {
      cambiosPosteriores.fotoUri = foto.data;
    }
    if (remota.nota !== local.nota) {
      cambiosPosteriores.nota = local.nota;
    }
    if (Object.keys(cambiosPosteriores).length > 0) {
      const actualizada = await peticion<Visita>({
        method: 'PATCH',
        url: `/yo/visitas/${encodeURIComponent(local.id)}`,
        data: cambiosPosteriores,
      });
      if (!actualizada.success) {
        return actualizada;
      }
      remota = actualizada.data;
    }

    const guardada = conservarFotoLocal(remota, local);
    await guardarVisita(guardada);
    await guardarUrlFotoSubidaVisita(local.id, null);
    await quitarPendienteVisita(operacion.id);
    return { success: true, data: guardada };
  }

  const cambios = operacion.payload.cambios ?? {};
  const cuerpo: CambiosVisita = {};
  if (Object.prototype.hasOwnProperty.call(cambios, 'fotoUri')) {
    if (cambios.fotoUri === null || cambios.fotoUri === undefined) {
      cuerpo.fotoUri = cambios.fotoUri;
    } else if (cambios.fotoUri.startsWith('file://')) {
      const foto = await prepararUrlFoto({ ...local, fotoUri: cambios.fotoUri });
      if (!foto.success) {
        return foto;
      }
      cuerpo.fotoUri = foto.data;
    } else {
      cuerpo.fotoUri = cambios.fotoUri;
    }
  }
  if (Object.prototype.hasOwnProperty.call(cambios, 'nota')) {
    cuerpo.nota = cambios.nota;
  }

  const actualizada = await peticion<Visita>({
    method: 'PATCH',
    url: `/yo/visitas/${encodeURIComponent(local.id)}`,
    data: cuerpo,
  });
  if (!actualizada.success) {
    return actualizada;
  }

  const guardada = conservarFotoLocal(actualizada.data, local);
  await guardarVisita(guardada);
  if (Object.prototype.hasOwnProperty.call(cambios, 'fotoUri')) {
    await guardarUrlFotoSubidaVisita(local.id, null);
  }
  await quitarPendienteVisita(operacion.id);
  return { success: true, data: guardada };
}

export async function sincronizarVisitaPendientePorId(
  usuario: Usuario,
  id: string,
): Promise<Result<null>> {
  const base = await abrirBaseDatos();
  const fila = await base.getFirstAsync<FilaCola>(
    `SELECT id, entidad, accion, payload FROM cola_sincronizacion
     WHERE id = ? AND entidad = 'visita'`,
    [id],
  );
  if (
    fila === null ||
    (fila.accion !== 'crear' && fila.accion !== 'actualizar')
  ) {
    return { success: true, data: null };
  }
  try {
    const payload: unknown = JSON.parse(fila.payload);
    if (
      typeof payload !== 'object' ||
      payload === null ||
      (payload as Record<string, unknown>).usuarioId !== usuario.id ||
      typeof (payload as Record<string, unknown>).visitaId !== 'string'
    ) {
      return { success: true, data: null };
    }
    const resultado = await sincronizarOperacionVisita(usuario, {
      id: fila.id,
      accion: fila.accion,
      payload: payload as PayloadColaVisita,
    });
    if (!resultado.success) {
      return resultado;
    }
    return { success: true, data: null };
  } catch {
    return {
      success: false,
      error: 'No pudimos procesar una visita pendiente.',
    };
  }
}

async function sincronizarVisitaPendiente(
  usuario: Usuario,
  visitaId: IdVisita,
): Promise<Result<Visita | null>> {
  const pendiente = await leerOperacion(usuario.id, visitaId);
  if (pendiente === null) {
    return { success: true, data: await obtenerVisitaGuardada(visitaId) };
  }
  return sincronizarOperacionVisita(usuario, pendiente);
}

async function prepararVisitasLocalesParaCuenta(
  usuario: Usuario,
): Promise<void> {
  await asegurarUsuario(usuario);
  const base = await abrirBaseDatos();
  const filas = await base.getAllAsync<{
    id: IdVisita;
    usuarioId: IdUsuario;
    lugarId: IdLugar;
    fechaHora: string;
    origen: string;
    fotoUri: string | null;
    nota: string | null;
    sincronizada: number;
  }>(
    'SELECT * FROM visitas WHERE usuarioId = ? AND sincronizada = 0',
    [ID_USUARIO_LOCAL],
  );

  for (const fila of filas) {
    const visita: Visita = {
      id: fila.id,
      usuarioId: usuario.id,
      lugarId: fila.lugarId,
      fechaHora: fila.fechaHora,
      origen: fila.origen as OrigenVisita,
      fotoUri: fila.fotoUri,
      nota: fila.nota,
      sincronizada: false,
    };
    await guardarVisita(visita);
    await guardarPendienteCrear(visita);
  }
}

export async function prepararVisitasPendientesDeCuenta(
  usuario: Usuario,
): Promise<void> {
  await prepararVisitasLocalesParaCuenta(usuario);
  await asegurarVisitaSinCola(usuario.id);
}

async function asegurarVisitaSinCola(
  usuarioId: IdUsuario,
): Promise<void> {
  const base = await abrirBaseDatos();
  const filas = await base.getAllAsync<{
    id: IdVisita;
    usuarioId: IdUsuario;
    lugarId: IdLugar;
    fechaHora: string;
    origen: string;
    fotoUri: string | null;
    nota: string | null;
    sincronizada: number;
  }>(
    'SELECT * FROM visitas WHERE usuarioId = ? AND sincronizada = 0',
    [usuarioId],
  );
  for (const fila of filas) {
    const pendiente = await leerOperacion(usuarioId, fila.id);
    if (pendiente !== null) {
      continue;
    }
    await guardarPendienteCrear({
      id: fila.id,
      usuarioId,
      lugarId: fila.lugarId,
      fechaHora: fila.fechaHora,
      origen: fila.origen as OrigenVisita,
      fotoUri: fila.fotoUri,
      nota: fila.nota,
      sincronizada: false,
    });
  }
}

async function resolverLugarVisita(id: IdLugar): Promise<boolean> {
  try {
    if ((await obtenerLugarCache(id)) !== null) {
      return true;
    }
    const lugar = await obtenerLugarServicio(id);
    return lugar.success;
  } catch {
    return false;
  }
}

async function obtenerVisitasRemotas(): Promise<Result<Visita[]>> {
  const visitas: Visita[] = [];
  let pagina = 1;
  while (true) {
    const respuesta = await peticionLista<Visita>({
      method: 'GET',
      url: '/yo/visitas',
      params: { pagina, porPagina: 500 },
    });
    if (!respuesta.success) {
      return respuesta;
    }
    visitas.push(...respuesta.data.datos);
    if (
      visitas.length >= respuesta.data.meta.total ||
      respuesta.data.datos.length === 0
    ) {
      return { success: true, data: visitas };
    }
    pagina += 1;
  }
}

async function cachearVisitasRemotas(visitas: Visita[]): Promise<boolean> {
  let cacheCompleta = true;
  for (const visita of visitas) {
    if (!(await resolverLugarVisita(visita.lugarId))) {
      cacheCompleta = false;
      continue;
    }
    const existente = await obtenerVisitaGuardada(visita.id);
    const guardada =
      existente !== null && !existente.sincronizada
        ? existente
        : existente === null
          ? { ...visita, sincronizada: true }
          : conservarFotoLocal(visita, existente);
    await guardarVisita(guardada);
  }
  return cacheCompleta;
}

function ordenarVisitas(visitas: Visita[]): Visita[] {
  return [...visitas].sort(
    (a, b) => Date.parse(b.fechaHora) - Date.parse(a.fechaHora),
  );
}

async function obtenerCacheLocal(
  usuarioId: IdUsuario,
  errorOriginal: Result<Visita[]>,
): Promise<Result<Visita[]>> {
  try {
    const visitas = await obtenerVisitas(usuarioId);
    const snapshot =
      (await Storage.getItemAsync(`${CLAVE_SNAPSHOT_VISITAS}${usuarioId}`)) ===
      '1';
    if (visitas.length > 0 || snapshot) {
      return { success: true, data: ordenarVisitas(visitas) };
    }
  } catch {
    // Si la base local tampoco se puede leer, se devuelve el error original.
  }
  return errorOriginal;
}

async function registrarVisitaLocal(
  lugar: Lugar,
  origen: OrigenVisita,
  usuario: Usuario | null,
): Promise<Result<Visita>> {
  try {
    await asegurarReferencias(lugar, usuario);
    const visita: Visita = {
      id: generarIdVisita(),
      usuarioId: usuario?.id ?? ID_USUARIO_LOCAL,
      lugarId: lugar.id,
      fechaHora: new Date().toISOString(),
      origen,
      fotoUri: null,
      nota: null,
      sincronizada: false,
    };
    await guardarVisita(visita);

    if (usuario !== null) {
      await guardarPendienteCrear(visita);
      const sincronizada = await sincronizarVisitaPendiente(usuario, visita.id);
      if (sincronizada.success && sincronizada.data !== null) {
        return { success: true, data: sincronizada.data };
      }
      if (!sincronizada.success && !puedeUsarCache(sincronizada)) {
        return {
          success: false,
          error: sincronizada.error,
          codigo: sincronizada.codigo,
          estado: sincronizada.estado,
        };
      }
    }
    return { success: true, data: visita };
  } catch {
    return { success: false, error: ERROR_GUARDADO };
  }
}

/** Valida el QR antes de tocar la base; los códigos ajenos se ignoran. */
export async function registrarVisitaPorQr(
  codigoQr: string,
  usuario: Usuario | null = null,
): Promise<Result<Visita>> {
  const lugarId = parsearCodigoQr(codigoQr);
  if (lugarId === null) {
    return { success: false, error: ERROR_QR_INVALIDO };
  }
  const lugar = await buscarLugarActivo(lugarId);
  if (lugar === null) {
    return { success: false, error: ERROR_QR_NO_DISPONIBLE };
  }
  return registrarVisitaLocal(lugar, 'qr', usuario);
}

export async function registrarVisitaManual(
  lugarId: IdLugar,
  usuario: Usuario | null = null,
): Promise<Result<Visita>> {
  const lugar = await buscarLugarActivo(lugarId);
  if (lugar === null) {
    return { success: false, error: 'No encontramos ese lugar.' };
  }
  return registrarVisitaLocal(lugar, 'manual', usuario);
}

/** Registra el lugar activo más cercano dentro del radio configurado. */
export async function registrarVisitaPorProximidad(
  radioMetros: number = RADIO_PROXIMIDAD_METROS,
  usuario: Usuario | null = null,
): Promise<Result<Visita>> {
  const radio =
    Number.isFinite(radioMetros) && radioMetros > 0
      ? radioMetros
      : RADIO_PROXIMIDAD_METROS;

  let resultadoUbicacion: Result<Coordenadas | null>;
  try {
    resultadoUbicacion = await obtenerUbicacionActual();
  } catch {
    return {
      success: false,
      error:
        'No pudimos obtener tu ubicación. Probá de nuevo o registrá la visita de forma manual.',
    };
  }

  if (!resultadoUbicacion.success) {
    return {
      success: false,
      error:
        'No pudimos obtener tu ubicación. Probá de nuevo o registrá la visita de forma manual.',
    };
  }
  const ubicacion = resultadoUbicacion.data;
  if (ubicacion === null) {
    return { success: false, error: ERROR_SIN_UBICACION };
  }

  let lugares: Lugar[];
  try {
    lugares = await obtenerLugares();
  } catch {
    return {
      success: false,
      error:
        'No pudimos leer los lugares guardados. Probá de nuevo o registrá la visita de forma manual.',
    };
  }

  const [candidato] = lugares
    .filter((lugar) => lugar.activo)
    .map((lugar) => ({
      lugar,
      distancia: distanciaMetros(ubicacion, lugar.coordenadas),
    }))
    .sort((a, b) => a.distancia - b.distancia);

  if (candidato === undefined || candidato.distancia > radio) {
    return {
      success: false,
      error: `No encontramos ningún lugar a menos de ${radio} m. Podés registrar la visita de forma manual.`,
    };
  }
  return registrarVisitaLocal(candidato.lugar, 'gps', usuario);
}

export async function listarVisitas(
  usuario: Usuario | null = null,
): Promise<Result<Visita[]>> {
  if (usuario === null) {
    try {
      return {
        success: true,
        data: ordenarVisitas(await obtenerVisitas(ID_USUARIO_LOCAL)),
      };
    } catch {
      return {
        success: false,
        error: 'No pudimos leer tus visitas guardadas. Intentá de nuevo.',
      };
    }
  }

  try {
    await prepararVisitasPendientesDeCuenta(usuario);

    const remotas = await obtenerVisitasRemotas();
    if (!remotas.success) {
      return puedeUsarCache(remotas)
        ? obtenerCacheLocal(usuario.id, remotas)
        : remotas;
    }

    try {
      const cacheCompleta = await cachearVisitasRemotas(remotas.data);
      if (cacheCompleta) {
        await Storage.setItemAsync(
          `${CLAVE_SNAPSHOT_VISITAS}${usuario.id}`,
          '1',
        );
      }
    } catch {
      // Se muestra la respuesta remota aunque falle la caché local.
    }
    const locales = await obtenerVisitas(usuario.id);
    const porId = new Map(locales.map((visita) => [visita.id, visita]));
    for (const visita of remotas.data) {
      const local = porId.get(visita.id);
      if (local === undefined) {
        porId.set(visita.id, visita);
      }
    }
    return { success: true, data: ordenarVisitas([...porId.values()]) };
  } catch {
    return {
      success: false,
      error: 'No pudimos leer tus visitas guardadas. Intentá de nuevo.',
    };
  }
}

export async function obtenerVisita(
  id: IdVisita,
  usuario: Usuario | null = null,
): Promise<Result<Visita | null>> {
  try {
    let visita = await obtenerVisitaGuardada(id);
    if (usuario === null) {
      return {
        success: true,
        data: visita?.usuarioId === ID_USUARIO_LOCAL ? visita : null,
      };
    }

    if (visita === null || visita.usuarioId !== usuario.id) {
      const visitas = await listarVisitas(usuario);
      if (!visitas.success) {
        return visitas;
      }
      visita = visitas.data.find((candidata) => candidata.id === id) ?? null;
    }
    return { success: true, data: visita };
  } catch {
    return {
      success: false,
      error: 'No pudimos leer esta visita. Intentá de nuevo.',
    };
  }
}

export interface CambiosVisita {
  fotoUri?: string | null;
  nota?: string | null;
}

function esRutaLocal(uri: string): boolean {
  return uri.startsWith('file://');
}

/** Persiste la edición primero y sincroniza la foto antes de enviar su URL. */
export async function actualizarVisita(
  id: IdVisita,
  cambios: CambiosVisita,
  usuario: Usuario | null = null,
): Promise<Result<Visita>> {
  if (
    cambios.fotoUri !== undefined &&
    cambios.fotoUri !== null &&
    !esRutaLocal(cambios.fotoUri)
  ) {
    return { success: false, error: ERROR_FOTO_INVALIDA };
  }

  try {
    const visita = await obtenerVisitaGuardada(id);
    const usuarioId = usuario?.id ?? ID_USUARIO_LOCAL;
    if (visita === null || visita.usuarioId !== usuarioId) {
      return { success: false, error: 'No encontramos esa visita.' };
    }

    const actualizada: Visita = {
      ...visita,
      fotoUri: cambios.fotoUri !== undefined ? cambios.fotoUri : visita.fotoUri,
      nota: cambios.nota !== undefined ? cambios.nota : visita.nota,
      sincronizada: false,
    };
    await guardarVisita(actualizada);

    if (usuario !== null) {
      if (cambios.fotoUri !== undefined) {
        await guardarUrlFotoSubidaVisita(id, null);
      }
      await guardarPendienteActualizar(usuario.id, actualizada, cambios);
      const sincronizacion = await sincronizarVisitaPendiente(usuario, id);
      if (sincronizacion.success && sincronizacion.data !== null) {
        return { success: true, data: sincronizacion.data };
      }
      if (!sincronizacion.success && !puedeUsarCache(sincronizacion)) {
        return {
          success: false,
          error: sincronizacion.error,
          codigo: sincronizacion.codigo,
          estado: sincronizacion.estado,
        };
      }
    }

    return { success: true, data: actualizada };
  } catch {
    return {
      success: false,
      error: 'No pudimos guardar los cambios de la visita. Intentá de nuevo.',
    };
  }
}
