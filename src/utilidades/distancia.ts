import type { Coordenadas } from '@/tipos/lugar';

const RADIO_TIERRA_METROS = 6371000;

function gradosARadianes(grados: number): number {
  return (grados * Math.PI) / 180;
}

function normalizarGrados(grados: number): number {
  return ((grados % 360) + 360) % 360;
}

export function distanciaMetros(origen: Coordenadas, destino: Coordenadas): number {
  const latitudOrigen = gradosARadianes(origen.latitud);
  const latitudDestino = gradosARadianes(destino.latitud);
  const deltaLatitud = gradosARadianes(destino.latitud - origen.latitud);
  const deltaLongitud = gradosARadianes(destino.longitud - origen.longitud);

  const haversine =
    Math.sin(deltaLatitud / 2) ** 2 +
    Math.cos(latitudOrigen) * Math.cos(latitudDestino) * Math.sin(deltaLongitud / 2) ** 2;

  return Math.round(
    2 * RADIO_TIERRA_METROS * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
}

export function ordenarPorCercania<T extends { coordenadas: Coordenadas }>(
  items: T[],
  origen: Coordenadas,
): T[] {
  return [...items].sort(
    (a, b) => distanciaMetros(origen, a.coordenadas) - distanciaMetros(origen, b.coordenadas),
  );
}

export function rumboGrados(origen: Coordenadas, destino: Coordenadas): number {
  const latitudOrigen = gradosARadianes(origen.latitud);
  const latitudDestino = gradosARadianes(destino.latitud);
  const deltaLongitud = gradosARadianes(destino.longitud - origen.longitud);

  const y = Math.sin(deltaLongitud) * Math.cos(latitudDestino);
  const x =
    Math.cos(latitudOrigen) * Math.sin(latitudDestino) -
    Math.sin(latitudOrigen) * Math.cos(latitudDestino) * Math.cos(deltaLongitud);

  return normalizarGrados((Math.atan2(y, x) * 180) / Math.PI);
}

export function formatearDistancia(metros: number): string {
  if (metros < 1000) {
    return `${Math.round(metros)} m`;
  }
  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}