import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

import type { Result } from '@/tipos/api';
import type { Coordenadas, IdLugar, Lugar } from '@/tipos/lugar';
import type { Preferencias } from '@/tipos/usuario';
import { distanciaMetros, formatearDistancia } from '@/utilidades/distancia';

export const CANAL_RECORDATORIOS = 'recordatorios-agenda';
export const CANAL_PROXIMIDAD = 'avisos-proximidad';

const CLAVE_AVISOS_PROXIMIDAD = 'proximidad:avisos:v1';
/** Margen extra para no repetir el aviso si el GPS oscila justo en el borde. */
const MARGEN_SALIDA_METROS = 25;
const NOMBRE_CANAL_PROXIMIDAD = 'Avisos de proximidad';
const NOMBRE_CANAL_RECORDATORIOS = 'Recordatorios de agenda';

/**
 * Expo Go (SDK 57) no incluye `ExpoTopicSubscriptionModule`, que el índice de
 * `expo-notifications` importa para notificaciones push. Por eso cargamos solo
 * los módulos de notificaciones locales de forma diferida y toleramos que el
 * entorno no los soporte.
 */
export interface ApiNotificaciones {
  setNotificationHandler: typeof import('expo-notifications/build/NotificationsHandler').setNotificationHandler;
  getPermissionsAsync: typeof import('expo-notifications/build/NotificationPermissions').getPermissionsAsync;
  requestPermissionsAsync: typeof import('expo-notifications/build/NotificationPermissions').requestPermissionsAsync;
  scheduleNotificationAsync: typeof import('expo-notifications/build/scheduleNotificationAsync').scheduleNotificationAsync;
  cancelScheduledNotificationAsync: typeof import('expo-notifications/build/cancelScheduledNotificationAsync').cancelScheduledNotificationAsync;
  setNotificationChannelAsync: typeof import('expo-notifications/build/setNotificationChannelAsync').setNotificationChannelAsync;
}

let apiNotificaciones: ApiNotificaciones | null | undefined;

