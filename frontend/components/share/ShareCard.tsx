"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, Download, ImageIcon, LoaderCircle, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";
import { shareLink, type ShareChannel } from "@/lib/share-card";
import { cn } from "@/lib/utils";

const CHANNELS: Array<{ key: ShareChannel; label: string; path: string }> = [
  {
    key: "x",
    label: "X",
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    path: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
  },
  {
    key: "telegram",
    label: "Telegram",
    path: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  },
];

/** X, WhatsApp and Telegram as square links that open a prefilled post. */
export function ShareChannels({
  message,
  url,
  channels = ["x", "whatsapp", "telegram"],
  className,
}: {
  message: string;
  url: string;
  channels?: ShareChannel[];
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2", className)}>
      {CHANNELS.filter((channel) => channels.includes(channel.key)).map((channel) => (
        <a
          key={channel.key}
          href={shareLink(channel.key, message, url)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Share on ${channel.label}`}
          title={`Share on ${channel.label}`}
          className="group inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
            <path d={channel.path} />
          </svg>
          <span className="hidden sm:inline">{channel.label}</span>
        </a>
      ))}
    </div>
  );
}

/** Opens a dialog with a rendered card and every way to send it. */
export function ShareCardDialog({
  open,
  onOpenChange,
  title,
  description,
  filename,
  render,
  message,
  url,
  options,
  renderKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  filename: string;
  render: () => Promise<Blob>;
  message: string;
  url: string;
  /** Controls shown above the preview, such as a toggle for what the card shows. */
  options?: ReactNode;
  /** Change it to redraw the card, for example when an option changes. */
  renderKey?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content className="glass-card fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 focus:outline-none sm:p-6">
          <div className="mb-1 flex items-center justify-between gap-3">
            <Dialog.Title className="font-heading text-lg font-bold">{title}</Dialog.Title>
            <Dialog.Close
              className="flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-4 text-sm text-muted-foreground">
            {description}
          </Dialog.Description>
          {options ? <div className="mb-4">{options}</div> : null}
          {open ? (
            <ShareCardBody
              filename={filename}
              render={render}
              renderKey={renderKey}
              message={message}
              url={url}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ShareCardBody({
  filename,
  render,
  renderKey,
  message,
  url,
}: {
  filename: string;
  render: () => Promise<Blob>;
  renderKey?: string;
  message: string;
  url: string;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState<"link" | "image" | null>(null);
  // Draw once per opening and per renderKey; the parent's render closure
  // changes every render.
  const renderRef = useRef(render);
  renderRef.current = render;

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    renderRef
      .current()
      .then((image) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(image);
        setBlob(image);
        setPreview(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [renderKey]);

  const file = blob ? new File([blob], filename, { type: "image/png" }) : null;
  const canShareFile =
    typeof navigator !== "undefined" && Boolean(file && navigator.canShare?.({ files: [file] }));
  const canCopyImage = typeof ClipboardItem !== "undefined" && Boolean(navigator.clipboard?.write);

  const flash = (what: "link" | "image") => {
    setCopied(what);
    window.setTimeout(() => setCopied(null), 1_500);
  };

  const copyImage = async () => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("image");
    } catch {
      toast.error("Couldn't copy the image. Download it instead.");
    }
  };

  const copyLink = async () => {
    if (await copyToClipboard(url)) flash("link");
    else toast.error("Couldn't copy the link.");
  };

  const shareNative = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], text: `${message} ${url}` });
    } catch (error) {
      if ((error as Error).name !== "AbortError") toast.error("Couldn't open the share sheet.");
    }
  };

  const secondary =
    "inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-border px-3 text-xs font-semibold transition-colors hover:bg-card-hover focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

  return (
    <div className="space-y-4">
      <div className="relative aspect-[16/9] w-full border border-border bg-background">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob URL, not an optimisable asset
          <img src={preview} alt="Share card preview" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {failed ? (
              "Couldn't draw the card in this browser."
            ) : (
              <LoaderCircle className="h-5 w-5 animate-spin" aria-label="Drawing card" />
            )}
          </div>
        )}
      </div>

      <div>
        <p className="label mb-2">Post it</p>
        <ShareChannels message={message} url={url} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Links open a ready-to-send post. To attach the card, download or copy it first and paste it in.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {preview ? (
          <a
            href={preview}
            download={filename}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 bg-primary px-3 font-heading text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download PNG
          </a>
        ) : null}
        {canCopyImage ? (
          <button type="button" onClick={() => void copyImage()} disabled={!blob} className={secondary}>
            {copied === "image" ? <Check className="h-4 w-4 text-success" /> : <ImageIcon className="h-4 w-4" />}
            {copied === "image" ? "Image copied" : "Copy image"}
          </button>
        ) : null}
        {canShareFile ? (
          <button type="button" onClick={() => void shareNative()} className={secondary}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share image
          </button>
        ) : null}
        <button type="button" onClick={() => void copyLink()} className={secondary}>
          {copied === "link" ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          {copied === "link" ? "Link copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
