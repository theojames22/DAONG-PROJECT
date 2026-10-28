"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface IdCardTabProps {
  userId: string;
  userName: string;
  position?: string | null;
  avatarUrl: string | null;
  shortId: string;
}

const BRAND_BLUE = "#2563eb";

function loadImage(src: string, anonymous: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (anonymous) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the ID card onto a canvas at 2x scale and returns it. */
async function renderCardCanvas({
  avatarImg,
  name,
  qrImg,
  logoImg,
}: {
  avatarImg: HTMLImageElement | null;
  name: string;
  qrImg: HTMLImageElement;
  logoImg: HTMLImageElement | null;
}): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  const W = 640;
  const H = 880;
  const S = 2; // retina scale
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.scale(S, S);

  // Card surface
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, 20, 20, W - 40, H - 40, 32);
  ctx.fill();
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.stroke();

  const cx = W / 2;

  // Avatar (photo or initials fallback) with brand-blue ring
  const ay = 170;
  ctx.beginPath();
  ctx.arc(cx, ay, 66, 0, Math.PI * 2);
  ctx.fillStyle = "#eff6ff";
  ctx.fill();
  if (avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, ay, 60, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, cx - 60, ay - 60, 120, 120);
    ctx.restore();
  } else {
    ctx.fillStyle = BRAND_BLUE;
    ctx.font = "700 44px Manrope, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.charAt(0).toUpperCase(), cx, ay + 2);
  }
  ctx.beginPath();
  ctx.arc(cx, ay, 64, 0, Math.PI * 2);
  ctx.strokeStyle = BRAND_BLUE;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Name
  ctx.fillStyle = "#172033";
  ctx.font = "800 30px Manrope, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(name.toUpperCase(), cx, 268);

  // QR code
  const qrSize = 240;
  ctx.drawImage(qrImg, cx - qrSize / 2, 360, qrSize, qrSize);

  // Brand footer — logo (if it loaded) + DAONG
  const by = 660;
  if (logoImg) {
    ctx.drawImage(logoImg, cx - 14 - 58, by - 16, 32, 32);
  }
  ctx.fillStyle = "#172033";
  ctx.font = "800 20px Manrope, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("DAONG", logoImg ? cx - 14 - 16 : cx - 34, by - 8);

  // Tagline
  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 13px Manrope, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Ang Bawat Oras sa Paglalayag", cx, by + 26);

  return canvas;
}

export default function IdCardTab({
  userId,
  userName,
  position,
  avatarUrl,
  shortId,
}: IdCardTabProps) {
  const supabase = createClient();
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Load the employee's token and render their QR.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from("profiles")
          .select("qr_token")
          .eq("id", userId)
          .single();
        if (fetchError) throw fetchError;
        if (!data?.qr_token) throw new Error("No QR code on file yet.");

        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(data.qr_token, {
          width: 480,
          margin: 1,
          errorCorrectionLevel: "M",
        });
        if (!cancelled) setQr(url);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load your ID card. If the QR migration hasn't been run, ask your Head."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  async function handleDownload() {
    if (!qr) return;
    setDownloading(true);
    try {
      const [qrImg, logoImg, avatarImg] = await Promise.all([
        loadImage(qr, false),
        loadImage("/images/logo2.png", false),
        avatarUrl ? loadImage(avatarUrl, true) : Promise.resolve(null),
      ]);
      if (!qrImg) throw new Error("QR image unavailable");

      const canvas = await renderCardCanvas({
        avatarImg,
        name: userName,
        qrImg,
        logoImg,
      });

      // If the avatar tainted the canvas, redraw with initials instead.
      let blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png")
      );
      if (!blob) {
        const fallback = await renderCardCanvas({
          avatarImg: null,
          name: userName,
          qrImg,
          logoImg,
        });
        blob = await new Promise((resolve) =>
          fallback.toBlob((b) => resolve(b), "image/png")
        );
      }
      if (!blob) throw new Error("Could not export the card");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `daong-id-${shortId}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <ShieldCheck className="h-8 w-8 text-danger" />
        <p className="text-[13px] text-ink-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-2">
      {/* Heading row + download action */}
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent" />
          <h3 className="text-[14px] font-bold text-ink">Digital ID Card</h3>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!qr || downloading}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60"
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Download ID Card
        </button>
      </div>

      {/* The card itself */}
      <div className="neu-raised flex w-full max-w-[300px] flex-col items-center rounded-container px-8 py-8">
        {/* Avatar */}
        <div className="flex h-[128px] w-[128px] items-center justify-center rounded-full border-4 border-accent bg-accent-soft">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <span className="text-4xl font-bold text-accent-dark">
              {(userName || "?").charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Name + code */}
        <p className="mt-5 text-center text-[17px] font-extrabold tracking-wide text-ink">
          {(userName || "Employee").toUpperCase()}
        </p>
        {position && (
          <p className="mt-0.5 text-[11.5px] text-ink-subtle">{position}</p>
        )}

        {/* QR */}
        <div className="mt-5 flex h-[168px] w-[168px] items-center justify-center">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Your attendance QR code" className="h-[160px] w-[160px]" />
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-ink-subtle" />
          )}
        </div>

        {/* Brand footer */}
        <div className="mt-5 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo2.png" alt="" className="h-6 w-6 object-contain" />
          <span className="font-display text-[15px] font-extrabold tracking-tight text-ink">
            DAONG
          </span>
        </div>
      </div>

      <p className="text-[11.5px] text-ink-subtle">
        Show this card&apos;s QR to your Head when clocking in or out.
      </p>
    </div>
  );
}
