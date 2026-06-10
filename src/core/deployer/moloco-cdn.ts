/**
 * Moloco CDN asset uploader (Partner Guide v2.0 §2.7 "Assets Upload Guide").
 *
 * Flow:
 *  1. POST /cm/v1/auth/tokens { api_key }            → { token }   (expires in 16h)
 *  2. POST /cm/v1/creative-assets?ad_account_id=ID
 *       { asset_kind: "EXTERNAL", mime_type: "text/javascript" }
 *                                                     → { asset_url, content_upload_url }
 *  3. PUT content_upload_url  <payload.js bytes>      → asset hosted at asset_url
 *
 * The returned asset_url is then substituted into launcher.html via
 * fillLauncherPayloadUrl (#PAYLOAD_URL# placeholder).
 *
 * Note: when payload is hosted on Moloco's CDN, macros MUST be delivered via
 * the window object (we already emit window.MOLOCO_MACROS in the launcher).
 */

export const MOLOCO_API_BASE = 'https://api.moloco.cloud/cm/v1';

/** Token lives 16h per spec; refresh a bit early to avoid edge-of-expiry 401s. */
const TOKEN_TTL_MS = 15 * 60 * 60 * 1000;

export interface MolocoCdnClientOptions {
  apiKey: string;
  adAccountId: string;
  fetchFn?: typeof fetch;
}

export interface MolocoUploadResult {
  assetUrl: string;
}

export class MolocoCdnClient {
  private apiKey: string;
  private adAccountId: string;
  private fetchFn: typeof fetch;
  private token: string | null = null;
  private tokenIssuedAt = 0;

  constructor(opts: MolocoCdnClientOptions) {
    if (!opts.apiKey) throw new Error('Moloco API key is required');
    if (!opts.adAccountId) throw new Error('Moloco Ad Account ID is required');
    this.apiKey = opts.apiKey;
    this.adAccountId = opts.adAccountId;
    this.fetchFn = opts.fetchFn || fetch;
  }

  private async getToken(): Promise<string> {
    const now = Date.now();
    if (this.token && now - this.tokenIssuedAt < TOKEN_TTL_MS) return this.token;
    const res = await this.fetchFn(`${MOLOCO_API_BASE}/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ api_key: this.apiKey }),
    });
    if (!res.ok) throw new Error(`Moloco auth failed: ${res.status} ${await safeText(res)}`);
    const body = (await res.json()) as { token?: string };
    if (!body.token) throw new Error('Moloco auth failed: no token in response');
    this.token = body.token;
    this.tokenIssuedAt = now;
    return this.token;
  }

  /** Upload a payload.js body to Moloco CDN, returning the hosted asset URL. */
  async uploadPayload(payload: string | Buffer): Promise<MolocoUploadResult> {
    const token = await this.getToken();

    const sessionRes = await this.fetchFn(
      `${MOLOCO_API_BASE}/creative-assets?ad_account_id=${encodeURIComponent(this.adAccountId)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ asset_kind: 'EXTERNAL', mime_type: 'text/javascript' }),
      },
    );
    if (!sessionRes.ok) {
      throw new Error(`Moloco upload session failed: ${sessionRes.status} ${await safeText(sessionRes)}`);
    }
    const session = (await sessionRes.json()) as {
      asset_url?: string;
      content_upload_url?: string;
    };
    if (!session.asset_url || !session.content_upload_url) {
      throw new Error('Moloco upload session failed: missing asset_url/content_upload_url');
    }

    const putRes = await this.fetchFn(session.content_upload_url, {
      method: 'PUT',
      // Buffer is not in TS's BodyInit union — pass a Uint8Array view instead.
      body: typeof payload === 'string' ? payload : new Uint8Array(payload),
    });
    if (!putRes.ok) {
      throw new Error(`Moloco asset upload failed: ${putRes.status} ${await safeText(putRes)}`);
    }

    return { assetUrl: session.asset_url };
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '';
  }
}
