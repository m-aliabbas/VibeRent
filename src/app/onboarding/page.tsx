import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/auth-frame";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { getSessionViewer } from "@/server/auth/session";
export default async function OnboardingPage(){const viewer=await getSessionViewer();if(!viewer)redirect("/sign-in?callbackUrl=/onboarding");if(viewer.activeAgencyId&&viewer.active)redirect("/");return <AuthFrame eyebrow="Agency setup" title="Create your workspace" description="Set up the rental agency and its first operating branch. Staff can only join later through your invitation."><OnboardingForm/></AuthFrame>}
