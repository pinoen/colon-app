import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { TarjetaLugar } from '@/componentes/TarjetaLugar';
import { paleta } from '@/constantes/colores';
import { useLugares } from '@/hooks/useLugares';
import { categoriaKeys } from '@/queries/categoriaKeys';
import type { FiltrosLugar } from '@/queries/lugarKeys';
import { listarCategorias } from '@/servicios/categorias';

type ParametrosLugares = {
  categoria?: string;
  buscar?: string;
};

function primerValor(valor: string | string[] | undefined): string | undefined {
  return typeof valor === 'string' ? valor : undefined;
}

export default function LugaresScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<ParametrosLugares>();
  const categoria = primerValor(params.categoria);
  const busquedaParametro = primerValor(params.buscar);

  const [textoBusqueda, setTextoBusqueda] = useState(busquedaParametro ?? '');

  useEffect(() => {
    const tiempo = setTimeout(() => {
      const texto = textoBusqueda.trim();
      const actual = busquedaParametro ?? '';
      if (texto !== actual) {
        router.setParams({ buscar: texto === '' ? undefined : texto });
      }
    }, 300);
    return () => clearTimeout(tiempo);
  }, [textoBusqueda, busquedaParametro, router]);

  const filtros: FiltrosLugar = {
    ...(categoria === undefined ? {} : { categoriaId: categoria }),
    ...(busquedaParametro === undefined ? {} : { busqueda: busquedaParametro }),
  };

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

  const {
    data: lugares,
    isPending,
    isError,
    refetch,
  } = useLugares(filtros);

  return (
    <View className="flex-1 bg-fondo dark:bg-fondo-oscuro">
      <View className="gap-4 p-4">
        <TextInput
          value={textoBusqueda}
          onChangeText={setTextoBusqueda}
          placeholder="Buscar por nombre"
          placeholderTextColor={paleta['texto-secundario']}
          className="rounded-xl border border-borde bg-superficie px-4 py-3 text-texto dark:border-borde-oscuro dark:bg-superficie-oscura dark:text-texto-oscuro"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-grow-0"
        >
          <View className="flex-row gap-2 pr-4">
            <Pressable
              onPress={() => router.setParams({ categoria: undefined })}
              className={`rounded-full px-4 py-2 ${
                categoria === undefined
                  ? 'bg-primario'
                  : 'bg-superficie dark:bg-superficie-oscura'
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  categoria === undefined
                    ? 'text-blanco'
                    : 'text-texto dark:text-texto-oscuro'
                }`}
              >
                Todas
              </Text>
            </Pressable>
            {categorias.map((c) => (
              <Pressable
                key={c.id}
                onPress={() =>
                  router.setParams({
                    categoria: c.id === categoria ? undefined : c.id,
                  })
                }
                className={`rounded-full px-4 py-2 ${
                  categoria === c.id
                    ? 'bg-primario'
                    : 'bg-superficie dark:bg-superficie-oscura'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    categoria === c.id
                      ? 'text-blanco'
                      : 'text-texto dark:text-texto-oscuro'
                  }`}
                >
                  {c.nombre}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {isPending ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator size="large" color={paleta.primario} />
          <Text className="text-texto-secundario dark:text-texto-secundario-oscuro">
            Cargando lugares...
          </Text>
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center gap-4 p-6">
          <Text className="text-center text-base text-texto dark:text-texto-oscuro">
            No se pudieron cargar los lugares. Verificá tu conexión e intentá de
            nuevo.
          </Text>
          <Pressable
            onPress={() => refetch()}
            className="rounded-xl bg-primario px-6 py-3"
          >
            <Text className="text-base font-semibold text-blanco">Reintentar</Text>
          </Pressable>
        </View>
      ) : lugares.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 p-6">
          <Text className="text-center text-lg font-semibold text-texto dark:text-texto-oscuro">
            No encontramos lugares
          </Text>
          <Text className="text-center text-base text-texto-secundario dark:text-texto-secundario-oscuro">
            Probá con otro nombre o con otra categoría.
          </Text>
        </View>
      ) : (
        <FlatList
          data={lugares}
          keyExtractor={(lugar) => lugar.id}
          renderItem={({ item }) => (
            <TarjetaLugar
              lugar={item}
              onPress={() =>
                router.push({
                  pathname: '/lugares/[id]',
                  params: { id: item.id },
                } as never)
              }
            />
          )}
          contentContainerClassName="gap-4 p-4 pb-8"
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}