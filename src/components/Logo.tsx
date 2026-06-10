"use client";

// ─── Logo ─────────────────────────────────────────────────────────────────────
// The original SVG has a hardcoded black background rect and white-fill paths.
// Here the background rect is removed and all fills are replaced with
// currentColor so the logo inherits its color from CSS. Set `color` on the
// parent element to control the logo color — it will always be white on the
// dark platform background.

interface LogoProps {
  /**
   * "sidebar" — compact horizontal lockup for the navigation rail.
   * "signin"  — large centered mark for the authentication screen.
   */
  variant?: "sidebar" | "signin";
  className?: string;
}

const SIDEBAR_HEIGHT = 28;
const SIGNIN_HEIGHT = 72;

// The viewBox covers only the artwork (no background). The original viewBox is
// 0 0 2000 2000 but the artwork sits in roughly x=330 y=684 to x=1663 y=1316.
// Using the tight crop gives a clean lockup at any size.
const ARTWORK_VIEWBOX = "330 684 1333 632";

export function Logo({ variant = "sidebar", className }: LogoProps) {
  const height = variant === "signin" ? SIGNIN_HEIGHT : SIDEBAR_HEIGHT;

  return (
    <svg
      viewBox={ARTWORK_VIEWBOX}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Create"
      role="img"
      style={{ display: "block", color: "var(--text)", flexShrink: 0 }}
      className={className}
    >
      {/* All paths use fill="currentColor" — no hardcoded white or black. */}

      {/* R glyph */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M1054,778.8c14.2,3.7,26.1,12.1,35.8,24.5c9.7,12.4,17.1,29.5,22.1,51.7
          c5,21.8,7.4,48.8,7.4,81.3c0,51.8-10,86.2-30.1,103.8c6.9,28.3,13.8,56.1,20.7,83.4
          c6.8,26.8,13.8,53.2,20.7,79c-20.9,5.4-41.7,10.9-62.6,16.4c-4.6-22.8-9.2-45.9-13.7-69.3
          c-4.5-23.7-9.1-47.5-13.5-71.7c0,24.7,0,49.4,0,74c0,24.7,0,49.4,0,74
          c-18.5,4.8-36.9,9.7-55.3,14.4c0-79.8,0-159.8,0-239.7c0-79.9,0-159.8,0-239.8
          C1008.3,766.9,1031.1,772.8,1054,778.8L1054,778.8z
          M1040.8,979.7c3.2,0.1,6.4,0.2,9.6,0.3c10.5,0.3,15.7-15.1,15.7-46.1
          c0-10.8-1.3-20.3-3.9-28.5c-2.6-8.2-5.9-12.6-9.9-13.1c-3.9-0.5-7.8-1-11.6-1.5
          C1040.8,920.5,1040.8,950.1,1040.8,979.7L1040.8,979.7z"
      />

      {/* E glyph */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M1143.7,1199c0-66.1,0-132.2,0.1-198.3c0-66.1,0-132.3,0-198.4
          c34.9,9.1,69.8,18.3,104.7,27.4c0,15.6,0,31.1,0,46.7c0,15.5,0,31.1,0,46.7
          c-16.5-2-33-3.9-49.5-5.9c0,11.7,0,23.5,0,35.2c14.8,1,29.7,2,44.6,3.1
          c0,29.4,0,58.9,0,88.2c-14.9,1-29.8,2-44.7,2.9c0,12.9,0,25.7,0,38.7
          c16.8-2.1,33.6-4.1,50.4-6.1c-0.1,30.8-0.1,61.5-0.1,92.2
          C1214,1180.6,1178.9,1189.8,1143.7,1199L1143.7,1199z"
      />

      {/* A glyph */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M1252.6,1170.5c9.2-58.1,18.3-114.9,27.6-169.8c9.1-53.4,18.5-105.2,27.7-155.4
          c20.8,5.4,41.7,10.9,62.5,16.4c9.1,47.9,18,94.3,27.2,139.1c8.9,43.2,18.2,84.8,27.3,124.7
          c-20.2,5.3-40.4,10.5-60.5,15.8c-1.6-11.4-3.3-23-4.8-34.6c-14.1,2.8-28.2,5.5-42.1,8.2
          c-1.7,13.3-3.4,26.6-5,40C1292.5,1160.1,1272.6,1165.3,1252.6,1170.5L1252.6,1170.5z
          M1350,1040c-1.9-15.9-3.8-31.9-5.6-48c-1.8-16.2-3.6-32.6-5.4-49
          c-0.4-0.1-0.8-0.1-1.2-0.2c-1.9,16.2-3.8,32.6-5.7,48.9c-1.9,16.5-3.7,33.2-5.5,49.8
          C1334.5,1041,1342.2,1040.5,1350,1040L1350,1040z"
      />

      {/* T glyph */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M1458.2,1116.7c0-25.9,0-51.9,0.1-77.9c0-26,0.1-51.9,0.1-77.9
          c-10.5-0.9-21-1.9-31.3-2.8c0-13.6,0-27.2,0-40.9c0-13.6,0.1-27.2,0.1-40.9
          c39.6,10.4,79.1,20.7,118.7,31c0,10.3-0.1,20.5-0.1,30.7c0,10.2,0,20.4-0.1,30.6
          c-10.5-0.9-20.9-1.9-31.3-2.8c0,22.7-0.1,45.4-0.1,68.1c0,22.7-0.1,45.4-0.1,68.1
          C1495.5,1107,1476.9,1111.9,1458.2,1116.7L1458.2,1116.7z"
      />

      {/* E glyph (second) */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M1558.3,1090.6c0-30,0.1-59.9,0.1-89.9c0.1-29.9,0.1-59.9,0.2-89.9
          c34.9,9.1,69.7,18.2,104.6,27.4c0,5.7,0,11.4-0.1,17.1c0,5.7,0,11.4,0,17
          c-16.5-2-33-3.9-49.4-5.9c-0.1,4.8-0.1,9.7-0.1,14.5c14.9,1,29.7,2,44.6,3.1
          c0,10.9-0.1,21.8-0.1,32.7c-14.9,1-29.8,1.9-44.6,2.9c-0.1,5.3-0.1,10.6-0.1,15.9
          c16.8-2,33.6-4.1,50.5-6.1c-0.1,11.2-0.1,22.4-0.1,33.6
          C1628.7,1072.2,1593.5,1081.4,1558.3,1090.6z"
      />

      {/* Pause bars (between C and R) */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M948.1,953.1L948.1,953.1c-6.3,0-11.4,5.1-11.4,11.4v71
          c0,6.3,5.1,11.4,11.4,11.4h0c6.3,0,11.4-5.1,11.4-11.4v-71
          C959.5,958.2,954.4,953.1,948.1,953.1z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M902.5,953.1L902.5,953.1c-6.3,0-11.4,5.1-11.4,11.4v71
          c0,6.3,5.1,11.4,11.4,11.4h0c6.3,0,11.4-5.1,11.4-11.4v-71
          C913.9,958.2,908.7,953.1,902.5,953.1z"
      />

      {/* C mark — outer shape */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M810.1,922.1c-0.1-0.1-0.2-0.2-0.3-0.3c-21.1-21.8-50.2-34.1-80.5-34.1
          c-62,0-112.2,50.2-112.2,112.2c0,62,50.2,112.2,112.2,112.2
          c30.2,0,59.1-12.2,80.2-33.8c12.9-13,30.4-20.4,48.7-20.4
          c37.8,0,68.5,30.7,68.5,68.5c0,12.3-3.3,24.3-9.5,34.8
          c-56.9,95.9-160.1,154.6-271.6,154.6c-174.5,0-315.9-141.4-315.9-315.9
          c0-174.5,141.4-315.9,315.9-315.9c111.5,0,214.7,58.7,271.6,154.6
          c6.2,10.5,9.5,22.6,9.5,34.8c0,37.8-30.7,68.5-68.5,68.5
          C840.3,942,823,934.8,810.1,922.1z"
      />

      {/* C mark — inner highlight */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M765.8,1080.2c-11.1,5-23.4,7.9-36.4,7.9c-48.7,0-88.1-39.4-88.1-88.1
          c0-13.4,3-26.1,8.3-37.4c-0.5,4-0.7,8-0.7,12.1
          c0,58.6,47.5,106.1,106.1,106.1C758.6,1080.8,762.2,1080.6,765.8,1080.2z"
      />
    </svg>
  );
}