import type { AppState } from '../types';

/**
 * Cloud save in a secret GitHub Gist owned by the user.
 * A secret gist is unlisted, not private: it is hidden from search and the user's profile,
 * but anyone who has its link can open it.
 * The token and gist id are kept in their own localStorage key, never inside AppState,
 * so they are not included in exported backup files.
 */

const SYNC_KEY = 'shiftmoney:cloud';
const FILE = 'shiftmoney-data.json';
const API = 'https://api.github.com';

/** Opens GitHub's "new token" page with only the gist scope ticked */
export const NEW_TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=ShiftMoney%20cloud%20save';

export interface CloudConfig {
  token: string;
  gistId: string;
  /** savedAt of the last version this device uploaded or downloaded */
  lastSyncedAt?: string;
}

export interface CloudData {
  savedAt: string;
  state: AppState;
}

export function loadCloudConfig(): CloudConfig | null {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    return raw ? (JSON.parse(raw) as CloudConfig) : null;
  } catch {
    return null;
  }
}

export function saveCloudConfig(cfg: CloudConfig | null): void {
  try {
    if (cfg) localStorage.setItem(SYNC_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(SYNC_KEY);
  } catch {
    /* the app keeps working even if saving fails */
  }
}

export class CloudError extends Error {
  /** True when GitHub rejected the token (expired, deleted or mistyped) */
  constructor(
    message: string,
    readonly tokenRejected = false,
  ) {
    super(message);
  }
}

async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new CloudError("Couldn't reach GitHub. Check your internet connection and try again.");
  }
  if (res.status === 401) {
    throw new CloudError('GitHub rejected the token. It may have expired or been deleted, or was not copied in full.', true);
  }
  if (res.status === 403 || res.status === 404) {
    throw new CloudError('This token cannot use Gists. Create a token with the "gist" box ticked.');
  }
  if (!res.ok) throw new CloudError(`GitHub returned an error (${res.status}). Try again in a minute.`);
  return (await res.json()) as T;
}

interface GistFile {
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}
interface Gist {
  id: string;
  html_url: string;
  files: Record<string, GistFile>;
}

async function readFile(file: GistFile): Promise<CloudData | null> {
  let text = file.content ?? '';
  if (file.truncated && file.raw_url) {
    const res = await fetch(file.raw_url);
    if (!res.ok) throw new CloudError("Couldn't download the cloud save.");
    text = await res.text();
  }
  try {
    const data = JSON.parse(text) as CloudData;
    return data && data.state ? data : null;
  } catch {
    return null;
  }
}

/** Find this user's ShiftMoney gist, if there is one */
export async function findSave(token: string): Promise<{ gistId: string; data: CloudData | null } | null> {
  for (let page = 1; page <= 5; page++) {
    const gists = await gh<Gist[]>(token, `/gists?per_page=100&page=${page}`);
    const match = gists.find((g) => FILE in g.files);
    if (match) {
      const full = await gh<Gist>(token, `/gists/${match.id}`);
      return { gistId: match.id, data: await readFile(full.files[FILE]) };
    }
    if (gists.length < 100) break;
  }
  return null;
}

export async function pull(cfg: CloudConfig): Promise<CloudData | null> {
  const gist = await gh<Gist>(cfg.token, `/gists/${cfg.gistId}`);
  const file = gist.files[FILE];
  return file ? readFile(file) : null;
}

function payload(state: AppState): { savedAt: string; body: string } {
  const savedAt = new Date().toISOString();
  return { savedAt, body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify({ savedAt, state }) } } }) };
}

/** Upload the app data; returns the savedAt stamp written */
export async function push(cfg: CloudConfig, state: AppState): Promise<string> {
  const { savedAt, body } = payload(state);
  await gh(cfg.token, `/gists/${cfg.gistId}`, { method: 'PATCH', body });
  return savedAt;
}

/** Create the secret gist with the current data */
export async function createSave(token: string, state: AppState): Promise<{ gistId: string; savedAt: string }> {
  const { savedAt, body } = payload(state);
  const parsed = JSON.parse(body) as { files: unknown };
  const gist = await gh<Gist>(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({ description: 'ShiftMoney cloud save (do not edit)', public: false, files: parsed.files }),
  });
  return { gistId: gist.id, savedAt };
}

export function gistUrl(gistId: string): string {
  return `https://gist.github.com/${gistId}`;
}
