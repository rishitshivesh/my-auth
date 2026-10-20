"use client";

import { use, useEffect, useRef, useState } from "react";
import { PortalLayout } from "@/components/layouts/portal-layout";
import { SentryInput as Input, SentryButton as Button, Label, SentrySkeleton } from "@repo/ui";



import { useBranding, useUpdateBranding, useUploadLogo } from "@/lib/queries";
import { FONT_FAMILY_OPTIONS } from "@/lib/types";
import type { BrandingConfig } from "@/lib/types";
import { getErrorMessage } from "@/lib/api-error";

// ── Minimal toast ─────────────────────────────────────────────
type ToastKind = "success" | "error";
function Toast({ message, kind }: { message: string; kind: ToastKind }) {
  return (
    <div
      role="alert"
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${
        kind === "success" ? "bg-green-600" : "bg-red-600"
      }`}
    >
      {kind === "success" ? "✓" : "✕"} {message}
    </div>
  );
}

export default function BrandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data: branding, isLoading } = useBranding();
  const updateBranding = useUpdateBranding();
  const uploadLogo = useUploadLogo();

  const [form, setForm] = useState<Partial<BrandingConfig>>({});
  const [toast, setToast] = useState<{
    message: string;
    kind: ToastKind;
  } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Populate form once data arrives
  useEffect(() => {
    if (branding && Object.keys(form).length === 0) {
      setForm(branding);
    }
  }, [branding]); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(message: string, kind: ToastKind) {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSave() {
    try {
      await updateBranding.mutateAsync(form);
      showToast("Branding saved successfully", "success");
    } catch (err: unknown) {
      showToast(
        getErrorMessage(err, "Failed to save branding"),
        "error",
      );
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { logoUrl } = await uploadLogo.mutateAsync(file);
      setForm((prev) => ({ ...prev, logoUrl }));
      showToast("Logo uploaded", "success");
    } catch (err: unknown) {
      showToast(
        getErrorMessage(err, "Logo upload failed"),
        "error",
      );
    }
  }

  const isSaving = updateBranding.isPending;
  const primaryColor = form.primaryColor ?? "#6366f1";

  return (
    <PortalLayout
      tenantSlug={slug}
      pageTitle="Branding"
      pageSubtitle="Customize the look and feel of your auth screens"
      currentPath={`/t/${slug}/branding`}
      primaryAction={{
        label: isSaving ? "Saving…" : "Save Changes",
        onClick: handleSave,
      }}
    >
      {toast && <Toast message={toast.message} kind={toast.kind} />}

      <div className="space-y-6">
        {/* Logo & Colors */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold text-foreground">
            Logo &amp; Colors
          </h3>

          {isLoading ? (
            <div className="space-y-4">
              <SentrySkeleton className="h-10 w-full" />
              <SentrySkeleton className="h-10 w-full" />
            </div>
          ) : (

            <div className="grid gap-6 md:grid-cols-2">
              {/* Logo */}
              <div className="space-y-2">
                <Label>Logo</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://example.com/logo.png"
                    value={form.logoUrl ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, logoUrl: e.target.value }))
                    }
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadLogo.isPending}
                  >
                    {uploadLogo.isPending ? "Uploading…" : "Upload"}
                  </Button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, or SVG · max 500 KB
                </p>
              </div>

              {/* Primary Color */}
              <div className="space-y-2">
                <Label htmlFor="primary">Primary Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="primary"
                    type="color"
                    value={primaryColor}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, primaryColor: e.target.value }))
                    }
                    className="h-10 w-20"
                  />
                  <Input
                    placeholder="#6366f1"
                    value={primaryColor}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, primaryColor: e.target.value }))
                    }
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                </div>
              </div>

              {/* Font Family */}
              <div className="space-y-2">
                <Label htmlFor="fontFamily">Font Family</Label>
                <select
                  id="fontFamily"
                  value={form.fontFamily ?? "Inter"}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, fontFamily: e.target.value }))
                  }
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  {FONT_FAMILY_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              {/* Header Weight */}
              <div className="space-y-2">
                <Label>Header Weight</Label>
                <div className="flex gap-3">
                  {(["regular", "bold"] as const).map((w) => (
                    <label
                      key={w}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="headerWeight"
                        value={w}
                        checked={(form.headerWeight ?? "bold") === w}
                        onChange={() =>
                          setForm((p) => ({ ...p, headerWeight: w }))
                        }
                      />
                      <span
                        className={`text-sm capitalize ${w === "bold" ? "font-bold" : "font-normal"}`}
                      >
                        {w}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Background Style */}
              <div className="space-y-2">
                <Label>Background Style</Label>
                <div className="flex gap-3">
                  {(["solid", "gradient"] as const).map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="backgroundStyle"
                        value={s}
                        checked={(form.backgroundStyle ?? "solid") === s}
                        onChange={() =>
                          setForm((p) => ({ ...p, backgroundStyle: s }))
                        }
                      />
                      <span className="text-sm capitalize">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">
            Preview
          </h3>
          <div
            className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-border"
            style={{
              background:
                form.backgroundStyle === "gradient"
                  ? `linear-gradient(135deg, ${primaryColor}22, ${primaryColor}55)`
                  : undefined,
            }}
          >
            <div className="text-center space-y-3">
              {form.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.logoUrl}
                  alt="Logo preview"
                  className="mx-auto h-12 object-contain"
                />
              ) : (
                <div
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg font-bold text-white text-lg"
                  style={{ backgroundColor: primaryColor }}
                >
                  SS
                </div>
              )}
              <p
                className={`text-base ${(form.fontFamily ?? "Inter") === "system-ui" ? "" : "font-sans"}`}
                style={{
                  fontFamily: form.fontFamily ?? "Inter",
                  fontWeight:
                    (form.headerWeight ?? "bold") === "bold" ? 700 : 400,
                  color: primaryColor,
                }}
              >
                Welcome back
              </p>
              <p className="text-xs text-muted-foreground">
                Secured by Scrolloop Sentry
              </p>
            </div>
          </div>
        </div>

        {/* Save button (bottom) */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </PortalLayout>
  );
}
