import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';

import { peticion } from '@/servicios/clienteApi';
import type { Result, Sesion as SesionApi } from '@/tipos/api';
import type { IdUsuario, Preferencias, Usuario } from '@/tipos/usuario';

/**
 * El token de sesión es el único dato sensible de la autenticación y vive
 * exclusivamente en SecureStore (nunca en kv-store ni en logs).
 */
const CLAVE_TOKEN = 'colon.auth.token';
/** Perfil público del usuario (nombre/email/preferencias), sin credenciales. */
const CLAVE_USUARIO = 'colon.auth.usuario';
/** Bandera no sensible que habilita el reingreso biométrico local. */
const CLAVE_BIOMETRIA = 'colon.auth.biometria';
const CLAVE_PREFERENCIAS = 'colon.preferencias.v1';
const CLAVE_PREFERENCIAS_PENDIENTES = 'colon.preferencias.pendientes';

export const PREFERENCIAS_POR_DEFECTO: Preferencias = {
  categoriasFavoritas: [],
  avisarProximidad: true,
  radioAvisoMetros: 250,
  tema: 'sistema',
};

export type Sesion = SesionApi;

const ERROR_SESION =
  'No pudimos guardar tu sesión en este dispositivo. Intentá de nuevo.';
const ERROR_SIN_SESION =
  'No hay una sesión guardada. Ingresá con tu email y contraseña.';
const ERROR_BIOMETRIA_NO_DISPONIBLE =
  'Este dispositivo no tiene huella o rostro configurado. Podés ingresar con tu email y contraseña.';
const ERROR_BIOMETRIA_DESHABILITADA =
  'Activá el reingreso por biometría desde tu perfil para usar esta opción.';
const ERROR_VERIFICACION =
  'No pudimos verificar tu identidad. Ingresá con tu email y contraseña.';

function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

function esEmailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizarPreferencias(valor: unknown): Preferencias {
  const candidato =
    typeof valor === 'object' && valor !== null
      ? (valor as Record<string, unknown>)
      : {};

  const categorias = Array.isArray(candidato.categoriasFavoritas)
    ? candidato.categoriasFavoritas.filter(
        (categoriaId): categoriaId is string => typeof categoriaId === 'string',
      )
    : [];

  const radio = candidato.radioAvisoMetros;
  const tema = candidato.tema;

  return {
    categoriasFavoritas: Array.from(new Set(categorias)),
    avisarProximidad:
      typeof candidato.avisarProximidad === 'boolean'
        ? candidato.avisarProximidad
        : PREFERENCIAS_POR_DEFECTO.avisarProximidad,
    radioAvisoMetros:
      radio === 100 || radio === 250 || radio === 500
        ? radio
        : PREFERENCIAS_POR_DEFECTO.radioAvisoMetros,
    tema:
      tema === 'claro' || tema === 'oscuro' || tema === 'sistema'
        ? tema
        : PREFERENCIAS_POR_DEFECTO.tema,
  };
}

function normalizarUsuario(valor: unknown): Usuario | null {
  if (typeof valor !== 'object' || valor === null) {
    return null;
  }

  const candidato = valor as Record<string, unknown>;
  if (
    typeof candidato.id !== 'string' ||
    !candidato.id.startsWith('usr-') ||
    typeof candidato.nombre !== 'string' ||
    typeof candidato.email !== 'string' ||
    typeof candidato.creadoEn !== 'string'
  ) {
    return null;
  }

  return {
    id: candidato.id as IdUsuario,
    nombre: candidato.nombre,
    email: candidato.email,
    avatarUrl:
      typeof candidato.avatarUrl === 'string' ? candidato.avatarUrl : null,
    creadoEn: candidato.creadoEn,
    preferencias: normalizarPreferencias(candidato.preferencias),
  };
}

function normalizarSesion(valor: unknown): Sesion | null {
  if (typeof valor !== 'object' || valor === null) {
    return null;
  }
  const candidato = valor as Record<string, unknown>;
  const usuario = normalizarUsuario(candidato.usuario);
  if (
    typeof candidato.token !== 'string' ||
    candidato.token.length === 0 ||
    usuario === null
  ) {
    return null;
  }
  return { token: candidato.token, usuario };
}

export interface CambiosUsuarioApi {
  nombre?: string;
  avatarUrl?: string | null;
  preferencias?: Partial<Preferencias>;
}

export async function obtenerMiUsuario(): Promise<Result<Usuario>> {
  const respuesta = await peticion<unknown>({ method: 'GET', url: '/yo' });
  if (!respuesta.success) {
    return respuesta;
  }
  const usuario = normalizarUsuario(respuesta.data);
  return usuario === null
    ? {
        success: false,
        error: 'La API devolvió un perfil con formato inválido.',
        codigo: 'RESPUESTA_INVALIDA',
      }
    : { success: true, data: usuario };
}

