import { readStore,cleanStore,isAdmin } from "@/lib/event-db";
export const dynamic="force-dynamic";
export async function GET(request:Request){const store=await readStore();const admin=await isAdmin(request);return Response.json({store:cleanStore(store,admin),serverTime:Date.now(),admin})}
