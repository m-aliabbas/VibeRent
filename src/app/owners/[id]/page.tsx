import { notFound } from "next/navigation";
import { OwnerProfile } from "@/components/owners/owner-profile";
import { owners } from "@/lib/operations-data";
export function generateStaticParams(){return owners.map(({id})=>({id}))}
export default async function OwnerPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const owner=owners.find(item=>item.id===id);if(!owner)notFound();return <OwnerProfile owner={owner}/>}
