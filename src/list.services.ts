import { GetSimultaneo } from "./catalog.services.js";
import { addProduct,ExistProduct,getProduct,getProductsSorted,deleteProduct } from "./list.repository.js";
import { GetProduct } from "./catalog.services.js";
import type { Product } from "./list.repository.js";

export async function ProponerProducto(id:number,nombreUsuario:string) {

  if(ExistProduct(id)) return {message:"EL producto ya esta propuesto"}
  
  const misProductos = getProductsSorted().filter((p) => p.proposedBy === nombreUsuario).length;
  if (misProductos >= 3) return { message: "Solo podés proponer hasta 3 productos como máximo" };
  
  const res = await GetProduct(id);
  if (!res.producto) return { message: res.message };
    

  const p = res.producto

  const producto : Product = {
    id: p.id,
    title: p.title,
    price: p.price,
    thumbnail: p.thumbnail,
    proposedBy: nombreUsuario,
    votes: 0,
  }
  
  addProduct(producto);
  return { producto };

}


export function VotarProducto(id: number) {
  const p = getProduct(id);
  if (!p) return { message: "El producto no existe" };

  p.votes++;
  return { producto: p };
}

export function QuitarVoto(id: number) {
  const p = getProduct(id);
  if (!p) return { message: "El producto no existe" };

  if (p.votes > 0) p.votes--;
  return { producto: p };
}

export function QuitarProducto(id: number, nombreUsuario: string) {
  const p = getProduct(id);
  if (!p) return { message: "El producto no existe" };

  if (p.proposedBy !== nombreUsuario) {
    return { message: "Solo quien lo propuso puede quitarlo" };
  }

  deleteProduct(id);
  return { ok: true };
}