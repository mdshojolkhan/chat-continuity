/**
 * Read-only web search.
 *
 * Uses DuckDuckGo's HTML endpoint: no API key, no user data sent beyond the
 * query, and the result is parsed into plain text. This is the ONLY outbound
 * network call available to a skill, and it can never POST or fetch an
 * arbitrary user-supplied URL.
 */
export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export class SearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchError";
  }
}

const ENDPOINT = "https://html.duckduckgo.com/html/";

function decode(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveUrl(href: string): string {
  const decoded = decode(href);
  const match = /[?&]uddg=([^&]+)/.exec(decoded);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return decoded;
    }
  }
  return decoded.startsWith("//") ? `https:${decoded}` : decoded;
}

export async function webSearch(
  query: string,
  limit = 5,
): Promise<SearchResult[]> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (compatible; V1Agent/1.0)",
      },
      body: new URLSearchParams({ q: query, kl: "wt-wt" }).toString(),
    });
  } catch {
    throw new SearchError("Web search could not be reached.");
  }
  if (!response.ok) {
    throw new SearchError("Web search is unavailable right now.");
  }

  const html = await response.text();
  const results: SearchResult[] = [];
  const blockPattern =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,1200}?)(?=<a[^>]+class="[^"]*result__a|<\/div>\s*<\/div>\s*<\/div>|$)/g;

  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(html)) && results.length < limit) {
    const url = resolveUrl(match[1] ?? "");
    const title = decode(match[2] ?? "");
    const snippetMatch = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(
      match[3] ?? "",
    );
    if (!url || !title) continue;
    results.push({
      title: title.slice(0, 200),
      url: url.slice(0, 500),
      snippet: decode(snippetMatch?.[1] ?? "").slice(0, 400),
    });
  }
  return results;
}
