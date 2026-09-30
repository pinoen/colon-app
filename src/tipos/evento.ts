import type { Coordenadas, IdLugar } from './lugar';

export type IdEvento = `evt-${string}`;

export type EstadoEvento = 'programado' | 'suspendido' | 'cancelado' | 'finalizado';

export interface Evento {
  id: IdEvento;
  titulo: string;
  descripcion: string;
  lugarId: IdLugar | null;
  direccionLibre: string | null;
  coordenadas: Coordenadas | null;
  inicio: string;
  fin: string | null;
  imagenUrl: string | null;
  precio: number | null;
  estado: EstadoEvento;
}