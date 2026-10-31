import '../global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { AuthProvider } from '@/context/AuthContext';
import { TemaProvider } from '@/context/TemaContext';
import { aplicarMigracionLocal } from '@/servicios/migracionLocal';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
    },
  },
});

export default function RootLayout() {
  const [migracionLista, setMigracionLista] = useState(false);

  useEffect(() => {
    let activo = true;

    void (async () => {
      try {
        await aplicarMigracionLocal();
      } finally {
        if (activo) {
          setMigracionLista(true);
        }
      }
    })();

    return () => {
      activo = false;
    };
  }, []);

  if (!migracionLista) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TemaProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </AuthProvider>
      </TemaProvider>
    </QueryClientProvider>
  );
}