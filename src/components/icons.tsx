/**
 * Vendored icon set — Lucide (https://lucide.dev), ISC License.
 *
 * lucide-react is not part of the approved Wave 1 dependency set, so the
 * exact glyphs UI_DESIGN.md §3.6 assigns are vendored here as plain SVG
 * components (24 px grid, stroke-width 2, stroke = currentColor). Sizes are
 * applied by callers via the className size-* utilities per the design spec.
 * Icons are decorative by default (aria-hidden); interactive elements carry
 * their own accessible labels.
 */

import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

function createIcon(children: React.ReactNode) {
  function Icon(props: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {children}
      </svg>
    );
  }
  return Icon;
}

export const RefrigeratorIcon = createIcon(
  <>
    <path
      key="k0"
      d="M5 6a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Z"
    />
    <path key="k1" d="M5 10h14" />
    <path key="k2" d="M15 7v6" />
  </>,
);

export const PlusIcon = createIcon(
  <>
    <path key="k0" d="M5 12h14" />
    <path key="k1" d="M12 5v14" />
  </>,
);

export const ShoppingBasketIcon = createIcon(
  <>
    <path key="k0" d="m15 11-1 9" />
    <path key="k1" d="m19 11-4-7" />
    <path key="k2" d="M2 11h20" />
    <path
      key="k3"
      d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4"
    />
    <path key="k4" d="M4.5 15.5h15" />
    <path key="k5" d="m5 11 4-7" />
    <path key="k6" d="m9 11 1 9" />
  </>,
);

export const ScanBarcodeIcon = createIcon(
  <>
    <path key="k0" d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path key="k1" d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path key="k2" d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path key="k3" d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <path key="k4" d="M8 7v10" />
    <path key="k5" d="M12 7v10" />
    <path key="k6" d="M17 7v10" />
  </>,
);

export const SearchIcon = createIcon(
  <>
    <path key="k0" d="m21 21-4.34-4.34" />
    <circle key="k1" cx="11" cy="11" r="8" />
  </>,
);

export const SearchXIcon = createIcon(
  <>
    <path key="k0" d="m13.5 8.5-5 5" />
    <path key="k1" d="m8.5 8.5 5 5" />
    <circle key="k2" cx="11" cy="11" r="8" />
    <path key="k3" d="m21 21-4.3-4.3" />
  </>,
);

export const PencilLineIcon = createIcon(
  <>
    <path key="k0" d="M13 21h8" />
    <path key="k1" d="m15 5 4 4" />
    <path
      key="k2"
      d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
    />
  </>,
);

export const TriangleAlertIcon = createIcon(
  <>
    <path
      key="k0"
      d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"
    />
    <path key="k1" d="M12 9v4" />
    <path key="k2" d="M12 17h.01" />
  </>,
);

export const CircleCheckIcon = createIcon(
  <>
    <circle key="k0" cx="12" cy="12" r="10" />
    <path key="k1" d="m9 12 2 2 4-4" />
  </>,
);

export const CircleAlertIcon = createIcon(
  <>
    <circle key="k0" cx="12" cy="12" r="10" />
    <line key="k1" x1="12" x2="12" y1="8" y2="12" />
    <line key="k2" x1="12" x2="12.01" y1="16" y2="16" />
  </>,
);

export const RotateCcwIcon = createIcon(
  <>
    <path key="k0" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path key="k1" d="M3 3v5h5" />
  </>,
);

export const ArrowDownRightIcon = createIcon(
  <>
    <path key="k0" d="m7 7 10 10" />
    <path key="k1" d="M17 7v10H7" />
  </>,
);

export const Trash2Icon = createIcon(
  <>
    <path key="k0" d="M10 11v6" />
    <path key="k1" d="M14 11v6" />
    <path key="k2" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path key="k3" d="M3 6h18" />
    <path key="k4" d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>,
);

export const LogOutIcon = createIcon(
  <>
    <path key="k0" d="m16 17 5-5-5-5" />
    <path key="k1" d="M21 12H9" />
    <path key="k2" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
  </>,
);

export const HistoryIcon = createIcon(
  <>
    <path key="k0" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path key="k1" d="M3 3v5h5" />
    <path key="k2" d="M12 7v5l4 2" />
  </>,
);

export const CheckIcon = createIcon(
  <>
    <path key="k0" d="M20 6 9 17l-5-5" />
  </>,
);

export const MinusIcon = createIcon(
  <>
    <path key="k0" d="M5 12h14" />
  </>,
);

export const XIcon = createIcon(
  <>
    <path key="k0" d="M18 6 6 18" />
    <path key="k1" d="m6 6 12 12" />
  </>,
);

export const LoaderCircleIcon = createIcon(
  <>
    <path key="k0" d="M21 12a9 9 0 1 1-6.219-8.56" />
  </>,
);

