import Link from "next/link";
import { MailCheck } from "lucide-react";
import { AuthFrame } from "@/components/auth/auth-frame";
import { Button } from "@/components/ui/button";
export default async function CheckEmailPage({searchParams}:{searchParams:Promise<{email?:string}>}){const {email}=await searchParams;return <AuthFrame eyebrow="Verify your email" title="Check your inbox" description="We sent a verification link to finish securing your account."><div className="text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#EFF8FF] text-[#006FE6]"><MailCheck size={27}/></span><p className="mt-4 text-sm leading-6 text-[#475467]">Open the link sent to <strong>{email??"your email address"}</strong>. In local development, the verification URL is printed in the server terminal.</p><Button asChild variant="secondary" className="mt-6 w-full"><Link href="/sign-in">Back to sign in</Link></Button></div></AuthFrame>}
