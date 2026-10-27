/**
 * HTML que se carga dentro del WebView de la pantalla Mapa.
 *
 * El mapa usa Leaflet + teselas de OpenStreetMap (sin API key ni tarjeta de
 * crédito). Leaflet se carga desde unpkg; las teselas, desde el servidor
 * público de OpenStreetMap. Sin internet no hay mapa base, pero la lista de
 * "Lugares cercanos" de la pantalla sigue funcionando con los datos locales.
 *
 * Contrato con React Native:
 * - RN envía mensajes JSON con `webView.postMessage(...)`:
 *   `{ tipo: 'actualizar', datos }`, `{ tipo: 'centrar', lat, lng, zoom }`,
 *   `{ tipo: 'enfocar', id }` y `{ tipo: 'zoom', delta }`.
 * - El mapa responde con `{ tipo: 'listo' }`, `{ tipo: 'seleccion', id }`,
 *   `{ tipo: 'fondo' }`, `{ tipo: 'region', centro, limites }` y
 *   `{ tipo: 'error', mensaje }`.
 */
export const HTML_MAPA = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
  />
  <title>Mapa de Colón</title>
  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    onerror="window.mostrarErrorMapa && window.mostrarErrorMapa()"
  />
  <style>
    html, body, #mapa {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
    }
    body {
      background: #e8e6e1;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      -webkit-tap-highlight-color: transparent;
    }
    #mapa {
      position: absolute;
      inset: 0;
      background: #e8e6e1;
    }
    #estado {
      position: absolute;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: #e8e6e1;
      color: #5b6470;
      font-size: 13px;
      line-height: 1.4;
      text-align: center;
    }
    #estado.oculto {
      display: none;
    }
    body.mapa-oscuro,
    body.mapa-oscuro #mapa {
      background: #1a1a1a;
    }
    body.mapa-oscuro #estado {
      background: #1a1a1a;
      color: #a1a1aa;
    }
    body.mapa-oscuro .leaflet-tile-pane {
      filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9);
    }
    body.mapa-oscuro .leaflet-control-attribution {
      background: rgba(18, 18, 18, 0.82);
      color: #a1a1aa;
    }
    body.mapa-oscuro .leaflet-control-attribution a {
      color: #2e8b6d;
    }
    .leaflet-control-attribution {
      font-size: 9px;
      line-height: 1.3;
    }
    .marcador-envoltura {
      background: transparent;
      border: 0;
    }
    .marcador-pildora {
      position: absolute;
      left: 0;
      top: 0;
      display: inline-block;
      transform: translate(-50%, -50%);
      padding: 3px 8px;
      border: 2px solid #ffffff;
      border-radius: 999px;
      background: #00694e;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.2;
      white-space: nowrap;
    }
    .marcador-seleccionado {
      background: #e8a33d;
      color: #111111;
    }
  </style>
