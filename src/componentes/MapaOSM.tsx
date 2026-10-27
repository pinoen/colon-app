import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Linking } from 'react-native';
import {
  WebView,
  type WebViewMessageEvent,
} from 'react-native-webview';

import { HTML_MAPA } from '@/componentes/htmlMapa';
import {
  construirDatosMapa,
  interpretarMensajeMapa,
  type MapaOSMProps,
  type MapaOSMRef,
} from '@/componentes/mapaComun';

/**
 * Mapa OpenStreetMap + Leaflet dentro de un WebView.
 *
 * No requiere API key. Funciona en Expo Go (react-native-webview viene
 * incluido) y en builds nativos. La lógica del mapa vive en `htmlMapa.ts`;
 * este componente sólo monta el WebView y traduce los mensajes.
 */
export const MapaOSM = forwardRef<MapaOSMRef, MapaOSMProps>(function MapaOSM(
  {
    lugares,
    ubicacion,
    seleccionadoId,
    oscuro,
    onSeleccionar,
    onVistaChange,
    onError,
  },
  ref,
) {
  const webViewRef = useRef<WebView>(null);
  const [listo, setListo] = useState(false);

  const enviar = useCallback((mensaje: unknown) => {
    webViewRef.current?.postMessage(JSON.stringify(mensaje));
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      centrarEn: (coordenadas, zoom = 16) =>
        enviar({
          tipo: 'centrar',
          lat: coordenadas.latitud,
          lng: coordenadas.longitud,
          zoom,
        }),
      enfocar: (id) => enviar({ tipo: 'enfocar', id }),
      cambiarZoom: (delta) => enviar({ tipo: 'zoom', delta }),
    }),
    [enviar],
  );

  useEffect(() => {
    if (!listo) {
      return;
    }
    enviar({
      tipo: 'actualizar',
      datos: construirDatosMapa({
        lugares,
        ubicacion,
        seleccionadoId,
        oscuro,
      }),
    });
  }, [listo, lugares, ubicacion, seleccionadoId, oscuro, enviar]);

  const manejarMensaje = useCallback(
    (evento: WebViewMessageEvent) => {
      const mensaje = interpretarMensajeMapa(evento.nativeEvent.data);
      if (mensaje === undefined) {
        return;
      }
      switch (mensaje.tipo) {
        case 'listo':
          setListo(true);
          break;
        case 'seleccion':
          onSeleccionar(mensaje.id);
          break;
        case 'fondo':
          onSeleccionar(undefined);
          break;
        case 'region':
          onVistaChange({
            centro: mensaje.centro,
            limites: mensaje.limites,
          });
          break;
        case 'error':
          onError?.(mensaje.mensaje);
          break;
      }
    },
    [onError, onSeleccionar, onVistaChange],
  );

  return (
    <WebView
      ref={webViewRef}
      style={{
        flex: 1,
        backgroundColor: oscuro ? '#121212' : '#e8e6e1',
      }}
      source={{ html: HTML_MAPA }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      cacheEnabled
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      setSupportMultipleWindows={false}
      androidLayerType="hardware"
      onLoadStart={() => setListo(false)}
      onMessage={manejarMensaje}
      onError={() =>
        onError?.('No pudimos cargar el mapa. Revisá tu conexión a internet.')
      }
      onShouldStartLoadWithRequest={(solicitud) => {
        if (!/^https?:/i.test(solicitud.url)) {
          return true;
        }
        // Los enlaces de atribución de OpenStreetMap se abren fuera del mapa.
        Linking.openURL(solicitud.url).catch(() => undefined);
        return false;
      }}
    />
  );
});
