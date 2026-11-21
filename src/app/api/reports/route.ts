import { NextResponse } from "next/server";
import { clientIp, handleRoute, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { ReportSubmissionSchema } from "@/lib/validations/schemas";
import { MAX_IMAGE_BYTES, ImageValidationError } from "@/lib/storage/images";
import { submitReport, SubmissionError } from "@/lib/workflows/report-intake";
import { env, providerStatus } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Public: students submit reports without an account. Location comes from the QR slug only. */
export const POST = handleRoute(async (req: Request) => {
  const ip = clientIp(req);
  if (!(await rateLimit("report-ip", ip, 12, 600))) throw new HttpError(429, "Too many reports from this network. Please wait a few minutes.");

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMAGE_BYTES + 64_000) throw new HttpError(413, "The upload is too large (max 5 MB photo).");

  const form = await req.formData();
  const fields = ReportSubmissionSchema.parse({
    qrSlug: form.get("qrSlug"),
    selectedAssetId: form.get("selectedAssetId") || null,
    description: form.get("description"),
    additionalDetails: form.get("additionalDetails") || null,
    reporterName: form.get("reporterName"),
    reporterEmail: form.get("reporterEmail"),
  });
  if (!(await rateLimit("report-email", fields.reporterEmail.toLowerCase(), 6, 600))) {
    throw new HttpError(429, "You have submitted several reports in a short time. Please wait a few minutes.");
  }

  const file = form.get("photo");
  let image: Uint8Array | null = null;
  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > MAX_IMAGE_BYTES) throw new HttpError(413, "The photo is larger than 5 MB.");
    image = new Uint8Array(await file.arrayBuffer());
  }

  try {
    const result = await submitReport({ ...fields, image });
    // Only student-safe fields are returned.
    return NextResponse.json(
      {
        reportNumber: result.reportNumber,
        ticketNumber: result.ticketNumber,
        ticketStatus: result.ticketStatus,
        category: result.category,
        priority: result.priority,
        safetyLevel: result.safetyLevel,
        linkedReports: result.linkedReports,
        linkStatus: result.linkStatus,
        trackingUrl: result.trackingUrl,
        aiMode: result.aiMode,
        emailedTo: fields.reporterEmail.toLowerCase(),
        emailDelivery: providerStatus().email,
        // Demo mode only: the simulated confirmation e-mail can be viewed via the student's own token.
        emailPreviewUrl: env().DEMO_TOOLS_ENABLED === "true" && providerStatus().email !== "live" ? `${result.trackingUrl}/emails` : null,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ImageValidationError) throw new HttpError(415, err.message);
    if (err instanceof SubmissionError) throw new HttpError(err.status, err.message);
    throw err;
  }
});
