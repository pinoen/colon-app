import * as SecureStore from 'expo-secure-store';
import { deleteDatabaseAsync } from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';

import {
  cerrarBaseDatos,
  NOMBRE_BASE_DATOS,
} from '@/servicios/baseDatos';

/**
 * Versión de los datos locales. La 1 es el primer arranque con la API real:
 * los datos mock tenían ids que ahora significan otra cosa (por ejemplo,
 * `lug-001` era Parque Quirós y en la API es Termas de Colón), así que no se
 * pueden migrar de forma segura.
 */
const CLAVE_VERSION_DATOS = 'colon.datos.version';
const VERSION_DATOS_ACTUAL = 1;

const CLAVES_KV_A_BORRAR = [
  'colon.preferencias.v1',
  'colon.preferencias.pendientes',
  'colon.favoritos.snapshot',
  'colon.auth.usuario',
  'colon.auth.biometria',
  'agenda:recordatorios:v1',
];

const CLAVES_SEGURAS_A_BORRAR = ['colon.auth.token'];

/**
 * Borra una sola vez la base local y las preferencias/sesión mock antes de
 * que cualquier pantalla abra SQLite. Si algo falla, no se marca la versión
 * para volver a intentarlo en el próximo arranque.
 */
export async function aplicarMigracionLocal(): Promise<void> {
  let versionGuardada: number;
  try {
    versionGuardada = Number(await Storage.getItemAsync(CLAVE_VERSION_DATOS)) || 0;
  } catch {
    versionGuardada = 0;
  }

  if (versionGuardada >= VERSION_DATOS_ACTUAL) {
    return;
  }

  try {
    await cerrarBaseDatos();
  } catch {
    // Si la conexión ya estaba cerrada, seguimos con el borrado.
  }

  try {
    await deleteDatabaseAsync(NOMBRE_BASE_DATOS);
  } catch {
    // Si la base todavía no existía, no hay nada que borrar.
  }

  // Los recordatorios mock ya no corresponden a eventos reales. Se cancelan
  // todas las notificaciones locales de la app antes de borrar el registro.
  try {
    const { cancelAllScheduledNotificationsAsync } =
      require('expo-notifications/build/cancelAllScheduledNotificationsAsync') as typeof import('expo-notifications/build/cancelAllScheduledNotificationsAsync');
    await cancelAllScheduledNotificationsAsync();
  } catch {
    // Expo Go puede no tener el módulo de notificaciones; no bloquea el reset.
  }

  for (const clave of CLAVES_KV_A_BORRAR) {
    try {
      await Storage.removeItemAsync(clave);
    } catch {
      // Una clave que no existe o no está disponible no bloquea la migración.
    }
  }

  for (const clave of CLAVES_SEGURAS_A_BORRAR) {
    try {
      await SecureStore.deleteItemAsync(clave);
    } catch {
      // SecureStore no está disponible en algunos entornos (por ejemplo web).
    }
  }

  await Storage.setItemAsync(
    CLAVE_VERSION_DATOS,
    String(VERSION_DATOS_ACTUAL),
  );
}
