import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useTema } from '@/context/TemaContext';
import {
  PREFERENCIAS_POR_DEFECTO,
  actualizarMiUsuario,
  autenticarConBiometria,
  borrarPreferenciasPendientes,
  borrarSesionGuardada,
  consultarBiometria,
  establecerBiometria,
  guardarPreferencias,
  guardarPreferenciasPendientes,
  guardarSesion,
  iniciarSesion as iniciarSesionServicio,
  leerPreferenciasPendientes,
  leerPreferencias,
  leerSesionGuardada,
  obtenerMiUsuario,
  registrarCuenta as registrarCuentaServicio,
  type Sesion,
} from '@/servicios/autenticacion';
import {
  fijarTokenAcceso,
  puedeUsarCache,
  registrarManejadorNoAutorizado,
} from '@/servicios/clienteApi';
import type { Result } from '@/tipos/api';
import type { Preferencias, Usuario } from '@/tipos/usuario';

interface ContextoAuth {
  usuario: Usuario | null;
  preferencias: Preferencias;
  cargando: boolean;
  /** `true` cuando hay sesión previa y la biometría está habilitada. */
  requiereDesbloqueo: boolean;
  biometriaDisponible: boolean;
  biometriaHabilitada: boolean;
  iniciarSesion: (email: string, contrasena: string) => Promise<Result<Usuario>>;
  registrarse: (
    nombre: string,
    email: string,
    contrasena: string,
  ) => Promise<Result<Usuario>>;
  cerrarSesion: () => Promise<Result<null>>;
  desbloquearConBiometria: () => Promise<Result<null>>;
  activarBiometria: (habilitada: boolean) => Promise<Result<boolean>>;
  actualizarPerfil: (
    cambios: Partial<Pick<Usuario, 'nombre' | 'avatarUrl'>>,
  ) => Promise<Result<Usuario>>;
  actualizarPreferencias: (
    cambios: Partial<Preferencias>,
  ) => Promise<Result<Preferencias>>;
}

const AuthContexto = createContext<ContextoAuth | null>(null);

function esNoAutenticado(resultado: Result<unknown>): boolean {
  return (
    !resultado.success &&
    (resultado.codigo === 'NO_AUTENTICADO' || resultado.estado === 401)
  );
}

async function sincronizarPreferenciasPendientes(
  usuario: Usuario,
): Promise<Result<Usuario>> {
  const pendientes = await leerPreferenciasPendientes(usuario.id);
  if (pendientes === null) {
    return { success: true, data: usuario };
  }

  const resultado = await actualizarMiUsuario({ preferencias: pendientes });
  if (resultado.success) {
    await borrarPreferenciasPendientes(usuario.id);
  }
  return resultado;
}

