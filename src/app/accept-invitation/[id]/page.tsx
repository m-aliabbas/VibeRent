import { AuthFrame } from "@/components/auth/auth-frame";
import { InvitationCard } from "@/components/auth/invitation-card";
import { getOptionalWebSession } from "@/server/auth/session";
export default async function AcceptInvitationPage({params}:{params:Promise<{id:string}>}){const [{id},session]=await Promise.all([params,getOptionalWebSession()]);return <AuthFrame eyebrow="Team invitation" title="Join your agency" description="Review the invitation and connect your verified account to the same agency workspace."><InvitationCard invitationId={id} signedIn={Boolean(session)}/></AuthFrame>}