export async function actualizarMiUsuario(
  cambios: CambiosUsuarioApi,
): Promise<Result<Usuario>> {
  const respuesta = await peticion<unknown>({
    method: 'PATCH',
    url: '/yo',
    data: cambios,
  });
  if (!respuesta.success) {
    return respuesta;
  }
  const usuario = normalizarUsuario(respuesta.data);
  return usuario === null
    ? {
        success: false,
        error: 'La API devolvió un perfil con formato inválido.',
        codigo: 'RESPUESTA_INVALIDA',
      }
    : { success: true, data: usuario };
}

export async function guardarPreferenciasPendientes(
  usuarioId: IdUsuario,
  preferencias: Preferencias,
): Promise<boolean> {
  try {
    await Storage.setItemAsync(
      CLAVE_PREFERENCIAS_PENDIENTES,
      JSON.stringify({ usuarioId, preferencias }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function leerPreferenciasPendientes(
  usuarioId: IdUsuario,
): Promise<Preferencias | null> {
  try {
    const crudo = await Storage.getItemAsync(CLAVE_PREFERENCIAS_PENDIENTES);
    if (crudo === null) {
      return null;
    }
    const pendiente: unknown = JSON.parse(crudo);
    if (
      typeof pendiente !== 'object' ||
      pendiente === null ||
      (pendiente as Record<string, unknown>).usuarioId !== usuarioId
    ) {
      return null;
    }
    return normalizarPreferencias(
      (pendiente as Record<string, unknown>).preferencias,
    );
  } catch {
    return null;
  }
}

export async function borrarPreferenciasPendientes(
  usuarioId?: IdUsuario,
): Promise<void> {
  try {
    if (usuarioId !== undefined) {
      const crudo = await Storage.getItemAsync(CLAVE_PREFERENCIAS_PENDIENTES);
      if (crudo === null) {
        return;
      }
      const pendiente: unknown = JSON.parse(crudo);
      if (
        typeof pendiente !== 'object' ||
        pendiente === null ||
        (pendiente as Record<string, unknown>).usuarioId !== usuarioId
      ) {
        return;
      }
    }
    await Storage.removeItemAsync(CLAVE_PREFERENCIAS_PENDIENTES);
  } catch {
    // Una clave ausente o un almacenamiento no disponible no bloquea el flujo.
  }
}

async function leerUsuarioGuardado(): Promise<Usuario | null> {
  try {
    const crudo = await Storage.getItemAsync(CLAVE_USUARIO);
    if (crudo === null) {
      return null;
    }
    return normalizarUsuario(JSON.parse(crudo));
  } catch {
    return null;
  }
}

export async function leerPreferencias(): Promise<Preferencias> {
  try {
    const crudo = await Storage.getItemAsync(CLAVE_PREFERENCIAS);
    if (crudo === null) {
      return { ...PREFERENCIAS_POR_DEFECTO };
    }
    return normalizarPreferencias(JSON.parse(crudo));
  } catch {
    return { ...PREFERENCIAS_POR_DEFECTO };
  }
}

export async function guardarPreferencias(
  preferencias: Preferencias,
): Promise<Result<Preferencias>> {
  const normalizadas = normalizarPreferencias(preferencias);
  try {
    await Storage.setItemAsync(
      CLAVE_PREFERENCIAS,
      JSON.stringify(normalizadas),
    );
    return { success: true, data: normalizadas };
  } catch {
    return {
      success: false,
      error: 'No pudimos guardar tus preferencias. Intentá de nuevo.',
    };
  }
}

export async function iniciarSesion(
  email: string,
  contrasena: string,
): Promise<Result<Sesion>> {
  const correo = normalizarEmail(email);
  if (!esEmailValido(correo)) {
    return { success: false, error: 'Ingresá un email válido.' };
  }
  if (contrasena.length === 0) {
    return { success: false, error: 'Ingresá tu contraseña.' };
  }

  const respuesta = await peticion<unknown>({
    method: 'POST',
    url: '/auth/ingreso',
    data: { email: correo, contrasena },
  });
  if (!respuesta.success) {
    return respuesta;
  }
  const sesion = normalizarSesion(respuesta.data);
  return sesion === null
    ? {
        success: false,
        error: 'La API devolvió una sesión con formato inválido.',
        codigo: 'RESPUESTA_INVALIDA',
      }
    : { success: true, data: sesion };
}

export async function registrarCuenta(
  nombre: string,
  email: string,
  contrasena: string,
): Promise<Result<Sesion>> {
  const correo = normalizarEmail(email);
  const nombreLimpio = nombre.trim();

  if (nombreLimpio.length < 2) {
    return { success: false, error: 'Ingresá tu nombre.' };
  }
  if (nombreLimpio.length > 100) {
    return { success: false, error: 'El nombre puede tener hasta 100 letras.' };
  }
  if (!esEmailValido(correo)) {
    return { success: false, error: 'Ingresá un email válido.' };
  }
  if (contrasena.length < 8) {
    return {
      success: false,
      error: 'La contraseña debe tener al menos 8 caracteres.',
    };
  }
  if (contrasena.length > 200) {
    return { success: false, error: 'La contraseña es demasiado larga.' };
  }

  const respuesta = await peticion<unknown>({
    method: 'POST',
    url: '/auth/registro',
    data: { nombre: nombreLimpio, email: correo, contrasena },
  });
  if (!respuesta.success) {
    return respuesta;
  }
  const sesion = normalizarSesion(respuesta.data);
  return sesion === null
    ? {
        success: false,
        error: 'La API devolvió una sesión con formato inválido.',
        codigo: 'RESPUESTA_INVALIDA',
      }
    : { success: true, data: sesion };
}

/** Guarda el token en SecureStore y el perfil no sensible en kv-store. */
export async function guardarSesion(sesion: Sesion): Promise<Result<null>> {
  try {
    await SecureStore.setItemAsync(CLAVE_TOKEN, sesion.token);
    await Storage.setItemAsync(
      CLAVE_USUARIO,
      JSON.stringify(sesion.usuario),
    );
    return { success: true, data: null };
  } catch {
    try {
      await SecureStore.deleteItemAsync(CLAVE_TOKEN);
    } catch {
      // Sin acceso a SecureStore no hay sesión que limpiar.
    }
    return { success: false, error: ERROR_SESION };
  }
}

export async function leerSesionGuardada(): Promise<Result<Sesion | null>> {
  try {
    const token = await SecureStore.getItemAsync(CLAVE_TOKEN);
    if (token === null) {
      return { success: true, data: null };
    }

    const usuario = await leerUsuarioGuardado();
    if (usuario === null) {
      return { success: true, data: null };
    }

    return { success: true, data: { token, usuario } };
  } catch {
    return {
      success: false,
      error: 'No pudimos recuperar tu sesión guardada. Intentá de nuevo.',
    };
  }
}

export async function borrarSesionGuardada(): Promise<Result<null>> {
  try {
    await SecureStore.deleteItemAsync(CLAVE_TOKEN);
    await Storage.removeItemAsync(CLAVE_USUARIO);
    return { success: true, data: null };
  } catch {
    return {
      success: false,
      error: 'No pudimos cerrar la sesión. Intentá de nuevo.',
    };
  }
}

async function biometriaDisponible(): Promise<boolean> {
  try {
    const [tieneHardware, estaInscripta] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return tieneHardware && estaInscripta;
  } catch {
    return false;
  }
}

async function leerBiometriaHabilitada(): Promise<boolean> {
  try {
    return (await Storage.getItemAsync(CLAVE_BIOMETRIA)) === '1';
  } catch {
    return false;
  }
}

export async function consultarBiometria(): Promise<{
  disponible: boolean;
  habilitada: boolean;
}> {
  const [disponible, habilitada] = await Promise.all([
    biometriaDisponible(),
    leerBiometriaHabilitada(),
  ]);
  return {
    disponible,
    habilitada: disponible && habilitada,
  };
}

export async function establecerBiometria(
  habilitada: boolean,
): Promise<Result<boolean>> {
  if (habilitada && !(await biometriaDisponible())) {
    return { success: false, error: ERROR_BIOMETRIA_NO_DISPONIBLE };
  }

  try {
    await Storage.setItemAsync(CLAVE_BIOMETRIA, habilitada ? '1' : '0');
    return { success: true, data: habilitada };
  } catch {
    return {
      success: false,
      error: 'No pudimos guardar la preferencia de biometría.',
    };
  }
}

/**
 * Reingreso local: solo funciona si ya existe una sesión guardada y el usuario
 * habilitó la biometría. No reemplaza al login con email/contraseña.
 */
export async function autenticarConBiometria(): Promise<Result<null>> {
  try {
    const token = await SecureStore.getItemAsync(CLAVE_TOKEN);
    if (token === null) {
      return { success: false, error: ERROR_SIN_SESION };
    }

    if (!(await leerBiometriaHabilitada())) {
      return { success: false, error: ERROR_BIOMETRIA_DESHABILITADA };
    }

    if (!(await biometriaDisponible())) {
      return { success: false, error: ERROR_BIOMETRIA_NO_DISPONIBLE };
    }

    const resultado = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Ingresá a Guía Turística de Colón',
      cancelLabel: 'Usar contraseña',
      disableDeviceFallback: false,
    });

    if (!resultado.success) {
      return { success: false, error: ERROR_VERIFICACION };
    }

    return { success: true, data: null };
  } catch {
    return { success: false, error: ERROR_VERIFICACION };
  }
}
