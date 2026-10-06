import "server-only";

import fs from "node:fs";
import PDFDocument from "pdfkit";
import { sqlite } from "@/db/connection";
import { composeTermsSnapshot, normalizeAgreementConfig, type AgreementDesignConfig, type AgreementSectionId } from "@/lib/agreement-config";
import type { RequestContext } from "@/server/context/request-context";
import { DomainError } from "@/server/domain/errors";
import { wrapRtlText } from "@/server/documents/rtl-text";

type AgreementRow = {
  publicNumber: number | null;
  pickupAt: string;
  returnAt: string;
  dailyRate: number;
  totalAmount: number;
  depositRequired: number;
  destinationCity: string;
  rentalMode: string;
  renterSkipped: number;
  terms: string;
  agency: string;
  agencyPhone: string | null;
  agencyEmail: string | null;
  agencyAddress: string | null;
  registrationNumber: string | null;
  taxNumber: string | null;
  agreementConfig: string | null;
  legacyTerms: string;
  logo: string | null;
  customer: string;
  customerFatherName: string | null;
  customerPhone: string;
  customerCnic: string;
  vehicle: string;
  plate: string;
  chassisNumber: string | null;
  engineNumber: string | null;
  driver: string | null;
  driverPhone: string | null;
  driverCnic: string | null;
  driverLicense: string | null;
  initialOdometer: number | null;
};

type PdfFonts = { regular: string; bold: string; urdu?: string };
const pageWidth = 595.28;
const contentWidth = 507;

export async function createRentalAgreementPdf(context: RequestContext, bookingId: string): Promise<{ bytes: Buffer; fileName: string; customerPhone: string }> {
  const row = sqlite.prepare(`
    SELECT b.public_number AS publicNumber,b.pickup_at AS pickupAt,b.return_at AS returnAt,
      b.daily_rate AS dailyRate,b.total_amount AS totalAmount,b.deposit_required AS depositRequired,
      b.destination_city AS destinationCity,b.rental_mode AS rentalMode,b.renter_skipped AS renterSkipped,
      b.terms_snapshot AS terms,a.name AS agency,a.phone AS agencyPhone,a.public_email AS agencyEmail,
      a.address AS agencyAddress,a.registration_number AS registrationNumber,a.tax_number AS taxNumber,
      a.agreement_config AS agreementConfig,a.rental_terms AS legacyTerms,o.logo,
      c.name AS customer,c.father_name AS customerFatherName,c.phone_normalized AS customerPhone,c.cnic_normalized AS customerCnic,
      v.make||' '||v.model||' '||v.year AS vehicle,v.plate,v.chassis_number AS chassisNumber,
      v.engine_number AS engineNumber,d.name AS driver,d.phone_normalized AS driverPhone,
      d.cnic_normalized AS driverCnic,d.license_number AS driverLicense,
      (SELECT ri.odometer FROM rental_inspections ri WHERE ri.agency_id=b.agency_id AND ri.booking_id=b.id AND ri.kind='checkout' LIMIT 1) AS initialOdometer
    FROM bookings b
    JOIN agencies a ON a.id=b.agency_id
    LEFT JOIN organization o ON o.id=b.agency_id
    JOIN customers c ON c.id=b.customer_id AND c.agency_id=b.agency_id
    JOIN vehicles v ON v.id=b.vehicle_id AND v.agency_id=b.agency_id
    LEFT JOIN drivers d ON d.id=b.driver_id AND d.agency_id=b.agency_id
    WHERE b.agency_id=? AND b.id=?
  `).get(context.agencyId, bookingId) as AgreementRow | undefined;
  if (!row) throw new DomainError("NOT_FOUND", "Booking not found.", 404);

  const config = normalizeAgreementConfig(parseConfig(row.agreementConfig), row.legacyTerms);
  const doc = new PDFDocument({ size: "A4", margin: 44, bufferPages: true, info: { Title: `${config.titleEn} #${row.publicNumber ?? bookingId}`, Author: row.agency } });
  const fonts = registerFonts(doc);
  const chunks: Buffer[] = [];
  doc.on("data", chunk => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });

  renderHeader(doc, fonts, row, config);
  for (const section of config.sections.filter(item => item.enabled)) {
    renderSection(doc, fonts, row, config, section.id, section.titleEn, section.titleUr);
  }
  renderFooter(doc, fonts, config);
  doc.end();
  return { bytes: await completed, fileName: `rental-agreement-${row.publicNumber ?? bookingId}.pdf`, customerPhone: row.customerPhone };
}

