import type { BarcodeScanningResult } from 'expo-camera';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { paleta } from '@/constantes/colores';
import { useLugares } from '@/hooks/useLugares';
import type { EntradaRegistroVisita } from '@/hooks/useVisitas';
import { useRegistrarVisita, useVisitas } from '@/hooks/useVisitas';
import { RADIO_PROXIMIDAD_METROS } from '@/servicios/visitas';
import type { IdLugar } from '@/tipos/lugar';
import type { OrigenVisita, Visita } from '@/tipos/visita';

const ETIQUETAS_ORIGEN: Record<OrigenVisita, string> = {
  qr: 'Código QR',
  gps: 'Proximidad GPS',
  manual: 'Carga manual',
};

function formatearFechaHora(fechaHora: string): string {
  const fecha = new Date(fechaHora);
  if (Number.isNaN(fecha.getTime())) {
    return fechaHora;
  }
  return fecha.toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RecorridoScreen() {
  const visitasQuery = useVisitas();
  const lugaresQuery = useLugares();
  const registro = useRegistrarVisita();
  const [permisoCamara, solicitarPermisoCamara] = useCameraPermissions();

  const [escanerVisible, setEscanerVisible] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const escaneandoRef = useRef(false);

  const lugares = lugaresQuery.data ?? [];
  const lugaresPorId = useMemo(
    () => new Map(lugares.map((lugar) => [lugar.id, lugar])),
    [lugares],
  );

  const registrarEntrada = (
    entrada: EntradaRegistroVisita,
    tituloError: string,
  ) => {
    registro.mutate(entrada, {
      onSuccess: (visita) => {
        const lugar = lugaresPorId.get(visita.lugarId);
        setEscanerVisible(false);
        setSelectorVisible(false);
        setErrorCamara(null);
        escaneandoRef.current = false;
        Alert.alert(
          'Visita registrada',
          `Guardamos tu visita a ${lugar?.nombre ?? 'este lugar'}. Quedó en el dispositivo y se sincronizará cuando haya conexión.`,
        );
      },
      onError: (error) => {
        setEscanerVisible(false);
        setSelectorVisible(false);
        setErrorCamara(null);
        escaneandoRef.current = false;
        Alert.alert(tituloError, error.message);
      },
    });
  };

  const cerrarEscaner = () => {
    setEscanerVisible(false);
    setErrorCamara(null);
    escaneandoRef.current = false;
  };

  const abrirEscaner = async () => {
    escaneandoRef.current = false;
    setErrorCamara(null);

    if (permisoCamara?.granted === true) {
      setEscanerVisible(true);
      return;
    }

    try {
      const permiso = await solicitarPermisoCamara();
      if (permiso.granted) {
        setEscanerVisible(true);
        return;
      }

      const botones =
        permiso.canAskAgain === false
          ? [
              { text: 'Cerrar', style: 'cancel' as const },
              {
                text: 'Abrir ajustes',
                onPress: () => {
                  void Linking.openSettings().catch(() => undefined);
                },
              },
            ]
          : [{ text: 'Entendido' }];

      Alert.alert(
        'Permiso de cámara',
        'Sin acceso a la cámara no podemos escanear el QR. También podés registrar la visita con la carga manual.',
        botones,
      );
    } catch {
      Alert.alert(
        'Permiso de cámara',
        'No pudimos solicitar el permiso de cámara. Podés registrar la visita de forma manual.',
      );
    }
  };

  const manejarCodigoEscaneado = (resultado: BarcodeScanningResult) => {
    if (escaneandoRef.current) {
      return;
    }
    escaneandoRef.current = true;
    registrarEntrada(
      { origen: 'qr', codigoQr: resultado.data },
      'Código QR no válido',
    );
  };

  const registrarPorProximidad = () => {
    registrarEntrada(
      { origen: 'gps', radioMetros: RADIO_PROXIMIDAD_METROS },
      'No se pudo registrar por ubicación',
    );
  };

  const elegirLugar = (lugarId: IdLugar) => {
    registrarEntrada({ origen: 'manual', lugarId }, 'No se pudo registrar');
  };

  const registrandoPorGps =
    registro.isPending && registro.variables?.origen === 'gps';

  return (
    <SafeAreaView
      edges={['top']}
      className="flex-1 bg-fondo dark:bg-fondo-oscuro"
    >
      <ScrollView
        contentContainerClassName="gap-6 p-4 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-1">
          <Text className="text-2xl font-bold text-texto dark:text-texto-oscuro">
            Mi Recorrido
          </Text>
          <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
            Registrá los lugares que visitás. Cada visita se guarda en el
            dispositivo para que no la pierdas si te quedás sin señal.
          </Text>
        </View>

        <View className="gap-3">
          <Text className="text-xl font-bold text-texto dark:text-texto-oscuro">
            Registrar una visita
          </Text>

          <MetodoRegistro
            icono="▣"
            titulo="Escanear código QR"
            descripcion="Leé el código oficial del lugar con la cámara."
            accion="Abrir cámara"
            onPress={() => {
              void abrirEscaner();
            }}
          />

          <MetodoRegistro
            icono="✎"
            titulo="Carga manual"
            descripcion="Elegí el lugar desde la lista de la guía."
            accion="Elegir lugar"
            onPress={() => setSelectorVisible(true)}
          />

          <MetodoRegistro
            icono="◎"
            titulo="Proximidad GPS"
            descripcion={`Registra el lugar más cercano si estás a menos de ${RADIO_PROXIMIDAD_METROS} m.`}
            accion="Usar mi ubicación"
            cargando={registrandoPorGps}
            deshabilitado={registrandoPorGps}
            onPress={registrarPorProximidad}
          />
        </View>

        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-bold text-texto dark:text-texto-oscuro">
              Mis visitas
            </Text>
            {visitasQuery.data !== undefined &&
            visitasQuery.data.length > 0 ? (
              <Text className="text-sm font-medium text-texto-secundario dark:text-texto-secundario-oscuro">
                {visitasQuery.data.length}
              </Text>
            ) : null}
          </View>

          {visitasQuery.isPending ? (
            <View className="flex-row items-center justify-center gap-3 rounded-2xl bg-superficie py-8 dark:bg-superficie-oscura">
              <ActivityIndicator size="small" color={paleta.primario} />
              <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
                Cargando tus visitas...
              </Text>
            </View>
          ) : visitasQuery.isError ? (
            <View className="items-center gap-3 rounded-2xl bg-superficie p-5 dark:bg-superficie-oscura">
              <Text className="text-center text-sm text-texto dark:text-texto-oscuro">
                No pudimos leer las visitas guardadas en este dispositivo.
              </Text>
              <Pressable
                onPress={() => visitasQuery.refetch()}
                accessibilityRole="button"
                className="rounded-xl bg-primario px-5 py-2"
              >
                <Text className="text-sm font-semibold text-blanco">
                  Reintentar
                </Text>
              </Pressable>
            </View>
          ) : visitasQuery.data.length === 0 ? (
            <View className="items-center gap-1 rounded-2xl bg-superficie p-6 dark:bg-superficie-oscura">
              <Text className="text-center text-base font-semibold text-texto dark:text-texto-oscuro">
                Todavía no registraste visitas
              </Text>
              <Text className="text-center text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
                Escaneá un QR, elegí un lugar o usá tu ubicación para empezar
                tu recorrido.
              </Text>
            </View>
          ) : (
            visitasQuery.data.map((visita) => (
              <TarjetaVisita
                key={visita.id}
                visita={visita}
                nombreLugar={
                  lugaresPorId.get(visita.lugarId)?.nombre ??
                  'Lugar no disponible'
                }
              />
            ))
          )}
        </View>
      </ScrollView>

      <Modal
        visible={escanerVisible}
        animationType="slide"
        onRequestClose={cerrarEscaner}
        statusBarTranslucent
      >
        <View className="flex-1 bg-black">
          {permisoCamara?.granted === true ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={manejarCodigoEscaneado}
              onMountError={() =>
                setErrorCamara(
                  'No pudimos iniciar la cámara. Podés registrar la visita de forma manual.',
                )
              }
            />
          ) : null}

          <SafeAreaView
            edges={['top', 'bottom']}
            className="flex-1 justify-between p-6"
          >
            <View className="flex-row items-start justify-between gap-4">
              <View className="flex-1 gap-1">
                <Text className="text-xl font-bold text-white">
                  Escanear código QR
                </Text>
                <Text className="text-sm text-white/80">
                  Apuntá al código oficial del lugar.
                </Text>
              </View>
              <Pressable
                onPress={cerrarEscaner}
                accessibilityRole="button"
                accessibilityLabel="Cerrar el escáner"
                className="h-11 w-11 items-center justify-center rounded-full bg-black/50"
              >
                <Text className="text-xl font-semibold text-white">✕</Text>
              </Pressable>
            </View>

            <View className="items-center gap-4">
              <View className="h-64 w-64 rounded-3xl border-4 border-white/80" />
              {errorCamara !== null ? (
                <Text className="text-center text-sm text-white">
                  {errorCamara}
                </Text>
              ) : (
                <View className="flex-row items-center gap-2">
                  {registro.isPending ? (
                    <ActivityIndicator size="small" color={paleta.blanco} />
                  ) : null}
                  <Text className="text-center text-sm text-white/80">
                    {registro.isPending
                      ? 'Validando el código...'
                      : 'La lectura es automática. Los QRs ajenos se ignoran.'}
                  </Text>
                </View>
              )}
            </View>

            <Pressable
              onPress={() => {
                cerrarEscaner();
                setSelectorVisible(true);
              }}
              accessibilityRole="button"
              className="rounded-xl bg-white/15 px-5 py-3"
            >
              <Text className="text-center text-sm font-semibold text-white">
                Registrar de forma manual
              </Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={selectorVisible}
        animationType="slide"
        onRequestClose={() => setSelectorVisible(false)}
      >
        <SafeAreaView className="flex-1 bg-fondo dark:bg-fondo-oscuro">
          <View className="flex-row items-center justify-between gap-4 p-4">
            <View className="flex-1 gap-1">
              <Text className="text-xl font-bold text-texto dark:text-texto-oscuro">
                Elegir lugar
              </Text>
              <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
                La visita se registrará con origen manual.
              </Text>
            </View>
            <Pressable
              onPress={() => setSelectorVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar la lista de lugares"
              className="h-11 w-11 items-center justify-center rounded-full bg-superficie dark:bg-superficie-oscura"
            >
              <Text className="text-xl font-semibold text-texto dark:text-texto-oscuro">
                ✕
              </Text>
            </Pressable>
          </View>

          {lugaresQuery.isPending ? (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator size="large" color={paleta.primario} />
              <Text className="text-texto-secundario dark:text-texto-secundario-oscuro">
                Cargando lugares...
              </Text>
            </View>
          ) : lugaresQuery.isError ? (
            <View className="flex-1 items-center justify-center gap-4 p-6">
              <Text className="text-center text-base text-texto dark:text-texto-oscuro">
                No pudimos cargar la lista de lugares. Verificá tu conexión.
              </Text>
              <Pressable
                onPress={() => lugaresQuery.refetch()}
                accessibilityRole="button"
                className="rounded-xl bg-primario px-6 py-3"
              >
                <Text className="text-base font-semibold text-blanco">
                  Reintentar
                </Text>
              </Pressable>
            </View>
          ) : lugares.length === 0 ? (
            <View className="flex-1 items-center justify-center p-6">
              <Text className="text-center text-base text-texto-secundario dark:text-texto-secundario-oscuro">
                No hay lugares disponibles para registrar.
              </Text>
            </View>
          ) : (
            <FlatList
              data={lugares}
              keyExtractor={(lugar) => lugar.id}
              contentContainerClassName="pb-8"
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => elegirLugar(item.id)}
                  disabled={registro.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Registrar visita a ${item.nombre}`}
                  className="flex-row items-center gap-3 border-b border-borde p-4 active:opacity-70 dark:border-borde-oscuro"
                >
                  <View className="flex-1 gap-1">
                    <Text className="text-base font-semibold text-texto dark:text-texto-oscuro">
                      {item.nombre}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro"
                    >
                      {item.direccion}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold text-primario dark:text-primario-claro">
                    Registrar
                  </Text>
                </Pressable>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function MetodoRegistro({
  icono,
  titulo,
  descripcion,
  accion,
  onPress,
  cargando = false,
  deshabilitado = false,
}: {
  icono: string;
  titulo: string;
  descripcion: string;
  accion: string;
  onPress: () => void;
  cargando?: boolean;
  deshabilitado?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${accion}`}
      className={`flex-row items-center gap-4 rounded-2xl bg-superficie p-4 active:opacity-80 dark:bg-superficie-oscura ${
        deshabilitado ? 'opacity-60' : ''
      }`}
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-primario/10 dark:bg-primario/20">
        {cargando ? (
          <ActivityIndicator size="small" color={paleta.primario} />
        ) : (
          <Text className="text-xl text-primario dark:text-primario-claro">
            {icono}
          </Text>
        )}
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-semibold text-texto dark:text-texto-oscuro">
          {titulo}
        </Text>
        <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
          {descripcion}
        </Text>
      </View>
      <Text className="text-xl text-texto-secundario dark:text-texto-secundario-oscuro">
        ›
      </Text>
    </Pressable>
  );
}

function TarjetaVisita({
  visita,
  nombreLugar,
}: {
  visita: Visita;
  nombreLugar: string;
}) {
  return (
    <View className="gap-2 rounded-2xl bg-superficie p-4 dark:bg-superficie-oscura">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-texto dark:text-texto-oscuro">
          {nombreLugar}
        </Text>
        <View className="rounded-full bg-primario/10 px-3 py-1 dark:bg-primario/20">
          <Text className="text-xs font-semibold text-primario dark:text-primario-claro">
            {ETIQUETAS_ORIGEN[visita.origen]}
          </Text>
        </View>
      </View>
      <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
        {formatearFechaHora(visita.fechaHora)}
      </Text>
      <View className="flex-row items-center gap-2">
        <View
          className={`h-2 w-2 rounded-full ${
            visita.sincronizada ? 'bg-exito' : 'bg-acento'
          }`}
        />
        <Text className="flex-1 text-xs text-texto-secundario dark:text-texto-secundario-oscuro">
          {visita.sincronizada
            ? 'Sincronizada'
            : 'Guardada en el dispositivo · pendiente de sincronizar'}
        </Text>
      </View>
    </View>
  );
}
