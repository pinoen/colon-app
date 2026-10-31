import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { paleta } from '@/constantes/colores';
import { useTema } from '@/context/TemaContext';

const ACCESOS_PRINCIPALES = [
  {
    titulo: 'Lugares',
    ruta: '/lugares',
    descripcion: 'Buscar y filtrar los lugares de interés.',
    icono: 'location',
  },
  {
    titulo: 'Mapa',
    ruta: '/mapa',
    descripcion: 'Ver los lugares cercanos en el mapa.',
    icono: 'map',
  },
  {
    titulo: 'Agenda',
    ruta: '/agenda',
    descripcion: 'Eventos programados día a día.',
    icono: 'calendar',
  },
] as const;

const ACCESOS_SECUNDARIOS = [
  {
    titulo: 'Mi recorrido',
    ruta: '/recorrido',
    icono: 'footsteps',
  },
  {
    titulo: 'Perfil',
    ruta: '/perfil',
    icono: 'person',
  },
] as const;

export default function Inicio() {
  const { esquema } = useTema();
  const colorSecundario =
    esquema === 'dark' ? paleta['primario-claro'] : paleta.primario;

  return (
    <SafeAreaView className="flex-1 bg-fondo dark:bg-fondo-oscuro">
      <ScrollView
        contentContainerClassName="gap-6 p-6 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-2">
          <Text className="text-3xl font-bold text-texto dark:text-texto-oscuro">
            Guía Turística de Colón
          </Text>
          <Text className="text-base text-texto-secundario dark:text-texto-secundario-oscuro">
            Descubrí qué hacer y cómo recorrer la ciudad.
          </Text>
        </View>

        <View className="gap-3">
          <Text className="text-base font-semibold text-texto dark:text-texto-oscuro">
            Acceso rápido
          </Text>
          {ACCESOS_PRINCIPALES.map((acceso) => (
            <Link key={acceso.ruta} href={acceso.ruta} asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Ir a ${acceso.titulo}`}
                className="flex-row items-center gap-4 rounded-2xl bg-primario p-4 active:opacity-90"
              >
                <View className="h-12 w-12 items-center justify-center rounded-xl bg-blanco/15">
                  <Ionicons
                    name={acceso.icono}
                    size={26}
                    color={paleta.blanco}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-semibold text-blanco">
                    {acceso.titulo}
                  </Text>
                  <Text className="text-sm text-blanco/90">
                    {acceso.descripcion}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={paleta.blanco}
                />
              </Pressable>
            </Link>
          ))}
        </View>

        <View className="gap-3">
          <Text className="text-base font-semibold text-texto dark:text-texto-oscuro">
            Mi espacio
          </Text>
          <View className="overflow-hidden rounded-2xl bg-superficie dark:bg-superficie-oscura">
            {ACCESOS_SECUNDARIOS.map((acceso, indice) => (
              <Link key={acceso.ruta} href={acceso.ruta} asChild>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ir a ${acceso.titulo}`}
                  className={`flex-row items-center gap-3 p-4 active:opacity-80 ${
                    indice > 0
                      ? 'border-t border-borde dark:border-borde-oscuro'
                      : ''
                  }`}
                >
                  <Ionicons
                    name={acceso.icono}
                    size={24}
                    color={colorSecundario}
                  />
                  <Text className="flex-1 text-base font-semibold text-texto dark:text-texto-oscuro">
                    {acceso.titulo}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colorSecundario}
                  />
                </Pressable>
              </Link>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
