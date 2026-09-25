import { StyleSheet, Text, View } from 'react-native';

export default function MapaScreen() {
  return (
    <View style={styles.contenedor}>
      <Text style={styles.titulo}>Mapa</Text>
      <Text style={styles.descripcion}>
        Acá se mostrará el mapa con la ubicación del usuario y los lugares cercanos.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    padding: 24,
    gap: 12,
    backgroundColor: '#ffffff',
  },
  titulo: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111111',
  },
  descripcion: {
    fontSize: 15,
    color: '#444444',
  },
});