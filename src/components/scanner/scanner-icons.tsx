/**
 * Scanner-local vendored icons — Lucide (https://lucide.dev), ISC License.
 *
 * Same approach and glyph sources as the shared src/components/icons.tsx
 * (lucide-react is not in the approved dependency set), but kept inside the
 * scanner's owned directory so Wave 2 agents never edit the same file.
 * UI_DESIGN.md §3.6 assignments used here: Camera / CameraOff for camera
 * states, Flashlight / FlashlightOff for the torch, CircleCheck for detected
 * feedback, TriangleAlert for errors, LoaderCircle for the pending spinner.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

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

export const CameraIcon = createIcon(
  <>
    <path
      key="k0"
      d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"
    />
    <circle key="k1" cx="12" cy="13" r="3" />
  </>,
);

export const CameraOffIcon = createIcon(
  <>
    <path key="k0" d="M14.564 14.558a3 3 0 1 1-4.122-4.121" />
    <path key="k1" d="m2 2 20 20" />
    <path
      key="k2"
      d="M20 20H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 .819-.175"
    />
    <path
      key="k3"
      d="M9.695 4.024A2 2 0 0 1 10.004 4h3.993a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v7.344"
    />
  </>,
);

export const FlashlightIcon = createIcon(
  <>
    <path key="k0" d="M12 13v1" />
    <path
      key="k1"
      d="M17 2a1 1 0 0 1 1 1v4a3 3 0 0 1-.6 1.8l-.6.8A4 4 0 0 0 16 12v8a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-8a4 4 0 0 0-.8-2.4l-.6-.8A3 3 0 0 1 6 7V3a1 1 0 0 1 1-1z"
    />
    <path key="k2" d="M6 6h12" />
  </>,
);

export const FlashlightOffIcon = createIcon(
  <>
    <path key="k0" d="M11.652 6H18" />
    <path key="k1" d="M12 13v1" />
    <path
      key="k2"
      d="M16 16v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8a4 4 0 0 0-.8-2.4l-.6-.8A3 3 0 0 1 6 7V6"
    />
    <path key="k3" d="m2 2 20 20" />
    <path
      key="k4"
      d="M7.649 2H17a1 1 0 0 1 1 1v4a3 3 0 0 1-.6 1.8l-.6.8a4 4 0 0 0-.55 1.007"
    />
  </>,
);

export const CircleCheckIcon = createIcon(
  <>
    <circle key="k0" cx="12" cy="12" r="10" />
    <path key="k1" d="m9 12 2 2 4-4" />
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

export const LoaderCircleIcon = createIcon(
  <path key="k0" d="M21 12a9 9 0 1 1-6.219-8.56" />,
);
