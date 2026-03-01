import { describe, it, expect } from 'vitest';
import { detectParkedDomain } from '../src/parked-domain.js';

describe('detectParkedDomain', () => {
  // ─── Parking redirect detection ──────────────────────────────────────────

  it('detects JS redirect to /lander', () => {
    const html = '<script>window.location.replace("/lander")</script>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
    expect(result.reason).toContain('js-redirect');
    expect(result.reason).toContain('/lander');
  });

  it('detects JS redirect to /parking', () => {
    const html = '<script>window.location.href = "/parking"</script>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
    expect(result.reason).toContain('/parking');
  });

  it('detects JS redirect to /park', () => {
    const html = '<script>window.location.assign("/park")</script>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
    expect(result.reason).toContain('/park');
  });

  it('detects JS redirect to /sedoparking', () => {
    const html = '<script>window.location.href = "/sedoparking"</script>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
    expect(result.reason).toContain('/sedoparking');
  });

  it('ignores JS redirect to non-parking path', () => {
    const html = '<script>window.location.href = "/dashboard"</script>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(false);
  });

  it('ignores page without JS redirect patterns', () => {
    const html = '<script>console.log("hello")</script>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(false);
  });

  // ─── Parking service domain detection ─────────────────────────────────────

  it('detects sedoparking.com reference', () => {
    const html = '<script src="https://sedoparking.com/park.js"></script>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
    expect(result.reason).toContain('sedoparking.com');
  });

  it('detects bodis.com reference', () => {
    const html = '<iframe src="https://bodis.com/landing"></iframe>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
    expect(result.reason).toContain('bodis.com');
  });

  it('detects hugedomains.com reference', () => {
    const html = '<a href="https://hugedomains.com/buy">Buy this domain</a>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
    expect(result.reason).toContain('hugedomains.com');
  });

  it('detects dan.com reference', () => {
    const html = '<script src="https://dan.com/widget.js"></script>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
    expect(result.reason).toContain('dan.com');
  });

  it('detects afternic.com reference', () => {
    const html = '<link href="afternic.com/styles.css">';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
    expect(result.reason).toContain('afternic.com');
  });

  it('detects parkingcrew.net reference', () => {
    const html = '<div>Powered by parkingcrew.net</div>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
    expect(result.reason).toContain('parkingcrew.net');
  });

  it('detects godaddy.com/domainsearch reference', () => {
    const html = '<a href="https://godaddy.com/domainsearch?key=xyz">Find domains</a>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
    expect(result.reason).toContain('godaddy.com/domainsearch');
  });

  // ─── Parking text pattern detection ───────────────────────────────────────

  it('detects "buy this domain" text', () => {
    const html = '<h1>Buy this domain</h1>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
    expect(result.reason).toContain('parking text');
  });

  it('detects "domain is for sale" text', () => {
    const html = '<p>This domain is for sale. Contact us for pricing.</p>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
    expect(result.reason).toContain('parking text');
  });

  it('detects "this domain may be for sale" text', () => {
    const html = '<p>This domain may be for sale!</p>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
  });

  it('detects "domain for sale" text', () => {
    const html = '<h1>domain for sale</h1>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
  });

  it('detects "parked by" text', () => {
    const html = '<footer>Parked by GoDaddy</footer>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
  });

  it('detects "this page is parked" text', () => {
    const html = '<div>This page is parked free, courtesy of GoDaddy.</div>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
  });

  it('detects "domain has expired" text', () => {
    const html = '<p>This domain has expired and is pending renewal.</p>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
  });

  it('detects "make an offer on this domain" text', () => {
    const html = '<button>Make an offer on this domain</button>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
  });

  it('detects "get this domain" text', () => {
    const html = '<a>Get this domain now</a>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
  });

  it('detects "acquire this domain" text', () => {
    const html = '<h2>Acquire this domain today</h2>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
  });

  it('detects "this domain name is available" text', () => {
    const html = '<h1>This domain name is available for purchase</h1>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
  });

  it('detects "this domain has been registered" text', () => {
    const html = '<p>This domain has been registered via Namecheap</p>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(true);
  });

  // ─── Normal (not parked) pages ────────────────────────────────────────────

  it('returns not parked for normal site', () => {
    const html = '<html><body><h1>Welcome to our company</h1><p>We provide solutions.</p></body></html>';
    const result = detectParkedDomain(html);
    expect(result.isParked).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it('returns not parked for empty page', () => {
    const result = detectParkedDomain('');
    expect(result.isParked).toBe(false);
  });
});
