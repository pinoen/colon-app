import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { useLugares } from '@/hooks/useLugares';
import {
  consultarPermisoNotificaciones,
  procesarProximidad,
  type EstadoPermisoNotificaciones,
} from '@/servicios/notificaciones';
import type { Coordenadas, IdLugar, Lugar } from '@/tipos/lugar';

export type EstadoPermisoUbicacion = 'concedido' | 'denegado' | null;

/**
 * Vigila la ubicación mientras la pantalla está enfocada y dispara, como máximo,
 * un aviso de proximidad por lugar y por día. Si la preferencia está apagada o
 * el permiso se deniega, no hace nada y la app sigue funcionando.
 */
export function useNotificaciones() {
  const { preferencias } = useAuth();
  const { data: lugares } = useLugares();

  const [ultimoAviso, setUltimoAviso] = useState<Lugar | null>(null);
  const [permisoUbicacion, setPermisoUbicacion] =
    useState<EstadoPermisoUbicacion>(null);
  const [permisoNotificaciones, setPermisoNotificaciones] =
    useState<EstadoPermisoNotificaciones>('pendiente');

  const lugaresRef = useRef<Lugar[]>([]);
  const preferenciasRef = useRef(preferencias);
  const dentroRef = useRef<Set<IdLugar>>(new Set());
  const colaRef = useRef<Promise<void>>(Promise.resolve());
  const montadoRef = useRef(true);

  useEffect(() => {
    lugaresRef.current = lugares ?? [];
  }, [lugares]);

  useEffect(() => {
    preferenciasRef.current = preferencias;
  }, [preferencias]);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  const procesar = useCallback((coordenadas: Coordenadas) => {
    colaRef.current = colaRef.current
      .then(async () => {
        const resultado = await procesarProximidad(
          coordenadas,
          lugaresRef.current,
          preferenciasRef.current,
          dentroRef.current,
        );
        if (!resultado.success) {
          return;
        }

        dentroRef.current = new Set(resultado.data.dentro);
        const { avisado, motivo } = resultado.data;
        if (avisado !== null) {
          const lugar = lugaresRef.current.find((item) => item.id === avisado);
          if (lugar !== undefined && montadoRef.current) {
            setUltimoAviso(lugar);
          }
        }
        if (motivo === 'permiso-denegado' && montadoRef.current) {
          setPermisoNotificaciones('denegado');
        }
        if (motivo === 'no-soportado' && montadoRef.current) {
          setPermisoNotificaciones('no-soportado');
        }
      })
      .catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      let suscripcion: Location.LocationSubscription | null = null;
      dentroRef.current = new Set();

      const iniciar = async () => {
        if (Platform.OS === 'web') {
          setPermisoUbicacion('denegado');
          return;
        }
        if (!preferencias.avisarProximidad) {
          setPermisoUbicacion(null);
          return;
        }

        setPermisoNotificaciones(await consultarPermisoNotificaciones());
        if (!activo) {
          return;
        }

        const permiso = await Location.requestForegroundPermissionsAsync();
        if (!activo) {
          return;
        }
        if (permiso.status !== 'granted') {
          setPermisoUbicacion('denegado');
          return;
        }
        setPermisoUbicacion('concedido');

        suscripcion = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 50,
            timeInterval: 60_000,
          },
          (posicion) => {
            if (!activo) {
              return;
            }
            procesar({
              latitud: posicion.coords.latitude,
              longitud: posicion.coords.longitude,
            });
          },
          () => {
            if (activo) {
              setPermisoUbicacion('denegado');
            }
          },
        );
        if (!activo) {
          suscripcion.remove();
        }
      };

      void iniciar().catch(() => {
        if (activo) {
          setPermisoUbicacion('denegado');
        }
      });

      return () => {
        activo = false;
        suscripcion?.remove();
      };
    }, [preferencias.avisarProximidad, procesar]),
  );

  return {
    ultimoAviso,
    permisoUbicacion,
    permisoNotificaciones,
  };
}
