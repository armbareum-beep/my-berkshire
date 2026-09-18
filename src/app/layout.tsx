import type { Metadata, Viewport } from "next";
import "./family.css";
export const metadata:Metadata={title:"우리집 자산 | 가족 포트폴리오",description:"가족·계좌별 자산과 XIRR, 국가별 비중을 함께 관리합니다.",robots:{index:false,follow:false},manifest:"/manifest.webmanifest",icons:{icon:"/family-icon.svg",apple:"/family-icon.svg"},appleWebApp:{capable:true,title:"우리집 자산",statusBarStyle:"default"}};
export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#193858"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>;}
