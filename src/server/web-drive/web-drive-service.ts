import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { CodeChallengeMethod, OAuth2Client, type Credentials } from "google-auth-library";
import { drive as createDriveClient } from "googleapis/build/src/apis/drive";
import { execute, queryOne } from "@/db/query";
import { loadGoogleDriveClient, loadGoogleDriveWebClient } from "@/server/desktop/encrypted-credentials";
import { requireRole } from "@/server/auth/authorize";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { createAgencyPortableBackup } from "@/server/services/agency-portable-backup-service";

const driveScope="https://www.googleapis.com/auth/drive.file";
const folderName="VibeRent Backups";
type Connection={id:string;credentialsEncrypted:string;accountEmail:string|null;folderId:string|null;lastBackupAt:string|null;lastBackupFileId:string|null};
type OAuthState={state:string;verifier:string;agencyId:string;authUserId:string;expiresAt:number};
function key(){const secret=process.env.BETTER_AUTH_SECRET?.trim();if(!secret||secret.length<32)throw new DomainError("VALIDATION_FAILED","The server encryption secret is not configured.",503);return createHash("sha256").update(`viberent-web-drive:${secret}`).digest()}
export function seal(value:unknown){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv);const payload=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),payload]).toString("base64url")}
export function unseal<T>(value:string):T{try{const bytes=Buffer.from(value,"base64url"),decipher=createDecipheriv("aes-256-gcm",key(),bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString("utf8")) as T}catch{throw new DomainError("VALIDATION_FAILED","Google Drive connection data is invalid.",400)}}
const LOOPBACK_HOSTS=["localhost","127.0.0.1"];
async function configuration(){
  const base=process.env.BETTER_AUTH_URL?.trim();if(!base)return null;
  let url:URL;try{url=new URL("/api/v1/agency-backup/google-drive/callback",base)}catch{return null}
  const loopback=url.protocol==="http:"&&LOOPBACK_HOSTS.includes(url.hostname);if(url.protocol!=="https:"&&!loopback)return null;
  let id=process.env.GOOGLE_DRIVE_WEB_CLIENT_ID?.trim(),secret=process.env.GOOGLE_DRIVE_WEB_CLIENT_SECRET?.trim();
  if(!id||!secret){
    // Prefer a Google "Web application" client (g1-web.json.enc). Google only accepts the desktop
    // client from g1.json.enc on loopback redirects, so it is a fallback for localhost web runs.
    const encrypted=await loadGoogleDriveWebClient().catch(()=>loopback?loadGoogleDriveClient().catch(()=>null):null);
    id=encrypted?.client_id;secret=encrypted?.client_secret;
  }
  if(!id||!secret)return null;
  return {id,secret,redirectUri:url.toString()}
}
async function client(){const config=await configuration();if(!config)throw new DomainError("VALIDATION_FAILED","Google Drive backup is not configured for this web deployment.",503);return new OAuth2Client(config.id,config.secret,config.redirectUri)}
function owner(context:RequestContext){requireRole(context,["agency_owner"]);if(!context.authUserId)throw new DomainError("UNAUTHENTICATED","Sign in to connect Google Drive.",401);return context.authUserId}
async function connection(context:RequestContext){return queryOne<Connection>("SELECT id,credentials_encrypted AS credentialsEncrypted,account_email AS accountEmail,folder_id AS folderId,last_backup_at AS lastBackupAt,last_backup_file_id AS lastBackupFileId FROM web_drive_connections WHERE agency_id=? AND auth_user_id=?",[context.agencyId,owner(context)])}
export async function status(context:RequestContext){const row=await connection(context);return {configured:Boolean(await configuration()),connected:Boolean(row),email:row?.accountEmail??null,lastBackupAt:row?.lastBackupAt??null,lastBackupUrl:row?.lastBackupFileId?`https://drive.google.com/file/d/${encodeURIComponent(row.lastBackupFileId)}/view`:null}}
export async function authorization(context:RequestContext){const authUserId=owner(context),oauth=await client();const {codeVerifier,codeChallenge}=await oauth.generateCodeVerifierAsync(),state=randomUUID();const cookie=seal({state,verifier:codeVerifier,agencyId:context.agencyId,authUserId,expiresAt:Date.now()+10*60*1000} satisfies OAuthState);const url=oauth.generateAuthUrl({access_type:"offline",prompt:"consent",scope:[driveScope],state,include_granted_scopes:true,code_challenge:codeChallenge,code_challenge_method:CodeChallengeMethod.S256});return {url,cookie}}
export async function completeAuthorization(context:RequestContext,code:string,state:string,cookie:string){const expected=unseal<OAuthState>(cookie);const actual=Buffer.from(state),wanted=Buffer.from(expected.state);if(expected.expiresAt<Date.now()||expected.agencyId!==context.agencyId||expected.authUserId!==owner(context)||actual.length!==wanted.length||!timingSafeEqual(actual,wanted))throw new DomainError("VALIDATION_FAILED","Google Drive sign-in expired. Start the connection again.",400);const oauth=await client();const {tokens}=await oauth.getToken({code,codeVerifier:expected.verifier});if(!tokens.refresh_token)throw new DomainError("VALIDATION_FAILED","Google did not grant ongoing backup access. Try connecting again.",400);oauth.setCredentials(tokens);const drive=createDriveClient({version:"v3",auth:oauth});const about=await drive.about.get({fields:"user(emailAddress)"});const now=new Date().toISOString();await execute("INSERT INTO web_drive_connections (id,agency_id,auth_user_id,credentials_encrypted,account_email,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(agency_id,auth_user_id) DO UPDATE SET credentials_encrypted=excluded.credentials_encrypted,account_email=excluded.account_email,folder_id=NULL,updated_at=excluded.updated_at",[randomUUID(),context.agencyId,context.authUserId,seal(tokens),about.data.user?.emailAddress??null,now,now]);return status(context)}
export async function disconnect(context:RequestContext){await execute("DELETE FROM web_drive_connections WHERE agency_id=? AND auth_user_id=?",[context.agencyId,owner(context)]);return status(context)}
export async function upload(context:RequestContext){const row=await connection(context);if(!row)throw new DomainError("VALIDATION_FAILED","Connect Google Drive before uploading a backup.",400);const oauth=await client(),saved=unseal<Credentials>(row.credentialsEncrypted);oauth.setCredentials(saved);const drive=createDriveClient({version:"v3",auth:oauth});let folderId=row.folderId;if(!folderId){const folder=await drive.files.create({requestBody:{name:folderName,mimeType:"application/vnd.google-apps.folder"},fields:"id"});folderId=folder.data.id??null;if(!folderId)throw new DomainError("VALIDATION_FAILED","Google Drive did not create the backup folder.",502)}const backup=await createAgencyPortableBackup(context);const file=await drive.files.create({requestBody:{name:backup.fileName,parents:[folderId],appProperties:{agencyId:context.agencyId}},media:{mimeType:"application/vnd.sqlite3",body:Readable.from([backup.bytes])},fields:"id,name"});if(!file.data.id)throw new DomainError("VALIDATION_FAILED","Google Drive did not confirm the backup upload.",502);const now=new Date().toISOString();await execute("UPDATE web_drive_connections SET credentials_encrypted=?,folder_id=?,last_backup_at=?,last_backup_file_id=?,updated_at=? WHERE id=? AND agency_id=? AND auth_user_id=?",[seal({...saved,...oauth.credentials}),folderId,now,file.data.id,now,row.id,context.agencyId,context.authUserId]);return {fileName:file.data.name??backup.fileName,at:now,url:`https://drive.google.com/file/d/${encodeURIComponent(file.data.id)}/view`,tables:backup.manifest.tables}}
