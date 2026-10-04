import * as Location from 'expo-location';

import type { Result } from '@/tipos/api';
import type { Coordenadas } from '@/tipos/lugar';

export async function obtenerUbicacionActual(): Promise<Result<Coordenadas | null>> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return { success: true, data: null };
  }
  try {
    const posicion = await Location.getCurrentPositionAsync({});
    return {
      success: true,
      data: {
        latitud: posicion.coords.latitude,
        longitud: posicion.coords.longitude,
      },
    };
  } catch {
    return { success: false, error: 'No pudimos obtener tu ubicación.' };
  }
}