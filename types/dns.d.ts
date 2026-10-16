/** A supported DNS record type. */
export type RecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'CAA';

/** Name of a built-in DNS-over-HTTPS resolver. */
export type ResolverName = 'cloudflare' | 'google';

/** Built-in resolver URLs. */
export const RESOLVERS: Readonly<Record<ResolverName, string>>;

/** Numeric DNS type code for each supported record type. */
export const RECORD_TYPES: Readonly<Record<RecordType, number>>;

/** A parsed DNS record. */
export interface DnsRecord {
  type: RecordType;
  /** Owner name without a trailing dot. */
  name: string;
  /** Record value without a trailing dot (TXT chunks joined, CAA kept as-is). */
  value: string;
  ttl: number;
  /** MX priority; `null` for every other type. */
  priority: number | null;
}

/** Response returned by a DNS transport. */
export interface DnsTransportResponse {
  status: number;
  body: string;
}

/** Performs a GET request for the DNS client. */
export type DnsTransport = (
  url: string,
  headers: Record<string, string>,
) => DnsTransportResponse | Promise<DnsTransportResponse>;

export interface DnsOptions {
  /** `"cloudflare"` (default), `"google"`, or a full DoH JSON URL. */
  resolver?: ResolverName | (string & {});
  /** Custom transport, mainly for tests. Defaults to global `fetch`. */
  transport?: DnsTransport;
}

export interface PropagationResult {
  results: { cloudflare: string[]; google: string[] };
  consistent: boolean;
}

/** DNS-over-HTTPS client. */
export class Dns {
  constructor(options?: DnsOptions);
  /** The resolver URL this instance queries. */
  readonly resolver: string;
  /** Look up records of one type. Returns `[]` on NXDOMAIN or no answer. */
  lookup(domain: string, type?: RecordType): Promise<DnsRecord[]>;
  /** True when any A (IPv4) or AAAA (IPv6) record equals `ip`. */
  pointsTo(domain: string, ip: string): Promise<boolean>;
  /** Query Cloudflare and Google and compare the sorted values. */
  propagation(domain: string, type?: RecordType): Promise<PropagationResult>;
}
