import type { Coordenadas, Lugar } from '@/tipos/lugar';
import type { LimitesMapa, VistaMapa } from '@/tipos/mapa';

export interface MapaOSMRef {
  centrarEn: (coordenadas: Coordenadas, zoom?: number) => void;
  enfocar: (id: string) => void;
  cambiarZoom: (delta: number) => void;
}

export interface MapaOSMProps {
  lugares: Lugar[];
  ubicacion: Coordenadas | null | undefined;
  seleccionadoId: string | undefined;
  oscuro: boolean;
  onSeleccionar: (id: string | undefined) => void;
  onVistaChange: (vista: VistaMapa) => void;
  onError?: (mensaje: string) => void;
}

export type MensajeMapa =
  | { tipo: 'listo' }
  | { tipo: 'seleccion'; id: string }
  | { tipo: 'fondo' }
  | { tipo: 'region'; centro: Coordenadas; limites: LimitesMapa }
  | { tipo: 'error'; mensaje: string };

export interface DatosMapa {
  lugares: Array<{
    id: string;
    nombre: string;
    latitud: number;
    longitud: number;
  }>;
  ubicacion: Coordenadas | null;
  seleccionadoId: string | null;
  oscuro: boolean;
}

export function interpretarMensajeMapa(texto: string): MensajeMapa | undefined {
  try {
    const mensaje = JSON.parse(texto) as MensajeMapa;
    return typeof mensaje?.tipo === 'string' ? mensaje : undefined;
  } catch {
    return undefined;
  }
}

export function construirDatosMapa({
  lugares,
  ubicacion,
  seleccionadoId,
  oscuro,
}: Pick<
  MapaOSMProps,
  'lugares' | 'ubicacion' | 'seleccionadoId' | 'oscuro'
>): DatosMapa {
  return {
    lugares: lugares.map((lugar) => ({
      id: lugar.id,
      nombre: lugar.nombre,
      latitud: lugar.coordenadas.latitud,
      longitud: lugar.coordenadas.longitud,
    })),
    ubicacion: ubicacion ?? null,
    seleccionadoId: seleccionadoId ?? null,
    oscuro,
  };
}
