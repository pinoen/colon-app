import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { paleta } from '@/constantes/colores';
import { useAuth } from '@/context/AuthContext';
import { useAlternarFavorito, useFavoritos } from '@/hooks/useFavoritos';
import { useLugares } from '@/hooks/useLugares';
import { categoriaKeys } from '@/queries/categoriaKeys';
import { listarCategorias } from '@/servicios/categorias';
import type { IdLugar } from '@/tipos/lugar';
import type { Preferencias } from '@/tipos/usuario';

const TEMAS: Array<{ valor: Preferencias['tema']; etiqueta: string }> = [
  { valor: 'claro', etiqueta: 'Claro' },
  { valor: 'oscuro', etiqueta: 'Oscuro' },
  { valor: 'sistema', etiqueta: 'Sistema' },
];

const RADIOS: Array<Preferencias['radioAvisoMetros']> = [100, 250, 500];

export default function PerfilScreen() {
  const router = useRouter();
  const {
    usuario,
    preferencias,
    cargando,
    requiereDesbloqueo,
    biometriaDisponible,
    biometriaHabilitada,
    iniciarSesion,
    registrarse,
    cerrarSesion,
    desbloquearConBiometria,
    activarBiometria,
    actualizarPreferencias,
  } = useAuth();

  const [modoRegistro, setModoRegistro] = useState(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const favoritosQuery = useFavoritos(usuario);
  const alternarFavorito = useAlternarFavorito(usuario);
  const lugaresQuery = useLugares();

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

  const lugaresPorId = useMemo(
    () =>
      new Map(
        (lugaresQuery.data ?? []).map((lugar) => [lugar.id, lugar] as const),
      ),
    [lugaresQuery.data],
  );

  const enviarFormulario = async () => {
    setErrorFormulario(null);
    setEnviando(true);

    const resultado = modoRegistro
      ? await registrarse(nombre, email, contrasena)
      : await iniciarSesion(email, contrasena);

    setEnviando(false);

    if (!resultado.success) {
      setErrorFormulario(resultado.error);
      return;
    }

    setNombre('');
    setEmail('');
    setContrasena('');
    Alert.alert(
      modoRegistro ? 'Cuenta creada' : 'Sesión iniciada',
      `Hola, ${resultado.data.nombre}. Ya podés guardar tus favoritos.`,
    );
  };

  const confirmarCierreSesion = () => {
    Alert.alert('Cerrar sesión', '¿Querés salir de tu cuenta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: () => {
          void cerrarSesion().then((resultado) => {
            if (!resultado.success) {
              Alert.alert('Cerrar sesión', resultado.error);
            }
          });
        },
      },
    ]);
  };

  const desbloquear = async () => {
    const resultado = await desbloquearConBiometria();
    if (!resultado.success) {
      Alert.alert('No pudimos desbloquear', resultado.error);
    }
  };

  const cambiarBiometria = async (habilitada: boolean) => {
    const resultado = await activarBiometria(habilitada);
    if (!resultado.success) {
      Alert.alert('Biometría', resultado.error);
    }
  };

  const cambiarPreferencias = async (cambios: Partial<Preferencias>) => {
    const resultado = await actualizarPreferencias(cambios);
    if (!resultado.success) {
      Alert.alert('Preferencias', resultado.error);
    }
  };

  const alternarCategoria = (categoriaId: string) => {
    const actuales = preferencias.categoriasFavoritas;
    const siguientes = actuales.includes(categoriaId)
      ? actuales.filter((id) => id !== categoriaId)
      : [...actuales, categoriaId];
    void cambiarPreferencias({ categoriasFavoritas: siguientes });
  };

  const quitarFavorito = (lugarId: IdLugar) => {
    if (usuario === null) {
      return;
    }
    alternarFavorito.mutate(lugarId, {
      onError: (error) => {
        Alert.alert('Favoritos', error.message);
      },
    });
  };

  const favoritos = favoritosQuery.data ?? [];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-fondo dark:bg-fondo-oscuro">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 p-4 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-1">
          <Text className="text-2xl font-bold text-texto dark:text-texto-oscuro">
            Perfil
          </Text>
          <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
            Tu cuenta, favoritos y preferencias de la guía.
          </Text>
        </View>

        {cargando ? (
          <View className="items-center justify-center gap-3 py-10">
            <ActivityIndicator size="large" color={paleta.primario} />
            <Text className="text-base text-texto-secundario dark:text-texto-secundario-oscuro">
              Cargando tu cuenta...
            </Text>
          </View>
        ) : (
          <>
            {usuario === null ? (
              <FormularioSesion
                modoRegistro={modoRegistro}
                nombre={nombre}
                email={email}
                contrasena={contrasena}
                error={errorFormulario}
                enviando={enviando}
                onCambiarNombre={setNombre}
                onCambiarEmail={setEmail}
                onCambiarContrasena={setContrasena}
                onEnviar={() => void enviarFormulario()}
                onAlternarModo={() => {
                  setModoRegistro((actual) => !actual);
                  setErrorFormulario(null);
                }}
              />
            ) : (
              <TarjetaCuenta
                nombre={usuario.nombre}
                email={usuario.email}
                requiereDesbloqueo={requiereDesbloqueo}
                biometriaDisponible={biometriaDisponible}
                biometriaHabilitada={biometriaHabilitada}
                onDesbloquear={() => void desbloquear()}
                onCambiarBiometria={(valor) => void cambiarBiometria(valor)}
                onCerrarSesion={confirmarCierreSesion}
              />
            )}

            {usuario !== null ? (
              <Seccion titulo="Mis favoritos">
                {favoritosQuery.isPending ? (
                  <ActivityIndicator color={paleta.primario} />
                ) : favoritosQuery.isError ? (
                  <View className="gap-3">
                    <Text className="text-base text-texto dark:text-texto-oscuro">
                      No pudimos cargar tus favoritos.
                    </Text>
                    <BotonSecundario
                      texto="Reintentar"
                      onPress={() => void favoritosQuery.refetch()}
                    />
                  </View>
                ) : favoritos.length === 0 ? (
                  <Text className="text-base text-texto-secundario dark:text-texto-secundario-oscuro">
                    Todavía no guardaste favoritos. Abrí el detalle de un lugar
                    y tocá “Guardar en favoritos”.
                  </Text>
                ) : (
                  <View className="gap-3">
                    {favoritos.map((favorito) => {
                      const lugar = lugaresPorId.get(favorito.lugarId);
                      return (
                        <View
                          key={favorito.id}
                          className="gap-3 rounded-xl bg-superficie p-4 dark:bg-superficie-oscura"
                        >
                          <View className="gap-1">
                            <Text className="text-base font-semibold text-texto dark:text-texto-oscuro">
                              {lugar?.nombre ?? 'Lugar no disponible'}
                            </Text>
                            <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
                              {lugar?.descripcionCorta ??
                                'No pudimos cargar los datos de este lugar.'}
                            </Text>
                          </View>
                          <View className="flex-row gap-2">
                            <Pressable
                              onPress={() =>
                                router.push({
                                  pathname: '/lugares/[id]',
                                  params: { id: favorito.lugarId },
                                } as never)
                              }
                              accessibilityRole="button"
                              accessibilityLabel={`Ver ${lugar?.nombre ?? 'el lugar'}`}
                              className="flex-1 rounded-xl bg-primario/10 px-4 py-3 dark:bg-primario/20"
                            >
                              <Text className="text-center text-sm font-semibold text-primario dark:text-primario-claro">
                                Ver detalle
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => quitarFavorito(favorito.lugarId)}
                              disabled={alternarFavorito.isPending}
                              accessibilityRole="button"
                              accessibilityLabel={`Quitar ${lugar?.nombre ?? 'el lugar'} de favoritos`}
                              className="flex-1 rounded-xl bg-peligro/10 px-4 py-3 dark:bg-peligro/20"
                            >
                              <Text className="text-center text-sm font-semibold text-peligro">
                                Quitar
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </Seccion>
            ) : null}

            <Seccion titulo="Preferencias">
              <View className="gap-5 rounded-xl bg-superficie p-4 dark:bg-superficie-oscura">
                <View className="gap-2">
                  <Text className="text-base font-semibold text-texto dark:text-texto-oscuro">
                    Tema de la app
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {TEMAS.map((tema) => (
                      <Chip
                        key={tema.valor}
                        texto={tema.etiqueta}
                        seleccionado={preferencias.tema === tema.valor}
                        onPress={() =>
                          void cambiarPreferencias({ tema: tema.valor })
                        }
                      />
                    ))}
                  </View>
                </View>

                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 gap-1">
                    <Text className="text-base font-semibold text-texto dark:text-texto-oscuro">
                      Avisos de proximidad
                    </Text>
                    <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
                      Recibir un aviso al acercarte a un lugar.
                    </Text>
                  </View>
                  <Switch
                    value={preferencias.avisarProximidad}
                    onValueChange={(valor) =>
                      void cambiarPreferencias({ avisarProximidad: valor })
                    }
                    trackColor={{
                      false: paleta.borde,
                      true: paleta['primario-claro'],
                    }}
                    thumbColor={paleta.blanco}
                    accessibilityLabel="Avisos de proximidad"
                  />
                </View>

                <View className="gap-2">
                  <Text className="text-base font-semibold text-texto dark:text-texto-oscuro">
                    Radio de aviso
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {RADIOS.map((radio) => (
                      <Chip
                        key={radio}
                        texto={`${radio} m`}
                        seleccionado={preferencias.radioAvisoMetros === radio}
                        onPress={() =>
                          void cambiarPreferencias({ radioAvisoMetros: radio })
                        }
                      />
                    ))}
                  </View>
                </View>

                <View className="gap-2">
                  <Text className="text-base font-semibold text-texto dark:text-texto-oscuro">
                    Categorías favoritas
                  </Text>
                  {categoriasQuery.isPending ? (
                    <ActivityIndicator color={paleta.primario} />
                  ) : categoriasQuery.isError ? (
                    <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
                      No pudimos cargar las categorías.
                    </Text>
                  ) : (
                    <View className="flex-row flex-wrap gap-2">
                      {(categoriasQuery.data ?? []).map((categoria) => (
                        <Chip
                          key={categoria.id}
                          texto={categoria.nombre}
                          seleccionado={preferencias.categoriasFavoritas.includes(
                            categoria.id,
                          )}
                          onPress={() => alternarCategoria(categoria.id)}
                        />
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </Seccion>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

interface PropsFormulario {
  modoRegistro: boolean;
  nombre: string;
  email: string;
  contrasena: string;
  error: string | null;
  enviando: boolean;
  onCambiarNombre: (valor: string) => void;
  onCambiarEmail: (valor: string) => void;
  onCambiarContrasena: (valor: string) => void;
  onEnviar: () => void;
  onAlternarModo: () => void;
}

function FormularioSesion({
  modoRegistro,
  nombre,
  email,
  contrasena,
  error,
  enviando,
  onCambiarNombre,
  onCambiarEmail,
  onCambiarContrasena,
  onEnviar,
  onAlternarModo,
}: PropsFormulario) {
  return (
    <View className="gap-4 rounded-2xl bg-superficie p-4 dark:bg-superficie-oscura">
      <View className="gap-1">
        <Text className="text-lg font-bold text-texto dark:text-texto-oscuro">
          {modoRegistro ? 'Crear cuenta' : 'Iniciar sesión'}
        </Text>
        <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
          Tu cuenta guarda favoritos y preferencias en este dispositivo.
        </Text>
      </View>

      {modoRegistro ? (
        <CampoTexto
          etiqueta="Nombre"
          valor={nombre}
          placeholder="Tu nombre"
          autoCapitalize="words"
          onChangeText={onCambiarNombre}
        />
      ) : null}

      <CampoTexto
        etiqueta="Email"
        valor={email}
        placeholder="tucorreo@ejemplo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        onChangeText={onCambiarEmail}
      />

      <CampoTexto
        etiqueta="Contraseña"
        valor={contrasena}
        placeholder="Mínimo 6 caracteres"
        secureTextEntry
        autoCapitalize="none"
        onChangeText={onCambiarContrasena}
      />

      {error !== null ? (
        <Text className="text-sm text-peligro">{error}</Text>
      ) : null}

      <Pressable
        onPress={onEnviar}
        disabled={enviando}
        accessibilityRole="button"
        accessibilityLabel={modoRegistro ? 'Crear cuenta' : 'Iniciar sesión'}
        className={`rounded-xl bg-primario px-6 py-3 ${
          enviando ? 'opacity-60' : ''
        }`}
      >
        <Text className="text-center text-base font-semibold text-blanco">
          {enviando
            ? 'Procesando...'
            : modoRegistro
              ? 'Crear cuenta'
              : 'Iniciar sesión'}
        </Text>
      </Pressable>

      <Pressable
        onPress={onAlternarModo}
        accessibilityRole="button"
        className="py-1"
      >
        <Text className="text-center text-sm font-semibold text-primario dark:text-primario-claro">
          {modoRegistro
            ? 'Ya tengo cuenta. Iniciar sesión'
            : 'No tengo cuenta. Registrarme'}
        </Text>
      </Pressable>
    </View>
  );
}

interface PropsCuenta {
  nombre: string;
  email: string;
  requiereDesbloqueo: boolean;
  biometriaDisponible: boolean;
  biometriaHabilitada: boolean;
  onDesbloquear: () => void;
  onCambiarBiometria: (valor: boolean) => void;
  onCerrarSesion: () => void;
}

function TarjetaCuenta({
  nombre,
  email,
  requiereDesbloqueo,
  biometriaDisponible,
  biometriaHabilitada,
  onDesbloquear,
  onCambiarBiometria,
  onCerrarSesion,
}: PropsCuenta) {
  const inicial = nombre.trim().charAt(0).toUpperCase() || '?';

  return (
    <View className="gap-4 rounded-2xl bg-superficie p-4 dark:bg-superficie-oscura">
      <View className="flex-row items-center gap-3">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primario">
          <Text className="text-xl font-bold text-blanco">{inicial}</Text>
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-lg font-bold text-texto dark:text-texto-oscuro">
            {nombre}
          </Text>
          <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
            {email}
          </Text>
        </View>
      </View>

      {requiereDesbloqueo ? (
        <View className="gap-3 rounded-xl bg-acento/15 p-4">
          <Text className="text-base font-semibold text-texto dark:text-texto-oscuro">
            Sesión protegida
          </Text>
          <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
            Ingresá con tu huella o rostro para desbloquear tu cuenta.
          </Text>
          <BotonSecundario texto="Desbloquear con biometría" onPress={onDesbloquear} />
        </View>
      ) : null}

      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-base font-semibold text-texto dark:text-texto-oscuro">
            Reingreso con biometría
          </Text>
          <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
            {biometriaDisponible
              ? 'Usá tu huella o rostro para volver a entrar.'
              : 'Este dispositivo no tiene biometría configurada.'}
          </Text>
        </View>
        <Switch
          value={biometriaHabilitada}
          onValueChange={onCambiarBiometria}
          disabled={!biometriaDisponible}
          trackColor={{ false: paleta.borde, true: paleta['primario-claro'] }}
          thumbColor={paleta.blanco}
          accessibilityLabel="Reingreso con biometría"
        />
      </View>

      <Pressable
        onPress={onCerrarSesion}
        accessibilityRole="button"
        accessibilityLabel="Cerrar sesión"
        className="rounded-xl border border-peligro px-6 py-3"
      >
        <Text className="text-center text-base font-semibold text-peligro">
          Cerrar sesión
        </Text>
      </Pressable>
    </View>
  );
}

interface PropsCampo {
  etiqueta: string;
  valor: string;
  placeholder: string;
  onChangeText: (valor: string) => void;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address';
  secureTextEntry?: boolean;
}

function CampoTexto({
  etiqueta,
  valor,
  placeholder,
  onChangeText,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
  secureTextEntry = false,
}: PropsCampo) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-semibold text-texto dark:text-texto-oscuro">
        {etiqueta}
      </Text>
      <TextInput
        value={valor}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={paleta['texto-secundario']}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        accessibilityLabel={etiqueta}
        className="rounded-xl border border-borde bg-fondo px-4 py-3 text-base text-texto dark:border-borde-oscuro dark:bg-fondo-oscuro dark:text-texto-oscuro"
      />
    </View>
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

function Chip({
  texto,
  seleccionado,
  onPress,
}: {
  texto: string;
  seleccionado: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: seleccionado }}
      className={`rounded-full px-4 py-2 ${
        seleccionado
          ? 'bg-primario'
          : 'bg-primario/10 dark:bg-primario/20'
      }`}
    >
      <Text
        className={`text-sm font-semibold ${
          seleccionado
            ? 'text-blanco'
            : 'text-primario dark:text-primario-claro'
        }`}
      >
        {texto}
      </Text>
    </Pressable>
  );
}

function BotonSecundario({
  texto,
  onPress,
}: {
  texto: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="rounded-xl bg-primario px-5 py-3"
    >
      <Text className="text-center text-sm font-semibold text-blanco">
        {texto}
      </Text>
    </Pressable>
  );
}
