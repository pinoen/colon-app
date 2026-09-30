import { openDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';

import type { IdCategoria } from '@/tipos/categoria';
import type { IdLugar, Lugar } from '@/tipos/lugar';
import type { IdUsuario } from '@/tipos/usuario';
import type { IdVisita, Visita } from '@/tipos/visita';

const NOMBRE_BASE_DATOS = 'colon.db';

const ESQUEMA_BASE_DATOS = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categorias (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,
  icono         TEXT NOT NULL,
  color         TEXT NOT NULL,
  orden         INTEGER NOT NULL DEFAULT 0,
  actualizadoEn TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lugares (
  id               TEXT PRIMARY KEY,
  nombre           TEXT NOT NULL,
  categoriaId      TEXT NOT NULL REFERENCES categorias(id),
  descripcionCorta TEXT NOT NULL,
  descripcion      TEXT NOT NULL,
  latitud          REAL NOT NULL,
  longitud         REAL NOT NULL,
  direccion        TEXT NOT NULL,
  imagenes         TEXT NOT NULL,
  horarios         TEXT NOT NULL,
  telefono         TEXT,
  sitioWeb         TEXT,
  precioEntrada    INTEGER,
  audioguia        TEXT,
  codigoQr         TEXT,
  accesible        INTEGER NOT NULL DEFAULT 0,
  activo           INTEGER NOT NULL DEFAULT 1,
  actualizadoEn    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eventos (
  id            TEXT PRIMARY KEY,
  titulo        TEXT NOT NULL,
  descripcion   TEXT NOT NULL,
  lugarId       TEXT REFERENCES lugares(id),
  direccionLibre TEXT,
  latitud       REAL,
  longitud      REAL,
  inicio        TEXT NOT NULL,
  fin           TEXT,
  imagenUrl     TEXT,
  precio        INTEGER,
  estado        TEXT NOT NULL CHECK (estado IN ('programado','suspendido','cancelado','finalizado'))
);

CREATE TABLE IF NOT EXISTS usuarios (
  id        TEXT PRIMARY KEY,
  nombre    TEXT NOT NULL,
  email     TEXT NOT NULL UNIQUE,
  avatarUrl TEXT,
  creadoEn  TEXT NOT NULL,
  preferencias TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS favoritos (
  id        TEXT PRIMARY KEY,
  usuarioId TEXT NOT NULL REFERENCES usuarios(id),
  lugarId   TEXT NOT NULL REFERENCES lugares(id),
  creadoEn  TEXT NOT NULL,
  UNIQUE (usuarioId, lugarId)
);

CREATE TABLE IF NOT EXISTS visitas (
  id          TEXT PRIMARY KEY,
  usuarioId   TEXT NOT NULL REFERENCES usuarios(id),
  lugarId     TEXT NOT NULL REFERENCES lugares(id),
  fechaHora   TEXT NOT NULL,
  origen      TEXT NOT NULL CHECK (origen IN ('qr','gps','manual')),
  fotoUri     TEXT,
  nota        TEXT,
  sincronizada INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cola_sincronizacion (
  id         TEXT PRIMARY KEY,
  entidad    TEXT NOT NULL,
  accion     TEXT NOT NULL,
  payload    TEXT NOT NULL,
  intentos   INTEGER NOT NULL DEFAULT 0,
  creadoEn   TEXT NOT NULL
);
`;

interface FilaLugar {
  id: IdLugar;
  nombre: string;
  categoriaId: IdCategoria;
  descripcionCorta: string;
  descripcion: string;
  latitud: number;
  longitud: number;
  direccion: string;
  imagenes: string;
  horarios: string;
  telefono: string | null;
  sitioWeb: string | null;
  precioEntrada: number | null;
  audioguia: string | null;
  codigoQr: string | null;
  accesible: number;
  activo: number;
  actualizadoEn: string;
}

interface FilaVisita {
  id: IdVisita;
  usuarioId: IdUsuario;
  lugarId: IdLugar;
  fechaHora: string;
  origen: string;
  fotoUri: string | null;
  nota: string | null;
  sincronizada: number;
}

let baseDatos: SQLiteDatabase | null = null;

export async function abrirBaseDatos(): Promise<SQLiteDatabase> {
  if (baseDatos === null) {
    const base = await openDatabaseAsync(NOMBRE_BASE_DATOS);
    await base.execAsync(ESQUEMA_BASE_DATOS);
    baseDatos = base;
  }
  return baseDatos;
}

function aFilaLugar(lugar: Lugar): FilaLugar {
  return {
    id: lugar.id,
    nombre: lugar.nombre,
    categoriaId: lugar.categoriaId,
    descripcionCorta: lugar.descripcionCorta,
    descripcion: lugar.descripcion,
    latitud: lugar.coordenadas.latitud,
    longitud: lugar.coordenadas.longitud,
    direccion: lugar.direccion,
    imagenes: JSON.stringify(lugar.imagenes),
    horarios: JSON.stringify(lugar.horarios),
    telefono: lugar.telefono,
    sitioWeb: lugar.sitioWeb,
    precioEntrada: lugar.precioEntrada,
    audioguia: lugar.audioguia === null ? null : JSON.stringify(lugar.audioguia),
    codigoQr: lugar.codigoQr,
    accesible: lugar.accesible ? 1 : 0,
    activo: lugar.activo ? 1 : 0,
    actualizadoEn: lugar.actualizadoEn,
  };
}

function aLugar(fila: FilaLugar): Lugar {
  return {
    id: fila.id,
    nombre: fila.nombre,
    categoriaId: fila.categoriaId,
    descripcionCorta: fila.descripcionCorta,
    descripcion: fila.descripcion,
    coordenadas: { latitud: fila.latitud, longitud: fila.longitud },
    direccion: fila.direccion,
    imagenes: JSON.parse(fila.imagenes),
    horarios: JSON.parse(fila.horarios),
    telefono: fila.telefono,
    sitioWeb: fila.sitioWeb,
    precioEntrada: fila.precioEntrada,
    audioguia: fila.audioguia === null ? null : JSON.parse(fila.audioguia),
    codigoQr: fila.codigoQr,
    accesible: fila.accesible === 1,
    activo: fila.activo === 1,
    actualizadoEn: fila.actualizadoEn,
  };
}

function aFilaVisita(visita: Visita): FilaVisita {
  return {
    id: visita.id,
    usuarioId: visita.usuarioId,
    lugarId: visita.lugarId,
    fechaHora: visita.fechaHora,
    origen: visita.origen,
    fotoUri: visita.fotoUri,
    nota: visita.nota,
    sincronizada: visita.sincronizada ? 1 : 0,
  };
}

function aVisita(fila: FilaVisita): Visita {
  return {
    id: fila.id,
    usuarioId: fila.usuarioId,
    lugarId: fila.lugarId,
    fechaHora: fila.fechaHora,
    origen: fila.origen as Visita['origen'],
    fotoUri: fila.fotoUri,
    nota: fila.nota,
    sincronizada: fila.sincronizada === 1,
  };
}

export async function guardarLugar(lugar: Lugar): Promise<void> {
  const base = await abrirBaseDatos();
  const fila = aFilaLugar(lugar);
  await base.runAsync(
    `INSERT INTO lugares (
      id, nombre, categoriaId, descripcionCorta, descripcion, latitud, longitud,
      direccion, imagenes, horarios, telefono, sitioWeb, precioEntrada,
      audioguia, codigoQr, accesible, activo, actualizadoEn
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      nombre = excluded.nombre,
      categoriaId = excluded.categoriaId,
      descripcionCorta = excluded.descripcionCorta,
      descripcion = excluded.descripcion,
      latitud = excluded.latitud,
      longitud = excluded.longitud,
      direccion = excluded.direccion,
      imagenes = excluded.imagenes,
      horarios = excluded.horarios,
      telefono = excluded.telefono,
      sitioWeb = excluded.sitioWeb,
      precioEntrada = excluded.precioEntrada,
      audioguia = excluded.audioguia,
      codigoQr = excluded.codigoQr,
      accesible = excluded.accesible,
      activo = excluded.activo,
      actualizadoEn = excluded.actualizadoEn`,
    [
      fila.id,
      fila.nombre,
      fila.categoriaId,
      fila.descripcionCorta,
      fila.descripcion,
      fila.latitud,
      fila.longitud,
      fila.direccion,
      fila.imagenes,
      fila.horarios,
      fila.telefono,
      fila.sitioWeb,
      fila.precioEntrada,
      fila.audioguia,
      fila.codigoQr,
      fila.accesible,
      fila.activo,
      fila.actualizadoEn,
    ],
  );
}

export async function obtenerLugar(id: string): Promise<Lugar | null> {
  const base = await abrirBaseDatos();
  const fila = await base.getFirstAsync<FilaLugar>(
    'SELECT * FROM lugares WHERE id = ? AND activo = 1',
    [id],
  );
  return fila === null ? null : aLugar(fila);
}

export async function obtenerLugares(): Promise<Lugar[]> {
  const base = await abrirBaseDatos();
  const filas = await base.getAllAsync<FilaLugar>(
    'SELECT * FROM lugares WHERE activo = 1 ORDER BY nombre',
  );
  return filas.map(aLugar);
}

export async function guardarVisita(visita: Visita): Promise<void> {
  const base = await abrirBaseDatos();
  const fila = aFilaVisita(visita);
  await base.runAsync(
    `INSERT INTO visitas (id, usuarioId, lugarId, fechaHora, origen, fotoUri, nota, sincronizada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [fila.id, fila.usuarioId, fila.lugarId, fila.fechaHora, fila.origen, fila.fotoUri, fila.nota, fila.sincronizada],
  );
}

export async function obtenerVisita(id: string): Promise<Visita | null> {
  const base = await abrirBaseDatos();
  const fila = await base.getFirstAsync<FilaVisita>(
    'SELECT * FROM visitas WHERE id = ?',
    [id],
  );
  return fila === null ? null : aVisita(fila);
}

export async function obtenerVisitas(): Promise<Visita[]> {
  const base = await abrirBaseDatos();
  const filas = await base.getAllAsync<FilaVisita>(
    'SELECT * FROM visitas ORDER BY fechaHora DESC',
  );
  return filas.map(aVisita);
}