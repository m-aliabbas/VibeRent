"use client";
import { useCallback, useEffect, useState } from "react";
import { Cloud, Download, ExternalLink, LoaderCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

type DriveStatus={configured:boolean;connected:boolean;email:string|null;lastBackupAt:string|null;lastBackupUrl:string|null};
const base="/api/v1/agency-backup/google-drive";
async function api<T>(path:string,method="GET"):Promise<T>{const response=await fetch(`${base}/${path}`,{method,cache:"no-store"});const body=await response.json() as {data?:T;error?:{message:string}};if(!response.ok||!body.data)throw new Error(body.error?.message||"Google Drive request failed.");return body.data}
export function WebDriveBackup({canManage,authError}:{canManage:boolean;authError:boolean}){
  const [status,setStatus]=useState<DriveStatus|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState("");
  const refresh=useCallback(async()=>{if(!canManage)return;try{setStatus(await api<DriveStatus>("status"));setError("")}catch(cause){setError(cause instanceof Error?cause.message:"Backup status could not be loaded.")}},[canManage]);
  useEffect(()=>{if(canManage)void api<DriveStatus>("status").then(setStatus).catch(cause=>setError(cause instanceof Error?cause.message:"Backup status could not be loaded."))},[canManage]);
  async function connect(){setBusy("connect");setError("");try{const result=await api<{authorizationUrl:string}>("connect","POST");window.location.assign(result.authorizationUrl)}catch(cause){setError(cause instanceof Error?cause.message:"Google Drive could not be connected.");setBusy("")}}
  async function upload(){setBusy("upload");setError("");try{await api("upload","POST");await refresh()}catch(cause){setError(cause instanceof Error?cause.message:"The backup could not be uploaded.")}finally{setBusy("")}}
  async function disconnect(){setBusy("disconnect");setError("");try{setStatus(await api<DriveStatus>("disconnect","DELETE"))}catch(cause){setError(cause instanceof Error?cause.message:"Google Drive could not be disconnected.")}finally{setBusy("")}}
  return <section className="rounded-xl border bg-white"><div className="flex gap-3 border-b p-5"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]"><Cloud size={19}/></span><div><h2 className="font-bold">Cloud backup</h2><p className="mt-1 text-sm text-[#667085]">Save this agency&apos;s records to your Google Drive.</p></div></div><div className="space-y-4 p-5">
    {!canManage?<p className="text-sm text-[#667085]">An agency owner can manage backups.</p>:<>
      <p className="text-sm text-[#475467]">The portable backup includes agency records. Uploaded document files stay in the server&apos;s private storage and need their own storage backup.</p>
      {authError&&<p role="alert" className="text-sm text-[#B42318]">Google Drive authorization did not complete. Check the account and try again.</p>}
      {error&&<p role="alert" className="rounded-lg bg-[#FEF3F2] p-3 text-sm text-[#B42318]">{error}</p>}
      {!status&&!error?<p className="flex items-center gap-2 text-sm text-[#667085]"><LoaderCircle className="animate-spin" size={16}/>Loading backup status…</p>:null}
      {status&&!status.configured&&<p className="rounded-lg bg-[#FFFAEB] p-3 text-sm text-[#93370D]">Google Drive needs a web OAuth client configured on this server. You can download a backup now.</p>}
      {status?.connected?<div className="space-y-3"><p className="text-sm">Connected to <strong>{status.email||"Google Drive"}</strong></p>{status.lastBackupAt&&<p className="text-sm text-[#475467]">Last backup: {new Date(status.lastBackupAt).toLocaleString()}</p>}{status.lastBackupUrl&&<a className="inline-flex items-center gap-1 text-sm font-semibold text-[#006FE6] underline" href={status.lastBackupUrl} target="_blank" rel="noreferrer">Open last backup in Drive<ExternalLink size={14}/></a>}<div className="flex flex-wrap gap-2"><Button disabled={Boolean(busy)} onClick={()=>void upload()}>{busy==="upload"?<LoaderCircle className="animate-spin" size={16}/>:<Upload size={16}/>}Back up to Google Drive</Button><Button variant="secondary" disabled={Boolean(busy)} onClick={()=>void disconnect()}>Disconnect</Button></div></div>:status?.configured?<Button disabled={Boolean(busy)} onClick={()=>void connect()}>{busy==="connect"?<LoaderCircle className="animate-spin" size={16}/>:<Cloud size={16}/>}Connect Google Drive</Button>:null}
      <Button asChild variant="secondary"><a href="/api/v1/agency-backup" download><Download size={16}/>Download backup</a></Button>
    </>}
  </div></section>
}