function renderHeader(doc: PDFKit.PDFDocument, fonts: PdfFonts, row: AgreementRow, config: AgreementDesignConfig) {
  const accent = config.accentColor;
  if (config.showPageBorder) doc.rect(24, 24, pageWidth - 48, 793.89).lineWidth(1.5).strokeColor(accent).stroke();
  let textX = 44;
  if (config.showLogo && row.logo?.startsWith("data:image/")) {
    try { doc.image(Buffer.from(row.logo.split(",")[1] ?? "", "base64"), 44, 38, { fit: [72, 50] }); textX = 126; } catch { textX = 44; }
  }
  doc.font(fonts.bold).fontSize(17).fillColor("#19191F").text(row.agency, textX, 40, { width: 551 - textX, align: config.template === "classic" ? "center" : "left" });
  const contacts = [row.agencyAddress, row.agencyPhone, row.agencyEmail].filter(Boolean).join(" · ");
  doc.font(fonts.regular).fontSize(8.5).fillColor("#667085").text(contacts, textX, 64, { width: 551 - textX, align: config.template === "classic" ? "center" : "left" });
  if (config.showRegistration) doc.fontSize(7.5).fillColor("#98A2B3").text([row.registrationNumber, row.taxNumber].filter(Boolean).join(" · "), textX, 78, { width: 551 - textX });
  doc.moveTo(44, 101).lineTo(551, 101).strokeColor(accent).lineWidth(config.template === "minimal" ? 1 : 2.5).stroke();
  const bilingual = config.language === "bilingual";
  if (config.language !== "ur") doc.font(fonts.bold).fontSize(16).fillColor(accent).text(config.titleEn, 44, 116, { width: bilingual ? 250 : 360 });
  if (config.language !== "en") urduText(doc, fonts, config.titleUr, bilingual ? 305 : 44, 112, bilingual ? 246 : contentWidth, 17, accent);
  doc.font(fonts.bold).fontSize(9).fillColor("#344054").text(`Booking #${row.publicNumber ?? "—"}`, 420, 142, { width: 131, align: "right" });
  doc.y = 168;
}

function renderSection(doc: PDFKit.PDFDocument, fonts: PdfFonts, row: AgreementRow, config: AgreementDesignConfig, id: AgreementSectionId, titleEn: string, titleUr: string) {
  const estimated = id === "terms" ? 125 : id === "signatures" ? 76 : 72;
  ensureSpace(doc, estimated, config);
  const y = doc.y;
  const terms = id === "terms" ? resolveTermsSnapshot(row.terms, config) : "";
  const parsedTerms = splitSnapshot(terms);
  const showEnglish = id === "terms" ? Boolean(parsedTerms.english) : config.language !== "ur";
  const showUrdu = id === "terms" ? Boolean(parsedTerms.urdu) : config.language !== "en";
  if (showEnglish) doc.font(fonts.bold).fontSize(9.5).fillColor(config.accentColor).text(titleEn.toUpperCase(), 44, y, { width: 245 });
  if (showUrdu) urduText(doc, fonts, titleUr, 305, y - 4, 246, 11, config.accentColor);
  doc.moveTo(44, y + 16).lineTo(551, y + 16).strokeColor(`${config.accentColor}55`).lineWidth(0.6).stroke();
  doc.y = y + 20;
  if (id === "terms") return renderTerms(doc, fonts, terms, config);
  if (id === "signatures") return renderSignatures(doc, fonts, config);
  const fields = detailFields(id, row);
  const columns = 3;
  const gap = 8;
  const fieldWidth = (contentWidth - gap * (columns - 1)) / columns;
  const rowHeight = config.density === "compact" ? 23 : 25;
  const baseY = doc.y;
  fields.forEach((field, index) => {
    const column = index % columns;
    const line = Math.floor(index / columns);
    const x = 44 + column * (fieldWidth + gap);
    const top = baseY + line * rowHeight;
    doc.roundedRect(x, top, fieldWidth, rowHeight - 4, 3).fillColor("#F8FAFC").fill();
    if(config.language==="ur")urduText(doc,fonts,field.ur,x+7,top+1,fieldWidth-14,6.2,"#667085",-1);
    else doc.font(fonts.regular).fontSize(6.2).fillColor("#667085").text(field.en, x + 7, top + 3, { width: fieldWidth - 14, lineGap: 0 });
    doc.font(fonts.bold).fontSize(7.4).fillColor("#19191F").text(field.value, x + 7, top + 11, { width: fieldWidth - 14, ellipsis: true, lineBreak: false });
  });
  doc.y = baseY + Math.ceil(fields.length / columns) * rowHeight + 5;
}

