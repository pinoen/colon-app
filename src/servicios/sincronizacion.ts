import * as Network from 'expo-network';

import {
  actualizarMiUsuario,
  borrarPreferenciasPendientes,
  guardarPreferencias,
  guardarSesion,
  leerPreferenciasPendientes,
  leerSesionGuardada,
} from '@/servicios/autenticacion';
import { abrirBaseDatos } from '@/servicios/baseDatos';
import { puedeUsarCache } from '@/servicios/clienteApi';
import {
  prepararEventosGuardadosLocales,
  sincronizarEventoGuardadoPendientePorId,
} from '@/servicios/eventos';
import { sincronizarFavoritoPendientePorId } from '@/servicios/favoritos';
import {
  prepararVisitasPendientesDeCuenta,
  sincronizarVisitaPendientePorId,
} from '@/servicios/visitas';
import type { Result } from '@/tipos/api';
import type { IdUsuario, Usuario } from '@/tipos/usuario';

const MAX_INTENTOS_POR_CICLO = 2;
const ESPERA_REINTENTO_MS = 500;
const COOLDOWN_CICLO_MS = 5_000;

interface FilaPendiente {
  id: string;
  entidad: string;
  payload: string;
}

interface PayloadPendiente {
  usuarioId?: string;
}

export interface ResultadoSincronizacion {
  conectado: boolean;
  procesadas: number;
  pendientes: number;
}

let cicloEnVuelo: Promise<Result<ResultadoSincronizacion>> | null = null;
let usuarioCiclo: IdUsuario | null = null;
let ultimoCicloMs = 0;

function esNoAutenticado(resultado: Result<unknown>): boolean {
  return (
    !resultado.success &&
    (resultado.codigo === 'NO_AUTENTICADO' || resultado.estado === 401)
  );
}

async function estaConectado(): Promise<boolean> {
  try {
    const estado = await Network.getNetworkStateAsync();
    return (
      estado.isConnected === true && estado.isInternetReachable !== false
    );
  } catch {
    // Si Network no está disponible en el entorno, intentamos sincronizar.
    return true;
  }
}

async function listarPendientes(usuarioId: IdUsuario): Promise<FilaPendiente[]> {
  const base = await abrirBaseDatos();
  const filas = await base.getAllAsync<FilaPendiente>(
    `SELECT id, entidad, payload FROM cola_sincronizacion
     ORDER BY creadoEn ASC`,
  );
  return filas.filter((fila) => {
    try {
      const payload: unknown = JSON.parse(fila.payload);
      return (
        typeof payload === 'object' &&
        payload !== null &&
        (payload as PayloadPendiente).usuarioId === usuarioId
      );
    } catch {
      return false;
    }
  });
}

async function fijarIntentos(id: string, intentos: number): Promise<void> {
  const base = await abrirBaseDatos();
  await base.runAsync(
    'UPDATE cola_sincronizacion SET intentos = ? WHERE id = ?',
    [intentos, id],
  );
}

async function reiniciarIntentos(filas: FilaPendiente[]): Promise<void> {
  const base = await abrirBaseDatos();
  await base.withTransactionAsync(async () => {
    for (const fila of filas) {
      await base.runAsync(
        'UPDATE cola_sincronizacion SET intentos = 0 WHERE id = ?',
        [fila.id],
      );
    }
  });
}

async function sincronizarFila(
  fila: FilaPendiente,
  usuario: Usuario,
): Promise<Result<null> | null> {
  if (fila.entidad === 'favorito') {
    return sincronizarFavoritoPendientePorId(fila.id);
  }
  if (fila.entidad === 'visita') {
    return sincronizarVisitaPendientePorId(usuario, fila.id);
  }
  if (fila.entidad === 'evento-guardado') {
    return sincronizarEventoGuardadoPendientePorId(fila.id);
  }
  // La cola puede contener entidades que se implementen en fases posteriores.
  return null;
}

