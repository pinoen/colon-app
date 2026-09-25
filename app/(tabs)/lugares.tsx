import { StyleSheet, Text, View } from 'react-native';

export default function LugaresScreen() {
  return (
    <View style={styles.contenedor}>
      <Text style={styles.titulo}>Lugares</Text>
      <Text style={styles.descripcion}>
        Acá se listarán los lugares de interés con filtros por categoría y búsqueda
        por nombre.
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