</head>
<body>
  <div id="mapa"></div>
  <div id="estado">Cargando mapa…</div>
  <script>
    function enviar(mensaje) {
      var texto = JSON.stringify(mensaje);
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(texto);
        } else if (window.parent && window.parent !== window) {
          window.parent.postMessage(texto, '*');
        }
      } catch (error) {
        // Sin puente disponible: no hay nada que hacer.
      }
    }

    window.mostrarErrorMapa = function () {
      var estado = document.getElementById('estado');
      if (estado) {
        estado.textContent =
          'No pudimos cargar el mapa. Revisá tu conexión a internet.';
        estado.classList.remove('oculto');
      }
      enviar({ tipo: 'error', mensaje: 'No pudimos cargar el mapa base.' });
    };
  </script>
  <script
    src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    onerror="window.mostrarErrorMapa && window.mostrarErrorMapa()"
  ></script>
  <script>
    (function () {
      var CENTRO_COLON = [-32.23, -58.143];
      var mapa = null;
      var capaMarcadores = null;
      var marcadores = {};
      var puntoUsuario = null;
      var circuloUsuario = null;
      var teselasOk = false;
      var errorTimer = null;
      var ultimaFirma = null;

      function ocultarEstado() {
        var estado = document.getElementById('estado');
        if (estado) {
          estado.classList.add('oculto');
        }
      }

      function escapar(texto) {
        return String(texto)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function enviarRegion() {
        if (!mapa) {
          return;
        }
        var centro = mapa.getCenter();
        var limites = mapa.getBounds();
        enviar({
          tipo: 'region',
          centro: { latitud: centro.lat, longitud: centro.lng },
          limites: {
            norte: limites.getNorth(),
            sur: limites.getSouth(),
            este: limites.getEast(),
            oeste: limites.getWest()
          }
        });
      }

      function crearMarcador(lugar, seleccionado) {
        var html =
          '<span class="marcador-pildora' +
          (seleccionado ? ' marcador-seleccionado' : '') +
          '">' +
          escapar(lugar.nombre) +
          '</span>';
        var icono = L.divIcon({
          className: 'marcador-envoltura',
          html: html,
          iconSize: [0, 0]
        });
        var marcador = L.marker([lugar.latitud, lugar.longitud], {
          icon: icono,
          keyboard: false,
          title: lugar.nombre
        });
        marcador.on('click', function () {
          enviar({ tipo: 'seleccion', id: lugar.id });
        });
        return marcador;
      }

      function actualizar(datos) {
        if (!mapa) {
          return;
        }

        document.body.classList.toggle('mapa-oscuro', Boolean(datos.oscuro));

        capaMarcadores.clearLayers();
        marcadores = {};

        var lista = datos.lugares || [];
        var posiciones = [];
        for (var i = 0; i < lista.length; i += 1) {
          var lugar = lista[i];
          var marcador = crearMarcador(lugar, lugar.id === datos.seleccionadoId);
          marcador.addTo(capaMarcadores);
          marcadores[lugar.id] = marcador;
          posiciones.push([lugar.latitud, lugar.longitud]);
        }

        if (datos.ubicacion) {
          var coordenadas = [datos.ubicacion.latitud, datos.ubicacion.longitud];
          if (puntoUsuario === null) {
            circuloUsuario = L.circle(coordenadas, {
              radius: 80,
              stroke: false,
              fillColor: '#1e88e5',
              fillOpacity: 0.15,
              interactive: false
            }).addTo(mapa);
            puntoUsuario = L.circleMarker(coordenadas, {
              radius: 7,
              color: '#ffffff',
              weight: 3,
              fillColor: '#1e88e5',
              fillOpacity: 1,
              interactive: false
            }).addTo(mapa);
          } else {
            puntoUsuario.setLatLng(coordenadas);
            circuloUsuario.setLatLng(coordenadas);
          }
        } else if (puntoUsuario !== null) {
          mapa.removeLayer(puntoUsuario);
          mapa.removeLayer(circuloUsuario);
          puntoUsuario = null;
          circuloUsuario = null;
        }

        var firma = lista
          .map(function (lugarActual) {
            return lugarActual.id;
          })
          .join('|');

        if (posiciones.length > 0 && firma !== ultimaFirma) {
          ultimaFirma = firma;
          if (posiciones.length === 1) {
            mapa.setView(posiciones[0], 16);
          } else {
            mapa.fitBounds(posiciones, { padding: [48, 48], maxZoom: 16 });
          }
        } else if (ultimaFirma === null && datos.ubicacion) {
          ultimaFirma = '';
          mapa.setView(
            [datos.ubicacion.latitud, datos.ubicacion.longitud],
            15
          );
        }

        enviarRegion();
      }

      function centrar(lat, lng, zoom) {
        if (mapa) {
          mapa.setView([lat, lng], zoom || 16, { animate: true });
        }
      }

      function enfocar(id) {
        var marcador = marcadores[id];
        if (mapa && marcador) {
          mapa.panTo(marcador.getLatLng(), { animate: true });
        }
      }

      function cambiarZoom(delta) {
        if (mapa) {
          mapa.setZoom(mapa.getZoom() + delta, { animate: true });
        }
      }

      if (typeof L === 'undefined') {
        window.mostrarErrorMapa();
        return;
      }

      mapa = L.map('mapa', {
        zoomControl: false,
        attributionControl: true
      }).setView(CENTRO_COLON, 14);

      var teselas = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          maxZoom: 19,
          attribution:
            'Datos del mapa &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
        }
      ).addTo(mapa);

      teselas.on('load', function () {
        teselasOk = true;
        ocultarEstado();
      });

      teselas.on('tileerror', function () {
        if (teselasOk || errorTimer !== null) {
          return;
        }
        errorTimer = setTimeout(function () {
          if (!teselasOk) {
            window.mostrarErrorMapa();
          }
        }, 4000);
      });

      capaMarcadores = L.layerGroup().addTo(mapa);

      mapa.on('click', function () {
        enviar({ tipo: 'fondo' });
      });
      mapa.on('moveend', enviarRegion);
      mapa.on('zoomend', enviarRegion);

      window.mapaApp = {
        actualizar: actualizar,
        centrar: centrar,
        enfocar: enfocar,
        cambiarZoom: cambiarZoom
      };

      function recibirMensaje(evento) {
        var datos;
        try {
          datos = JSON.parse(evento.data);
        } catch (error) {
          return;
        }
        if (!datos || !datos.tipo) {
          return;
        }
        if (datos.tipo === 'actualizar') {
          actualizar(datos.datos || {});
        } else if (datos.tipo === 'centrar') {
          centrar(datos.lat, datos.lng, datos.zoom);
        } else if (datos.tipo === 'enfocar') {
          enfocar(datos.id);
        } else if (datos.tipo === 'zoom') {
          cambiarZoom(datos.delta);
        }
      }

      // En Android, react-native-webview despacha el mensaje en document;
      // en iOS y en la web, en window. Escuchamos ambos para cubrir las
      // tres plataformas (el evento no burbujea, así que no se duplica).
      document.addEventListener('message', recibirMensaje);
      window.addEventListener('message', recibirMensaje);

      enviar({ tipo: 'listo' });

      setTimeout(function () {
        if (!teselasOk) {
          window.mostrarErrorMapa();
        }
      }, 10000);
    })();
  </script>
</body>
</html>`;
