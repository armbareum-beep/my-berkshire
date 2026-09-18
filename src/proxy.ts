import { NextResponse, type NextRequest } from "next/server";
/** Family app is local-first. Legacy ENUF routes are retired; no old account is required. */
export function proxy(request:NextRequest){
 const p=request.nextUrl.pathname;
 if(p==="/"||p==="/api/family-quotes"||p==="/manifest.webmanifest"||p==="/family-icon.svg"||p.startsWith("/_next/")||p==="/favicon.ico")return NextResponse.next();
 if(p.startsWith("/api/"))return NextResponse.json({error:"이전 API는 종료되었습니다."},{status:404});
 return NextResponse.redirect(new URL("/",request.url));
}
export const config={matcher:["/((?!_next/static|_next/image).*)"]};
