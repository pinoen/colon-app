export type IdCategoria = `cat-${string}`;

export interface Categoria {
  id: IdCategoria;
  nombre: string;
  icono: string;
  color: string;
  orden: number;
}