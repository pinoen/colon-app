import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import Storage from 'expo-sqlite/kv-store';

import type { FiltrosEvento } from '@/queries/eventoKeys';
import {
  abrirBaseDatos,
  obtenerEventos,
  obtenerLugares,
  reemplazarEventos,
} from '@/servicios/baseDatos';
import {
  peticion,
  peticionLista,
  puedeUsarCache,
} from '@/servicios/clienteApi';
import { listarLugares } from '@/servicios/lugares';
import {
  asegurarPermisoNotificaciones,
  CANAL_RECORDATORIOS,
  obtenerApiNotificaciones,
} from '@/servicios/notificaciones';
import type { Result } from '@/tipos/api';
import type { Evento, IdEvento } from '@/tipos/evento';
import type { IdUsuario, Usuario } from '@/tipos/usuario';
import { formatearFechaDia, formatearHora } from '@/utilidades/formato';

const CLAVE_RECORDATORIOS = 'agenda:recordatorios:v1';

/** Minutos antes del inicio en que se dispara el aviso local. */
export const ANTELACION_RECORDATORIO_MINUTOS = 60;

export interface RecordatorioEvento {
  eventoId: IdEvento;
  /** `null` cuando el evento quedó guardado pero no se pudo programar el aviso. */
  notificacionId: string | null;
  /** Momento en que se dispara el aviso, en ISO 8601. */
  programadoPara: string | null;
  /** Usuario propietario del guardado remoto; `null` es un guardado local sin sesión. */
  usuarioId: IdUsuario | null;
  /** `false` cuando queda una operación remota en la cola local. */
  sincronizada: boolean;
}

export type RecordatoriosEvento = Record<string, RecordatorioEvento>;

const ERROR_GUARDADO =
  'No pudimos guardar el recordatorio en este dispositivo. Intentá de nuevo.';
const ERROR_FECHA =
  'Este evento ya comenzó o su fecha no es válida. No se puede agendar un recordatorio.';
const ERROR_ESTADO =
  'Solo se pueden guardar eventos programados o suspendidos. Los eventos cancelados o finalizados ya no están vigentes.';
const CLAVE_SNAPSHOT_EVENTOS_GUARDADOS =
  'agenda:eventos-guardados:snapshots:v1';

interface FilaColaEvento {
  id: string;
  accion: string;
  payload: string;
}

interface PayloadEventoGuardado {
  usuarioId: IdUsuario;
  eventoId: IdEvento;
}

interface OperacionEventoGuardado {
  id: string;
  accion: 'guardar' | 'quitar';
  payload: PayloadEventoGuardado;
}

function esRecordatorioValido(valor: unknown): valor is RecordatorioEvento {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const candidato = valor as Record<string, unknown>;
  return (
    typeof candidato.eventoId === 'string' &&
    (candidato.notificacionId === null ||
      typeof candidato.notificacionId === 'string') &&
    (candidato.programadoPara === null ||
      typeof candidato.programadoPara === 'string') &&
    (candidato.usuarioId === undefined ||
      candidato.usuarioId === null ||
      typeof candidato.usuarioId === 'string') &&
    (candidato.sincronizada === undefined ||
      typeof candidato.sincronizada === 'boolean')
  );
}

async function leerRecordatorios(): Promise<RecordatoriosEvento> {
  try {
    const crudo = await Storage.getItemAsync(CLAVE_RECORDATORIOS);
    if (crudo === null) {
      return {};
    }
    const parseado: unknown = JSON.parse(crudo);
    if (
      typeof parseado !== 'object' ||
      parseado === null ||
      Array.isArray(parseado)
    ) {
      return {};
    }
    const recordatorios: RecordatoriosEvento = {};
    for (const [eventoId, valor] of Object.entries(
      parseado as Record<string, unknown>,
    )) {
      if (esRecordatorioValido(valor) && valor.eventoId === eventoId) {
        recordatorios[eventoId] = {
          eventoId: valor.eventoId as IdEvento,
          notificacionId: valor.notificacionId,
          programadoPara: valor.programadoPara,
          usuarioId:
            typeof valor.usuarioId === 'string'
              ? (valor.usuarioId as IdUsuario)
              : null,
          sincronizada:
            typeof valor.sincronizada === 'boolean'
              ? valor.sincronizada
              : false,
        };
      }
    }
    return recordatorios;
  } catch {
    return {};
  }
}

