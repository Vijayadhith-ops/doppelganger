export type RoundStatus="WAITING"|"READY"|"LIVE"|"PAUSED"|"ENDED";
export type PStatus="REGISTERED"|"VERIFIED"|"ACTIVE"|"SUBMITTED"|"EXPIRED";
export type Participant={code:string;name:string;college:string;challenge:string;status:PStatus;verifiedAt?:string;submittedAt?:string;projectUrl?:string;figmaUrl?:string;prompt?:string;submissionImage?:string};
export type Challenge={code:string;title:string;difficulty:string;color:string;description:string;imageUrl?:string;specs?:string[];category?:string};
export type EventStore={status:RoundStatus;duration:number;endsAt:number|null;pausedRemaining:number;participants:Participant[];challenges:Challenge[];startedAt?:number;grace:number};
const names = [
  "Aarav", "Aisha", "Akash", "Ananya", "Arjun", "Deepa", "Gokul", "Harini", "Ishaan", "Janani",
  "Kavin", "Keerthi", "Madhan", "Nila", "Pranav", "Rithika", "Sanjay", "Swetha", "Vijay", "Yamini",
  "Abishek", "Bhavana", "Charan", "Divya", "Ezhil", "Farhan", "Gayathri", "Hemant", "Induja", "Jeeva",
  "Karthik", "Lavanya", "Manoj", "Naveen", "Oviya", "Praveen", "Rakshana", "Saravanan", "Tharani", "Udhay",
  "Varun", "Vignesh", "Yazhini", "Zeenath", "Aditya"
];
export const challenges: Challenge[] = [];
export function seed(): EventStore {
  return {
    status: "WAITING",
    duration: 1800,
    endsAt: null,
    pausedRemaining: 1800,
    grace: 30,
    challenges: [],
    participants: Array.from({ length: 45 }, (_, i) => ({
      code: `DG-${String(i + 1).padStart(2, "0")}`,
      name: names[i % names.length],
      college: i % 3 === 0 ? "K.L.N. College of Engineering" : "Guest Institution",
      challenge: "",
      status: "REGISTERED",
    })),
  };
}
