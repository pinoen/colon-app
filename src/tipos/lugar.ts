import type { IdCategoria } from './categoria';

export type IdLugar = `lug-${string}`;

export type FechaISO = string;

export interface Coordenadas {
  latitud: number;
  longitud: number;
}

export interface Horario {
  dia: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  abre: string;
  cierra: string;
}

export interface Audioguia {
  url: string;
  duracionSegundos: number;
  idioma: 'es' | 'en' | 'pt';
}

export interface Lugar {
  id: IdLugar;
  nombre: string;
  categoriaId: IdCategoria;
  descripcionCorta: string;
  descripcion: string;
  coordenadas: Coordenadas;
  direccion: string;
  imagenes: string[];
  horarios: Horario[];
  telefono: string | null;
  sitioWeb: string | null;
  precioEntrada: number | null;
  audioguia: Audioguia | null;
  codigoQr: string | null;
  accesible: boolean;
  activo: boolean;
  actualizadoEn: FechaISO;
}