async function sincronizarPreferencias(
  usuario: Usuario,
): Promise<Result<null>> {
  const pendientes = await leerPreferenciasPendientes(usuario.id);
  if (pendientes === null) {
    return { success: true, data: null };
  }

  let ultimoError: Result<null> | null = null;
  for (let intento = 0; intento < MAX_INTENTOS_POR_CICLO; intento += 1) {
    const resultado = await actualizarMiUsuario({ preferencias: pendientes });
    if (resultado.success) {
      await borrarPreferenciasPendientes(usuario.id);
      await guardarPreferencias(resultado.data.preferencias);
      const sesion = await leerSesionGuardada();
      if (sesion.success && sesion.data?.usuario.id === usuario.id) {
        await guardarSesion({
          token: sesion.data.token,
          usuario: resultado.data,
        });
      }
      return { success: true, data: null };
    }

    ultimoError = {
      success: false,
      error: resultado.error,
      codigo: resultado.codigo,
      estado: resultado.estado,
    };
    if (!puedeUsarCache(resultado) || esNoAutenticado(resultado)) {
      return ultimoError;
    }
    if (intento + 1 < MAX_INTENTOS_POR_CICLO) {
      await new Promise((resolver) => setTimeout(resolver, ESPERA_REINTENTO_MS));
    }
  }
  return ultimoError ?? { success: true, data: null };
}

async function ejecutarCiclo(
  usuario: Usuario,
): Promise<Result<ResultadoSincronizacion>> {
  if (!(await estaConectado())) {
    return {
      success: true,
      data: { conectado: false, procesadas: 0, pendientes: 0 },
    };
  }

  await Promise.all([
    prepararVisitasPendientesDeCuenta(usuario),
    prepararEventosGuardadosLocales(usuario.id),
  ]);
  const filas = await listarPendientes(usuario.id);
  await reiniciarIntentos(filas);
  let procesadas = 0;
  let errorAutenticacion: Result<null> | null = null;

  for (const fila of filas) {
    for (let intento = 0; intento < MAX_INTENTOS_POR_CICLO; intento += 1) {
      const resultado = await sincronizarFila(fila, usuario);
      if (resultado === null) {
        break;
      }
      if (resultado.success) {
        procesadas += 1;
        break;
      }

      await fijarIntentos(fila.id, Math.min(intento + 1, 2));
      if (esNoAutenticado(resultado)) {
        errorAutenticacion = resultado;
        break;
      }
      if (!puedeUsarCache(resultado)) {
        break;
      }
      if (intento + 1 < MAX_INTENTOS_POR_CICLO) {
        await new Promise((resolver) =>
          setTimeout(resolver, ESPERA_REINTENTO_MS),
        );
      }
    }
    if (errorAutenticacion !== null) {
      break;
    }
  }

  if (errorAutenticacion !== null) {
    return errorAutenticacion;
  }

  const habiaPreferenciasPendientes =
    (await leerPreferenciasPendientes(usuario.id)) !== null;
  const preferencias = await sincronizarPreferencias(usuario);
  if (!preferencias.success && esNoAutenticado(preferencias)) {
    return preferencias;
  }
  if (habiaPreferenciasPendientes && preferencias.success) {
    procesadas += 1;
  }

  const pendientesRestantes = await listarPendientes(usuario.id);
  const preferenciasSiguenPendientes =
    (await leerPreferenciasPendientes(usuario.id)) !== null;

  return {
    success: true,
    data: {
      conectado: true,
      procesadas,
      pendientes:
        pendientesRestantes.length + (preferenciasSiguenPendientes ? 1 : 0),
    },
  };
}

/** Realiza como máximo dos reintentos por operación en cada ciclo online. */
export function sincronizarPendientes(
  usuario: Usuario,
  forzar = false,
): Promise<Result<ResultadoSincronizacion>> {
  if (cicloEnVuelo !== null) {
    return cicloEnVuelo;
  }

  const ahora = Date.now();
  if (
    !forzar &&
    usuarioCiclo === usuario.id &&
    ahora - ultimoCicloMs < COOLDOWN_CICLO_MS
  ) {
    return Promise.resolve({
      success: true,
      data: { conectado: true, procesadas: 0, pendientes: 0 },
    });
  }

  usuarioCiclo = usuario.id;
  ultimoCicloMs = ahora;
  const ciclo = ejecutarCiclo(usuario);
  cicloEnVuelo = ciclo;
  void ciclo.then(
    () => {
      if (cicloEnVuelo === ciclo) {
        cicloEnVuelo = null;
      }
    },
    () => {
      if (cicloEnVuelo === ciclo) {
        cicloEnVuelo = null;
      }
    },
  );
  return ciclo;
}
