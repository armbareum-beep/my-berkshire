import FamilyDashboard from "@/components/family/FamilyDashboard";
import FamilyLogin from "@/components/family/FamilyLogin";
import { authorized } from "@/lib/family/server";
export const dynamic = "force-dynamic";
export default async function Home(){return await authorized() ? <FamilyDashboard/> : <FamilyLogin/>;}
