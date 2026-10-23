export type UserRole = "admin" | "editor" | "user" | "volunteer";
export type User = { id:number; name:string; email:string; role:UserRole; created_at?:string };
export type Post = { id:number; slug:string; title:string; content:string; author_id?:number; author_name?:string; published?:boolean; published_at?:string; cover_media_id?:number; created_at?:string; updated_at?:string };
export type EventItem = { id:number; title:string; description:string; event_date:string; ends_at?:string; location:string; created_at?:string };
export type PageResponse<T> = { items:T[]; page:number; limit:number; total:number };
export type MediaItem = { id:number; title:string; file_path:string; media_type?:string; original_name?:string; size_bytes?:number; kind:"image"|"video"|"audio"|"document"; created_at?:string };

export type ApiErrorBody = { code:string; message:string; details:Record<string,unknown> };
export class ApiError extends Error {
  constructor(message:string, readonly code:string, readonly status:number) {
    super(message);
    this.name="ApiError";
  }
}

const API_URL=process.env.NEXT_PUBLIC_API_URL||"/api";
const REQUEST_TIMEOUT_MS=15000;
const UPLOAD_TIMEOUT_MS=120000;
function getUrl(endpoint:string){if(endpoint.startsWith("http://")||endpoint.startsWith("https://"))return endpoint;const base=API_URL.replace(/\/$/,"");return `${base}${endpoint.startsWith("/")?endpoint:`/${endpoint}`}`;}
function isApiErrorBody(value:unknown):value is {error:{code?:unknown;message?:unknown}} {
  return typeof value==="object"&&value!==null&&"error" in value&&typeof (value as {error:unknown}).error==="object"&&(value as {error:{message?:unknown}}).error!==null;
}

export async function apiFetch<T=unknown>(endpoint:string,options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers);
  const isUpload=typeof FormData!=="undefined"&&options.body instanceof FormData;
  if(!isUpload&&options.body!==undefined&&!headers.has("Content-Type"))headers.set("Content-Type","application/json");
  const controller=new AbortController();
  const forwardAbort=()=>controller.abort(options.signal?.reason);
  if(options.signal?.aborted)forwardAbort();
  else options.signal?.addEventListener("abort",forwardAbort,{once:true});
  const timeout=setTimeout(()=>controller.abort(new Error("Request timed out")),isUpload?UPLOAD_TIMEOUT_MS:REQUEST_TIMEOUT_MS);
  const cleanup=()=>{clearTimeout(timeout);options.signal?.removeEventListener("abort",forwardAbort);};
  let response:Response;
  try {
    response=await fetch(getUrl(endpoint),{...options,headers,credentials:"include",signal:controller.signal});
  } catch {
    const timedOut=controller.signal.aborted&&!options.signal?.aborted;
    cleanup();
    throw new ApiError(timedOut?"The request timed out. Please try again.":"We could not reach the service. Please check your connection and try again.",timedOut?"timeout":"network_error",0);
  }
  try {
    const text=await response.text();
    let payload:unknown=null;
    if(text){try{payload=JSON.parse(text);}catch{payload=null;}}
    if(!response.ok){
      const errorBody=isApiErrorBody(payload)?payload.error:null;
      const message=typeof errorBody?.message==="string"?errorBody.message:"Something went wrong. Please try again.";
      const code=typeof errorBody?.code==="string"?errorBody.code:response.status===401?"unauthorized":"request_failed";
      if(response.status===401&&typeof window!=="undefined"&&!/(^|\/)(login|register|refresh)$/.test(endpoint.split("?")[0]))window.dispatchEvent(new Event("auth:session-expired"));
      throw new ApiError(message,code,response.status);
    }
    return payload as T;
  } catch(error) {
    if(error instanceof ApiError)throw error;
    const timedOut=controller.signal.aborted&&!options.signal?.aborted;
    throw new ApiError(timedOut?"The request timed out. Please try again.":"The response could not be read. Please try again.",timedOut?"timeout":"response_error",response.status);
  } finally { cleanup(); }
}
export function formatDate(value?:string,withTime=false){if(!value)return "Date to be announced";const date=new Date(value);if(Number.isNaN(date.getTime()))return value;return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",...(withTime?{timeStyle:"short" as const}:{})}).format(date);}
export function excerpt(value:string,length=150){const clean=value.replace(/\s+/g," ").trim();return clean.length>length?`${clean.slice(0,length).trimEnd()}...`:clean;}
