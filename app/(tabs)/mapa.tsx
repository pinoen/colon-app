import { useRouter } from 'expo-router';
import { Magnetometer } from 'expo-sensors';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { MapaOSM } from '@/componentes/MapaOSM';
import type { MapaOSMRef } from '@/componentes/mapaComun';
import { useLugares } from '@/hooks/useLugares';
import { useUbicacion } from '@/hooks/useUbicacion';
import { categoriaKeys } from '@/queries/categoriaKeys';
import { listarCategorias } from '@/servicios/categorias';
import type { Coordenadas, Lugar } from '@/tipos/lugar';
import type { VistaMapa } from '@/tipos/mapa';
import {
  distanciaMetros,
  formatearDistancia,
  ordenarPorCercania,
  rumboGrados,
} from '@/utilidades/distancia';

function estaEnVista(
  coordenadas: Coordenadas,
  vista: VistaMapa | undefined,
): boolean {
  if (vista === undefined) {
    return true;
  }
  return (
    coordenadas.latitud <= vista.limites.norte &&
    coordenadas.latitud >= vista.limites.sur &&
    coordenadas.longitud <= vista.limites.este &&
    coordenadas.longitud >= vista.limites.oeste
  );
}

export default function MapaScreen() {
  const router = useRouter();
  const mapaRef = useRef<MapaOSMRef>(null);
  const [categoria, setCategoria] = useState<string | undefined>(undefined);
  const [seleccionadoId, setSeleccionadoId] = useState<string | undefined>(
    undefined,
  );
  const [vista, setVista] = useState<VistaMapa | undefined>(undefined);
  const [heading, setHeading] = useState<number | undefined>(undefined);
  const [errorMapa, setErrorMapa] = useState<string | undefined>(undefined);

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

  const manejarSeleccion = useCallback((id: string | undefined) => {
    setSeleccionadoId(id);
  }, []);

  const manejarVista = useCallback((nuevaVista: VistaMapa) => {
    setVista(nuevaVista);
  }, []);

  const manejarErrorMapa = useCallback((mensaje: string) => {
    setErrorMapa(mensaje);
  }, []);

  const cambiarCategoria = (nuevaCategoria: string | undefined) => {
    setCategoria(nuevaCategoria);
    setSeleccionadoId(undefined);
  };

  const seleccionado = lugares?.find((lugar) => lugar.id === seleccionadoId);

  const cercanos = useMemo(() => {
    if (ubicacion === null || ubicacion === undefined || lugares === undefined) {
      return [];
    }
    return ordenarPorCercania(lugares, ubicacion);
  }, [lugares, ubicacion]);

  const centrarEnMiUbicacion = () => {
    if (ubicacion !== null && ubicacion !== undefined) {
      mapaRef.current?.centrarEn(ubicacion, 16);
      return;
    }
    refetchUbicacion().then(({ data }) => {
      if (data !== null && data !== undefined) {
        mapaRef.current?.centrarEn(data, 16);
      }
    });
  };

  const abrirRuteo = (destino: Lugar) => {
    const { latitud, longitud } = destino.coordenadas;
    const etiqueta = encodeURIComponent(destino.nombre);
    const urlNavegador = `https://www.openstreetmap.org/?mlat=${latitud}&mlon=${longitud}#map=17/${latitud}/${longitud}`;
    const url = Platform.select({
      ios: `maps:0,0?q=${etiqueta}@${latitud},${longitud}`,
      android: `geo:${latitud},${longitud}?q=${latitud},${longitud}(${etiqueta})`,
      default: urlNavegador,
    });
    if (url === undefined) {
      return;
    }
    Linking.openURL(url).catch(() => {
      Linking.openURL(urlNavegador).catch(() => undefined);
    });
  };

  const flechaVisible =
    seleccionado !== undefined &&
    heading !== undefined &&
    vista !== undefined &&
    !estaEnVista(seleccionado.coordenadas, vista);

  const rotacionFlecha =
    flechaVisible && heading !== undefined && vista !== undefined
      ? (rumboGrados(vista.centro, seleccionado.coordenadas) - heading + 360) %
        360
      : 0;

  return (
    <View className="flex-1 bg-fondo dark:bg-fondo-oscuro">
      <MapaOSM
        ref={mapaRef}
        lugares={lugares ?? []}
        ubicacion={ubicacion}
        seleccionadoId={seleccionadoId}
        oscuro={false}
        onSeleccionar={manejarSeleccion}
        onVistaChange={manejarVista}
        onError={manejarErrorMapa}
      />

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
              onPress={() => cambiarCategoria(undefined)}
            />
            {categorias.map((c) => (
              <ChipCategoria
                key={c.id}
                nombre={c.nombre}
                seleccionada={categoria === c.id}
                onPress={() =>
                  cambiarCategoria(categoria === c.id ? undefined : c.id)
                }
              />
            ))}
          </View>
        </ScrollView>
      </View>

      {errorMapa !== undefined ? (
        <View className="absolute left-4 right-20 top-14 rounded-xl bg-superficie px-3 py-2 dark:bg-superficie-oscura">
          <Text className="text-xs text-texto-secundario dark:text-texto-secundario-oscuro">
            {errorMapa}
          </Text>
        </View>
      ) : null}

      <View className="absolute right-4 top-14 gap-2">
        <BotonMapa
          etiqueta="Acercar el mapa"
          texto="+"
          onPress={() => mapaRef.current?.cambiarZoom(1)}
        />
        <BotonMapa
          etiqueta="Alejar el mapa"
          texto="−"
          onPress={() => mapaRef.current?.cambiarZoom(-1)}
        />
      </View>

      {flechaVisible ? (
        <Pressable
          onPress={() =>
            mapaRef.current?.centrarEn(seleccionado.coordenadas, 16)
          }
          accessibilityRole="button"
          accessibilityLabel="Centrar el mapa en el lugar seleccionado"
          className="absolute right-4 top-40 rounded-full bg-superficie p-3 dark:bg-superficie-oscura"
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
              <Text className="text-sm font-semibold text-blanco">
                Reintentar
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {seleccionado !== undefined ? (
              <View className="mb-3 gap-2">
                <Text className="text-lg font-bold text-texto dark:text-texto-oscuro">
                  {seleccionado.nombre}
                </Text>
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => abrirRuteo(seleccionado)}
                    accessibilityRole="button"
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
                        params: { id: seleccionado.id },
                      } as never)
                    }
                    accessibilityRole="button"
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
                accessibilityRole="button"
                className="rounded-full bg-primario/10 px-3 py-2 dark:bg-primario/20"
              >
                <Text className="text-xs font-semibold text-primario dark:text-primario-claro">
                  Mi ubicación
                </Text>
              </Pressable>
            </View>

            {ubicacion === null || ubicacion === undefined ? (
              <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
                Sin permiso de ubicación: el mapa funciona igual, pero no
                podemos ordenar por distancia. Tocá "Mi ubicación" para
                intentarlo.
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
                    onPress={() => {
                      setSeleccionadoId(lugar.id);
                      mapaRef.current?.enfocar(lugar.id);
                    }}
                    accessibilityRole="button"
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

        <Text className="mt-3 text-center text-[10px] text-texto-secundario dark:text-texto-secundario-oscuro">
          Datos del mapa © OpenStreetMap
        </Text>
      </View>
    </View>
  );
}

function BotonMapa({
  etiqueta,
  texto,
  onPress,
}: {
  etiqueta: string;
  texto: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      className="h-10 w-10 items-center justify-center rounded-full bg-superficie dark:bg-superficie-oscura"
    >
      <Text className="text-xl font-semibold text-texto dark:text-texto-oscuro">
        {texto}
      </Text>
    </Pressable>
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
      accessibilityRole="button"
      className={`rounded-full px-4 py-2 ${
        seleccionada
          ? 'bg-primario'
          : 'bg-superficie dark:bg-superficie-oscura'
      }`}
    >
      <Text
        className={`text-sm font-medium ${
          seleccionada ? 'text-blanco' : 'text-texto dark:text-texto-oscuro'
        }`}
      >
        {nombre}
      </Text>
    </Pressable>
  );
}
