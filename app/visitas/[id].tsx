import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ETIQUETAS_ORIGEN,
  formatearFechaHoraVisita,
} from '@/componentes/VisitaCard';
import { paleta } from '@/constantes/colores';
import { useLugar } from '@/hooks/useLugar';
import { useActualizarVisita, useVisita } from '@/hooks/useVisitas';
import type { IdVisita } from '@/tipos/visita';

const LONGITUD_MAXIMA_NOTA = 600;

export default function DetalleVisita() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const idCrudo = Array.isArray(params.id) ? params.id[0] : params.id;
  const idValido: IdVisita | undefined =
    idCrudo !== undefined && idCrudo.startsWith('vis-')
      ? (idCrudo as IdVisita)
      : undefined;

  const { data: visita, isPending, isError, refetch } = useVisita(idValido);
  const { data: lugar } = useLugar(visita?.lugarId);

  return (
    <SafeAreaView
      edges={['top']}
      className="flex-1 bg-fondo dark:bg-fondo-oscuro"
    >
      <Stack.Screen options={{ title: 'Detalle de visita' }} />
      <View className="flex-row items-center px-4 py-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver a mis visitas"
          className="rounded-full bg-superficie px-4 py-2 dark:bg-superficie-oscura"
        >
          <Text className="text-base font-semibold text-primario dark:text-primario-claro">
            ‹ Volver
          </Text>
        </Pressable>
      </View>

      {idValido === undefined ? (
        <MensajeCentral
          titulo="Visita no encontrada"
          detalle="El identificador no es válido."
        />
      ) : isPending ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator size="large" color={paleta.primario} />
          <Text className="text-texto-secundario dark:text-texto-secundario-oscuro">
            Cargando visita...
          </Text>
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center gap-4 p-6">
          <Text className="text-center text-base text-texto dark:text-texto-oscuro">
            No pudimos leer esta visita. Verificá el dispositivo e intentá de
            nuevo.
          </Text>
          <Pressable
            onPress={() => refetch()}
            accessibilityRole="button"
            className="rounded-xl bg-primario px-6 py-3"
          >
            <Text className="text-base font-semibold text-blanco">
              Reintentar
            </Text>
          </Pressable>
        </View>
      ) : visita === undefined || visita === null ? (
        <MensajeCentral
          titulo="Visita no encontrada"
          detalle="No encontramos esa visita en este dispositivo."
        />
      ) : (
        <ContenidoVisita
          id={idValido}
          visita={visita}
          nombreLugar={lugar?.nombre ?? 'Lugar no disponible'}
        />
      )}
    </SafeAreaView>
  );
}

