import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

const ACCESOS_RAPIDOS = [
  {
    titulo: 'Mapa',
    ruta: '/mapa',
    descripcion: 'Ver los lugares cercanos en el mapa.',
  },
  {
    titulo: 'Agenda',
    ruta: '/agenda',
    descripcion: 'Eventos programados día a día.',
  },
  {
    titulo: 'Lugares',
    ruta: '/lugares',
    descripcion: 'Buscar y filtrar los lugares de interés.',
  },
] as const;

export default function Inicio() {
  return (
    <View className="flex-1 gap-4 bg-fondo p-6 dark:bg-fondo-oscuro">
      <Text className="text-3xl font-bold text-texto dark:text-texto-oscuro">
        Guía Turística de Colón
      </Text>
      <Text className="text-base text-texto-secundario dark:text-texto-secundario-oscuro">
        Acceso rápido
      </Text>
      {ACCESOS_RAPIDOS.map((acceso) => (
        <Link key={acceso.ruta} href={acceso.ruta} asChild>
          <Pressable className="rounded-xl bg-primario p-4">
            <Text className="text-lg font-semibold text-blanco">{acceso.titulo}</Text>
            <Text className="text-sm text-blanco/90">{acceso.descripcion}</Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}