function renderTerms(doc: PDFKit.PDFDocument, fonts: PdfFonts, snapshot: string, config: AgreementDesignConfig) {
  const { english, urdu } = splitSnapshot(snapshot);
  const startY = doc.y;
  const bilingual = Boolean(english && urdu);
  let englishBottom = startY;
  if (english) {
    doc.font(fonts.regular).fontSize(config.density === "compact" ? 6.8 : 7.2).fillColor("#344054").text(english, 44, startY, { width: bilingual ? 242 : contentWidth, lineGap: 0.5 });
    englishBottom = doc.y;
  }
  let urduBottom = startY;
  if (urdu) {
    const cleanUrdu = urdu.split("\n").map(line => line.replace(/^\s*\d+[.)]\s*/, "")).join("\n");
    urduText(doc, fonts, cleanUrdu, bilingual ? 309 : 44, startY, bilingual ? 242 : contentWidth, config.density === "compact" ? 7.5 : 8, "#344054", 0.5);
    urduBottom = doc.y;
  }
  doc.y = Math.max(englishBottom, urduBottom) + 9;
}

function renderSignatures(doc: PDFKit.PDFDocument, fonts: PdfFonts, config: AgreementDesignConfig) {
  const labels = [
    config.signatures.customer && ["Customer / Renter", "کرایہ دار"],
    config.signatures.representative && ["Agency representative", "ادارے کا نمائندہ"],
    config.signatures.witness && ["Witness", "گواہ"],
  ].filter(Boolean) as string[][];
  const gap = 18;
  const width = (contentWidth - gap * Math.max(0, labels.length - 1)) / Math.max(1, labels.length);
  const baseY = doc.y;
  labels.forEach(([en, ur], index) => {
    const x = 44 + index * (width + gap);
    doc.moveTo(x, baseY + 35).lineTo(x + width, baseY + 35).strokeColor("#98A2B3").lineWidth(0.7).stroke();
    if(config.language==="ur")urduText(doc,fonts,ur,x,baseY+38,width,8,"#475467",0);
    else doc.font(fonts.regular).fontSize(8).fillColor("#475467").text(en, x, baseY + 40, { width, lineBreak:false });
    doc.fontSize(7).fillColor("#98A2B3").text("Date: __________", x, baseY + 54, { width, lineBreak:false });
  });
  doc.y = baseY + 68;
}

function renderFooter(doc: PDFKit.PDFDocument, fonts: PdfFonts, config: AgreementDesignConfig) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    if (config.language !== "ur") doc.font(fonts.regular).fontSize(7).fillColor("#98A2B3").text(config.footerEn, 44, 776, { width: config.language === "bilingual" ? 246 : contentWidth, align: config.language === "bilingual" ? "left" : "center", lineBreak: false });
    if (config.language !== "en") urduText(doc,fonts,config.footerUr,config.language === "bilingual" ? 305 : 44,772,config.language === "bilingual" ? 246 : contentWidth,7,"#98A2B3",0);
    doc.font(fonts.regular).fontSize(6.5).text(`Generated by VibeRent - Page ${index - range.start + 1} of ${range.count}`, 44, 788, { width: contentWidth, align: "center" });
  }
}

