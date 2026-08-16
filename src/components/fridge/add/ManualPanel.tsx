"use client";

import { useState } from "react";

import { useToast } from "@/components/app-shell/Toaster";
import { CircleAlertIcon, LoaderCircleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/utils";
import { createManualProduct } from "@/lib/actions/products";
import { classifyBarcode } from "@/lib/barcode";
import { CATEGORIES } from "@/lib/types";
import type { Category, Product } from "@/lib/types";

import { CategoryIcon } from "../CategoryIcon";
import { ConfirmSheet } from "./ConfirmSheet";
import { UnitsStepper } from "./UnitsStepper";

/**
 * Manual mode (docs/UI_DESIGN.md §6.4.3): "a short favor, not a form". Name
 * is the only required field, so optional fields mark themselves — no
 * asterisks. Category is a tap-friendly chip grid, not an administrative
 * select. A duplicate barcode is NOT an error: the action returns the
 * existing product and the confirm sheet says so.
 *
 * Wave 3 readiness: scan handoffs arrive through `prefill`/`prefillVersion`
 * (bumped per handoff) — barcode prefills show a "From your scan" note.
 */

export interface ManualPrefill {
  name?: string;
  barcode?: string;
  fromScan?: boolean;
}

interface FieldErrors {
  name?: string;
  barcode?: string;
  brand?: string;
  packageSize?: string;
}

export function ManualPanel({
  prefill,
  prefillVersion,
}: {
  prefill: ManualPrefill;
  prefillVersion: number;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(prefill.name ?? "");
  const [brand, setBrand] = useState("");
  const [packageSize, setPackageSize] = useState("");
  const [barcode, setBarcode] = useState(prefill.barcode ?? "");
  const [fromScan, setFromScan] = useState(prefill.fromScan ?? false);
  const [category, setCategory] = useState<Category>("Other");
  const [units, setUnits] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [existing, setExisting] = useState<Product | null>(null);

  // Handoffs from Scan/Search land after mount; apply each version bump via
  // render-time state adjustment (no effect → no cascading render).
  const [appliedVersion, setAppliedVersion] = useState(prefillVersion);
  if (appliedVersion !== prefillVersion) {
    setAppliedVersion(prefillVersion);
    if (prefill.name !== undefined) setName(prefill.name);
    setBarcode(prefill.barcode ?? "");
    setFromScan(Boolean(prefill.fromScan && prefill.barcode));
    setErrors({});
  }

  function resetForm() {
    setName("");
    setBrand("");
    setPackageSize("");
    setBarcode("");
    setFromScan(false);
    setCategory("Other");
    setUnits(1);
    setErrors({});
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    const trimmedName = name.trim();
    const trimmedBarcode = barcode.trim();
    const nextErrors: FieldErrors = {};

    if (trimmedName.length === 0) {
      nextErrors.name = "Give it a name and you're done.";
    }
    if (trimmedBarcode.length > 0) {
      const classified = classifyBarcode(trimmedBarcode);
      if (classified.kind === "invalid") {
        nextErrors.barcode =
          "That code doesn't look right — check the digits under the lines.";
      } else if (classified.kind === "rcn") {
        nextErrors.barcode =
          "That's a store-printed code for weighed items — leave the barcode empty.";
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setPending(true);
    const result = await createManualProduct({
      name: trimmedName,
      barcode: trimmedBarcode.length > 0 ? trimmedBarcode : undefined,
      brand: brand.trim() || undefined,
      packageSize: packageSize.trim() || undefined,
      category,
      addUnits: units,
    });
    setPending(false);

    if (!result.ok) {
      const fieldErrors = result.error.fieldErrors ?? {};
      setErrors({
        name: fieldErrors.name?.[0],
        barcode: fieldErrors.barcode?.[0],
        brand: fieldErrors.brand?.[0],
        packageSize: fieldErrors.packageSize?.[0],
      });
      if (result.error.code !== "validation") {
        toast({ message: result.error.message, tone: "destructive" });
      }
      return;
    }

    if (result.data.existed) {
      // Duplicate barcode → the standard confirm sheet, informational mode.
      setExisting(result.data.product);
    } else {
      toast({
        message: `Added ${result.data.product.name}${units > 1 ? ` ×${units}` : ""}`,
      });
    }
    resetForm();
  }

  return (
    <>
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <Field id="mf-name" label="Product name" error={errors.name}>
          <Input
            id="mf-name"
            dir="auto"
            placeholder="e.g. קוטג' תנובה 5%"
            maxLength={80}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
            }}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "mf-name-error" : undefined}
          />
        </Field>

        <Field id="mf-brand" label="Brand" optional error={errors.brand}>
          <Input
            id="mf-brand"
            dir="auto"
            placeholder="e.g. תנובה"
            maxLength={60}
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            aria-invalid={errors.brand ? true : undefined}
            aria-describedby={errors.brand ? "mf-brand-error" : undefined}
          />
        </Field>

        <Field
          id="mf-size"
          label="Package size"
          optional
          error={errors.packageSize}
        >
          <Input
            id="mf-size"
            placeholder="e.g. 250 g / 1 L"
            maxLength={30}
            value={packageSize}
            onChange={(event) => setPackageSize(event.target.value)}
            aria-invalid={errors.packageSize ? true : undefined}
            aria-describedby={errors.packageSize ? "mf-size-error" : undefined}
          />
        </Field>

        <fieldset>
          <legend className="text-sm font-medium">Category</legend>
          <div
            role="radiogroup"
            aria-label="Category"
            className="mt-1.5 flex flex-wrap gap-2"
          >
            {CATEGORIES.map((option) => {
              const selected = category === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setCategory(option)}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-accent",
                  )}
                >
                  <CategoryIcon category={option} className="size-4" />
                  {option}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field
          id="mf-barcode"
          label="Barcode"
          optional
          error={errors.barcode}
          note={fromScan ? "From your scan" : undefined}
        >
          <Input
            id="mf-barcode"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 7290000066318"
            maxLength={20}
            value={barcode}
            onChange={(event) => {
              setBarcode(event.target.value);
              setFromScan(false);
              if (errors.barcode)
                setErrors((e) => ({ ...e, barcode: undefined }));
            }}
            aria-invalid={errors.barcode ? true : undefined}
            aria-describedby={errors.barcode ? "mf-barcode-error" : undefined}
          />
        </Field>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Units</span>
          <UnitsStepper value={units} onChange={setUnits} disabled={pending} />
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
              Adding…
            </>
          ) : (
            "Add to fridge"
          )}
        </Button>
      </form>

      <ConfirmSheet
        open={existing !== null}
        onClose={() => setExisting(null)}
        product={existing}
        note="Already in the catalog — added your units."
        showStepper={false}
        confirmLabel="Done"
        onConfirm={async () => setExisting(null)}
      />
    </>
  );
}

function Field({
  id,
  label,
  optional = false,
  error,
  note,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {optional && (
          <span className="font-normal text-muted-foreground"> (optional)</span>
        )}
      </label>
      {children}
      {note && !error && (
        <p className="text-xs text-muted-foreground">{note}</p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          className="flex items-center gap-1 text-xs text-destructive"
        >
          <CircleAlertIcon className="size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
