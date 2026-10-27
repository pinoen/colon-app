import type { Coordenadas } from './lugar';

export interface LimitesMapa {
  norte: number;
  sur: number;
  este: number;
  oeste: number;
}

export interface VistaMapa {
  centro: Coordenadas;
  limites: LimitesMapa;
}
