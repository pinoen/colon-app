import type { Tema } from '@/context/TemaContext';

export interface Preferencias {
  categoriasFavoritas: string[];
  avisarProximidad: boolean;
  radioAvisoMetros: 100 | 250 | 500;
  tema: Tema;
}

export type IdUsuario = `usr-${string}`;

export type FechaISO = string;

export interface Usuario {
  id: IdUsuario;
  nombre: string;
  email: string;
  avatarUrl: string | null;
  creadoEn: FechaISO;
  preferencias: Preferencias;
}