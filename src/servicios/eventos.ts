import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

import type { FiltrosEvento } from '@/queries/eventoKeys';
import {
  obtenerEventos,
  obtenerLugares,
  reemplazarEventos,
} from '@/servicios/baseDatos';
import { peticionLista, puedeUsarCache } from '@/servicios/clienteApi';
import { listarLugares } from '@/servicios/lugares';
import type { Result } from '@/tipos/api';
import type { Evento, IdEvento } from '@/tipos/evento';
import { formatearFechaDia, formatearHora } from '@/utilidades/formato';

const CLAVE_RECORDATORIOS = 'agenda:recordatorios:v1';
const CANAL_RECORDATORIOS = 'recordatorios-agenda';

/**
 * Expo Go (SDK 57) no incluye `ExpoTopicSubscriptionModule`, que el índice de
 * `expo-notifications` importa para notificaciones push. Por eso cargamos solo
 * los módulos de notificaciones locales de forma diferida y toleramos que el
 * entorno no los soporte (la agenda sigue funcionando).
 */
interface ApiNotificaciones {
  setNotificationHandler: typeof import('expo-notifications/build/NotificationsHandler').setNotificationHandler;
  getPermissionsAsync: typeof import('expo-notifications/build/NotificationPermissions').getPermissionsAsync;
  requestPermissionsAsync: typeof import('expo-notifications/build/NotificationPermissions').requestPermissionsAsync;
  scheduleNotificationAsync: typeof import('expo-notifications/build/scheduleNotificationAsync').scheduleNotificationAsync;
  cancelScheduledNotificationAsync: typeof import('expo-notifications/build/cancelScheduledNotificationAsync').cancelScheduledNotificationAsync;
  setNotificationChannelAsync: typeof import('expo-notifications/build/setNotificationChannelAsync').setNotificationChannelAsync;
}

let apiNotificaciones: ApiNotificaciones | null | undefined;

function obtenerApiNotificaciones(): ApiNotificaciones | null {
  if (apiNotificaciones !== undefined) {
    return apiNotificaciones;
  }

  try {
    const { setNotificationHandler } =
      require('expo-notifications/build/NotificationsHandler') as typeof import('expo-notifications/build/NotificationsHandler');
    const { getPermissionsAsync, requestPermissionsAsync } =
      require('expo-notifications/build/NotificationPermissions') as typeof import('expo-notifications/build/NotificationPermissions');
    const { scheduleNotificationAsync } =
      require('expo-notifications/build/scheduleNotificationAsync') as typeof import('expo-notifications/build/scheduleNotificationAsync');
    const { cancelScheduledNotificationAsync } =
      require('expo-notifications/build/cancelScheduledNotificationAsync') as typeof import('expo-notifications/build/cancelScheduledNotificationAsync');
    const { setNotificationChannelAsync } =
      require('expo-notifications/build/setNotificationChannelAsync') as typeof import('expo-notifications/build/setNotificationChannelAsync');

    apiNotificaciones = {
      setNotificationHandler,
      getPermissionsAsync,
      requestPermissionsAsync,
      scheduleNotificationAsync,
      cancelScheduledNotificationAsync,
      setNotificationChannelAsync,
    };

    try {
      setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    } catch {
      // Sin handler las notificaciones locales se agendan igual.
    }

    return apiNotificaciones;
  } catch {
    apiNotificaciones = null;
    return null;
  }
}


/** Minutos antes del inicio en que se dispara el aviso local. */
export const ANTELACION_RECORDATORIO_MINUTOS = 60;

export interface RecordatorioEvento {
  eventoId: IdEvento;
  /** `null` cuando el evento quedó guardado pero no se pudo programar el aviso. */
  notificacionId: string | null;
  /** Momento en que se dispara el aviso, en ISO 8601. */
  programadoPara: string | null;
}

export type RecordatoriosEvento = Record<string, RecordatorioEvento>;

