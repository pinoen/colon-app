import {
  Component,
  Fragment,
  useEffect,
  type ErrorInfo,
  type PropsWithChildren,
} from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { paleta } from '@/constantes/colores';

interface Props extends PropsWithChildren {
  /** Permite limpiar estado externo antes de volver a montar la app. */
  onReset?: () => void;
}

interface State {
  tieneError: boolean;
  version: number;
}

/**
 * Boundary global: captura errores de render/lifecycle y evita que la app se
 * cierre. El detalle técnico nunca se muestra; solo un mensaje accionable.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { tieneError: false, version: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { tieneError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (__DEV__) {
      // Solo en desarrollo: nunca mostramos stack traces ni datos internos.
      console.error('Error no controlado:', error, info.componentStack);
    }
  }

  private reintentar = (): void => {
    try {
      this.props.onReset?.();
    } catch {
      // Si el reset externo falla, igual intentamos volver a montar la app.
    }
    this.setState((estado) => ({
      tieneError: false,
      version: estado.version + 1,
    }));
  };

  render() {
    if (this.state.tieneError) {
      return <PantallaError onReintentar={this.reintentar} />;
    }

    // La `key` fuerza un remontaje limpio al reintentar.
    return (
      <Fragment key={this.state.version}>{this.props.children}</Fragment>
    );
  }
}

function PantallaError({ onReintentar }: { onReintentar: () => void }) {
  const esquema = useColorScheme();
  const oscuro = esquema === 'dark';

  const fondo = oscuro ? paleta['fondo-oscuro'] : paleta.fondo;
  const superficie = oscuro ? paleta['superficie-oscura'] : paleta.superficie;
  const texto = oscuro ? paleta['texto-oscuro'] : paleta.texto;
  const secundario = oscuro
    ? paleta['texto-secundario-oscuro']
    : paleta['texto-secundario'];
  const peligro = oscuro ? paleta['peligro-claro'] : paleta.peligro;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      'Algo salió mal. Podés intentar de nuevo.',
    );
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: fondo }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 520,
            gap: 20,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: oscuro ? paleta['borde-oscuro'] : paleta.borde,
            backgroundColor: superficie,
            padding: 24,
          }}
        >
          <View style={{ gap: 16 }}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                height: 64,
                width: 64,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 32,
                borderWidth: 2,
                borderColor: peligro,
                backgroundColor: fondo,
              }}
            >
              <Text
                style={{
                  color: peligro,
                  fontSize: 34,
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                !
              </Text>
            </View>

            <Text
              accessibilityRole="header"
              style={{
                color: texto,
                fontSize: 28,
                fontWeight: '700',
              }}
            >
              Algo salió mal
            </Text>

            <Text
              style={{
                color: secundario,
                fontSize: 17,
              }}
            >
              No pudimos mostrar esta pantalla. Tus datos guardados siguen en
              el dispositivo. Podés intentar de nuevo.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reintentar"
            accessibilityHint="Vuelve a cargar la pantalla"
            onPress={onReintentar}
            style={({ pressed }) => ({
              minHeight: 56,
              width: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 16,
              backgroundColor: paleta.primario,
              paddingHorizontal: 24,
              paddingVertical: 14,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                color: paleta.blanco,
                fontSize: 18,
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              Reintentar
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