async function guardarUsuarioEnSesion(usuario: Usuario): Promise<void> {
  const sesion = await leerSesionGuardada();
  if (sesion.success && sesion.data !== null) {
    await guardarSesion({ token: sesion.data.token, usuario });
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const { cambiarTema } = useTema();

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [preferencias, setPreferencias] = useState<Preferencias>(
    PREFERENCIAS_POR_DEFECTO,
  );
  const [cargando, setCargando] = useState(true);
  const [requiereDesbloqueo, setRequiereDesbloqueo] = useState(false);
  const [biometriaDisponible, setBiometriaDisponible] = useState(false);
  const [biometriaHabilitada, setBiometriaHabilitada] = useState(false);

  useEffect(() => {
    registrarManejadorNoAutorizado(() => {
      fijarTokenAcceso(null);
      setUsuario(null);
      setRequiereDesbloqueo(false);
      void borrarSesionGuardada();
    });
    return () => registrarManejadorNoAutorizado(null);
  }, []);

  useEffect(() => {
    let activo = true;

    const cargar = async () => {
      const [preferenciasLocales, sesion, biometria] = await Promise.all([
        leerPreferencias(),
        leerSesionGuardada(),
        consultarBiometria(),
      ]);

      if (!activo) {
        return;
      }

      setPreferencias(preferenciasLocales);
      cambiarTema(preferenciasLocales.tema);
      setBiometriaDisponible(biometria.disponible);
      setBiometriaHabilitada(biometria.habilitada);

      if (sesion.success && sesion.data !== null) {
        const sesionLocal = sesion.data;
        fijarTokenAcceso(sesionLocal.token);
        setUsuario({
          ...sesionLocal.usuario,
          preferencias: preferenciasLocales,
        });
        setRequiereDesbloqueo(biometria.habilitada);
        setCargando(false);

        // No consultamos el perfil remoto hasta desbloquear una sesión biométrica.
        if (!biometria.habilitada) {
          const remoto = await obtenerMiUsuario();
          if (!activo) {
            return;
          }

          if (remoto.success) {
            let usuarioActual = remoto.data;
            const preferenciasPendientes = await leerPreferenciasPendientes(
              usuarioActual.id,
            );
            const sincronizadas = await sincronizarPreferenciasPendientes(
              usuarioActual,
            );

            if (sincronizadas.success) {
              usuarioActual = sincronizadas.data;
            } else if (puedeUsarCache(sincronizadas)) {
              usuarioActual = {
                ...usuarioActual,
                preferencias:
                  preferenciasPendientes ?? usuarioActual.preferencias,
              };
            } else if (esNoAutenticado(sincronizadas)) {
              return;
            }

            await guardarPreferencias(usuarioActual.preferencias);
            await guardarSesion({
              token: sesionLocal.token,
              usuario: usuarioActual,
            });
            if (!activo) {
              return;
            }
            setPreferencias(usuarioActual.preferencias);
            cambiarTema(usuarioActual.preferencias.tema);
            setUsuario(usuarioActual);
          } else if (esNoAutenticado(remoto)) {
            fijarTokenAcceso(null);
            await borrarSesionGuardada();
            if (activo) {
              setUsuario(null);
              setRequiereDesbloqueo(false);
            }
          }
        }
        return;
      }

      fijarTokenAcceso(null);
      setUsuario(null);
      setRequiereDesbloqueo(false);
      setCargando(false);
    };

    void cargar();

    return () => {
      activo = false;
    };
  }, [cambiarTema]);

  const aplicarSesion = useCallback(
    async (sesion: Sesion): Promise<Result<Usuario>> => {
      const guardado = await guardarSesion(sesion);
      if (!guardado.success) {
        return guardado;
      }

      fijarTokenAcceso(sesion.token);
      let usuarioActual = sesion.usuario;
      const preferenciasPendientes = await leerPreferenciasPendientes(
        usuarioActual.id,
      );
      const sincronizadas = await sincronizarPreferenciasPendientes(
        usuarioActual,
      );
      if (sincronizadas.success) {
        usuarioActual = sincronizadas.data;
      } else if (puedeUsarCache(sincronizadas) && preferenciasPendientes !== null) {
        usuarioActual = {
          ...usuarioActual,
          preferencias: preferenciasPendientes,
        };
      } else if (esNoAutenticado(sincronizadas)) {
        fijarTokenAcceso(null);
        await borrarSesionGuardada();
        return sincronizadas;
      }

      await guardarPreferencias(usuarioActual.preferencias);
      const sesionActualizada = await guardarSesion({
        token: sesion.token,
        usuario: usuarioActual,
      });
      if (!sesionActualizada.success) {
        return sesionActualizada;
      }

      setUsuario(usuarioActual);
      setPreferencias(usuarioActual.preferencias);
      cambiarTema(usuarioActual.preferencias.tema);
      setRequiereDesbloqueo(false);
      return { success: true, data: usuarioActual };
    },
    [cambiarTema],
  );

  const iniciarSesion = useCallback(
    async (email: string, contrasena: string): Promise<Result<Usuario>> => {
      const resultado = await iniciarSesionServicio(email, contrasena);
      if (!resultado.success) {
        return resultado;
      }

      return aplicarSesion(resultado.data);
    },
    [aplicarSesion],
  );

  const registrarse = useCallback(
    async (
      nombre: string,
      email: string,
      contrasena: string,
    ): Promise<Result<Usuario>> => {
      const resultado = await registrarCuentaServicio(
        nombre,
        email,
        contrasena,
      );
      if (!resultado.success) {
        return resultado;
      }

      return aplicarSesion(resultado.data);
    },
    [aplicarSesion],
  );

  const cerrarSesion = useCallback(async (): Promise<Result<null>> => {
    const resultado = await borrarSesionGuardada();
    fijarTokenAcceso(null);
    setUsuario(null);
    setRequiereDesbloqueo(false);
    return resultado;
  }, []);

  const desbloquearConBiometria = useCallback(async (): Promise<
    Result<null>
  > => {
    const verificado = await autenticarConBiometria();
    if (!verificado.success) {
      return verificado;
    }

    const sesion = await leerSesionGuardada();
    if (!sesion.success) {
      return sesion;
    }
    if (sesion.data === null) {
      return {
        success: false,
        error:
          'No hay una sesión guardada. Ingresá con tu email y contraseña.',
      };
    }

    fijarTokenAcceso(sesion.data.token);
    let usuarioActual: Usuario = {
      ...sesion.data.usuario,
      preferencias,
    };
    const remoto = await obtenerMiUsuario();
    if (remoto.success) {
      usuarioActual = remoto.data;
      const preferenciasPendientes = await leerPreferenciasPendientes(
        usuarioActual.id,
      );
      const sincronizadas = await sincronizarPreferenciasPendientes(
        usuarioActual,
      );
      if (sincronizadas.success) {
        usuarioActual = sincronizadas.data;
      } else if (puedeUsarCache(sincronizadas)) {
        usuarioActual = {
          ...usuarioActual,
          preferencias:
            preferenciasPendientes ?? usuarioActual.preferencias,
        };
      } else if (esNoAutenticado(sincronizadas)) {
        fijarTokenAcceso(null);
        await borrarSesionGuardada();
        setUsuario(null);
        setRequiereDesbloqueo(false);
        return {
          success: false,
          error: sincronizadas.error,
          codigo: sincronizadas.codigo,
          estado: sincronizadas.estado,
        };
      }
    } else if (esNoAutenticado(remoto)) {
      fijarTokenAcceso(null);
      await borrarSesionGuardada();
      setUsuario(null);
      setRequiereDesbloqueo(false);
      return {
        success: false,
        error: remoto.error,
        codigo: remoto.codigo,
        estado: remoto.estado,
      };
    }

    await guardarPreferencias(usuarioActual.preferencias);
    await guardarSesion({ token: sesion.data.token, usuario: usuarioActual });
    setUsuario(usuarioActual);
    setPreferencias(usuarioActual.preferencias);
    cambiarTema(usuarioActual.preferencias.tema);
    setRequiereDesbloqueo(false);
    return { success: true, data: null };
  }, [cambiarTema, preferencias]);

  const activarBiometria = useCallback(
    async (habilitada: boolean): Promise<Result<boolean>> => {
      const resultado = await establecerBiometria(habilitada);
      if (!resultado.success) {
        return resultado;
      }

      setBiometriaHabilitada(resultado.data);
      if (!resultado.data) {
        setRequiereDesbloqueo(false);
      }
      return resultado;
    },
    [],
  );

  const actualizarPerfil = useCallback(
    async (
      cambios: Partial<Pick<Usuario, 'nombre' | 'avatarUrl'>>,
    ): Promise<Result<Usuario>> => {
      if (usuario === null) {
        return {
          success: false,
          error: 'Iniciá sesión para actualizar tu perfil.',
        };
      }

      const resultado = await actualizarMiUsuario(cambios);
      if (!resultado.success) {
        return resultado;
      }

      setUsuario(resultado.data);
      await guardarUsuarioEnSesion(resultado.data);
      return resultado;
    },
    [usuario],
  );

  const actualizarPreferencias = useCallback(
    async (
      cambios: Partial<Preferencias>,
    ): Promise<Result<Preferencias>> => {
      const siguientes: Preferencias = {
        ...preferencias,
        ...cambios,
        categoriasFavoritas:
          cambios.categoriasFavoritas ?? preferencias.categoriasFavoritas,
        radioAvisoMetros:
          cambios.radioAvisoMetros ?? preferencias.radioAvisoMetros,
        tema: cambios.tema ?? preferencias.tema,
      };

      const guardado = await guardarPreferencias(siguientes);
      if (!guardado.success) {
        return guardado;
      }

      setPreferencias(guardado.data);
      cambiarTema(guardado.data.tema);

      if (usuario !== null) {
        const pendientes = await leerPreferenciasPendientes(usuario.id);
        const cambiosRemotos =
          pendientes === null ? cambios : { ...pendientes, ...cambios };
        const remoto = await actualizarMiUsuario({
          preferencias: cambiosRemotos,
        });
        if (remoto.success) {
          const preferenciasRemotas = remoto.data.preferencias;
          await guardarPreferencias(preferenciasRemotas);
          await borrarPreferenciasPendientes(usuario.id);
          setUsuario(remoto.data);
          setPreferencias(preferenciasRemotas);
          cambiarTema(preferenciasRemotas.tema);
          await guardarUsuarioEnSesion(remoto.data);
          return { success: true, data: preferenciasRemotas };
        }

        if (puedeUsarCache(remoto)) {
          await guardarPreferenciasPendientes(usuario.id, guardado.data);
          const actualizado: Usuario = {
            ...usuario,
            preferencias: guardado.data,
          };
          setUsuario(actualizado);
          await guardarUsuarioEnSesion(actualizado);
          return guardado;
        }

        if (esNoAutenticado(remoto)) {
          const preferenciasRestauradas = await guardarPreferencias(
            preferencias,
          );
          setPreferencias(preferencias);
          cambiarTema(preferencias.tema);
          return preferenciasRestauradas.success ? remoto : preferenciasRestauradas;
        }

        const preferenciasRestauradas = await guardarPreferencias(preferencias);
        setPreferencias(preferencias);
        cambiarTema(preferencias.tema);
        if (preferenciasRestauradas.success) {
          setUsuario(usuario);
          await guardarUsuarioEnSesion(usuario);
        }
        return remoto;
      }

      return guardado;
    },
    [cambiarTema, preferencias, usuario],
  );

  const valor = useMemo<ContextoAuth>(
    () => ({
      usuario,
      preferencias,
      cargando,
      requiereDesbloqueo,
      biometriaDisponible,
      biometriaHabilitada,
      iniciarSesion,
      registrarse,
      cerrarSesion,
      desbloquearConBiometria,
      activarBiometria,
      actualizarPreferencias,
      actualizarPerfil,
    }),
    [
      usuario,
      preferencias,
      cargando,
      requiereDesbloqueo,
      biometriaDisponible,
      biometriaHabilitada,
      iniciarSesion,
      registrarse,
      cerrarSesion,
      desbloquearConBiometria,
      activarBiometria,
      actualizarPerfil,
      actualizarPreferencias,
    ],
  );

  return (
    <AuthContexto.Provider value={valor}>{children}</AuthContexto.Provider>
  );
}

export function useAuth(): ContextoAuth {
  const contexto = useContext(AuthContexto);
  if (contexto === null) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return contexto;
}
