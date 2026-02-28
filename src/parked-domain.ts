/**
 * Parked domain detection.
 * Vendored from @aeo/queue/redirect-check (pure functions, no network).
 */

export interface ParkedDomainResult {
  isParked: boolean;
  reason?: string;
}

/** Known parking paths used by domain parking services */
const PARKING_PATHS = ['/lander', '/parking', '/park', '/sedoparking'];

/** Known parking service domains found in page HTML (scripts, iframes, links) */
const PARKING_SERVICE_DOMAINS = [
  'sedoparking.com',
  'parkingcrew.net',
  'bodis.com',
  'dsparking.com',
  'hugedomains.com',
  'afternic.com',
  'dan.com',
  'undeveloped.com',
  'domainmarket.com',
  'sav.com',
  'domaincontrol.com',
  'above.com',
  'domainlore.com',
  'domainnamesales.com',
  'brandbucket.com',
  'squadhelp.com',
  'godaddy.com/domainsearch',
];

/** Parking-specific text patterns (case-insensitive) */
const PARKING_TEXT_PATTERNS = [
  /\bbuy this domain\b/i,
  /\bdomain is for sale\b/i,
  /\bthis domain may be for sale\b/i,
  /\bdomain for sale\b/i,
  /\bthis domain name is available\b/i,
  /\bparked by/i,
  /\bthis page is parked/i,
  /\bdomain has expired/i,
  /\bthis domain has been registered/i,
  /\bmake an offer on this domain\b/i,
  /\bget this domain\b/i,
  /\bacquire this domain\b/i,
];

function detectParkingRedirect(bodySnippet: string): string | null {
  const relativeRedirect = bodySnippet.match(
    /window\.location\.(replace|assign|href)\s*[=(]\s*['"](\/[^'"]*)['"]/i,
  );
  if (!relativeRedirect) return null;
  const path = relativeRedirect[2].toLowerCase().replace(/[?#].*/, '');
  if (PARKING_PATHS.includes(path)) {
    return `js-redirect to ${relativeRedirect[2]}`;
  }
  return null;
}

function detectParkingService(bodySnippet: string): string | null {
  const lower = bodySnippet.toLowerCase();
  for (const service of PARKING_SERVICE_DOMAINS) {
    if (lower.includes(service)) {
      return `parking service: ${service}`;
    }
  }
  return null;
}

function detectParkingText(bodySnippet: string): string | null {
  for (const pattern of PARKING_TEXT_PATTERNS) {
    if (pattern.test(bodySnippet)) {
      return `parking text: ${bodySnippet.match(pattern)?.[0]}`;
    }
  }
  return null;
}

/**
 * Detect if a page is a parked/lost/for-sale domain.
 * Pure function - no network calls.
 */
export function detectParkedDomain(bodySnippet: string): ParkedDomainResult {
  const parkingRedirect = detectParkingRedirect(bodySnippet);
  if (parkingRedirect) return { isParked: true, reason: parkingRedirect };

  const parkingService = detectParkingService(bodySnippet);
  if (parkingService) return { isParked: true, reason: parkingService };

  const parkingText = detectParkingText(bodySnippet);
  if (parkingText) return { isParked: true, reason: parkingText };

  return { isParked: false };
}
