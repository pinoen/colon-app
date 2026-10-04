import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { paleta } from '@/constantes/colores';
import { useLugar } from '@/hooks/useLugar';
import { categoriaKeys } from '@/queries/categoriaKeys';
import { listarCategorias } from '@/servicios/categorias';
import type { IdLugar, Lugar } from '@/tipos/lugar';
import { formatearHorarios, formatearPrecio } from '@/utilidades/formato';

export default function DetalleLugar() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const idCrudo = Array.isArray(params.id) ? params.id[0] : params.id;
  const idValido: IdLugar | undefined =
    idCrudo !== undefined && idCrudo.startsWith('lug-')
      ? (idCrudo as IdLugar)
      : undefined;

  const { data: lugar, isPending, isError, refetch } = useLugar(idValido);

  const categoriasQuery = useQuery({
    queryKey: categoriaKeys.listar(),
    queryFn: async () => {
      const resultado = await listarCategorias();
      if (resultado.success) {
        return resultado.data;
      }
      throw new Error(resultado.error);
    },
  });

  const categoriaNombre = categoriasQuery.data?.find(
    (categoria) => categoria.id === lugar?.categoriaId,
  )?.nombre;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-fondo dark:bg-fondo-oscuro">
      <Stack.Screen options={{ title: lugar?.nombre ?? 'Detalle' }} />
      <View className="flex-row items-center px-4 py-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="rounded-full bg-superficie px-4 py-2 dark:bg-superficie-oscura"
        >
          <Text className="text-base font-semibold text-primario dark:text-primario-claro">
            ‹ Volver
          </Text>
        </Pressable>
      </View>

      {idValido === undefined ? (
        <MensajeCentral
          titulo="Lugar no encontrado"
          detalle="El identificador no es válido."
        />
      ) : isPending ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator size="large" color={paleta.primario} />
          <Text className="text-texto-secundario dark:text-texto-secundario-oscuro">
            Cargando lugar...
          </Text>
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center gap-4 p-6">
          <Text className="text-center text-base text-texto dark:text-texto-oscuro">
            No se pudieron cargar los datos del lugar. Verificá tu conexión e
            intentá de nuevo.
          </Text>
          <Pressable
            onPress={() => refetch()}
            className="rounded-xl bg-primario px-6 py-3"
          >
            <Text className="text-base font-semibold text-blanco">Reintentar</Text>
          </Pressable>
        </View>
      ) : lugar === undefined ? (
        <MensajeCentral
          titulo="Lugar no encontrado"
          detalle="No encontramos ese lugar."
        />
      ) : (
        <ContenidoDetalle lugar={lugar} categoriaNombre={categoriaNombre} />
      )}
    </SafeAreaView>
  );
}

