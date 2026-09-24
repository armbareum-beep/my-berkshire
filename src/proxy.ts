import { NextResponse, type NextRequest } from "next/server";
/** Every family data endpoint verifies its session on the server. */
export function proxy(request:NextRequest){
 const p=request.nextUrl.pathname;
 if(p==="/"||["/api/family-quotes","/api/family-session","/api/family-data","/api/family-targets"].includes(p)){
  const response=NextResponse.next();response.headers.set("Cache-Control","no-store, private");response.headers.set("X-Frame-Options","DENY");response.headers.set("X-Content-Type-Options","nosniff");response.headers.set("Referrer-Policy","same-origin");return response;
 }
 if(p==="/manifest.webmanifest"||p==="/family-icon.svg"||p.startsWith("/_next/")||p==="/favicon.ico")return NextResponse.next();
 if(p.startsWith("/api/"))return NextResponse.json({error:"이전 API는 종료되었습니다."},{status:404});
 return NextResponse.redirect(new URL("/",request.url));
}
export const config={matcher:["/((?!_next/static|_next/image).*)"]};
