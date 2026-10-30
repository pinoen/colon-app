import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { paleta } from '@/constantes/colores';
import type { RecordatorioEvento } from '@/servicios/eventos';
import {
  useEventos,
  useGuardarEvento,
  useQuitarRecordatorioEvento,
  useRecordatoriosEventos,
} from '@/hooks/useEventos';
import { useLugares } from '@/hooks/useLugares';
import type { EstadoEvento, Evento } from '@/tipos/evento';
import {
  agruparEventosPorDia,
  fechaYaPaso,
  formatearDuracionEvento,
  formatearPrecioEvento,
  formatearRangoHorarioEvento,
} from '@/utilidades/formato';

const ESTILOS_ESTADO: Record<
  EstadoEvento,
  { etiqueta: string; contenedor: string; texto: string; barra: string }
> = {
  programado: {
    etiqueta: 'Programado',
    contenedor: 'bg-primario/10 dark:bg-primario/20',
    texto: 'text-primario dark:text-primario-claro',
    barra: 'bg-primario dark:bg-primario-claro',
  },
  suspendido: {
    etiqueta: 'Suspendido',
    contenedor: 'bg-acento/25',
    texto: 'text-[#7A4F00] dark:text-acento',
    barra: 'bg-acento',
  },
  cancelado: {
    etiqueta: 'Cancelado',
    contenedor: 'bg-peligro/10 dark:bg-peligro/25',
    texto: 'text-peligro dark:text-[#FF8A80]',
    barra: 'bg-peligro',
  },
  finalizado: {
    etiqueta: 'Finalizado',
    contenedor: 'bg-borde/40 dark:bg-borde-oscuro/40',
    texto: 'text-texto-secundario dark:text-texto-secundario-oscuro',
    barra: 'bg-texto-secundario dark:bg-texto-secundario-oscuro',
  },
};

function mensajeBloqueo(evento: Evento): string {
  if (evento.estado === 'cancelado') {
    return 'Este evento fue cancelado: no admite recordatorios.';
  }
  if (evento.estado === 'suspendido') {
    return 'Este evento está suspendido: no admite recordatorios.';
  }
  if (evento.estado === 'finalizado') {
    return 'Este evento ya finalizó.';
  }
  return 'La fecha de este evento ya pasó.';
}

