import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';

import { HTML_MAPA } from '@/componentes/htmlMapa';
import {
  construirDatosMapa,
  interpretarMensajeMapa,
  type MapaOSMProps,
  type MapaOSMRef,
} from '@/componentes/mapaComun';

/**
 * Variante web del mapa (react-native-web).
 *
 * `react-native-webview` no soporta web, así que el mismo HTML de Leaflet se
 * monta dentro de un iframe y se comunica con `postMessage`.
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [listo, setListo] = useState(false);

  const enviar = useCallback((mensaje: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify(mensaje),
      '*',
    );
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

  useEffect(() => {
    const manejarMensaje = (evento: MessageEvent) => {
      if (evento.source !== iframeRef.current?.contentWindow) {
        return;
      }
      if (typeof evento.data !== 'string') {
        return;
      }
      const mensaje = interpretarMensajeMapa(evento.data);
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
    };

    window.addEventListener('message', manejarMensaje);
    return () => window.removeEventListener('message', manejarMensaje);
  }, [onError, onSeleccionar, onVistaChange]);

  return (
    <View style={{ flex: 1 }}>
      <iframe
        ref={iframeRef}
        title="Mapa de Colón"
        srcDoc={HTML_MAPA}
        onLoad={() => setListo(true)}
        style={{
          width: '100%',
          height: '100%',
          border: 0,
          backgroundColor: oscuro ? '#121212' : '#e8e6e1',
        }}
      />
    </View>
  );
});
