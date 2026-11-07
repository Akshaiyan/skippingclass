// Aegis brand mark and wordmark as inline SVG, traced from the brand artwork (aegis-logo.png).
// The lettering is drawn paths, not a font, so it renders identically everywhere with no webfont request.
// fill is currentColor: set the colour with a text-* class; dark mode just works.

const MARK = (
  <>
    <path d="M526 284 619 448H432Z" />
    <path d="M410 487H641L685 565H366Z" />
    <path d="M344 603H506L446 710H284Z" />
    <path d="M545 603H707L768 710H606Z" />
  </>
);

const WORD = (
  <>
    {/* A */}
    <path d="M981 600 1096 394 1212 600H1178L1096 453 1014 600Z" />
    {/* E */}
    <path d="M1264 394H1437V423H1292V483H1412V511H1292V571H1437V600H1264Z" />
    {/* G */}
    <path d="M1533 394H1733V423H1539V571H1704V511H1635V483H1733V577A23 23 0 0 1 1710 600H1533A23 23 0 0 1 1510 577V417A23 23 0 0 1 1533 394Z" />
    {/* I */}
    <path d="M1807 394H1836V600H1807Z" />
    {/* S */}
    <path d="M1933 394H2116V423H1939V483H2093A23 23 0 0 1 2116 506V577A23 23 0 0 1 2093 600H1910V571H2087V511H1933A23 23 0 0 1 1910 488V417A23 23 0 0 1 1933 394Z" />
  </>
);

type Props = { className?: string };

export function AegisMark({ className }: Props) {
  return (
    <svg viewBox="284 284 484 426" fill="currentColor" className={className} role="img" aria-label="Aegis">
      {MARK}
    </svg>
  );
}

export function AegisLogo({ className }: Props) {
  return (
    <svg viewBox="284 284 1832 426" fill="currentColor" className={className} role="img" aria-label="Aegis">
      {MARK}
      {WORD}
    </svg>
  );
}
