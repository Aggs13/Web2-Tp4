import { GetSimultaneo } from "./catalog.services.js";
import { addProduct,ExistProduct,getProduct,getProductsSorted } from "./list.repository.js";
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