import { GetSimultaneo } from "./catalog.services.js";
import { addProduct,ExistProduct,getProduct,getProductsSorted,deleteProduct, type Product } from "./list.repository.js";
import { GetProduct } from "./catalog.services.js";

export async function ProponerProducto(ids:number[],nombreUsuario:string) {

  const idsUnicas = [...new Set(ids)]
  if(idsUnicas.length == 0 || idsUnicas.length > 10) return {message:"Minimo un id, Maximo 10"} 

  const failed: { id: number | undefined; message: string }[] = [];
  const idsParaBuscar: number[] = [];
 

  for (const id of idsUnicas) {
    if (ExistProduct(id)) {
      failed.push({ id, message: "El producto ya esta en la lista" });
    } else {
      idsParaBuscar.push(id);
    }
  }
  
  const res = await GetSimultaneo(idsParaBuscar);
  
  for (const r of res) {
    
    const p = r.producto

    if(p == null) {
      failed.push({ id: r.id, message: r.message });
      continue;
    } 

    const producto : Product = {
      id: p.id,
      title: p.title,
      price: p.price,
      thumbnail: p.thumbnail,
      proposedBy: nombreUsuario,
      votes: 0,
    }
    
    addProduct(producto);
    
  }
  
  
  

  return { idsParaBuscar, failed };

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