const ERROR_GUARDADO =
  'No pudimos guardar el recordatorio en este dispositivo. Intentá de nuevo.';
const ERROR_FECHA =
  'Este evento ya comenzó o su fecha no es válida. No se puede agendar un recordatorio.';
const ERROR_ESTADO =
  'Solo se pueden guardar eventos programados. Los eventos suspendidos, cancelados o finalizados no admiten recordatorios.';

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
      typeof candidato.programadoPara === 'string')
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
        recordatorios[eventoId] = valor;
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

async function asegurarPermisoNotificaciones(): Promise<ApiNotificaciones | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  const api = obtenerApiNotificaciones();
  if (api === null) {
    return null;
  }
  try {
    if (Platform.OS === 'android') {
      await api.setNotificationChannelAsync(CANAL_RECORDATORIOS, {
        name: 'Recordatorios de agenda',
        importance: AndroidImportance.DEFAULT,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const actual = await api.getPermissionsAsync();
    if (actual.granted) {
      return api;
    }
    if (!actual.canAskAgain) {
      return null;
    }
    const solicitado = await api.requestPermissionsAsync();
    return solicitado.granted ? api : null;
  } catch {
    return null;
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

export async function listarRecordatoriosEventos(): Promise<
  Result<RecordatoriosEvento>
> {
  const recordatorios = await leerRecordatorios();
  return { success: true, data: recordatorios };
}

/**
 * Guarda el evento en la agenda y programa su recordatorio local.
 * Un evento admite un único aviso activo: si ya estaba guardado no se
 * duplica (el límite global de avisos se completa en T15).
 */
export async function guardarEventoConRecordatorio(
  evento: Evento,
): Promise<Result<RecordatorioEvento>> {
  if (evento.estado !== 'programado') {
    return { success: false, error: ERROR_ESTADO };
  }

  const inicioMs = Date.parse(evento.inicio);
  if (Number.isNaN(inicioMs) || inicioMs <= Date.now()) {
    return { success: false, error: ERROR_FECHA };
  }

  const recordatorios = await leerRecordatorios();
  const existente = recordatorios[evento.id];
  if (existente !== undefined && existente.notificacionId !== null) {
    return { success: true, data: existente };
  }

  const api = await asegurarPermisoNotificaciones();
  const programadoPara = calcularAviso(inicioMs);
  let notificacionId: string | null = null;

  if (api !== null) {
    try {
      notificacionId = await api.scheduleNotificationAsync({
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
    } catch {
      notificacionId = null;
    }
  }

  const recordatorio: RecordatorioEvento = {
    eventoId: evento.id,
    notificacionId,
    programadoPara:
      notificacionId === null ? null : new Date(programadoPara).toISOString(),
  };

  const guardado = await escribirRecordatorios({
    ...recordatorios,
    [evento.id]: recordatorio,
  });
  if (!guardado) {
    if (notificacionId !== null && api !== null) {
      try {
        await api.cancelScheduledNotificationAsync(notificacionId);
      } catch {
        // Sin persistencia no podemos garantizar el recordatorio; se ignora.
      }
    }
    return { success: false, error: ERROR_GUARDADO };
  }

  return { success: true, data: recordatorio };
}

export async function quitarRecordatorioEvento(
  eventoId: IdEvento,
): Promise<Result<null>> {
  const recordatorios = await leerRecordatorios();
  const existente = recordatorios[eventoId];

  if (existente !== undefined && existente.notificacionId !== null) {
    const api = obtenerApiNotificaciones();
    if (api !== null) {
      try {
        await api.cancelScheduledNotificationAsync(existente.notificacionId);
      } catch {
        // El aviso pudo haberse disparado ya; igual quitamos el registro local.
      }
    }
  }

  const restantes: RecordatoriosEvento = { ...recordatorios };
  delete restantes[eventoId];
  const guardado = await escribirRecordatorios(restantes);
  if (!guardado) {
    return { success: false, error: ERROR_GUARDADO };
  }
  return { success: true, data: null };
}
