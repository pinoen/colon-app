import { categoriasMock } from '@/mocks/categorias';
import { lugaresMock } from '@/mocks/lugares';
import {
  abrirBaseDatos,
  guardarLugar,
  guardarVisita,
  obtenerVisita as obtenerVisitaGuardada,
  obtenerVisitas,
} from '@/servicios/baseDatos';
import { obtenerUbicacionActual } from '@/servicios/ubicacion';
import type { Result } from '@/tipos/api';
import type { Coordenadas, IdLugar, Lugar } from '@/tipos/lugar';
import type { IdUsuario } from '@/tipos/usuario';
import type { IdVisita, OrigenVisita, Visita } from '@/tipos/visita';
import { distanciaMetros } from '@/utilidades/distancia';
import { parsearCodigoQr } from '@/utilidades/validacionQr';

/** Radio por defecto usado por la proximidad GPS (preferencia editable en T12). */
export const RADIO_PROXIMIDAD_METROS = 250;

/**
 * Sin sesión iniciada las visitas quedan asociadas a este usuario local.
 * T14 las reasocia al usuario real durante la sincronización.
 */
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

function generarIdVisita(): IdVisita {
  const marca = Date.now().toString(36);
  const azar = Math.random().toString(36).slice(2, 8);
  return `vis-${marca}${azar}`;
}

function buscarLugarActivo(id: IdLugar): Lugar | null {
  const lugar = lugaresMock.find((candidato) => candidato.id === id);
  return lugar !== undefined && lugar.activo ? lugar : null;
}

/**
 * Las visitas referencian lugares y usuarios por FK en SQLite. Antes de
 * insertar la visita se cachean las filas mínimas necesarias para que el
 * registro funcione aunque el catálogo todavía no esté precargado (T14).
 */
async function asegurarReferencias(lugar: Lugar): Promise<void> {
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

async function registrarVisitaLocal(
  lugar: Lugar,
  origen: OrigenVisita,
): Promise<Result<Visita>> {
  try {
    await asegurarReferencias(lugar);

    const visita: Visita = {
      id: generarIdVisita(),
      usuarioId: ID_USUARIO_LOCAL,
      lugarId: lugar.id,
      fechaHora: new Date().toISOString(),
      origen,
      fotoUri: null,
      nota: null,
      sincronizada: false,
    };

    await guardarVisita(visita);
    return { success: true, data: visita };
  } catch {
    return { success: false, error: ERROR_GUARDADO };
  }
}

/**
 * Valida el formato `COLON:lug-<id>` antes de tocar la base. Un QR ajeno,
 * roto o de otro esquema se ignora con un mensaje amigable.
 */
export async function registrarVisitaPorQr(
  codigoQr: string,
): Promise<Result<Visita>> {
  const lugarId = parsearCodigoQr(codigoQr);
  if (lugarId === null) {
    return { success: false, error: ERROR_QR_INVALIDO };
  }

  const lugar = buscarLugarActivo(lugarId);
  if (lugar === null) {
    return { success: false, error: ERROR_QR_NO_DISPONIBLE };
  }

  return registrarVisitaLocal(lugar, 'qr');
}

export async function registrarVisitaManual(
  lugarId: IdLugar,
): Promise<Result<Visita>> {
  const lugar = buscarLugarActivo(lugarId);
  if (lugar === null) {
    return { success: false, error: 'No encontramos ese lugar.' };
  }

  return registrarVisitaLocal(lugar, 'manual');
}

/**
 * Registra el lugar activo más cercano siempre que esté dentro del radio.
 * Si el permiso de ubicación se niega (BR-001), devuelve un mensaje
 * amigable y la app sigue funcionando con el alta manual.
 */
export async function registrarVisitaPorProximidad(
  radioMetros: number = RADIO_PROXIMIDAD_METROS,
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

  const [candidato] = lugaresMock
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

  return registrarVisitaLocal(candidato.lugar, 'gps');
}

export async function listarVisitas(): Promise<Result<Visita[]>> {
  try {
    const visitas = await obtenerVisitas();
    return { success: true, data: visitas };
  } catch {
    return {
      success: false,
      error: 'No pudimos leer tus visitas guardadas. Intentá de nuevo.',
    };
  }
}

export async function obtenerVisita(
  id: IdVisita,
): Promise<Result<Visita | null>> {
  try {
    const visita = await obtenerVisitaGuardada(id);
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

const ERROR_FOTO_INVALIDA =
  'No pudimos guardar la foto elegida. Probá con otra imagen.';

function esRutaLocal(uri: string): boolean {
  return uri.startsWith('file://');
}

/**
 * Guarda la foto y/o la nota de una visita existente. La foto queda como ruta
 * local `file://` y la visita se mantiene pendiente de sincronizar.
 */
export async function actualizarVisita(
  id: IdVisita,
  cambios: CambiosVisita,
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
    if (visita === null) {
      return { success: false, error: 'No encontramos esa visita.' };
    }

    const actualizada: Visita = {
      ...visita,
      fotoUri: cambios.fotoUri !== undefined ? cambios.fotoUri : visita.fotoUri,
      nota: cambios.nota !== undefined ? cambios.nota : visita.nota,
      sincronizada: false,
    };

    const base = await abrirBaseDatos();
    await base.runAsync(
      `UPDATE visitas
       SET fotoUri = ?, nota = ?, sincronizada = 0
       WHERE id = ?`,
      [actualizada.fotoUri, actualizada.nota, actualizada.id],
    );

    return { success: true, data: actualizada };
  } catch {
    return {
      success: false,
      error: 'No pudimos guardar los cambios de la visita. Intentá de nuevo.',
    };
  }
}
