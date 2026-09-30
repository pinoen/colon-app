import type { Categoria } from '@/tipos/categoria';

export const categoriasMock: Categoria[] = [
  {
    id: 'cat-playas',
    nombre: 'Playas y Balnearios',
    icono: 'water',
    color: '#0077B6',
    orden: 1,
  },
  {
    id: 'cat-museos',
    nombre: 'Museos',
    icono: 'business',
    color: '#8E5A4A',
    orden: 2,
  },
  {
    id: 'cat-gastronomia',
    nombre: 'Gastronomía',
    icono: 'restaurant',
    color: '#D97706',
    orden: 3,
  },
  {
    id: 'cat-parques',
    nombre: 'Parques y Plazas',
    icono: 'leaf',
    color: '#16A34A',
    orden: 4,
  },
  {
    id: 'cat-historia',
    nombre: 'Sitios Históricos',
    icono: 'time',
    color: '#6D28D9',
    orden: 5,
  },
  {
    id: 'cat-entretenimiento',
    nombre: 'Entretenimiento',
    icono: 'film',
    color: '#DC2626',
    orden: 6,
  },
];