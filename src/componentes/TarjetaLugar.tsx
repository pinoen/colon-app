import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import type { Lugar } from '@/tipos/lugar';

interface Props {
  lugar: Lugar;
  onPress: () => void;
}

export function TarjetaLugar({ lugar, onPress }: Props) {
  const [cargaFallida, setCargaFallida] = useState(false);

  useEffect(() => {
    setCargaFallida(false);
  }, [lugar.id]);

  const mostrarImagen = lugar.imagenes.length > 0 && !cargaFallida;

  const etiquetas: string[] = [];
  if (lugar.precioEntrada === 0) {
    etiquetas.push('Gratis');
  } else if (lugar.precioEntrada !== null) {
    etiquetas.push(`$${lugar.precioEntrada}`);
  }
  if (lugar.audioguia !== null) {
    etiquetas.push('Audioguía');
  }
  if (lugar.accesible) {
    etiquetas.push('Accesible');
  }

  return (
    <Pressable
      onPress={onPress}
      className="overflow-hidden rounded-2xl bg-superficie active:opacity-80 dark:bg-superficie-oscura"
    >
      {mostrarImagen ? (
        <Image
          source={{ uri: lugar.imagenes[0] }}
          onError={() => setCargaFallida(true)}
          resizeMode="cover"
          className="h-40 w-full"
        />
      ) : (
        <View className="h-40 w-full items-center justify-center bg-borde/40 dark:bg-borde-oscuro/40">
          <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
            Sin fotos
          </Text>
        </View>
      )}
      <View className="gap-2 p-4">
        <Text
          numberOfLines={1}
          className="text-lg font-semibold text-texto dark:text-texto-oscuro"
        >
          {lugar.nombre}
        </Text>
        <Text
          numberOfLines={2}
          className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro"
        >
          {lugar.descripcionCorta}
        </Text>
        {etiquetas.length > 0 && (
          <View className="mt-1 flex-row flex-wrap gap-2">
            {etiquetas.map((etiqueta) => (
              <View
                key={etiqueta}
                className="rounded-full bg-primario/10 px-2 py-1 dark:bg-primario/20"
              >
                <Text className="text-xs font-medium text-primario dark:text-primario-claro">
                  {etiqueta}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}