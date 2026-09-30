import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';
import { Appearance, Platform, useColorScheme as useEsquemaDelSistema } from 'react-native';

export type Tema = 'claro' | 'oscuro' | 'sistema';

type Esquema = 'light' | 'dark';

interface ContextoTema {
  tema: Tema;
  esquema: Esquema;
  cambiarTema: (tema: Tema) => void;
}

const TemaContexto = createContext<ContextoTema | null>(null);

const ESQUEMA_SELECCIONADO: Record<Tema, 'light' | 'dark' | 'unspecified'> = {
  claro: 'light',
  oscuro: 'dark',
  sistema: 'unspecified',
};

export function TemaProvider({ children }: PropsWithChildren) {
  const esquemaSistema = useEsquemaDelSistema();
  const [tema, setTema] = useState<Tema>('sistema');
  const esquema: Esquema = esquemaSistema === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    const esquemaSeleccionado = ESQUEMA_SELECCIONADO[tema];
    if (Platform.OS === 'web') {
      const documento = (globalThis as { document?: Document }).document;
      documento?.documentElement.classList.toggle('dark', esquemaSeleccionado === 'dark');
    } else {
      Appearance.setColorScheme(esquemaSeleccionado);
    }
  }, [tema]);

  return (
    <TemaContexto.Provider value={{ tema, esquema, cambiarTema: setTema }}>
      {children}
    </TemaContexto.Provider>
  );
}

export function useTema() {
  const contexto = useContext(TemaContexto);
  if (contexto === null) {
    throw new Error('useTema debe usarse dentro de TemaProvider');
  }
  return contexto;
}