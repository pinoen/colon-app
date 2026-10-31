import type { Evento } from '@/tipos/evento';
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

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
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

/** Precio de un evento: `0` = Gratis, `null` = no aplica. */
export function formatearPrecioEvento(precio: number | null): string {
  return formatearPrecio(precio) ?? 'No aplica';
}

interface PartesFechaIso {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
}

/**
 * Extrae fecha y hora del string ISO 8601 respetando el offset con el que
 * fue definido el evento (no la zona horaria del dispositivo).
 */
function parsearPartesFechaIso(fechaIso: string): PartesFechaIso | null {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(fechaIso);
  if (coincidencia === null) {
    return null;
  }
  return {
    anio: Number(coincidencia[1]),
    mes: Number(coincidencia[2]),
    dia: Number(coincidencia[3]),
    hora: Number(coincidencia[4]),
    minuto: Number(coincidencia[5]),
  };
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function dosDigitos(valor: number): string {
  return valor.toString().padStart(2, '0');
}

/** "312" → "5:12"; "3720" → "1:02:00". */
export function formatearTiempoAudio(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos <= 0) {
    return '0:00';
  }
  const total = Math.floor(segundos);
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundosRestantes = total % 60;
  if (horas > 0) {
    return `${horas}:${dosDigitos(minutos)}:${dosDigitos(segundosRestantes)}`;
  }
  return `${minutos}:${dosDigitos(segundosRestantes)}`;
}

/** Tiempo restante de una audioguía con signo: "-4:48". */
export function formatearTiempoRestanteAudio(
  duracionSegundos: number,
  posicionSegundos: number,
): string {
  const restante = Math.max(
    0,
    Math.floor(duracionSegundos) - Math.floor(posicionSegundos),
  );
  return `-${formatearTiempoAudio(restante)}`;
}

/** "2026-11-06T10:00:00-03:00" → "Viernes 6 de noviembre de 2026". */
export function formatearFechaDia(fechaIso: string): string {
  const partes = parsearPartesFechaIso(fechaIso);
  if (partes === null) {
    return fechaIso;
  }
  const diaSemana = new Date(
    Date.UTC(partes.anio, partes.mes - 1, partes.dia),
  ).getUTCDay();
  const nombreDia = DIAS_SEMANA[diaSemana].toLowerCase();
  return capitalizar(
    `${nombreDia} ${partes.dia} de ${MESES[partes.mes - 1]} de ${partes.anio}`,
  );
}

/** "2026-11-06T10:00:00-03:00" → "10:00". */
export function formatearHora(fechaIso: string): string {
  const partes = parsearPartesFechaIso(fechaIso);
  if (partes === null) {
    return fechaIso;
  }
  return `${dosDigitos(partes.hora)}:${dosDigitos(partes.minuto)}`;
}

/**
 * Rango horario de un evento. Si no tiene fin muestra solo la hora de inicio;
 * si el fin cae en otro día incluye la fecha de cierre.
 */
export function formatearRangoHorarioEvento(
  inicio: string,
  fin: string | null,
): string {
  const horaInicio = formatearHora(inicio);
  if (fin === null) {
    return horaInicio;
  }
  const partesInicio = parsearPartesFechaIso(inicio);
  const partesFin = parsearPartesFechaIso(fin);
  if (partesInicio === null || partesFin === null) {
    return `${horaInicio} → ${formatearHora(fin)}`;
  }
  const mismoDia =
    partesInicio.anio === partesFin.anio &&
    partesInicio.mes === partesFin.mes &&
    partesInicio.dia === partesFin.dia;
  if (mismoDia) {
    return `${horaInicio} → ${formatearHora(fin)}`;
  }
  return `${horaInicio} → ${partesFin.dia}/${dosDigitos(partesFin.mes)} ${formatearHora(fin)}`;
}

/** Duración legible o `null` cuando el evento no informa fecha de fin. */
export function formatearDuracionEvento(
  inicio: string,
  fin: string | null,
): string | null {
  if (fin === null) {
    return null;
  }
  const marcaInicio = Date.parse(inicio);
  const marcaFin = Date.parse(fin);
  if (
    Number.isNaN(marcaInicio) ||
    Number.isNaN(marcaFin) ||
    marcaFin <= marcaInicio
  ) {
    return null;
  }

  const minutosTotales = Math.round((marcaFin - marcaInicio) / 60000);
  const dias = Math.floor(minutosTotales / (24 * 60));
  const horas = Math.floor((minutosTotales % (24 * 60)) / 60);
  const minutos = minutosTotales % 60;

  if (dias > 0) {
    const textoDias = `${dias} ${dias === 1 ? 'día' : 'días'}`;
    return horas > 0 ? `${textoDias} y ${horas} h` : textoDias;
  }
  if (horas > 0) {
    return minutos > 0 ? `${horas} h ${minutos} min` : `${horas} h`;
  }
  return `${minutos} min`;
}

/** `true` si la fecha ISO ya pasó respecto del reloj del dispositivo. */
export function fechaYaPaso(fechaIso: string): boolean {
  const marca = Date.parse(fechaIso);
  return Number.isNaN(marca) ? false : marca <= Date.now();
}

export interface GrupoEventosPorDia {
  clave: string;
  etiqueta: string;
  eventos: Evento[];
}

/**
 * Ordena los eventos cronológicamente y los agrupa por día (según la fecha
 * local con la que fue definido cada evento).
 */
export function agruparEventosPorDia(
  eventos: Evento[],
): GrupoEventosPorDia[] {
  const ordenados = [...eventos].sort((a, b) => {
    const marcaA = Date.parse(a.inicio);
    const marcaB = Date.parse(b.inicio);
    if (Number.isNaN(marcaA) || Number.isNaN(marcaB)) {
      return a.inicio.localeCompare(b.inicio);
    }
    return marcaA - marcaB;
  });

  const grupos = new Map<string, Evento[]>();
  for (const evento of ordenados) {
    const clave = evento.inicio.slice(0, 10);
    const existentes = grupos.get(clave);
    if (existentes === undefined) {
      grupos.set(clave, [evento]);
    } else {
      existentes.push(evento);
    }
  }

  return [...grupos.entries()].map(([clave, lista]) => ({
    clave,
    etiqueta: formatearFechaDia(lista[0].inicio),
    eventos: lista,
  }));
}