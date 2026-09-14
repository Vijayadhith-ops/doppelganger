/* eslint-disable @typescript-eslint/ban-ts-comment, prefer-const */
// @ts-nocheck
import { readStore,writeStore,isAdmin } from "@/lib/event-db";
export const dynamic="force-dynamic";
export async function GET(request:Request){if(!await isAdmin(request))return Response.json({error:"Unauthorized"},{status:401});return Response.json({store:await readStore(),serverTime:Date.now()})}
export async function POST(request:Request){
 if(!await isAdmin(request))return Response.json({error:"Unauthorized"},{status:401});
 const b=await request.json().catch(()=>({}));
 if(b.type==="replace"&&b.store&&Array.isArray(b.store.participants)&&Array.isArray(b.store.challenges)){await writeStore(b.store);return Response.json({store:b.store})}
 const s=await readStore(),now=Date.now();
  if(b.type==="round"){
   if(b.action==="PREPARE"&&s.status==="WAITING")s.status="READY";
   else if(b.action==="START"&&(s.status==="READY"||s.status==="WAITING")){s.status="LIVE";s.startedAt=now;s.endsAt=now+s.duration*1000;s.pausedRemaining=s.duration;s.participants=s.participants.map(p=>p.status==="VERIFIED"||p.status==="REGISTERED"?{...p,status:"ACTIVE"}:p)}
   else if(b.action==="PAUSE"&&s.status==="LIVE"){s.pausedRemaining=s.endsAt?Math.max(0,Math.ceil((s.endsAt-now)/1000)):s.pausedRemaining;s.endsAt=null;s.status="PAUSED"}
   else if(b.action==="RESUME"&&s.status==="PAUSED"){s.status="LIVE";s.endsAt=now+s.pausedRemaining*1000}
   else if(b.action==="EXTEND"&&["LIVE","PAUSED"].includes(s.status)){s.pausedRemaining+=300;if(s.endsAt)s.endsAt+=300000}
   else if(b.action==="END"&&s.status!=="ENDED"){s.status="ENDED";s.endsAt=null;s.pausedRemaining=0;s.participants=s.participants.map(p=>p.status!=="SUBMITTED"?{...p,status:"EXPIRED"}:p)}
   else if(b.action==="RESET"){s.status="WAITING";s.startedAt=undefined;s.endsAt=null;s.pausedRemaining=s.duration||1800;s.participants=s.participants.map(p=>({...p,status:"REGISTERED",verifiedAt:undefined,submittedAt:undefined,projectUrl:undefined,figmaUrl:undefined}))}
   else return Response.json({error:"Action is invalid for current round state"},{status:409});
  } else if(b.type==="assign"){
   if(["LIVE","PAUSED","ENDED"].includes(s.status))return Response.json({error:"Assignments are locked"},{status:409});
   const size=Math.max(1,Math.min(20,Number(b.size)||5));let list=[...s.participants];
   if(b.random)for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]]}
    s.participants=list.map((p,i)=>({...p,challenge:s.challenges[Math.floor(i/size)%s.challenges.length].code})).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  } else if(b.type==="update-challenge"){
    const ch=b.challenge||{};
    if(!ch.code)return Response.json({error:"Missing challenge code"},{status:400});
    const idx=s.challenges.findIndex(c=>c.code===ch.code);
    if(idx>=0){
      s.challenges[idx]={
        ...s.challenges[idx],
        ...(ch.title!==undefined?{title:ch.title}:{}),
        ...(ch.difficulty!==undefined?{difficulty:ch.difficulty}:{}),
        ...(ch.color!==undefined?{color:ch.color}:{}),
        ...(ch.description!==undefined?{description:ch.description}:{}),
        ...(ch.imageUrl!==undefined?{imageUrl:ch.imageUrl}:{}),
        ...(ch.specs!==undefined?{specs:ch.specs}:{}),
        ...(ch.category!==undefined?{category:ch.category}:{}),
      };
    } else {
      s.challenges.push({
        code:ch.code,
        title:ch.title||"New Challenge",
        difficulty:ch.difficulty||"Medium",
        color:ch.color||"#7357ff",
        description:ch.description||"Recreate this interface with high fidelity.",
        imageUrl:ch.imageUrl||"",
        specs:ch.specs||[],
        category:ch.category||"Mobile",
      });
      if (["WAITING", "READY"].includes(s.status) && s.challenges.length > 0) {
        s.participants = s.participants.map((p, i) => ({
          ...p,
          challenge: s.challenges[i % s.challenges.length].code
        }));
      }
    }
  } else if(b.type==="delete-challenge"){
    s.challenges=s.challenges.filter(c=>c.code!==b.code);
    const fallbackCode = s.challenges[0]?.code || "";
    s.participants = s.participants.map(p => p.challenge === b.code ? { ...p, challenge: fallbackCode } : p);
  } else if(b.type==="reset-challenges" || b.type==="clear-challenges"){
    s.challenges=[];
    s.participants = s.participants.map(p => ({ ...p, challenge: "" }));
  } else if(b.type==="participant-retry")s.participants=s.participants.map(p=>p.code===b.code?{...p,status:"VERIFIED",submittedAt:undefined,projectUrl:undefined,figmaUrl:undefined}:p);
  else return Response.json({error:"Unknown action"},{status:400});
 await writeStore(s);return Response.json({store:s});
}