export default function AgendaScreen() {
  const eventosQuery = useEventos();
  const recordatoriosQuery = useRecordatoriosEventos();
  const lugaresQuery = useLugares();
  const guardarEvento = useGuardarEvento();
  const quitarRecordatorio = useQuitarRecordatorioEvento();

  const eventos = eventosQuery.data ?? [];
  const recordatorios = recordatoriosQuery.data ?? {};
  const lugaresPorId = useMemo(
    () =>
      new Map(
        (lugaresQuery.data ?? []).map((lugar) => [lugar.id, lugar.nombre]),
      ),
    [lugaresQuery.data],
  );

  const secciones = useMemo(
    () =>
      agruparEventosPorDia(eventos).map((grupo) => ({
        title: grupo.etiqueta,
        data: grupo.eventos,
      })),
    [eventos],
  );

  const guardar = (evento: Evento) => {
    guardarEvento.mutate(evento, {
      onSuccess: (recordatorio) => {
        if (recordatorio.notificacionId === null) {
          Alert.alert(
            'Evento guardado',
            'Guardamos el evento, pero no pudimos programar el recordatorio. Revisá los permisos de notificaciones del dispositivo.',
          );
          return;
        }
        Alert.alert(
          'Recordatorio agendado',
          `Te vamos a avisar antes del inicio de "${evento.titulo}".`,
        );
      },
      onError: (error) => {
        Alert.alert('No se pudo guardar el evento', error.message);
      },
    });
  };

  const quitar = (evento: Evento) => {
    quitarRecordatorio.mutate(evento.id, {
      onSuccess: () => {
        Alert.alert(
          'Recordatorio eliminado',
          `Ya no vas a recibir un aviso para "${evento.titulo}".`,
        );
      },
      onError: (error) => {
        Alert.alert('No se pudo quitar el recordatorio', error.message);
      },
    });
  };

  return (
    <SafeAreaView
      edges={['top']}
      className="flex-1 bg-fondo dark:bg-fondo-oscuro"
    >
      <View className="gap-1 px-4 pb-2 pt-2">
        <Text className="text-2xl font-bold text-texto dark:text-texto-oscuro">
          Agenda
        </Text>
        <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
          Eventos ordenados por día. Guardá uno para recibir un recordatorio
          local en tu teléfono.
        </Text>
      </View>

      {eventosQuery.isPending ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator size="large" color={paleta.primario} />
          <Text className="text-texto-secundario dark:text-texto-secundario-oscuro">
            Cargando la agenda...
          </Text>
        </View>
      ) : eventosQuery.isError ? (
        <View className="flex-1 items-center justify-center gap-4 p-6">
          <Text className="text-center text-base text-texto dark:text-texto-oscuro">
            No se pudo cargar la agenda. Verificá tu conexión e intentá de
            nuevo.
          </Text>
          <Pressable
            onPress={() => eventosQuery.refetch()}
            accessibilityRole="button"
            className="rounded-xl bg-primario px-6 py-3"
          >
            <Text className="text-base font-semibold text-blanco">
              Reintentar
            </Text>
          </Pressable>
        </View>
      ) : eventos.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 p-6">
          <Text className="text-center text-lg font-semibold text-texto dark:text-texto-oscuro">
            No hay eventos en la agenda
          </Text>
          <Text className="text-center text-base text-texto-secundario dark:text-texto-secundario-oscuro">
            Volvé a consultar más tarde para ver las próximas actividades.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={secciones}
          keyExtractor={(evento) => evento.id}
          renderSectionHeader={({ section }) => (
            <View className="bg-fondo px-4 pb-2 pt-4 dark:bg-fondo-oscuro">
              <Text className="text-base font-bold text-texto dark:text-texto-oscuro">
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View className="px-4 pb-3">
              <TarjetaEvento
                evento={item}
                nombreLugar={
                  item.lugarId === null
                    ? undefined
                    : lugaresPorId.get(item.lugarId)
                }
                recordatorio={recordatorios[item.id]}
                guardando={
                  guardarEvento.isPending &&
                  guardarEvento.variables?.id === item.id
                }
                quitando={
                  quitarRecordatorio.isPending &&
                  quitarRecordatorio.variables === item.id
                }
                onGuardar={() => guardar(item)}
                onQuitar={() => quitar(item)}
              />
            </View>
          )}
          contentContainerClassName="pb-10"
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

function TarjetaEvento({
  evento,
  nombreLugar,
  recordatorio,
  guardando,
  quitando,
  onGuardar,
  onQuitar,
}: {
  evento: Evento;
  nombreLugar: string | undefined;
  recordatorio: RecordatorioEvento | undefined;
  guardando: boolean;
  quitando: boolean;
  onGuardar: () => void;
  onQuitar: () => void;
}) {
  const estilo = ESTILOS_ESTADO[evento.estado];
  const bloqueado = evento.estado !== 'programado' || fechaYaPaso(evento.inicio);
  const ubicacion =
    evento.direccionLibre ??
    nombreLugar ??
    (evento.lugarId === null ? 'A confirmar' : 'Lugar no disponible');
  const duracion = formatearDuracionEvento(evento.inicio, evento.fin);
  const precio = formatearPrecioEvento(evento.precio);
  const tieneRecordatorio = recordatorio?.notificacionId != null;

  return (
    <View className="flex-row overflow-hidden rounded-2xl bg-superficie dark:bg-superficie-oscura">
      <View className={`w-1.5 ${estilo.barra}`} />
      <View className="flex-1 gap-3 p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className={`rounded-full px-3 py-1 ${estilo.contenedor}`}>
            <Text className={`text-xs font-semibold ${estilo.texto}`}>
              {estilo.etiqueta}
            </Text>
          </View>
          <Text className="text-sm font-semibold text-texto dark:text-texto-oscuro">
            {precio}
          </Text>
        </View>

        <Text className="text-lg font-bold text-texto dark:text-texto-oscuro">
          {evento.titulo}
        </Text>

        <Text
          numberOfLines={3}
          className="text-sm leading-5 text-texto-secundario dark:text-texto-secundario-oscuro"
        >
          {evento.descripcion}
        </Text>

        <View className="gap-1.5 rounded-xl bg-fondo/70 p-3 dark:bg-fondo-oscuro/40">
          <FilaEvento
            etiqueta="Horario"
            valor={formatearRangoHorarioEvento(evento.inicio, evento.fin)}
          />
          <FilaEvento
            etiqueta="Duración"
            valor={duracion ?? 'No informada'}
          />
          <FilaEvento etiqueta="Ubicación" valor={ubicacion} />
          <FilaEvento etiqueta="Entrada" valor={precio} />
        </View>

        {tieneRecordatorio ? (
          <View className="gap-2 rounded-xl bg-primario/10 p-3 dark:bg-primario/20">
            <Text className="text-sm font-semibold text-primario dark:text-primario-claro">
              Recordatorio agendado
            </Text>
            <Text className="text-xs text-texto-secundario dark:text-texto-secundario-oscuro">
              Te avisaremos antes del inicio del evento.
            </Text>
            <Pressable
              onPress={onQuitar}
              disabled={quitando}
              accessibilityRole="button"
              accessibilityLabel={`Quitar el recordatorio de ${evento.titulo}`}
              accessibilityState={{ disabled: quitando }}
              className={`items-center rounded-xl border border-peligro px-4 py-2 dark:border-[#FF8A80] ${
                quitando ? 'opacity-60' : ''
              }`}
            >
              <Text className="text-sm font-semibold text-peligro dark:text-[#FF8A80]">
                {quitando ? 'Quitando...' : 'Quitar recordatorio'}
              </Text>
            </Pressable>
          </View>
        ) : recordatorio !== undefined ? (
          <View className="gap-2 rounded-xl bg-acento/15 p-3">
            <Text className="text-sm font-semibold text-[#7A4F00] dark:text-acento">
              Evento guardado sin recordatorio
            </Text>
            <Text className="text-xs text-texto-secundario dark:text-texto-secundario-oscuro">
              Revisá los permisos de notificaciones del dispositivo para
              recibir el aviso.
            </Text>
            {bloqueado ? null : (
              <Pressable
                onPress={onGuardar}
                disabled={guardando}
                accessibilityRole="button"
                accessibilityLabel={`Reintentar el recordatorio de ${evento.titulo}`}
                accessibilityState={{ disabled: guardando }}
                className={`items-center rounded-xl bg-primario px-4 py-2 ${
                  guardando ? 'opacity-60' : ''
                }`}
              >
                <Text className="text-sm font-semibold text-blanco">
                  {guardando ? 'Guardando...' : 'Reintentar recordatorio'}
                </Text>
              </Pressable>
            )}
          </View>
        ) : bloqueado ? (
          <Text className="text-sm text-texto-secundario dark:text-texto-secundario-oscuro">
            {mensajeBloqueo(evento)}
          </Text>
        ) : (
          <Pressable
            onPress={onGuardar}
            disabled={guardando}
            accessibilityRole="button"
            accessibilityLabel={`Guardar evento ${evento.titulo} con recordatorio`}
            accessibilityState={{ disabled: guardando }}
            className={`items-center rounded-xl bg-primario px-4 py-3 ${
              guardando ? 'opacity-60' : ''
            }`}
          >
            <Text className="text-base font-semibold text-blanco">
              {guardando ? 'Guardando...' : 'Guardar evento'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function FilaEvento({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <Text className="w-20 text-xs font-semibold uppercase text-texto-secundario dark:text-texto-secundario-oscuro">
        {etiqueta}
      </Text>
      <Text className="flex-1 text-sm text-texto dark:text-texto-oscuro">
        {valor}
      </Text>
    </View>
  );
}