async function escribirRecordatorios(
  recordatorios: RecordatoriosEvento,
): Promise<boolean> {
  try {
    await Storage.setItemAsync(
      CLAVE_RECORDATORIOS,
      JSON.stringify(recordatorios),
    );
    return true;
  } catch {
    return false;
  }
}

function idOperacionEvento(
  usuarioId: IdUsuario,
  eventoId: IdEvento,
): string {
  return `evento-guardado:${usuarioId}:${eventoId}`;
}

async function leerPendientesEventos(
  usuarioId: IdUsuario,
): Promise<OperacionEventoGuardado[]> {
  const base = await abrirBaseDatos();
  const filas = await base.getAllAsync<FilaColaEvento>(
    `SELECT id, accion, payload FROM cola_sincronizacion
     WHERE entidad = 'evento-guardado' ORDER BY creadoEn ASC`,
  );
  const pendientes: OperacionEventoGuardado[] = [];
  for (const fila of filas) {
    if (fila.accion !== 'guardar' && fila.accion !== 'quitar') {
      continue;
    }
    try {
      const payload: unknown = JSON.parse(fila.payload);
      if (
        typeof payload !== 'object' ||
        payload === null ||
        (payload as Record<string, unknown>).usuarioId !== usuarioId ||
        typeof (payload as Record<string, unknown>).eventoId !== 'string'
      ) {
        continue;
      }
      pendientes.push({
        id: fila.id,
        accion: fila.accion,
        payload: payload as PayloadEventoGuardado,
      });
    } catch {
      // Se ignora la fila inválida y se procesan las restantes.
    }
  }
  return pendientes;
}

async function guardarPendienteEvento(
  accion: OperacionEventoGuardado['accion'],
  payload: PayloadEventoGuardado,
): Promise<void> {
  const base = await abrirBaseDatos();
  await base.runAsync(
    `INSERT INTO cola_sincronizacion (id, entidad, accion, payload, intentos, creadoEn)
     VALUES (?, 'evento-guardado', ?, ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET
       entidad = excluded.entidad,
       accion = excluded.accion,
       payload = excluded.payload,
       intentos = 0,
       creadoEn = excluded.creadoEn`,
    [
      idOperacionEvento(payload.usuarioId, payload.eventoId),
      accion,
      JSON.stringify(payload),
      new Date().toISOString(),
    ],
  );
}

async function quitarPendienteEvento(id: string): Promise<void> {
  const base = await abrirBaseDatos();
  await base.runAsync('DELETE FROM cola_sincronizacion WHERE id = ?', [id]);
}

export async function sincronizarEventoGuardadoPendientePorId(
  id: string,
): Promise<Result<null>> {
  const base = await abrirBaseDatos();
  const fila = await base.getFirstAsync<FilaColaEvento>(
    `SELECT id, accion, payload FROM cola_sincronizacion
     WHERE id = ? AND entidad = 'evento-guardado'`,
    [id],
  );
  if (
    fila === null ||
    (fila.accion !== 'guardar' && fila.accion !== 'quitar')
  ) {
    return { success: true, data: null };
  }

  let payload: PayloadEventoGuardado;
  try {
    payload = JSON.parse(fila.payload) as PayloadEventoGuardado;
  } catch {
    return { success: false, error: 'La operación de agenda guardada no es válida.' };
  }

  const respuesta =
    fila.accion === 'guardar'
      ? await peticion<Evento>({
          method: 'PUT',
          url: `/yo/eventos-guardados/${encodeURIComponent(payload.eventoId)}`,
        })
      : await peticion<null>({
          method: 'DELETE',
          url: `/yo/eventos-guardados/${encodeURIComponent(payload.eventoId)}`,
        });
  if (!respuesta.success) {
    if (
      fila.accion === 'guardar' &&
      (respuesta.codigo === 'EVENTO_NO_VIGENTE' ||
        respuesta.codigo === 'EVENTO_NO_ENCONTRADO')
    ) {
      await quitarPendienteEvento(fila.id);
      const recordatorios = await leerRecordatorios();
      const local = recordatorios[payload.eventoId];
      if (local?.usuarioId === payload.usuarioId) {
        await cancelarNotificacionLocal(local);
        const restantes = { ...recordatorios };
        delete restantes[payload.eventoId];
        await escribirRecordatorios(restantes);
      }
      return { success: true, data: null };
    }
    return respuesta;
  }

  if (fila.accion === 'guardar') {
    await aplicarEventoGuardadoRemoto(payload.usuarioId, respuesta.data as Evento);
  }
  await quitarPendienteEvento(fila.id);
  return { success: true, data: null };
}

