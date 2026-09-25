import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

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
    <View style={styles.contenedor}>
      <Text style={styles.titulo}>Guía Turística de Colón</Text>
      <Text style={styles.subtitulo}>Acceso rápido</Text>
      {ACCESOS_RAPIDOS.map((acceso) => (
        <Link key={acceso.ruta} href={acceso.ruta} style={styles.tarjeta}>
          <Text style={styles.tarjetaTitulo}>{acceso.titulo}</Text>
          <Text style={styles.tarjetaDescripcion}>{acceso.descripcion}</Text>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    padding: 24,
    gap: 16,
    backgroundColor: '#ffffff',
  },
  titulo: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111111',
  },
  subtitulo: {
    fontSize: 16,
    color: '#555555',
  },
  tarjeta: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f2f4f7',
    gap: 4,
  },
  tarjetaTitulo: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111111',
  },
  tarjetaDescripcion: {
    fontSize: 14,
    color: '#444444',
  },
});