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
  autenticarConBiometria,
  borrarSesionGuardada,
  consultarBiometria,
  establecerBiometria,
  guardarPreferencias,
  guardarSesion,
  iniciarSesion as iniciarSesionServicio,
  leerPreferencias,
  leerSesionGuardada,
  registrarCuenta as registrarCuentaServicio,
  type Sesion,
} from '@/servicios/autenticacion';
import { fijarTokenAcceso } from '@/servicios/clienteApi';
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
  actualizarPreferencias: (
    cambios: Partial<Preferencias>,
  ) => Promise<Result<Preferencias>>;
}

const AuthContexto = createContext<ContextoAuth | null>(null);

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
    let activo = true;

    const cargar = async () => {
      const [preferenciasGuardadas, sesion, biometria] = await Promise.all([
        leerPreferencias(),
        leerSesionGuardada(),
        consultarBiometria(),
      ]);

      if (!activo) {
        return;
      }

      setPreferencias(preferenciasGuardadas);
      cambiarTema(preferenciasGuardadas.tema);
      setBiometriaDisponible(biometria.disponible);
      setBiometriaHabilitada(biometria.habilitada);

      if (sesion.success && sesion.data !== null) {
        fijarTokenAcceso(sesion.data.token);
        setUsuario({
          ...sesion.data.usuario,
          preferencias: preferenciasGuardadas,
        });
        setRequiereDesbloqueo(biometria.habilitada);
      }

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
      setUsuario(sesion.usuario);
      setPreferencias(sesion.usuario.preferencias);
      setRequiereDesbloqueo(false);
      return { success: true, data: sesion.usuario };
    },
    [],
  );

  const iniciarSesion = useCallback(
    async (email: string, contrasena: string): Promise<Result<Usuario>> => {
      const resultado = await iniciarSesionServicio(email, contrasena);
      if (!resultado.success) {
        return resultado;
      }

      return aplicarSesion({
        ...resultado.data,
        usuario: { ...resultado.data.usuario, preferencias },
      });
    },
    [aplicarSesion, preferencias],
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

      return aplicarSesion({
        ...resultado.data,
        usuario: { ...resultado.data.usuario, preferencias },
      });
    },
    [aplicarSesion, preferencias],
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
    setUsuario({ ...sesion.data.usuario, preferencias });
    setRequiereDesbloqueo(false);
    return { success: true, data: null };
  }, [preferencias]);

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
        const actualizado: Usuario = {
          ...usuario,
          preferencias: guardado.data,
        };
        setUsuario(actualizado);

        const sesion = await leerSesionGuardada();
        if (sesion.success && sesion.data !== null) {
          await guardarSesion({ ...sesion.data, usuario: actualizado });
        }
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