async function obtenerEventosGuardadosRemotos(): Promise<Result<Evento[]>> {
  const eventos: Evento[] = [];
  let pagina = 1;
  while (true) {
    const respuesta = await peticionLista<Evento>({
      method: 'GET',
      url: '/yo/eventos-guardados',
      params: { pagina, porPagina: 100 },
    });
    if (!respuesta.success) {
      return respuesta;
    }
    eventos.push(...respuesta.data.datos);
    if (
      eventos.length >= respuesta.data.meta.total ||
      respuesta.data.datos.length === 0
    ) {
      return { success: true, data: eventos };
    }
    pagina += 1;
  }
}

async function leerSnapshotsEventos(): Promise<Set<IdUsuario>> {
  try {
    const crudo = await Storage.getItemAsync(CLAVE_SNAPSHOT_EVENTOS_GUARDADOS);
    if (crudo === null) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(crudo);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is IdUsuario => typeof id === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

async function marcarSnapshotEventos(usuarioId: IdUsuario): Promise<void> {
  const snapshots = await leerSnapshotsEventos();
  snapshots.add(usuarioId);
  await Storage.setItemAsync(
    CLAVE_SNAPSHOT_EVENTOS_GUARDADOS,
    JSON.stringify([...snapshots]),
  );
}

async function cacheLocalEventosGuardados(
  usuarioId: IdUsuario,
  errorOriginal: Result<RecordatoriosEvento>,
): Promise<Result<RecordatoriosEvento>> {
  const recordatorios = await leerRecordatorios();
  const pendientes = await leerPendientesEventos(usuarioId);
  const snapshots = await leerSnapshotsEventos();
  const cacheados = Object.fromEntries(
    Object.entries(recordatorios).filter(
      ([, recordatorio]) =>
        recordatorio.usuarioId === usuarioId || recordatorio.usuarioId === null,
    ),
  );
  if (
    Object.keys(cacheados).length > 0 ||
    pendientes.length > 0 ||
    snapshots.has(usuarioId)
  ) {
    return { success: true, data: cacheados };
  }
  return errorOriginal;
}

export async function prepararEventosGuardadosLocales(
  usuarioId: IdUsuario,
): Promise<void> {
  const recordatorios = await leerRecordatorios();
  let actualizados = false;
  for (const [eventoId, recordatorio] of Object.entries(recordatorios)) {
    if (recordatorio.usuarioId !== null) {
      continue;
    }
    await guardarPendienteEvento('guardar', {
      usuarioId,
      eventoId: eventoId as IdEvento,
    });
    recordatorios[eventoId] = {
      ...recordatorio,
      usuarioId,
      sincronizada: false,
    };
    actualizados = true;
  }
  if (actualizados) {
    await escribirRecordatorios(recordatorios);
  }
}

function calcularAviso(inicioMs: number): number {
  const objetivo = inicioMs - ANTELACION_RECORDATORIO_MINUTOS * 60 * 1000;
  // Si el evento empieza en menos de una hora, avisamos enseguida.
  return objetivo > Date.now() ? objetivo : Date.now() + 60 * 1000;
}

function filtrarEventos(eventos: Evento[], filtros: FiltrosEvento): Evento[] {
  return eventos
    .filter(
      (evento) =>
        filtros.estado === undefined || evento.estado === filtros.estado,
    )
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
}

async function cachearEventos(eventos: Evento[]): Promise<void> {
  try {
    if (eventos.length === 0) {
      await reemplazarEventos([]);
      return;
    }

    let lugaresExistentes = new Set(
      (await obtenerLugares()).map((lugar) => lugar.id),
    );
    const faltaAlgunLugar = eventos.some(
      (evento) =>
        evento.lugarId !== null && !lugaresExistentes.has(evento.lugarId),
    );
    if (faltaAlgunLugar) {
      await listarLugares({});
      lugaresExistentes = new Set(
        (await obtenerLugares()).map((lugar) => lugar.id),
      );
    }

    const eventosParaCache = eventos.map((evento) =>
      evento.lugarId !== null && !lugaresExistentes.has(evento.lugarId)
        ? { ...evento, lugarId: null }
        : evento,
    );
    await reemplazarEventos(eventosParaCache);
  } catch {
    // La respuesta sigue siendo válida aunque no se pueda cachear.
  }
}

let eventosEnVuelo: Promise<Result<Evento[]>> | null = null;

async function cargarEventos(): Promise<Result<Evento[]>> {
  const respuesta = await peticionLista<Evento>({
    method: 'GET',
    url: '/eventos',
    params: { porPagina: 100 },
  });

  if (respuesta.success) {
    await cachearEventos(respuesta.data.datos);
    return { success: true, data: respuesta.data.datos };
  }

  if (puedeUsarCache(respuesta)) {
    try {
      const cacheados = await obtenerEventos();
      if (cacheados.length > 0) {
        return { success: true, data: cacheados };
      }
    } catch {
      // Si tampoco hay caché legible, se conserva el error original.
    }
  }

  return respuesta;
}

function obtenerEventosBase(): Promise<Result<Evento[]>> {
  if (eventosEnVuelo !== null) {
    return eventosEnVuelo;
  }

  const promesa = cargarEventos();
  eventosEnVuelo = promesa;
  void promesa.then(
    () => {
      if (eventosEnVuelo === promesa) {
        eventosEnVuelo = null;
      }
    },
    () => {
      if (eventosEnVuelo === promesa) {
        eventosEnVuelo = null;
      }
    },
  );
  return promesa;
}

export async function listarEventos(
  filtros: FiltrosEvento = {},
): Promise<Result<Evento[]>> {
  const resultado = await obtenerEventosBase();
  if (!resultado.success) {
    return resultado;
  }
  return { success: true, data: filtrarEventos(resultado.data, filtros) };
}

export async function listarRecordatoriosEventos(
  usuario: Usuario | null = null,
): Promise<Result<RecordatoriosEvento>> {
  const recordatoriosLocales = await leerRecordatorios();
  if (usuario === null) {
    return {
      success: true,
      data: Object.fromEntries(
        Object.entries(recordatoriosLocales).filter(
          ([, recordatorio]) => recordatorio.usuarioId === null,
        ),
      ),
    };
  }

  await prepararEventosGuardadosLocales(usuario.id);
  const recordatoriosMigrados = await leerRecordatorios();

  const remotos = await obtenerEventosGuardadosRemotos();
  if (!remotos.success) {
    return puedeUsarCache(remotos)
      ? cacheLocalEventosGuardados(usuario.id, remotos)
      : remotos;
  }

  const guardados = new Map<IdEvento, RecordatorioEvento>();
  for (const evento of remotos.data) {
    const existente = recordatoriosMigrados[evento.id];
    const admiteAviso =
      evento.estado === 'programado' && Date.parse(evento.inicio) > Date.now();
    let notificacionId = admiteAviso ? existente?.notificacionId ?? null : null;
    let programadoPara = admiteAviso
      ? existente?.programadoPara ?? null
      : null;

    if (!admiteAviso && existente?.notificacionId !== null && existente !== undefined) {
      const api = obtenerApiNotificaciones();
      try {
        await api?.cancelScheduledNotificationAsync(
          existente.notificacionId as string,
        );
      } catch {
        // El registro remoto continúa siendo válido aunque no se cancele localmente.
      }
    }

    guardados.set(evento.id, {
      eventoId: evento.id,
      notificacionId,
      programadoPara,
      usuarioId: usuario.id,
      sincronizada: true,
    });
  }

  const pendientes = await leerPendientesEventos(usuario.id);
  for (const pendiente of pendientes) {
    if (pendiente.accion === 'quitar') {
      guardados.delete(pendiente.payload.eventoId);
      continue;
    }
    const existente =
      recordatoriosMigrados[pendiente.payload.eventoId] ?? {
        eventoId: pendiente.payload.eventoId,
        notificacionId: null,
        programadoPara: null,
        usuarioId: usuario.id,
        sincronizada: false,
      };
    guardados.set(pendiente.payload.eventoId, {
      ...existente,
      usuarioId: usuario.id,
      sincronizada: false,
    });
  }

  for (const [eventoId, recordatorio] of Object.entries(recordatoriosMigrados)) {
    if (
      recordatorio.usuarioId === usuario.id &&
      !guardados.has(eventoId as IdEvento) &&
      recordatorio.notificacionId !== null
    ) {
      const api = obtenerApiNotificaciones();
      try {
        await api?.cancelScheduledNotificationAsync(recordatorio.notificacionId);
      } catch {
        // Si el aviso ya se disparó o fue borrado, seguimos actualizando el caché.
      }
    }
  }

  const combinado: RecordatoriosEvento = {};
  for (const [eventoId, recordatorio] of Object.entries(recordatoriosMigrados)) {
    if (recordatorio.usuarioId !== usuario.id) {
      combinado[eventoId] = recordatorio;
    }
  }
  for (const [eventoId, recordatorio] of guardados) {
    combinado[eventoId] = recordatorio;
  }

  const persistidos = await escribirRecordatorios(combinado);
  if (persistidos) {
    await marcarSnapshotEventos(usuario.id);
  }
  return {
    success: true,
    data: Object.fromEntries(
      Object.entries(combinado).filter(
        ([, recordatorio]) =>
          recordatorio.usuarioId === usuario.id ||
          recordatorio.usuarioId === null,
      ),
    ),
  };
}

async function cancelarNotificacionLocal(
  recordatorio: RecordatorioEvento | undefined,
): Promise<void> {
  if (recordatorio?.notificacionId == null) {
    return;
  }
  const api = obtenerApiNotificaciones();
  try {
    await api?.cancelScheduledNotificationAsync(recordatorio.notificacionId);
  } catch {
    // El aviso pudo haberse disparado ya; se continúa con la actualización local.
  }
}

async function aplicarEventoGuardadoRemoto(
  usuarioId: IdUsuario,
  evento: Evento,
): Promise<RecordatorioEvento | undefined> {
  const recordatorios = await leerRecordatorios();
  const existente = recordatorios[evento.id];
  if (existente === undefined) {
    return undefined;
  }

  let sincronizado: RecordatorioEvento = {
    ...existente,
    usuarioId,
    sincronizada: true,
  };
  if (
    evento.estado !== 'programado' &&
    sincronizado.notificacionId !== null
  ) {
    await cancelarNotificacionLocal(sincronizado);
    sincronizado = {
      ...sincronizado,
      notificacionId: null,
      programadoPara: null,
    };
  }
  await escribirRecordatorios({ ...recordatorios, [evento.id]: sincronizado });
  return sincronizado;
}

async function programarNotificacionLocal(
  evento: Evento,
): Promise<{ notificacionId: string | null; programadoPara: string | null }> {
  const api = await asegurarPermisoNotificaciones();
  if (api === null) {
    return { notificacionId: null, programadoPara: null };
  }

  const programadoPara = calcularAviso(Date.parse(evento.inicio));
  try {
    const notificacionId = await api.scheduleNotificationAsync({
      content: {
        title: 'Recordatorio de agenda',
        body: `${evento.titulo} · ${formatearFechaDia(evento.inicio)} a las ${formatearHora(evento.inicio)}`,
        data: { eventoId: evento.id },
        sound: 'default',
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DATE,
        date: new Date(programadoPara),
        channelId: CANAL_RECORDATORIOS,
      },
    });
    return {
      notificacionId,
      programadoPara: new Date(programadoPara).toISOString(),
    };
  } catch {
    return { notificacionId: null, programadoPara: null };
  }
}

/**
 * Guarda el evento en la agenda y programa su recordatorio local.
 * Un evento admite un único aviso activo: si ya estaba guardado no se
 * duplica (el límite global de avisos se completa en T15).
 */
export async function guardarEventoConRecordatorio(
  evento: Evento,
  usuario: Usuario | null = null,
): Promise<Result<RecordatorioEvento>> {
  if (evento.estado !== 'programado' && evento.estado !== 'suspendido') {
    return { success: false, error: ERROR_ESTADO };
  }

  const inicioMs = Date.parse(evento.inicio);
  if (
    evento.estado === 'programado' &&
    (Number.isNaN(inicioMs) || inicioMs <= Date.now())
  ) {
    return { success: false, error: ERROR_FECHA };
  }

  const recordatorios = await leerRecordatorios();
  const existente = recordatorios[evento.id];
  const admiteAviso = evento.estado === 'programado';
  if (!admiteAviso) {
    await cancelarNotificacionLocal(existente);
  }
  let notificacionId = admiteAviso
    ? existente?.notificacionId ?? null
    : null;
  let programadoPara = admiteAviso
    ? existente?.programadoPara ?? null
    : null;
  let notificacionNueva = false;

  if (admiteAviso && notificacionId === null) {
    const notificacion = await programarNotificacionLocal(evento);
    notificacionId = notificacion.notificacionId;
    programadoPara = notificacion.programadoPara;
    notificacionNueva = notificacionId !== null;
  }

  const recordatorio: RecordatorioEvento = {
    eventoId: evento.id,
    notificacionId,
    programadoPara: notificacionId === null ? null : programadoPara,
    usuarioId: usuario?.id ?? null,
    sincronizada: false,
  };

  const siguientes: RecordatoriosEvento = {
    ...recordatorios,
    [evento.id]: recordatorio,
  };
  const guardado = await escribirRecordatorios(siguientes);
  if (!guardado) {
    if (notificacionNueva) {
      await cancelarNotificacionLocal(recordatorio);
    }
    return { success: false, error: ERROR_GUARDADO };
  }

  if (usuario === null) {
    return { success: true, data: recordatorio };
  }

  try {
    await guardarPendienteEvento('guardar', {
      usuarioId: usuario.id,
      eventoId: evento.id,
    });
  } catch {
    const rollback = { ...recordatorios };
    if (existente === undefined) {
      delete rollback[evento.id];
    } else {
      rollback[evento.id] = existente;
    }
    await escribirRecordatorios(rollback);
    if (notificacionNueva) {
      await cancelarNotificacionLocal(recordatorio);
    }
    return { success: false, error: ERROR_GUARDADO };
  }

  const respuesta = await peticion<Evento>({
    method: 'PUT',
    url: `/yo/eventos-guardados/${encodeURIComponent(evento.id)}`,
  });
  if (respuesta.success) {
    await quitarPendienteEvento(idOperacionEvento(usuario.id, evento.id));
    const sincronizado = await aplicarEventoGuardadoRemoto(
      usuario.id,
      respuesta.data,
    );
    return {
      success: true,
      data: sincronizado ?? { ...recordatorio, sincronizada: true },
    };
  }

  if (puedeUsarCache(respuesta)) {
    const pendiente = { ...recordatorio, sincronizada: false };
    await escribirRecordatorios({ ...siguientes, [evento.id]: pendiente });
    return { success: true, data: pendiente };
  }

  await quitarPendienteEvento(idOperacionEvento(usuario.id, evento.id));
  if (existente === undefined) {
    const restantes = { ...siguientes };
    delete restantes[evento.id];
    await escribirRecordatorios(restantes);
  } else {
    await escribirRecordatorios({
      ...siguientes,
      [evento.id]: { ...existente, notificacionId: null, programadoPara: null },
    });
  }
  if (notificacionNueva) {
    await cancelarNotificacionLocal(recordatorio);
  }
  return respuesta;
}

export async function quitarRecordatorioEvento(
  eventoId: IdEvento,
  usuario: Usuario | null = null,
): Promise<Result<null>> {
  const recordatorios = await leerRecordatorios();
  const existente = recordatorios[eventoId];
  await cancelarNotificacionLocal(existente);

  const restantes: RecordatoriosEvento = { ...recordatorios };
  delete restantes[eventoId];
  if (!(await escribirRecordatorios(restantes))) {
    return { success: false, error: ERROR_GUARDADO };
  }

  if (usuario === null) {
    return { success: true, data: null };
  }

  try {
    await guardarPendienteEvento('quitar', {
      usuarioId: usuario.id,
      eventoId,
    });
  } catch {
    if (existente !== undefined) {
      await escribirRecordatorios({
        ...restantes,
        [eventoId]: { ...existente, notificacionId: null, programadoPara: null },
      });
    }
    return { success: false, error: ERROR_GUARDADO };
  }

  const respuesta = await peticion<null>({
    method: 'DELETE',
    url: `/yo/eventos-guardados/${encodeURIComponent(eventoId)}`,
  });
  if (respuesta.success) {
    await quitarPendienteEvento(idOperacionEvento(usuario.id, eventoId));
    return { success: true, data: null };
  }
  if (puedeUsarCache(respuesta)) {
    return { success: true, data: null };
  }

  await quitarPendienteEvento(idOperacionEvento(usuario.id, eventoId));
  if (existente !== undefined) {
    await escribirRecordatorios({
      ...restantes,
      [eventoId]: { ...existente, notificacionId: null, programadoPara: null },
    });
  }
  return respuesta;
}
