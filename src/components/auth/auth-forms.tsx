"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-controls";

function Message({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "success" }) {
  return <div role="status" className={`rounded-lg border p-3 text-sm ${tone === "error" ? "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]" : "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]"}`}>{children}</div>;
}

export function SignInForm({ callbackUrl = "/" }: { callbackUrl?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({ email: String(data.get("email")), password: String(data.get("password")), rememberMe: Boolean(data.get("remember")) });
    setPending(false);
    if (result.error) return setError(result.error.message ?? "Sign in failed.");
    router.push(safeCallback(callbackUrl)); router.refresh();
  }
  return <form method="post" onSubmit={submit} className="space-y-4"><FormInput name="email" label="Email address" type="email" autoComplete="email" required/><FormInput name="password" label="Password" type="password" autoComplete="current-password" required/><div className="flex items-center justify-between text-sm"><label className="flex items-center gap-2 text-[#475467]"><input name="remember" type="checkbox" className="h-4 w-4 accent-[#006FE6]"/>Keep me signed in</label><Link href="/forgot-password" className="font-semibold text-[#006FE6] hover:underline">Forgot password?</Link></div>{error&&<Message>{error}</Message>}<Button type="submit" className="h-11 w-full" disabled={pending}>{pending?<LoaderCircle className="animate-spin" size={18}/>:<>Sign in<ArrowRight size={17}/></>}</Button><p className="text-center text-sm text-[#667085]">New to VibeRent? <Link href="/sign-up" className="font-semibold text-[#006FE6] hover:underline">Create an account</Link></p></form>;
}

export function SignUpForm() {
  const router = useRouter(); const [pending,setPending]=useState(false); const [error,setError]=useState("");
  async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setPending(true);setError("");const data=new FormData(event.currentTarget);const password=String(data.get("password"));if(password!==String(data.get("confirm"))){setPending(false);setError("Passwords do not match.");return;}const result=await authClient.signUp.email({name:String(data.get("name")),email:String(data.get("email")),password,callbackURL:"/onboarding"});setPending(false);if(result.error)return setError(result.error.message??"Account creation failed.");router.push("/onboarding");router.refresh();}
  return <form method="post" onSubmit={submit} className="space-y-4"><FormInput name="name" label="Full name" autoComplete="name" required/><FormInput name="email" label="Work email" type="email" autoComplete="email" required/><FormInput name="password" label="Password" type="password" minLength={10} autoComplete="new-password" required/><p className="-mt-2 text-xs text-[#667085]">Use at least 10 characters.</p><FormInput name="confirm" label="Confirm password" type="password" minLength={10} autoComplete="new-password" required/>{error&&<Message>{error}</Message>}<Button type="submit" className="h-11 w-full" disabled={pending}>{pending?<LoaderCircle className="animate-spin" size={18}/>:<>Create account<ArrowRight size={17}/></>}</Button><p className="text-center text-sm text-[#667085]">Already have an account? <Link href="/sign-in" className="font-semibold text-[#006FE6] hover:underline">Sign in</Link></p></form>;
}

export function ForgotPasswordForm(){const [pending,setPending]=useState(false);const [sent,setSent]=useState(false);const [error,setError]=useState("");async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setPending(true);setError("");const data=new FormData(event.currentTarget);const result=await authClient.requestPasswordReset({email:String(data.get("email")),redirectTo:"/reset-password"});setPending(false);if(result.error)return setError(result.error.message??"Request failed.");setSent(true);}if(sent)return <div className="space-y-4"><Message tone="success">If an account exists for that email, a reset link is on its way.</Message><Button asChild variant="secondary" className="w-full"><Link href="/sign-in">Back to sign in</Link></Button></div>;return <form method="post" onSubmit={submit} className="space-y-4"><FormInput name="email" label="Email address" type="email" autoComplete="email" required/>{error&&<Message>{error}</Message>}<Button type="submit" className="h-11 w-full" disabled={pending}>{pending?<LoaderCircle className="animate-spin" size={18}/>:"Send reset link"}</Button><Button asChild variant="ghost" className="w-full"><Link href="/sign-in">Back to sign in</Link></Button></form>}

export function ResetPasswordForm({token}:{token:string}){const router=useRouter();const [pending,setPending]=useState(false);const [error,setError]=useState("");async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);const password=String(data.get("password"));if(password!==String(data.get("confirm"))){setError("Passwords do not match.");return;}setPending(true);const result=await authClient.resetPassword({newPassword:password,token});setPending(false);if(result.error)return setError(result.error.message??"This reset link is invalid or expired.");router.push("/sign-in?reset=1");}return <form method="post" onSubmit={submit} className="space-y-4"><FormInput name="password" label="New password" type="password" minLength={10} autoComplete="new-password" required/><FormInput name="confirm" label="Confirm new password" type="password" minLength={10} autoComplete="new-password" required/>{error&&<Message>{error}</Message>}<Button type="submit" className="h-11 w-full" disabled={pending||!token}>{pending?<LoaderCircle className="animate-spin" size={18}/>:"Update password"}</Button></form>}

function safeCallback(value:string){return value.startsWith("/")&&!value.startsWith("//")?value:"/";}
