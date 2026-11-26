import { title } from "node:process";

const config = {
  port: Number(process.env.PORT ?? 3000),
  catalogUrl: process.env.CATALOG_URL ?? "https://dummyjson.com/products",
  catalogTimeoutMs: Number(process.env.CATALOG_TIMEOUT_MS ?? 3000),
  catalogDelayMs: Number(process.env.CATALOG_DELAY_MS ?? 0),
};

export async function GetProduct(id:number) {
  const delay = config.catalogDelayMs > 0 ? `?delay=${config.catalogDelayMs}` : "";
  const url = `${config.catalogUrl}/${id}${delay}`
  try {
    const res = await fetch(url,{signal: AbortSignal.timeout(config.catalogTimeoutMs)})

    if(res.status == 400) return {message: "Producto inexistente"}
    if(!res.ok) return {message: `Error HTTP ${res.status}`}

    const data = await res.json()
    return{
      producto: {
        id : data.id as number,
        title: data.title as string,
        price: data.price as number,
        thumbnail: data.thumbnail as string,
      }
    }

  } catch (error) {
    const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return{message: isTimeout ? "El catálogo no respondió a tiempo" : "Error al consultar el catálogo",}
  }
}

// Envia peticiones GET a la API de manera simultanea 
export async function GetSimultaneo(ids:number[]) {
  return Promise.all(ids.map(id => GetProduct(id)));
}