function ContenidoVisita({
  id,
  visita,
  nombreLugar,
}: {
  id: IdVisita;
  visita: NonNullable<ReturnType<typeof useVisita>['data']>;
  nombreLugar: string;
}) {
  const actualizacion = useActualizarVisita(id);
  const [permisoCamara, solicitarPermisoCamara] = useCameraPermissions();
  const camaraRef = useRef<CameraView>(null);

  const [nota, setNota] = useState(visita.nota ?? '');
  const [mensajeGuardado, setMensajeGuardado] = useState<string | null>(null);
  const [camaraVisible, setCamaraVisible] = useState(false);
  const [camaraLista, setCamaraLista] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);

  // Solo se recarga la nota cuando cambia la visita; guardar la foto no debe
  // pisar el texto que el usuario todavía no guardó.
  useEffect(() => {
    setNota(visita.nota ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visita.id]);

  const notaLimpia = nota.trim();
  const notaModificada = nota !== (visita.nota ?? '');
  const hayFoto = visita.fotoUri !== null;

  const guardarFoto = (fotoUri: string | null) => {
    actualizacion.mutate(
      { fotoUri },
      {
        onSuccess: () => {
          setMensajeGuardado(
            fotoUri === null
              ? 'Foto quitada de la visita.'
              : 'Foto guardada en este dispositivo.',
          );
        },
        onError: (error) => {
          Alert.alert('No se pudo guardar la foto', error.message);
        },
      },
    );
  };

  const guardarNota = () => {
    actualizacion.mutate(
      { nota: notaLimpia.length === 0 ? null : notaLimpia },
      {
        onSuccess: (guardada) => {
          setNota(guardada.nota ?? '');
          setMensajeGuardado('Nota guardada.');
        },
        onError: (error) => {
          Alert.alert('No se pudo guardar la nota', error.message);
        },
      },
    );
  };

  const abrirCamara = async () => {
    setErrorCamara(null);
    setCamaraLista(false);

    if (permisoCamara?.granted === true) {
      setCamaraVisible(true);
      return;
    }

    try {
      const permiso = await solicitarPermisoCamara();
      if (permiso.granted) {
        setCamaraVisible(true);
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
        'Sin acceso a la cámara no podemos tomar la foto. También podés elegir una imagen de la galería.',
        botones,
      );
    } catch {
      Alert.alert(
        'Permiso de cámara',
        'No pudimos solicitar el permiso de cámara. Podés elegir una foto de la galería.',
      );
    }
  };

  const cerrarCamara = () => {
    setCamaraVisible(false);
    setCamaraLista(false);
    setCapturando(false);
    setErrorCamara(null);
  };

  const tomarFoto = async () => {
    if (camaraRef.current === null || capturando || !camaraLista) {
      return;
    }

    setCapturando(true);
    setErrorCamara(null);

    try {
      const foto = await camaraRef.current.takePictureAsync({ quality: 0.7 });
      setCamaraVisible(false);
      setCamaraLista(false);
      guardarFoto(foto.uri);
    } catch {
      setErrorCamara(
        'No pudimos capturar la foto. Probá de nuevo o elegí una de la galería.',
      );
    } finally {
      setCapturando(false);
    }
  };

  const elegirDeGaleria = async () => {
    try {
      const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permiso.granted) {
        Alert.alert(
          'Permiso de galería',
          'Sin acceso a tus fotos no podemos elegir una imagen. Podés tomar la foto con la cámara.',
        );
        return;
      }

      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });

      if (resultado.canceled) {
        return;
      }

      const uri = resultado.assets[0]?.uri;
      if (uri === undefined) {
        Alert.alert(
          'Foto no disponible',
          'No pudimos leer la imagen elegida. Probá con otra.',
        );
        return;
      }

      guardarFoto(uri);
    } catch {
      Alert.alert(
        'Galería no disponible',
        'No pudimos abrir la galería. Probá de nuevo o tomá la foto con la cámara.',
      );
    }
  };

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 p-4 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-1">
          <Text className="text-2xl font-bold text-texto dark:text-texto-oscuro">
            Detalle de visita
          </Text>
          <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
            {nombreLugar}
          </Text>
        </View>

        <Seccion titulo="Foto">
          {hayFoto ? (
            <Image
              source={{ uri: visita.fotoUri as string }}
              resizeMode="cover"
              className="h-64 w-full rounded-2xl"
            />
          ) : (
            <View className="h-48 w-full items-center justify-center rounded-2xl bg-borde/40 dark:bg-borde-oscuro/40">
              <Text className="text-base font-semibold text-texto dark:text-texto-oscuro">
                Sin foto todavía
              </Text>
              <Text className="mt-1 text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
                Tomá una foto del lugar o elegí una de tu galería.
              </Text>
            </View>
          )}

          <View className="flex-row flex-wrap gap-3">
            <BotonSecundario
              texto={hayFoto ? 'Reemplazar con cámara' : 'Tomar foto'}
              onPress={() => {
                void abrirCamara();
              }}
              deshabilitado={actualizacion.isPending}
            />
            <BotonSecundario
              texto="Elegir de galería"
              onPress={() => {
                void elegirDeGaleria();
              }}
              deshabilitado={actualizacion.isPending}
            />
            {hayFoto ? (
              <BotonSecundario
                texto="Quitar foto"
                onPress={() => guardarFoto(null)}
                deshabilitado={actualizacion.isPending}
                peligro
              />
            ) : null}
          </View>

          {actualizacion.isPending ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color={paleta.primario} />
              <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
                Guardando cambios...
              </Text>
            </View>
          ) : (
            <Text className="text-xs text-texto-secundario dark:text-texto-secundario-oscuro">
              La foto se guarda como archivo local y se subirá cuando la visita
              se sincronice.
            </Text>
          )}
        </Seccion>

        <Seccion titulo="Nota">
          <TextInput
            value={nota}
            onChangeText={(texto) => {
              setNota(texto);
              setMensajeGuardado(null);
            }}
            placeholder="¿Qué te pareció este lugar?"
            placeholderTextColor={paleta['texto-secundario']}
            multiline
            maxLength={LONGITUD_MAXIMA_NOTA}
            textAlignVertical="top"
            accessibilityLabel="Nota de la visita"
            className="min-h-32 rounded-xl border border-borde bg-superficie p-4 text-base text-texto dark:border-borde-oscuro dark:bg-superficie-oscura dark:text-texto-oscuro"
          />
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-xs text-texto-secundario dark:text-texto-secundario-oscuro">
              {nota.length}/{LONGITUD_MAXIMA_NOTA}
            </Text>
            {mensajeGuardado !== null ? (
              <Text className="flex-1 text-right text-xs font-semibold text-exito">
                {mensajeGuardado}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={guardarNota}
            disabled={!notaModificada || actualizacion.isPending}
            accessibilityRole="button"
            accessibilityLabel="Guardar nota de la visita"
            className={`rounded-xl bg-primario px-6 py-3 ${
              !notaModificada || actualizacion.isPending ? 'opacity-50' : ''
            }`}
          >
            <Text className="text-center text-base font-semibold text-blanco">
              {actualizacion.isPending ? 'Guardando...' : 'Guardar nota'}
            </Text>
          </Pressable>
        </Seccion>

        <Seccion titulo="Datos de la visita">
          <View className="gap-3 rounded-xl bg-superficie p-4 dark:bg-superficie-oscura">
            <FilaDato etiqueta="Lugar" valor={nombreLugar} />
            <FilaDato
              etiqueta="Fecha y hora"
              valor={formatearFechaHoraVisita(visita.fechaHora)}
            />
            <FilaDato
              etiqueta="Origen"
              valor={ETIQUETAS_ORIGEN[visita.origen]}
            />
            <FilaDato
              etiqueta="Estado"
              valor={
                visita.sincronizada
                  ? 'Sincronizada'
                  : 'Guardada en el dispositivo · pendiente de sincronizar'
              }
            />
          </View>
        </Seccion>
      </ScrollView>

      <Modal
        visible={camaraVisible}
        animationType="slide"
        onRequestClose={cerrarCamara}
        statusBarTranslucent
      >
        <View className="flex-1 bg-black">
          {permisoCamara?.granted === true ? (
            <CameraView
              ref={camaraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              onCameraReady={() => setCamaraLista(true)}
              onMountError={() =>
                setErrorCamara(
                  'No pudimos iniciar la cámara. Podés elegir una foto de la galería.',
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
                  Tomar foto
                </Text>
                <Text className="text-sm text-white/80">
                  Encuadrá el lugar y tocá el botón para capturar.
                </Text>
              </View>
              <Pressable
                onPress={cerrarCamara}
                accessibilityRole="button"
                accessibilityLabel="Cerrar la cámara"
                className="h-11 w-11 items-center justify-center rounded-full bg-black/50"
              >
                <Text className="text-xl font-semibold text-white">✕</Text>
              </Pressable>
            </View>

            <View className="items-center gap-4">
              {errorCamara !== null ? (
                <Text className="text-center text-sm text-white">
                  {errorCamara}
                </Text>
              ) : null}
              <Pressable
                onPress={() => {
                  void tomarFoto();
                }}
                disabled={!camaraLista || capturando}
                accessibilityRole="button"
                accessibilityLabel="Capturar foto"
                className={`h-20 w-20 items-center justify-center rounded-full border-4 border-white ${
                  !camaraLista || capturando ? 'opacity-50' : ''
                }`}
              >
                {capturando ? (
                  <ActivityIndicator size="large" color={paleta.blanco} />
                ) : (
                  <View className="h-14 w-14 rounded-full bg-white" />
                )}
              </Pressable>
              <Text className="text-center text-sm text-white/80">
                {camaraLista
                  ? 'La foto se guarda en el dispositivo.'
                  : 'Preparando la cámara...'}
              </Text>
            </View>

            <Pressable
              onPress={() => {
                cerrarCamara();
                void elegirDeGaleria();
              }}
              accessibilityRole="button"
              className="rounded-xl bg-white/15 px-5 py-3"
            >
              <Text className="text-center text-sm font-semibold text-white">
                Elegir de galería
              </Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-3">
      <Text className="text-xl font-bold text-texto dark:text-texto-oscuro">
        {titulo}
      </Text>
      {children}
    </View>
  );
}

function BotonSecundario({
  texto,
  onPress,
  deshabilitado = false,
  peligro = false,
}: {
  texto: string;
  onPress: () => void;
  deshabilitado?: boolean;
  peligro?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityLabel={texto}
      className={`rounded-xl px-4 py-3 ${
        peligro
          ? 'bg-peligro/10 dark:bg-peligro/20'
          : 'bg-superficie dark:bg-superficie-oscura'
      } ${deshabilitado ? 'opacity-50' : ''}`}
    >
      <Text
        className={`text-sm font-semibold ${
          peligro
            ? 'text-peligro'
            : 'text-primario dark:text-primario-claro'
        }`}
      >
        {texto}
      </Text>
    </Pressable>
  );
}

function FilaDato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <Text className="w-32 text-sm font-semibold text-texto-secundario dark:text-texto-secundario-oscuro">
        {etiqueta}
      </Text>
      <Text className="flex-1 text-base text-texto dark:text-texto-oscuro">
        {valor}
      </Text>
    </View>
  );
}

function MensajeCentral({
  titulo,
  detalle,
}: {
  titulo: string;
  detalle: string;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-2 p-6">
      <Text className="text-center text-lg font-semibold text-texto dark:text-texto-oscuro">
        {titulo}
      </Text>
      <Text className="text-center text-base text-texto-secundario dark:text-texto-secundario-oscuro">
        {detalle}
      </Text>
    </View>
  );
}