export const WifiOffIcon = createIcon(
  <>
    <path key="k0" d="M12 20h.01" />
    <path key="k1" d="M8.5 16.429a5 5 0 0 1 7 0" />
    <path key="k2" d="M5 12.859a10 10 0 0 1 5.17-2.69" />
    <path key="k3" d="M19 12.859a10 10 0 0 0-2.007-1.523" />
    <path key="k4" d="M2 8.82a15 15 0 0 1 4.177-2.643" />
    <path key="k5" d="M22 8.82a15 15 0 0 0-11.288-3.764" />
    <path key="k6" d="m2 2 20 20" />
  </>,
);

export const CameraIcon = createIcon(
  <>
    <path
      key="k0"
      d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"
    />
    <circle key="k1" cx="12" cy="13" r="3" />
  </>,
);

export const MilkIcon = createIcon(
  <>
    <path key="k0" d="M8 2h8" />
    <path
      key="k1"
      d="M9 2v2.789a4 4 0 0 1-.672 2.219l-.656.984A4 4 0 0 0 7 10.212V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9.789a4 4 0 0 0-.672-2.219l-.656-.984A4 4 0 0 1 15 4.788V2"
    />
    <path key="k2" d="M7 15a6.472 6.472 0 0 1 5 0 6.47 6.47 0 0 0 5 0" />
  </>,
);

export const BeefIcon = createIcon(
  <>
    <path
      key="k0"
      d="M16.4 13.7A6.5 6.5 0 1 0 6.28 6.6c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c4 0 8.4-1.8 11.4-4.3"
    />
    <path
      key="k1"
      d="m18.5 6 2.19 4.5a6.48 6.48 0 0 1-2.29 7.2C15.4 20.2 11 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5"
    />
    <circle key="k2" cx="12.5" cy="8.5" r="2.5" />
  </>,
);

export const CarrotIcon = createIcon(
  <>
    <path
      key="k0"
      d="M15 16a1 1 0 0 0-7-7q-4 4-5.987 12.385a.5.5 0 0 0 .602.602Q11 20 15 16l-3-3"
    />
    <path key="k1" d="M15 9q4 4 7 0-3-4-7 0 4-4 0-7-4 3 0 7" />
    <path key="k2" d="m8 15-2.58-2.58" />
  </>,
);

export const AppleIcon = createIcon(
  <>
    <path key="k0" d="M12 6.528V3a1 1 0 0 1 1-1h0" />
    <path
      key="k1"
      d="M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21"
    />
  </>,
);

export const CupSodaIcon = createIcon(
  <>
    <path
      key="k0"
      d="m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8"
    />
    <path key="k1" d="M5 8h14" />
    <path key="k2" d="M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0" />
    <path key="k3" d="m12 8 1-6h2" />
  </>,
);

export const DropletsIcon = createIcon(
  <>
    <path
      key="k0"
      d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"
    />
    <path
      key="k1"
      d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"
    />
  </>,
);

export const CookieIcon = createIcon(
  <>
    <path key="k0" d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
    <path key="k1" d="M8.5 8.5v.01" />
    <path key="k2" d="M16 15.5v.01" />
    <path key="k3" d="M12 12v.01" />
    <path key="k4" d="M11 17v.01" />
    <path key="k5" d="M7 14v.01" />
  </>,
);

export const CookingPotIcon = createIcon(
  <>
    <path key="k0" d="M2 12h20" />
    <path key="k1" d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" />
    <path key="k2" d="m4 8 16-4" />
    <path
      key="k3"
      d="m8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8"
    />
  </>,
);

export const SnowflakeIcon = createIcon(
  <>
    <path key="k0" d="m10 20-1.25-2.5L6 18" />
    <path key="k1" d="M10 4 8.75 6.5 6 6" />
    <path key="k2" d="m14 20 1.25-2.5L18 18" />
    <path key="k3" d="m14 4 1.25 2.5L18 6" />
    <path key="k4" d="m17 21-3-6h-4" />
    <path key="k5" d="m17 3-3 6 1.5 3" />
    <path key="k6" d="M2 12h6.5L10 9" />
    <path key="k7" d="m20 10-1.5 2 1.5 2" />
    <path key="k8" d="M22 12h-6.5L14 15" />
    <path key="k9" d="m4 10 1.5 2L4 14" />
    <path key="k10" d="m7 21 3-6-1.5-3" />
    <path key="k11" d="m7 3 3 6h4" />
  </>,
);

export const WeightIcon = createIcon(
  <>
    <circle key="k0" cx="12" cy="5" r="3" />
    <path
      key="k1"
      d="M6.5 8a2 2 0 0 0-1.905 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8Z"
    />
  </>,
);

export const PackageIcon = createIcon(
  <>
    <path
      key="k0"
      d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"
    />
    <path key="k1" d="M12 22V12" />
    <polyline key="k2" points="3.29 7 12 12 20.71 7" />
    <path key="k3" d="m7.5 4.27 9 5.15" />
  </>,
);
