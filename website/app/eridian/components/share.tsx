'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import qrcode from 'qrcode-generator';
import { Btn } from '../../learn/components/controls';

/** True only after hydration on the client — without setState-in-effect, so
 * client-only content (a QR built from window.location) renders on the second
 * pass with no server/client mismatch. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/*
 * Sharing helpers for pairing a phone with the console — a QR to scan and a
 * share/copy button. Both resolve a site-relative path to an absolute URL at
 * call time, so they work in dev (localhost) and in production without knowing
 * the origin ahead of render.
 */

function absoluteUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).toString();
}

/** Share a page via the native share sheet, falling back to copy-to-clipboard. */
export function ShareButton({
  path,
  title,
  label = 'Share link',
}: {
  path: string;
  title: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = absoluteUrl(path);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Share sheet dismissed or unsupported — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (e.g. insecure context) — nothing more we can do.
    }
  }

  return <Btn onClick={() => void share()}>{copied ? '✓ Link copied' : label}</Btn>;
}

/**
 * A QR code for a site-relative path — scan it with a phone to open the page
 * there. Rendered dark-on-white regardless of theme (QR scanners need the
 * contrast), built client-side once mounted.
 */
export function QrCode({ path, size = 148, alt }: { path: string; size?: number; alt: string }) {
  const hydrated = useHydrated();
  const dataUrl = useMemo(() => {
    if (!hydrated) return null;
    const qr = qrcode(0, 'M');
    qr.addData(absoluteUrl(path));
    qr.make();
    return qr.createDataURL(5, 2);
  }, [hydrated, path]);

  if (!dataUrl) return <div style={{ width: size, height: size }} aria-hidden />;
  return (
    <img
      src={dataUrl}
      alt={alt}
      width={size}
      height={size}
      className="rounded-sm bg-white p-2"
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
    />
  );
}
