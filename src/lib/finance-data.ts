export type TransactionKind = "Payment" | "Deposit received" | "Deposit applied" | "Deposit refunded" | "Deposit forfeited" | "Reversal" | "Write-off";
export type PaymentMethod = "Cash" | "Bank transfer" | "Card terminal" | "Wallet";
export type FinanceTransaction = { id:string; bookingId:string; customer:string; kind:TransactionKind; amount:number; method:PaymentMethod; receivedAt:string; reference:string; account:string; note:string; linkedTransactionId?:string; status:"Posted"|"Reversed" };
export type ExpenseStatus = "Draft"|"Submitted"|"Approved"|"Rejected"|"Reversed";
export type ExpenseRecord = { id:string; date:string; vehicle:string; booking?:string; owner?:string; category:string; amount:number; description:string; vendor:string; method:string; city:string; responsibility:"Agency"|"Owner"|"Shared"; receipt:boolean; status:ExpenseStatus; note:string };

export const financeTransactions:FinanceTransaction[]=[
  {id:"TXN-8841",bookingId:"BKG-1051",customer:"Hamza Siddiqui",kind:"Payment",amount:28500,method:"Bank transfer",receivedAt:"2026-09-26T09:15",reference:"IBFT-90418",account:"HBL Operations",note:"Rental charge received",status:"Posted"},
  {id:"TXN-8837",bookingId:"BKG-1048",customer:"Areeba Khan",kind:"Deposit received",amount:17000,method:"Card terminal",receivedAt:"2026-09-25T16:20",reference:"POS-1742",account:"Lahore counter",note:"Partial security deposit",status:"Posted"},
  {id:"TXN-8819",bookingId:"BKG-1031",customer:"Zain Ahmed",kind:"Payment",amount:5000,method:"Wallet",receivedAt:"2026-09-18T10:00",reference:"WLT-3302",account:"Easypaisa",note:"Booking advance",status:"Posted"},
];

export const expenseRecords:ExpenseRecord[]=[
  {id:"EXP-391",date:"2026-09-25",vehicle:"ICT-704",booking:"BKG-1051",category:"Fuel",amount:8400,description:"Pre-delivery fuel top-up",vendor:"PSO Blue Area",method:"Card",city:"Islamabad",responsibility:"Agency",receipt:true,status:"Approved",note:"Approved by accounts"},
  {id:"EXP-384",date:"2026-09-20",vehicle:"LEB-218",category:"Cleaning",amount:3500,description:"Interior detailing",vendor:"Shine Auto Spa",method:"Cash",city:"Lahore",responsibility:"Agency",receipt:true,status:"Submitted",note:"Awaiting review"},
  {id:"EXP-372",date:"2026-09-14",vehicle:"BKC-882",owner:"Sana Malik",category:"Maintenance",amount:28600,description:"Brake pads and labour",vendor:"Karachi Auto Works",method:"Bank transfer",city:"Karachi",responsibility:"Owner",receipt:true,status:"Approved",note:"Agreement owner responsibility"},
  {id:"EXP-359",date:"2026-09-08",vehicle:"LHR-529",category:"Insurance",amount:12400,description:"Monthly policy allocation",vendor:"EFU Insurance",method:"Bank transfer",city:"Lahore",responsibility:"Shared",receipt:false,status:"Draft",note:"Receipt requested"},
];

export function postedTotal(bookingId:string){return financeTransactions.filter(t=>t.bookingId===bookingId&&t.status==="Posted"&&!t.kind.includes("refunded")&&!t.kind.includes("Reversal")).reduce((sum,t)=>sum+t.amount,0)}
export function refundableDeposit(bookingId:string){return financeTransactions.filter(t=>t.bookingId===bookingId&&t.status==="Posted"&&t.kind==="Deposit received").reduce((sum,t)=>sum+t.amount,0)-financeTransactions.filter(t=>t.bookingId===bookingId&&t.status==="Posted"&&["Deposit applied","Deposit refunded","Deposit forfeited"].includes(t.kind)).reduce((sum,t)=>sum+t.amount,0)}
