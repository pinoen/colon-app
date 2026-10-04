import { Marker } from 'react-native-maps';
import { Text, View } from 'react-native';

import type { Lugar } from '@/tipos/lugar';

interface Props {
  lugar: Lugar;
  onPress?: () => void;
}

export function MarcadorMapa({ lugar, onPress }: Props) {
  return (
    <Marker
      coordinate={{
        latitude: lugar.coordenadas.latitud,
        longitude: lugar.coordenadas.longitud,
      }}
      title={lugar.nombre}
      onPress={onPress}
      tracksViewChanges={false}
    >
      <View className="items-center rounded-full border-2 border-blanco bg-primario px-3 py-1">
        <Text className="text-xs font-bold text-blanco">{lugar.nombre}</Text>
      </View>
    </Marker>
  );
}