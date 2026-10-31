import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAudioguia } from '@/hooks/useAudioguia';
import type { Audioguia, IdLugar } from '@/tipos/lugar';
import {
  formatearTiempoAudio,
  formatearTiempoRestanteAudio,
} from '@/utilidades/formato';

const SALTO_SEGUNDOS = 15;

const NOMBRE_IDIOMA: Record<Audioguia['idioma'], string> = {
  es: 'Español',
  en: 'Inglés',
  pt: 'Portugués',
};

interface Props {
  lugarId: IdLugar;
  audioguia: Audioguia;
  nombreLugar: string;
}

/**
 * Reproductor de la audioguía del lugar (expo-audio) con descarga local para
 * escucharla sin conexión. No se renderiza si el lugar no tiene audioguía.
 */
export function ReproductorAudio({ lugarId, audioguia, nombreLugar }: Props) {
  const {
    fuente,
    descargada,
    descargando,
    eliminando,
    progreso,
    errorDescarga,
    descargar,
    eliminar,
  } = useAudioguia(lugarId, audioguia);

  const player = useAudioPlayer(fuente, { updateInterval: 500 });
  const estado = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    }).catch(() => undefined);
  }, []);

  const duracion =
    estado.duration > 0 ? estado.duration : audioguia.duracionSegundos;
  const posicion = Math.min(Math.max(estado.currentTime, 0), duracion);
  const porcentajeReproduccion =
    duracion > 0 ? Math.min(100, (posicion / duracion) * 100) : 0;

  const alternarReproduccion = () => {
    if (estado.playing) {
      player.pause();
      return;
    }
    if (estado.didJustFinish) {
      void player.seekTo(0).catch(() => undefined);
    }
    player.play();
  };

  const saltar = (segundos: number) => {
    const destino = Math.min(Math.max(posicion + segundos, 0), duracion);
    void player.seekTo(destino).catch(() => undefined);
  };

  const porcentajeDescarga = progreso?.porcentaje ?? null;

  return (
    <View className="gap-4 rounded-xl bg-superficie p-4 dark:bg-superficie-oscura">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-sm font-semibold text-texto-secundario dark:text-texto-secundario-oscuro">
          {NOMBRE_IDIOMA[audioguia.idioma]} ·{' '}
          {formatearTiempoAudio(duracion)}
        </Text>
        {descargada ? (
          <View className="rounded-full bg-primario px-3 py-1">
            <Text className="text-xs font-semibold text-blanco">
              Disponible sin conexión
            </Text>
          </View>
        ) : null}
      </View>

      <View
        className="h-2 overflow-hidden rounded-full bg-borde dark:bg-borde-oscuro"
        accessibilityRole="progressbar"
        accessibilityLabel="Progreso de la audioguía"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(porcentajeReproduccion) }}
      >
        <View
          className="h-2 rounded-full bg-primario"
          style={{ width: `${porcentajeReproduccion}%` }}
        />
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-texto-secundario dark:text-texto-secundario-oscuro">
          {formatearTiempoAudio(posicion)}
        </Text>
        <Text className="text-xs text-texto-secundario dark:text-texto-secundario-oscuro">
          {formatearTiempoRestanteAudio(duracion, posicion)}
        </Text>
      </View>

      <View className="flex-row items-center justify-center gap-4">
        <BotonSalto
          texto={`-${SALTO_SEGUNDOS} s`}
          etiqueta={`Retroceder ${SALTO_SEGUNDOS} segundos`}
          onPress={() => saltar(-SALTO_SEGUNDOS)}
        />
        <Pressable
          onPress={alternarReproduccion}
          accessibilityRole="button"
          accessibilityLabel={
            estado.playing
              ? `Pausar audioguía de ${nombreLugar}`
              : `Reproducir audioguía de ${nombreLugar}`
          }
          className="h-16 w-16 items-center justify-center rounded-full bg-primario active:opacity-80"
        >
          <Text className="text-2xl text-blanco">
            {estado.playing ? '❚❚' : '▶'}
          </Text>
        </Pressable>
        <BotonSalto
          texto={`+${SALTO_SEGUNDOS} s`}
          etiqueta={`Avanzar ${SALTO_SEGUNDOS} segundos`}
          onPress={() => saltar(SALTO_SEGUNDOS)}
        />
      </View>

      {estado.error !== null ? (
        <Text className="text-sm text-peligro dark:text-peligro">
          No se pudo reproducir la audioguía. Verificá tu conexión o descargala
          para escucharla sin internet.
        </Text>
      ) : null}

      <View className="gap-2">
        {descargada ? (
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="flex-1 text-sm text-texto dark:text-texto-oscuro">
              Guardada en este dispositivo.
            </Text>
            <Pressable
              onPress={eliminar}
              disabled={eliminando}
              accessibilityRole="button"
              accessibilityLabel={`Eliminar la descarga de la audioguía de ${nombreLugar}`}
              className={`rounded-xl border border-peligro px-4 py-2 ${
                eliminando ? 'opacity-60' : ''
              }`}
            >
              <Text className="text-sm font-semibold text-peligro">
                {eliminando ? 'Eliminando...' : 'Eliminar descarga'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={descargar}
            disabled={descargando}
            accessibilityRole="button"
            accessibilityLabel={`Descargar la audioguía de ${nombreLugar} para uso sin conexión`}
            className={`rounded-xl bg-primario px-5 py-3 ${
              descargando ? 'opacity-60' : ''
            }`}
          >
            <Text className="text-center text-base font-semibold text-blanco">
              {descargando
                ? porcentajeDescarga !== null
                  ? `Descargando ${porcentajeDescarga}%...`
                  : 'Descargando...'
                : 'Descargar para uso sin conexión'}
            </Text>
          </Pressable>
        )}
        {errorDescarga !== null ? (
          <Text className="text-sm text-peligro dark:text-peligro">
            {errorDescarga}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function BotonSalto({
  texto,
  etiqueta,
  onPress,
}: {
  texto: string;
  etiqueta: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      hitSlop={8}
      className="min-h-12 min-w-16 items-center justify-center rounded-xl bg-fondo px-3 py-2 dark:bg-fondo-oscuro"
    >
      <Text className="text-sm font-semibold text-primario dark:text-primario-claro">
        {texto}
      </Text>
    </Pressable>
  );
}
