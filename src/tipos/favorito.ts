import type { IdLugar, FechaISO } from './lugar';
import type { IdUsuario } from './usuario';

export type IdFavorito = `fav-${string}`;

export interface Favorito {
  id: IdFavorito;
  usuarioId: IdUsuario;
  lugarId: IdLugar;
  creadoEn: FechaISO;
}