export function obtenerApiNotificaciones(): ApiNotificaciones | null {
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

async function prepararCanales(api: ApiNotificaciones): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    await api.setNotificationChannelAsync(CANAL_RECORDATORIOS, {
      name: NOMBRE_CANAL_RECORDATORIOS,
      importance: AndroidImportance.DEFAULT,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
    await api.setNotificationChannelAsync(CANAL_PROXIMIDAD, {
      name: NOMBRE_CANAL_PROXIMIDAD,
      importance: AndroidImportance.DEFAULT,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch {
    // Si el canal falla, el aviso se intenta igual en el canal por defecto.
  }
}

export type EstadoPermisoNotificaciones =
  | 'concedido'
  | 'pendiente'
  | 'denegado'
  | 'no-soportado';

/** Consulta el permiso sin mostrar el diálogo del sistema. */
export async function consultarPermisoNotificaciones(): Promise<EstadoPermisoNotificaciones> {
  if (Platform.OS === 'web') {
    return 'no-soportado';
  }
  const api = obtenerApiNotificaciones();
  if (api === null) {
    return 'no-soportado';
  }
  try {
    const actual = await api.getPermissionsAsync();
    if (actual.granted) {
      await prepararCanales(api);
      return 'concedido';
    }
    return actual.canAskAgain ? 'pendiente' : 'denegado';
  } catch {
    return 'no-soportado';
  }
}

/** Pide el permiso de notificaciones locales. Nunca lanza: devuelve el estado. */
export async function pedirPermisoNotificaciones(): Promise<EstadoPermisoNotificaciones> {
  if (Platform.OS === 'web') {
    return 'no-soportado';
  }
  const api = obtenerApiNotificaciones();
  if (api === null) {
    return 'no-soportado';
  }
  try {
    const actual = await api.getPermissionsAsync();
    if (actual.granted) {
      await prepararCanales(api);
      return 'concedido';
    }
    if (!actual.canAskAgain) {
      return 'denegado';
    }
    const solicitado = await api.requestPermissionsAsync();
    if (solicitado.granted) {
      await prepararCanales(api);
      return 'concedido';
    }
    return solicitado.canAskAgain ? 'pendiente' : 'denegado';
  } catch {
    return 'no-soportado';
  }
}

/** Devuelve la API lista para usar o `null` si no hay permiso/soporte. */
export async function asegurarPermisoNotificaciones(): Promise<ApiNotificaciones | null> {
  const estado = await pedirPermisoNotificaciones();
  return estado === 'concedido' ? obtenerApiNotificaciones() : null;
}

interface RegistroAvisos {
  [lugarId: string]: string;
}

function fechaLocal(ahora: Date): string {
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

async function leerRegistroAvisos(): Promise<RegistroAvisos> {
  try {
    const crudo = await Storage.getItemAsync(CLAVE_AVISOS_PROXIMIDAD);
    if (crudo === null) {
      return {};
    }
    const parsed: unknown = JSON.parse(crudo);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entrada): entrada is [string, string] =>
          typeof entrada[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

async function marcarAvisoDelDia(
  lugarId: IdLugar,
  fecha: string,
): Promise<void> {
  const registro = await leerRegistroAvisos();
  const delDia: RegistroAvisos = {};
  for (const [id, dia] of Object.entries(registro)) {
    if (dia === fecha) {
      delDia[id] = dia;
    }
  }
  delDia[lugarId] = fecha;
  await Storage.setItemAsync(
    CLAVE_AVISOS_PROXIMIDAD,
    JSON.stringify(delDia),
  );
}

export type MotivoSinAviso =
  | 'preferencia-desactivada'
  | 'sin-lugares'
  | 'ya-avisado-hoy'
  | 'permiso-denegado'
  | 'no-soportado'
  | 'fuera-de-radio';

export interface EstadoProximidad {
  /** Lugares que quedaron dentro del radio (o del margen de salida). */
  dentro: IdLugar[];
  /** Lugar que acaba de recibir el aviso, o `null`. */
  avisado: IdLugar | null;
  /** Motivo por el que no se avisó en esta lectura, si aplica. */
  motivo: MotivoSinAviso | null;
}

export interface ResultadoAvisoProximidad {
  avisado: boolean;
  motivo: MotivoSinAviso | null;
}

/** Evita que dos lecturas de GPS casi simultáneas dupliquen el aviso. */
const avisosEnCurso = new Set<IdLugar>();

export async function avisarProximidad(
  lugar: Lugar,
  distancia: number,
  ahora: Date = new Date(),
): Promise<Result<ResultadoAvisoProximidad>> {
  if (avisosEnCurso.has(lugar.id)) {
    return { success: true, data: { avisado: false, motivo: 'ya-avisado-hoy' } };
  }
  avisosEnCurso.add(lugar.id);

  try {
    const hoy = fechaLocal(ahora);
    const registro = await leerRegistroAvisos();
    if (registro[lugar.id] === hoy) {
      return { success: true, data: { avisado: false, motivo: 'ya-avisado-hoy' } };
    }

    const api = await asegurarPermisoNotificaciones();
    if (api === null) {
      const permiso = await consultarPermisoNotificaciones();
      return {
        success: true,
        data: {
          avisado: false,
          motivo:
            permiso === 'no-soportado' ? 'no-soportado' : 'permiso-denegado',
        },
      };
    }

    await api.scheduleNotificationAsync({
      content: {
        title: `Estás cerca de ${lugar.nombre}`,
        body: `El lugar está a ${formatearDistancia(distancia)}. Abrí la guía para conocer más.`,
        data: { tipo: 'proximidad', lugarId: lugar.id },
        sound: 'default',
      },
      trigger: { channelId: CANAL_PROXIMIDAD },
    });
    await marcarAvisoDelDia(lugar.id, hoy);
    return { success: true, data: { avisado: true, motivo: null } };
  } catch {
    return {
      success: false,
      error: 'No pudimos mostrar el aviso de proximidad.',
    };
  } finally {
    avisosEnCurso.delete(lugar.id);
  }
}

/**
 * Procesa una lectura de GPS y avisa, como máximo, del lugar más cercano que
 * acaba de entrar al radio. El estado `dentro` permite distinguir una entrada
 * real de una lectura repetida dentro del mismo radio.
 */
export async function procesarProximidad(
  ubicacion: Coordenadas,
  lugares: Lugar[],
  preferencias: Preferencias,
  dentroAnterior: ReadonlySet<IdLugar>,
  ahora: Date = new Date(),
): Promise<Result<EstadoProximidad>> {
  if (!preferencias.avisarProximidad) {
    return {
      success: true,
      data: {
        dentro: [],
        avisado: null,
        motivo: 'preferencia-desactivada',
      },
    };
  }

  const activos = lugares.filter((lugar) => lugar.activo);
  if (activos.length === 0) {
    return {
      success: true,
      data: { dentro: [], avisado: null, motivo: 'sin-lugares' },
    };
  }

  const radio = preferencias.radioAvisoMetros;
  const porId = new Map(activos.map((lugar) => [lugar.id, lugar] as const));
  const distancias = new Map<IdLugar, number>();
  for (const lugar of activos) {
    distancias.set(lugar.id, distanciaMetros(ubicacion, lugar.coordenadas));
  }

  const dentroAhora = activos
    .filter((lugar) => (distancias.get(lugar.id) ?? Infinity) <= radio)
    .map((lugar) => lugar.id);

  const dentro = new Set<IdLugar>();
  for (const id of dentroAnterior) {
    const distancia = distancias.get(id);
    if (distancia !== undefined && distancia <= radio + MARGEN_SALIDA_METROS) {
      dentro.add(id);
    }
  }
  for (const id of dentroAhora) {
    dentro.add(id);
  }

  const entrados = dentroAhora.filter((id) => !dentroAnterior.has(id));
  if (entrados.length === 0) {
    return {
      success: true,
      data: { dentro: [...dentro], avisado: null, motivo: 'fuera-de-radio' },
    };
  }

  const candidatoId = entrados.sort(
    (a, b) => (distancias.get(a) ?? Infinity) - (distancias.get(b) ?? Infinity),
  )[0];
  const candidato = porId.get(candidatoId);
  if (candidato === undefined) {
    return {
      success: true,
      data: { dentro: [...dentro], avisado: null, motivo: 'fuera-de-radio' },
    };
  }

  const aviso = await avisarProximidad(
    candidato,
    distancias.get(candidatoId) ?? 0,
    ahora,
  );
  if (!aviso.success) {
    return aviso;
  }

  return {
    success: true,
    data: {
      dentro: [...dentro],
      avisado: aviso.data.avisado ? candidatoId : null,
      motivo: aviso.data.motivo,
    },
  };
}
