// Raw pixels stay inside the application. The encoder has no session or network access.
export interface PixelJob { id:string; width:number; height:number; bitmap:Uint8Array; maxEdge:number; maxBytes:number }
export type EncodedSnapshot = { dataUrl:string; width:number; height:number; bytes:number };
export type PixelResult = { id:string; image?:EncodedSnapshot; error?:string };
