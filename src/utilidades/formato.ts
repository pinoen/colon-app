import type { Horario } from '@/tipos/lugar';

export const DIAS_SEMANA = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

export interface HorarioFormateado {
  dia: Horario['dia'];
  nombreDia: string;
  rango: string;
}

export function formatearHorarios(horarios: Horario[]): HorarioFormateado[] {
  return [...horarios]
    .sort((a, b) => a.dia - b.dia)
    .map((horario) => ({
      dia: horario.dia,
      nombreDia: DIAS_SEMANA[horario.dia],
      rango: `${horario.abre} → ${horario.cierra}`,
    }));
}

export function formatearPrecio(precio: number | null): string | null {
  if (precio === null) {
    return null;
  }
  if (precio === 0) {
    return 'Gratis';
  }
  return `$ ${precio.toLocaleString('es-AR')}`;
}