function ContenidoDetalle({
  lugar,
  categoriaNombre,
}: {
  lugar: Lugar;
  categoriaNombre: string | undefined;
}) {
  const telefono = lugar.telefono;
  const sitioWeb = lugar.sitioWeb;
  const abrirEnlace = (enlace: string) =>
    Linking.openURL(enlace).catch(() => undefined);

  const precio = formatearPrecio(lugar.precioEntrada);
  const horarios = formatearHorarios(lugar.horarios);
  const diaHoy = new Date().getDay();
  const qrValido = lugar.codigoQr === `COLON:${lugar.id}`;

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-6 p-4 pb-10"
      showsVerticalScrollIndicator={false}
    >
      <View className="gap-2">
        {categoriaNombre !== undefined ? (
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge texto={categoriaNombre} />
          </View>
        ) : null}
        <Text className="text-2xl font-bold text-texto dark:text-texto-oscuro">
          {lugar.nombre}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge texto={precio ?? 'Sin datos de entrada'} />
          {lugar.accesible ? <Badge texto="Accesible" /> : null}
        </View>
      </View>

      {lugar.imagenes.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-grow-0"
        >
          <View className="flex-row gap-3">
            {lugar.imagenes.map((uri) => (
              <ImagenDetalle key={uri} uri={uri} />
            ))}
          </View>
        </ScrollView>
      ) : (
        <ImagenDetalle uri="" />
      )}

      <Seccion titulo="Descripción">
        <Text className="text-base leading-6 text-texto dark:text-texto-oscuro">
          {lugar.descripcion}
        </Text>
      </Seccion>

      <Seccion titulo="Horarios">
        {horarios.length === 0 ? (
          <Text className="text-base text-texto-secundario dark:text-texto-secundario-oscuro">
            Sin horarios definidos.
          </Text>
        ) : (
          <View className="gap-2">
            {horarios.map((horario) => (
              <View
                key={horario.dia}
                className="flex-row items-center justify-between rounded-xl bg-superficie px-4 py-3 dark:bg-superficie-oscura"
              >
                <Text className="flex-1 text-base text-texto dark:text-texto-oscuro">
                  {horario.nombreDia}: {horario.rango}
                </Text>
                {horario.dia === diaHoy ? <Badge texto="Hoy" activo /> : null}
              </View>
            ))}
          </View>
        )}
      </Seccion>

      <Seccion titulo="Datos útiles">
        <View className="gap-3 rounded-xl bg-superficie p-4 dark:bg-superficie-oscura">
          <FilaDato etiqueta="Dirección" valor={lugar.direccion} />
          <FilaDato
            etiqueta="Teléfono"
            valor={telefono ?? 'Sin teléfono'}
            onPress={telefono !== null ? () => abrirEnlace(`tel:${telefono}`) : undefined}
          />
          <FilaDato
            etiqueta="Sitio web"
            valor={sitioWeb ?? 'Sin sitio web'}
            onPress={sitioWeb !== null ? () => abrirEnlace(sitioWeb) : undefined}
          />
          <FilaDato etiqueta="Entrada" valor={precio ?? 'Sin datos de entrada'} />
          <FilaDato etiqueta="Accesible" valor={lugar.accesible ? 'Sí' : 'No'} />
        </View>
      </Seccion>

      <Seccion titulo="Audioguía">
        {lugar.audioguia === null ? (
          <Text className="text-base text-texto-secundario dark:text-texto-secundario-oscuro">
            Sin audioguía disponible.
          </Text>
        ) : (
          <View className="rounded-xl bg-primario/10 p-4 dark:bg-primario/20">
            <Text className="text-base text-texto dark:text-texto-oscuro">
              Audioguía disponible en{' '}
              {lugar.audioguia.idioma === 'es'
                ? 'español'
                : lugar.audioguia.idioma === 'en'
                  ? 'inglés'
                  : 'portugués'}{' '}
              ({Math.round(lugar.audioguia.duracionSegundos / 60)} min).
            </Text>
          </View>
        )}
      </Seccion>

      <Seccion titulo="Registro de visita">
        {qrValido ? (
          <Pressable
            onPress={() =>
              Alert.alert(
                'Registrar visita',
                'El registro por QR estará disponible en una próxima versión.',
              )
            }
            className="rounded-xl bg-primario px-6 py-3"
          >
            <Text className="text-center text-base font-semibold text-blanco">
              Registrar visita
            </Text>
          </Pressable>
        ) : (
          <Text className="text-base text-texto-secundario dark:text-texto-secundario-oscuro">
            Este lugar no participa del registro por código QR.
          </Text>
        )}
      </Seccion>
    </ScrollView>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="text-xl font-bold text-texto dark:text-texto-oscuro">
        {titulo}
      </Text>
      {children}
    </View>
  );
}

function Badge({ texto, activo }: { texto: string; activo?: boolean }) {
  return (
    <View
      className={`rounded-full px-3 py-1 ${
        activo === true
          ? 'bg-primario'
          : 'bg-primario/10 dark:bg-primario/20'
      }`}
    >
      <Text
        className={`text-xs font-semibold ${
          activo === true
            ? 'text-blanco'
            : 'text-primario dark:text-primario-claro'
        }`}
      >
        {texto}
      </Text>
    </View>
  );
}

function FilaDato({
  etiqueta,
  valor,
  onPress,
}: {
  etiqueta: string;
  valor: string;
  onPress?: () => void;
}) {
  const contenido = (
    <>
      <Text className="w-32 text-sm font-semibold text-texto-secundario dark:text-texto-secundario-oscuro">
        {etiqueta}
      </Text>
      <Text className="flex-1 text-base text-texto dark:text-texto-oscuro">
        {valor}
      </Text>
    </>
  );
  if (onPress === undefined) {
    return <View className="flex-row items-start gap-2">{contenido}</View>;
  }
  return (
    <Pressable onPress={onPress} className="flex-row items-start gap-2">
      {contenido}
    </Pressable>
  );
}

function ImagenDetalle({ uri }: { uri?: string }) {
  const [cargaFallida, setCargaFallida] = useState(false);

  useEffect(() => {
    setCargaFallida(false);
  }, [uri]);

  if (uri === undefined || uri === '' || cargaFallida) {
    return (
      <View className="h-52 w-80 items-center justify-center rounded-2xl bg-borde/40 dark:bg-borde-oscuro/40">
        <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
          Sin fotos
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      onError={() => setCargaFallida(true)}
      resizeMode="cover"
      className="h-52 w-80 rounded-2xl"
    />
  );
}

function MensajeCentral({ titulo, detalle }: { titulo: string; detalle: string }) {
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