import { memo, useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import type { OrigenVisita, Visita } from '@/tipos/visita';

export const ETIQUETAS_ORIGEN: Record<OrigenVisita, string> = {
  qr: 'Código QR',
  gps: 'Proximidad GPS',
  manual: 'Carga manual',
};

/** Fecha y hora local de la visita, con formato legible en español. */
export function formatearFechaHoraVisita(fechaHora: string): string {
  const fecha = new Date(fechaHora);
  if (Number.isNaN(fecha.getTime())) {
    return fechaHora;
  }
  return fecha.toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Props {
  visita: Visita;
  nombreLugar: string;
  onPress: () => void;
}

function VisitaCardBase({ visita, nombreLugar, onPress }: Props) {
  const [cargaFallida, setCargaFallida] = useState(false);

  useEffect(() => {
    setCargaFallida(false);
  }, [visita.fotoUri]);

  const mostrarFoto = visita.fotoUri !== null && !cargaFallida;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ver detalle de la visita a ${nombreLugar}`}
      className="gap-3 rounded-2xl bg-superficie p-4 active:opacity-80 dark:bg-superficie-oscura"
    >
      <View className="flex-row items-start gap-3">
        {mostrarFoto ? (
          <Image
            source={{ uri: visita.fotoUri as string }}
            onError={() => setCargaFallida(true)}
            resizeMode="cover"
            className="h-16 w-16 rounded-xl"
          />
        ) : (
          <View className="h-16 w-16 items-center justify-center rounded-xl bg-borde/40 dark:bg-borde-oscuro/40">
            <Text className="text-center text-[10px] text-texto-secundario dark:text-texto-secundario-oscuro">
              Sin foto
            </Text>
          </View>
        )}

        <View className="flex-1 gap-1">
          <View className="flex-row items-start justify-between gap-2">
            <Text
              numberOfLines={2}
              className="flex-1 text-base font-semibold text-texto dark:text-texto-oscuro"
            >
              {nombreLugar}
            </Text>
            <View className="rounded-full bg-primario/10 px-3 py-1 dark:bg-primario/20">
              <Text className="text-xs font-semibold text-primario dark:text-primario-claro">
                {ETIQUETAS_ORIGEN[visita.origen]}
              </Text>
            </View>
          </View>
          <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
            {formatearFechaHoraVisita(visita.fechaHora)}
          </Text>
        </View>
      </View>

      {visita.nota !== null ? (
        <Text
          numberOfLines={2}
          className="text-sm text-texto dark:text-texto-oscuro"
        >
          {visita.nota}
        </Text>
      ) : (
        <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
          Tocá para agregar una foto o una nota.
        </Text>
      )}

      <View className="flex-row items-center gap-2">
        <View
          className={`h-2 w-2 rounded-full ${
            visita.sincronizada ? 'bg-exito' : 'bg-acento'
          }`}
        />
        <Text className="flex-1 text-xs text-texto-secundario dark:text-texto-secundario-oscuro">
          {visita.sincronizada
            ? 'Sincronizada'
            : 'Guardada en el dispositivo · pendiente de sincronizar'}
        </Text>
        <Text className="text-lg text-texto-secundario dark:text-texto-secundario-oscuro">
          ›
        </Text>
      </View>
    </Pressable>
  );
}

export const VisitaCard = memo(VisitaCardBase);
