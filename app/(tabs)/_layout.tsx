import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Tabs } from 'expo-router';

import { paleta } from '@/constantes/colores';
import { useTema } from '@/context/TemaContext';

export default function TabLayout() {
  const { esquema } = useTema();
  const colorActivo =
    esquema === 'dark' ? paleta['primario-claro'] : paleta.primario;
  const colorInactivo =
    esquema === 'dark'
      ? paleta['texto-secundario-oscuro']
      : paleta['texto-secundario'];
  const colorFondo =
    esquema === 'dark' ? paleta['fondo-oscuro'] : paleta.fondo;
  const colorBorde =
    esquema === 'dark' ? paleta['borde-oscuro'] : paleta.borde;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colorActivo,
        tabBarInactiveTintColor: colorInactivo,
        tabBarStyle: {
          backgroundColor: colorFondo,
          borderTopColor: colorBorde,
        },
      }}
    >
      <Tabs.Screen
        name="lugares"
        options={{
          title: 'Lugares',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'location' : 'location-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="mapa"
        options={{
          title: 'Mapa',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'map' : 'map-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="agenda"
        options={{
          title: 'Agenda',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="recorrido"
        options={{
          title: 'Recorrido',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'footsteps' : 'footsteps-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
