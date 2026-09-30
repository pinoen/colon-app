import type { EstadoEvento, IdEvento } from '@/tipos/evento';

export interface FiltrosEvento {
  estado?: EstadoEvento;
}

export const eventoKeys = {
  all: ['eventos'] as const,
  listar: (filtros: FiltrosEvento = {}) => ['eventos', 'lista', filtros] as const,
  listarPorEstado: (estado: EstadoEvento) =>
    ['eventos', 'lista', { estado }] as const,
  detalle: (id: IdEvento) => ['eventos', 'detalle', id] as const,
};