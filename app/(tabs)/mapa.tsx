import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Magnetometer } from 'expo-sensors';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import MapView, { type Region } from 'react-native-maps';

import { MarcadorMapa } from '@/componentes/MarcadorMapa';
import { useLugares } from '@/hooks/useLugares';
import { useUbicacion } from '@/hooks/useUbicacion';
import { categoriaKeys } from '@/queries/categoriaKeys';
import { listarCategorias } from '@/servicios/categorias';
import type { Coordenadas, Lugar } from '@/tipos/lugar';
import {
  distanciaMetros,
  formatearDistancia,
  ordenarPorCercania,
  rumboGrados,
} from '@/utilidades/distancia';

const REGION_COLON: Region = {
  latitude: -32.23,
  longitude: -58.143,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

function estaEnRegion(coordenadas: Coordenadas, regionActual: Region): boolean {
  return (
    Math.abs(coordenadas.latitud - regionActual.latitude) <=
      regionActual.latitudeDelta / 2 &&
    Math.abs(coordenadas.longitud - regionActual.longitude) <=
      regionActual.longitudeDelta / 2
  );
}

export default function MapaScreen() {
  const router = useRouter();
  const mapaRef = useRef<MapView>(null);
  const [categoria, setCategoria] = useState<string | undefined>(undefined);
  const [region, setRegion] = useState<Region>(REGION_COLON);
  const [seleccionado, setSeleccionado] = useState<Lugar | undefined>(undefined);
  const [heading, setHeading] = useState<number | undefined>(undefined);
  const centradoInicial = useRef(false);

  const {
    data: lugares,
    isPending,
    isError,
    refetch,
  } = useLugares(categoria === undefined ? {} : { categoriaId: categoria });
  const { data: ubicacion, refetch: refetchUbicacion } = useUbicacion();

  const categoriasQuery = useQuery({
    queryKey: categoriaKeys.listar(),
    queryFn: async () => {
      const resultado = await listarCategorias();
      if (resultado.success) {
        return resultado.data;
      }
      throw new Error(resultado.error);
    },
  });
  const categorias = categoriasQuery.data ?? [];

  useEffect(() => {
    let suscripcion: { remove: () => void } | undefined;
    let activo = true;
    Magnetometer.isAvailableAsync()
      .then((disponible) => {
        if (!activo || !disponible) {
          return;
        }
        Magnetometer.setUpdateInterval(150);
        suscripcion = Magnetometer.addListener((datos) => {
          let angulo = (Math.atan2(datos.y, datos.x) * 180) / Math.PI;
          angulo = (angulo + 360) % 360;
          setHeading(angulo);
        });
      })
      .catch(() => undefined);
    return () => {
      activo = false;
      suscripcion?.remove();
    };
  }, []);

  useEffect(() => {
    if (ubicacion === null || ubicacion === undefined || centradoInicial.current) {
      return;
    }
    centradoInicial.current = true;
    mapaRef.current?.animateToRegion(
      {
        latitude: ubicacion.latitud,
        longitude: ubicacion.longitud,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      300,
    );
  }, [ubicacion]);

  const centrarEnMiUbicacion = () => {
    if (ubicacion === null || ubicacion === undefined) {
      refetchUbicacion().then(({ data }) => {
        if (data !== null && data !== undefined) {
          mapaRef.current?.animateToRegion(
            {
              latitude: data.latitud,
              longitude: data.longitud,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            },
            300,
          );
        }
      });
      return;
    }
    mapaRef.current?.animateToRegion(
      {
        latitude: ubicacion.latitud,
        longitude: ubicacion.longitud,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      300,
    );
  };

  const seleccionadoActual =
    seleccionado !== undefined &&
    lugares?.some((lugar) => lugar.id === seleccionado.id)
      ? seleccionado
      : undefined;

  const cercanos = useMemo(() => {
    if (ubicacion === null || ubicacion === undefined || lugares === undefined) {
      return [];
    }
    return ordenarPorCercania(lugares, ubicacion);
  }, [lugares, ubicacion]);

  const abrirRuteo = (destino: Coordenadas) => {
    const url = Platform.select({
      ios: `maps:?q=${destino.latitud},${destino.longitud}`,
      default: `https://www.google.com/maps/search/?api=1&query=${destino.latitud},${destino.longitud}`,
    });
    if (url !== undefined) {
      Linking.openURL(url).catch(() => undefined);
    }
  };

  const flechaVisible =
    seleccionadoActual !== undefined &&
    heading !== undefined &&
    !estaEnRegion(seleccionadoActual.coordenadas, region);
  const rotacionFlecha =
    flechaVisible && heading !== undefined
      ? (rumboGrados(
          { latitud: region.latitude, longitud: region.longitude },
          seleccionadoActual.coordenadas,
        ) -
          heading +
          360) %
        360
      : 0;

  return (
    <View className="flex-1 bg-fondo dark:bg-fondo-oscuro">
      <MapView
        ref={mapaRef}
        className="flex-1"
        initialRegion={REGION_COLON}
        onRegionChangeComplete={setRegion}
        onPress={() => setSeleccionado(undefined)}
        showsUserLocation={ubicacion !== null && ubicacion !== undefined}
        loadingEnabled
      >
        {lugares?.map((lugar) => (
          <MarcadorMapa
            key={lugar.id}
            lugar={lugar}
            onPress={() => setSeleccionado(lugar)}
          />
        ))}
      </MapView>

      <View className="absolute left-0 right-0 top-2 px-4">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-grow-0"
        >
          <View className="flex-row gap-2 pr-4">
            <ChipCategoria
              nombre="Todas"
              seleccionada={categoria === undefined}
              onPress={() => setCategoria(undefined)}
            />
            {categorias.map((c) => (
              <ChipCategoria
                key={c.id}
                nombre={c.nombre}
                seleccionada={categoria === c.id}
                onPress={() => setCategoria(categoria === c.id ? undefined : c.id)}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      {flechaVisible ? (
        <Pressable
          onPress={() => {
            mapaRef.current?.animateToRegion(
              {
                latitude: seleccionadoActual.coordenadas.latitud,
                longitude: seleccionadoActual.coordenadas.longitud,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              },
              300,
            );
          }}
          accessibilityRole="button"
          className="absolute right-4 top-16 rounded-full bg-superficie p-3 dark:bg-superficie-oscura"
        >
          <View style={{ transform: [{ rotate: `${rotacionFlecha}deg` }] }}>
            <Text className="text-2xl text-primario dark:text-primario-claro">
              ➤
            </Text>
          </View>
        </Pressable>
      ) : null}

      <View className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-superficie p-4 dark:bg-superficie-oscura">
        {isPending ? (
          <View className="flex-row items-center justify-center gap-3 py-6">
            <ActivityIndicator size="small" />
            <Text className="text-texto-secundario dark:text-texto-secundario-oscuro">
              Cargando lugares...
            </Text>
          </View>
        ) : isError ? (
          <View className="items-center gap-3 py-6">
            <Text className="text-center text-sm text-texto dark:text-texto-oscuro">
              No pudimos cargar los lugares. Verificá tu conexión.
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="rounded-xl bg-primario px-5 py-2"
            >
              <Text className="text-sm font-semibold text-blanco">Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {seleccionadoActual !== undefined ? (
              <View className="mb-3 gap-2">
                <Text className="text-lg font-bold text-texto dark:text-texto-oscuro">
                  {seleccionadoActual.nombre}
                </Text>
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => abrirRuteo(seleccionadoActual.coordenadas)}
                    className="flex-1 rounded-xl bg-primario px-4 py-3"
                  >
                    <Text className="text-center text-sm font-semibold text-blanco">
                      Cómo llegar
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/lugares/[id]',
                        params: { id: seleccionadoActual.id },
                      } as never)
                    }
                    className="flex-1 rounded-xl bg-primario/10 px-4 py-3 dark:bg-primario/20"
                  >
                    <Text className="text-center text-sm font-semibold text-primario dark:text-primario-claro">
                      Ver detalle
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-base font-bold text-texto dark:text-texto-oscuro">
                Lugares cercanos
              </Text>
              <Pressable
                onPress={centrarEnMiUbicacion}
                className="rounded-full bg-primario/10 px-3 py-2 dark:bg-primario/20"
              >
                <Text className="text-xs font-semibold text-primario dark:text-primario-claro">
                  Mi ubicación
                </Text>
              </Pressable>
            </View>

            {ubicacion === null || ubicacion === undefined ? (
              <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
                Sin permiso de ubicación: el mapa funciona igual, pero no podemos
                ordenar por distancia. Tocá "Mi ubicación" para intentarlo.
              </Text>
            ) : cercanos.length === 0 ? (
              <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
                No hay lugares para mostrar con este filtro.
              </Text>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                className="max-h-48"
              >
                {cercanos.map((lugar) => (
                  <Pressable
                    key={lugar.id}
                    onPress={() => setSeleccionado(lugar)}
                    className="flex-row items-center justify-between border-b border-borde py-3 last:border-b-0 dark:border-borde-oscuro"
                  >
                    <Text className="flex-1 pr-3 text-sm text-texto dark:text-texto-oscuro">
                      {lugar.nombre}
                    </Text>
                    <Text className="text-sm font-medium text-primario dark:text-primario-claro">
                      {formatearDistancia(
                        distanciaMetros(ubicacion, lugar.coordenadas),
                      )}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </>
        )}
      </View>
    </View>
  );
}

function ChipCategoria({
  nombre,
  seleccionada,
  onPress,
}: {
  nombre: string;
  seleccionada: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-4 py-2 ${
        seleccionada ? 'bg-primario' : 'bg-superficie dark:bg-superficie-oscura'
      }`}
    >
      <Text
        className={`text-sm font-medium ${
          seleccionada
            ? 'text-blanco'
            : 'text-texto dark:text-texto-oscuro'
        }`}
      >
        {nombre}
      </Text>
    </Pressable>
  );
}