function detailFields(id: Exclude<AgreementSectionId, "terms" | "signatures">, row: AgreementRow) {
  const map = {
    rental: [field("Pickup", "روانگی", date(row.pickupAt)), field("Return", "واپسی", date(row.returnAt)), field("Destination", "منزل", row.destinationCity), field("Rental type", "کرایہ کی قسم", row.rentalMode === "with_driver" ? "With driver" : "Self drive")],
    renter: row.renterSkipped ? [field("Renter", "کرایہ دار", "With-driver guest details not recorded")] : [field("Name", "نام", row.customer), field("Father name", "والد کا نام", row.customerFatherName || "Not recorded"), field("CNIC", "شناختی کارڈ", formatCnic(row.customerCnic)), field("Phone", "فون", row.customerPhone)],
    vehicle: [field("Vehicle", "گاڑی", row.vehicle), field("Registration", "رجسٹریشن", row.plate), field("Initial odometer", "ابتدائی اوڈومیٹر", row.initialOdometer === null ? "Not recorded" : `${row.initialOdometer.toLocaleString("en-PK")} km`), field("Chassis number", "چیسز نمبر", row.chassisNumber || "Not recorded"), field("Engine number", "انجن نمبر", row.engineNumber || "Not recorded")],
    charges: [field("Daily rate", "یومیہ کرایہ", money(row.dailyRate)), field("Deposit", "ضمانت", money(row.depositRequired)), field("Rental total", "کل رقم", money(row.totalAmount)), field("Currency", "کرنسی", "PKR")],
  };
  return map[id];
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number, config: AgreementDesignConfig) {
  if (doc.y + height < 770) return;
  doc.addPage();
  if (config.showPageBorder) doc.rect(24, 24, pageWidth - 48, 793.89).lineWidth(1.5).strokeColor(config.accentColor).stroke();
  doc.y = 48;
}

function registerFonts(doc: PDFKit.PDFDocument): PdfFonts {
  const fonts: PdfFonts = { regular: "Helvetica", bold: "Helvetica-Bold" };
  const urdu = ["/System/Library/Fonts/SFArabic.ttf", "/usr/share/fonts/truetype/noto/NotoNastaliqUrdu-Regular.ttf", "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf"].find(path => fs.existsSync(path));
  if (urdu) { try { doc.registerFont("VibeRentUrdu", urdu); fonts.urdu = "VibeRentUrdu"; } catch { /* Helvetica fallback remains available. */ } }
  return fonts;
}

function urduText(doc: PDFKit.PDFDocument, fonts: PdfFonts, value: string, x: number, y: number, width: number, size: number, color: string, lineGap = 3) {
  doc.font(fonts.urdu ?? fonts.regular).fontSize(size).fillColor(color);
  const lines=wrapRtlText(value,candidate=>doc.widthOfString(candidate)<=width);
  const lineHeight=doc.currentLineHeight()+lineGap;
  lines.forEach((line,index)=>{
    let right=x+width;
    const spaceWidth=doc.widthOfString(" ");
    for(const word of line.split(/\s+/).filter(Boolean)){
      const wordWidth=doc.widthOfString(word);
      doc.text(word,right-wordWidth,y+index*lineHeight,{width:wordWidth,lineBreak:false});
      right-=wordWidth+spaceWidth;
    }
  });
  doc.y=y+lines.length*lineHeight;
}

function splitSnapshot(value: string) {
  const urduHeading = value.indexOf("شرائط و ضوابط");
  if (urduHeading >= 0) return { english: value.slice(0, urduHeading).replace(/^Terms and conditions\s*/i, "").trim(), urdu: value.slice(urduHeading + "شرائط و ضوابط".length).trim() };
  return hasUrdu(value) ? { english: "", urdu: value } : { english: value.replace(/^Terms and conditions\s*/i, "").trim(), urdu: "" };
}

function resolveTermsSnapshot(snapshot: string, config: AgreementDesignConfig) {
  return snapshot.trim() || composeTermsSnapshot(config);
}

function parseConfig(value: string | null) { try { return value ? JSON.parse(value) : undefined; } catch { return undefined; } }
function field(en: string, ur: string, value: string) { return { en, ur, value }; }
function formatCnic(value: string) { const digits=value.replace(/\D/g,"");return digits.length===13?`${digits.slice(0,5)}-${digits.slice(5,12)}-${digits.slice(12)}`:value||"Not recorded"; }
function money(value: number) { return `PKR ${value.toLocaleString("en-PK")}`; }
function date(value: string) { return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(new Date(value)); }
function hasUrdu(value: string) { return /[\u0600-\u06ff]/.test(value); }
