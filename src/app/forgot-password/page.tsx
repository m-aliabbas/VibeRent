import { AuthFrame } from "@/components/auth/auth-frame";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";
export default function ForgotPasswordPage(){return <AuthFrame eyebrow="Account recovery" title="Reset your password" description="We’ll email a secure reset link if an account exists for this address."><ForgotPasswordForm/></AuthFrame>}
