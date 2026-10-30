import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';

import type { Result } from '@/tipos/api';
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

const DEMORA_MOCK_MS = 300;

export const PREFERENCIAS_POR_DEFECTO: Preferencias = {
  categoriasFavoritas: [],
  avisarProximidad: true,
  radioAvisoMetros: 250,
  tema: 'sistema',
};

export interface Sesion {
  token: string;
  usuario: Usuario;
}

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

const demoraMock = () =>
  new Promise((resolver) => setTimeout(resolver, DEMORA_MOCK_MS));

function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

function esEmailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Genera un id estable a partir del email para que el mismo usuario conserve
 * sus favoritos entre ingresos. Nunca se hacen operaciones matemáticas con el id.
 */
function generarIdUsuario(email: string): IdUsuario {
  let hash = 2166136261;
  for (let indice = 0; indice < email.length; indice += 1) {
    hash ^= email.charCodeAt(indice);
    hash = Math.imul(hash, 16777619);
  }
  return `usr-${(hash >>> 0).toString(36)}`;
}

function generarToken(): string {
  const marca = Date.now().toString(36);
  const azar = Math.random().toString(36).slice(2, 12);
  return `tok-${marca}${azar}`;
}

function nombreDesdeEmail(email: string): string {
  const base = email.split('@')[0] ?? 'Visitante';
  const partes = base
    .split(/[._-]+/)
    .filter((parte) => parte.length > 0)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1));
  return partes.length > 0 ? partes.join(' ') : 'Visitante';
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

/**
 * Login simulado mientras la API del tercero no está disponible (A2/A3).
 * Valida las entradas y devuelve un token + perfil tipado; nunca persiste la
 * contraseña.
 */
export async function iniciarSesion(
  email: string,
  contrasena: string,
): Promise<Result<Sesion>> {
  await demoraMock();

  const correo = normalizarEmail(email);
  if (!esEmailValido(correo)) {
    return { success: false, error: 'Ingresá un email válido.' };
  }
  if (contrasena.length < 6) {
    return {
      success: false,
      error: 'La contraseña debe tener al menos 6 caracteres.',
    };
  }

  const preferencias = await leerPreferencias();
  const existente = await leerUsuarioGuardado();

  const usuario: Usuario =
    existente !== null && existente.email === correo
      ? { ...existente, preferencias }
      : {
          id: generarIdUsuario(correo),
          nombre: nombreDesdeEmail(correo),
          email: correo,
          avatarUrl: null,
          creadoEn: new Date().toISOString(),
          preferencias,
        };

  return { success: true, data: { token: generarToken(), usuario } };
}

export async function registrarCuenta(
  nombre: string,
  email: string,
  contrasena: string,
): Promise<Result<Sesion>> {
  await demoraMock();

  const correo = normalizarEmail(email);
  const nombreLimpio = nombre.trim();

  if (nombreLimpio.length < 2) {
    return { success: false, error: 'Ingresá tu nombre.' };
  }
  if (!esEmailValido(correo)) {
    return { success: false, error: 'Ingresá un email válido.' };
  }
  if (contrasena.length < 6) {
    return {
      success: false,
      error: 'La contraseña debe tener al menos 6 caracteres.',
    };
  }

  const usuario: Usuario = {
    id: generarIdUsuario(correo),
    nombre: nombreLimpio,
    email: correo,
    avatarUrl: null,
    creadoEn: new Date().toISOString(),
    preferencias: await leerPreferencias(),
  };

  return { success: true, data: { token: generarToken(), usuario } };
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
