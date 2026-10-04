import { initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { importPKCS8, SignJWT } from "jose";

initializeApp();

const signingPrivateKey = defineSecret("LICENSE_SIGNING_PRIVATE_KEY");
const applicationId = "viberent";
const audience = "viberent-desktop";
const collection = "viberent_licenses";
const maxOfflineDays = 30;

type HttpResponse = {
  status(code: number): HttpResponse;
  set(name: string, value: string): HttpResponse;
  json(body: object): void;
};

function response(res: HttpResponse, status: number, body: object) {
  res.status(status).set("cache-control", "no-store").json(body);
}

function expiry(value: unknown) {
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export const viberentLicense = onRequest(
  { region: "asia-south1", secrets: [signingPrivateKey], timeoutSeconds: 15 },
  async (req, res) => {
    if (req.method !== "POST") return response(res, 405, { state: "unavailable", message: "Method not allowed." });
    const body = typeof req.body === "object" && req.body ? req.body as Record<string, unknown> : {};
    const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint.toLowerCase() : "";
    if (!/^[a-f0-9]{64}$/.test(fingerprint) || body.applicationId !== applicationId) {
      return response(res, 400, { state: "unavailable", message: "The license request is invalid." });
    }

    const reference = getFirestore().collection(collection).doc(fingerprint);
    const snapshot = await reference.get();
    if (!snapshot.exists) {
      await reference.create({
        applicationId,
        approved: false,
        disabled: false,
        createdAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp(),
        appVersion: typeof body.version === "string" ? body.version.slice(0, 32) : null,
      });
      return response(res, 403, { state: "pending", message: "Device registered and waiting for administrator approval." });
    }

    const license = snapshot.data() || {};
    await reference.set({ lastSeenAt: FieldValue.serverTimestamp(), appVersion: typeof body.version === "string" ? body.version.slice(0, 32) : null }, { merge: true });
    if (license.disabled === true) return response(res, 403, { state: "revoked", message: "This device license has been revoked." });
    if (license.approved !== true) return response(res, 403, { state: "pending", message: "This device is waiting for administrator approval." });
    const licenseExpiry = expiry(license.expireDate);
    if (!licenseExpiry || licenseExpiry.getTime() <= Date.now()) {
      return response(res, 403, { state: "expired", message: "This device license has expired." });
    }

    const offlineExpiry = new Date(Math.min(licenseExpiry.getTime(), Date.now() + maxOfflineDays * 24 * 60 * 60 * 1000));
    const key = await importPKCS8(signingPrivateKey.value(), "RS256");
    const token = await new SignJWT({
      applicationId,
      approved: true,
      customerName: typeof license.customerName === "string" ? license.customerName : undefined,
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer("viberent-license-service")
      .setAudience(audience)
      .setSubject(fingerprint)
      .setIssuedAt()
      .setExpirationTime(Math.floor(offlineExpiry.getTime() / 1000))
      .sign(key);
    return response(res, 200, { token });
  },
);
