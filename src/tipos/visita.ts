import type { IdLugar, FechaISO } from './lugar';
import type { IdUsuario } from './usuario';

export type IdVisita = `vis-${string}`;

export type OrigenVisita = 'qr' | 'gps' | 'manual';

export interface Visita {
  id: IdVisita;
  usuarioId: IdUsuario;
  lugarId: IdLugar;
  fechaHora: FechaISO;
  origen: OrigenVisita;
  fotoUri: string | null;
  nota: string | null;
  sincronizada: boolean;
}