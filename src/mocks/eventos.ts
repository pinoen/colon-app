import type { Coordenadas } from '@/tipos/lugar';
import type { Evento } from '@/tipos/evento';

export const eventosVaciosMock: Evento[] = [];

const coordenadasCostanera: Coordenadas = { latitud: -32.2331, longitud: -58.1398 };
const coordenadasAnfiteatro: Coordenadas = { latitud: -32.2304, longitud: -58.14 };

export const eventosMock: Evento[] = [
  {
    id: 'evt-101',
    titulo: 'Fiesta Nacional de la Pesca',
    descripcion:
      'Competencia de pesca deportiva, desfile de lanchas y puestos gastronómicos a lo largo de la costanera.',
    lugarId: 'lug-001',
    direccionLibre: null,
    coordenadas: null,
    inicio: '2026-11-06T10:00:00-03:00',
    fin: '2026-11-08T23:59:00-03:00',
    imagenUrl: 'https://cdn.ejemplo.com/colon/eventos/pesca-1.jpg',
    precio: 0,
    estado: 'programado',
  },
  {
    id: 'evt-102',
    titulo: 'Muestra de Arte Local',
    descripcion:
      'Exposición de pintura y escultura de artistas entrerrianos en el salón cultural.',
    lugarId: null,
    direccionLibre: 'Salón Cultural, San Martín 120',
    coordenadas: coordenadasCostanera,
    inicio: '2026-09-12T18:00:00-03:00',
    fin: null,
    imagenUrl: null,
    precio: 1500,
    estado: 'suspendido',
  },
  {
    id: 'evt-103',
    titulo: 'Caminata Histórica por la Costanera',
    descripcion:
      'Recorrido guiado contando la historia de la ribera y sus primeros pobladores.',
    lugarId: 'lug-003',
    direccionLibre: null,
    coordenadas: null,
    inicio: '2026-08-20T16:00:00-03:00',
    fin: '2026-08-20T18:30:00-03:00',
    imagenUrl: null,
    precio: null,
    estado: 'cancelado',
  },
  {
    id: 'evt-104',
    titulo: 'Recital junto al Río',
    descripcion:
      'Banda local en el anfiteatro con entrada libre hasta agotar capacidad.',
    lugarId: null,
    direccionLibre: 'Anfiteatro Municipal, costanera',
    coordenadas: coordenadasAnfiteatro,
    inicio: '2026-08-08T20:30:00-03:00',
    fin: null,
    imagenUrl: 'https://cdn.ejemplo.com/colon/eventos/recital-1.jpg',
    precio: 3000,
    estado: 'finalizado',
  },
  {
    id: 'evt-105',
    titulo: 'Taller de Cerámica para Niños y Niñas',
    descripcion:
      'Actividad gratuita de arte con barro dirigida a infancias de 6 a 12 años. Se recomienda inscribirse con anticipación en el mostrador del museo porque los cupos son limitados. Los materiales están incluidos, solo hay que llevar ropa cómoda que se pueda ensuciar. La actividad se suspende por lluvia y se reprograma automáticamente para el sábado siguiente en el mismo horario.',
    lugarId: null,
    direccionLibre: 'Museo Paleontológico, salón 2',
    coordenadas: null,
    inicio: '2026-09-27T15:00:00-03:00',
    fin: null,
    imagenUrl: null,
    precio: 0,
    estado: 'programado',
  },
];