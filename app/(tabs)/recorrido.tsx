import { StyleSheet, Text, View } from 'react-native';

export default function RecorridoScreen() {
  return (
    <View style={styles.contenedor}>
      <Text style={styles.titulo}>Mi Recorrido</Text>
      <Text style={styles.descripcion}>
        Acá se registrarán las visitas con QR, proximidad GPS o carga manual, con
        fotos y notas.
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