export type StatementStatus = "Draft"|"Reviewed"|"Approved"|"Partially Paid"|"Paid"|"Void";
export type StatementLine = { id:string; kind:"Rental revenue"|"Owner expense"|"Adjustment"|"Payout"; source:string; description:string; date:string; amount:number; agreementVersion:string };
export type OwnerStatement = { id:string; ownerId:string; period:string; openingBalance:number; status:StatementStatus; lines:StatementLine[]; reviewedBy?:string; approvedBy?:string };
export const statementFixtures:OwnerStatement[]=[
 {id:"STM-2026-009",ownerId:"OWN-018",period:"September 2026",openingBalance:18500,status:"Draft",lines:[
  {id:"SL-901",kind:"Rental revenue",source:"BKG-1042",description:"KIA Sportage · completed rental owner share (70%)",date:"2026-09-26",amount:37800,agreementVersion:"AGR-v2"},
  {id:"SL-902",kind:"Rental revenue",source:"BKG-1028",description:"Honda BR-V · completed rental owner share (70%)",date:"2026-09-18",amount:44800,agreementVersion:"AGR-v2"},
  {id:"SL-903",kind:"Owner expense",source:"EXP-372",description:"Owner-responsible brake service",date:"2026-09-14",amount:-28600,agreementVersion:"AGR-v2"},
  {id:"SL-904",kind:"Adjustment",source:"ADJ-119",description:"August toll reconciliation",date:"2026-09-02",amount:-2000,agreementVersion:"AGR-v2"},
 ]},
 {id:"STM-2026-008",ownerId:"OWN-018",period:"August 2026",openingBalance:0,status:"Paid",lines:[
  {id:"SL-801",kind:"Rental revenue",source:"BKG-0991",description:"KIA Sportage · owner share",date:"2026-08-24",amount:95500,agreementVersion:"AGR-v2"},
  {id:"SL-802",kind:"Payout",source:"PAY-441",description:"Full payout · HBL transfer",date:"2026-09-03",amount:-95500,agreementVersion:"AGR-v2"},
 ]}
];
export function statementTotals(statement:OwnerStatement){const rentalRevenue=statement.lines.filter(l=>l.kind==="Rental revenue").reduce((s,l)=>s+l.amount,0);const expenses=statement.lines.filter(l=>l.kind==="Owner expense").reduce((s,l)=>s+Math.abs(l.amount),0);const adjustments=statement.lines.filter(l=>l.kind==="Adjustment").reduce((s,l)=>s+l.amount,0);const payouts=statement.lines.filter(l=>l.kind==="Payout").reduce((s,l)=>s+Math.abs(l.amount),0);const closing=statement.openingBalance+rentalRevenue-expenses+adjustments-payouts;return {rentalRevenue,expenses,adjustments,payouts,closing,agencyShare:Math.round(rentalRevenue/0.7*0.3),grossRevenue:Math.round(rentalRevenue/0.7)}}
export function reconciliationScenarios(statement:OwnerStatement){const totals=statementTotals(statement);return [{label:"Statement closing balance",value:totals.closing,status:"Matched"},{label:"Owner directory payable",value:totals.closing,status:"Matched"},{label:"Unallocated completed rentals",value:0,status:"Clear"},{label:"Duplicate active source lines",value:0,status:"Clear"},{label:"Pending owner expenses",value:12400,status:"Review"}]}
