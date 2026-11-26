export interface Product {
  id: number;
  title: string;
  price: number;
  thumbnail: string;
  proposedBy: string;     // nombre de quien lo propuso (para saber quién puede quitarlo)
  votes: number;    // nombres de quienes votaron (Set evita votos repetidos)
}

const products = new Map<number, Product>();

export function addProduct(product: Omit<Product, "votes">): void {
  products.set(product.id, { ...product, votes: 0 });
}
export function deleteProduct(id: number): boolean {
  return products.delete(id);
}

export function getProduct(id: number): Product | undefined {
  return products.get(id);
}

// Revisa si ya existe un producto con ese id
export function ExistProduct(id: number): boolean {
  return products.has(id);

}

// Devuelve el array de objetos listo, ordenado por votos
export function getProductsSorted() {
  return [...products.values()]
    .map((p) => ({
      id: p.id,
      title: p.title,
      price: p.price,
      thumbnail: p.thumbnail,
      proposedBy: p.proposedBy,
      votes: p.votes,

    }))
    .sort((a, b) => b.votes - a.votes);
}