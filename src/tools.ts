// Tool catalog: each tool runs one Cardine Labs actor with a small, capped input
// and returns a compact result that fits in an AI client's context.
import { z } from 'zod';

export type Item = Record<string, unknown>;

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  actor: string; // username/actor-name on the Apify Store
  shape: z.ZodRawShape;
  buildInput: (args: any) => Record<string, unknown>;
  maxItems: (args: any) => number;
  pick: (item: Item) => Item; // fields returned to the client
}

export const URL_LIMIT = 10;
const urls = (list: string[]) => list.slice(0, URL_LIMIT).map((url) => ({ url }));
const keep = (item: Item, keys: string[]): Item =>
  Object.fromEntries(keys.filter((k) => item[k] !== undefined && item[k] !== null && item[k] !== '').map((k) => [k, item[k]]));
export const cap = (n: number | undefined, def: number, max: number) => Math.max(1, Math.min(n ?? def, max));

const urlList = (what: string) => z.array(z.string().url()).min(1).max(URL_LIMIT).describe(`${what} (1-${URL_LIMIT} URLs, including https://)`);

export const TOOLS: ToolDef[] = [
  {
    name: 'crawl_to_markdown',
    title: 'Crawl website to Markdown',
    description: 'Crawl a docs site or website and return each page as clean Markdown with its URL and title, ready for RAG or for answering questions about the site. Stays on the same domain.',
    actor: 'cardine-labs/md-crawler-rag',
    shape: {
      startUrls: urlList('Pages to start crawling from'),
      maxPages: z.number().int().min(1).max(50).optional().describe('Pages to crawl, 1-50 (default 10)'),
      maxDepth: z.number().int().min(0).max(3).optional().describe('Link depth from the start pages, 0-3 (default 1)'),
    },
    buildInput: (a) => ({ startUrls: urls(a.startUrls), maxItems: cap(a.maxPages, 10, 50), maxDepth: a.maxDepth ?? 1, sameDomainOnly: true, incremental: false }),
    maxItems: (a) => cap(a.maxPages, 10, 50),
    pick: (i) => keep(i, ['url', 'title', 'markdown']),
  },
  {
    name: 'audit_seo',
    title: 'Technical SEO audit',
    description: 'Crawl a website and return technical SEO issues by priority: broken internal links, missing or duplicate titles and meta descriptions, canonical, noindex, H1 and image alt text.',
    actor: 'cardine-labs/seo-site-auditor',
    shape: {
      startUrl: z.string().url().describe('Home page or section to audit, including https://'),
      maxPages: z.number().int().min(1).max(100).optional().describe('Pages to crawl, 1-100 (default 30)'),
    },
    buildInput: (a) => ({ startUrls: [{ url: a.startUrl }], maxPages: cap(a.maxPages, 30, 100) }),
    maxItems: () => 300,
    pick: (i) => keep(i, ['priority', 'id', 'title', 'url', 'detail']),
  },
  {
    name: 'detect_tech_stack',
    title: 'Detect tech stack',
    description: 'Find what websites run: CMS, ecommerce platform, analytics, tag managers, frameworks, CDN, hosting, cookie consent and payments, with the evidence and confidence for each detection.',
    actor: 'cardine-labs/tech-stack-detector',
    shape: { urls: urlList('Websites to analyze') },
    buildInput: (a) => ({ urls: urls(a.urls), maxSites: URL_LIMIT, onlyChanges: false }),
    maxItems: () => URL_LIMIT,
    pick: (i) => keep(i, ['url', 'domain', 'technologies', 'categories', 'error']),
  },
  {
    name: 'check_shop_prices',
    title: 'Check Shopify or WooCommerce prices',
    description: 'Read the product variants of public Shopify or WooCommerce stores: price, compare-at price, SKU and stock. Useful to compare competitor prices or check availability.',
    actor: 'cardine-labs/shop-price-monitor',
    shape: {
      shops: urlList('Store home pages'),
      maxProductsPerShop: z.number().int().min(1).max(250).optional().describe('Products per store, 1-250 (default 50)'),
    },
    buildInput: (a) => ({ shops: urls(a.shops), maxProductsPerShop: cap(a.maxProductsPerShop, 50, 250), onlyChanges: false }),
    maxItems: () => 1000,
    pick: (i) => keep(i, ['shop', 'title', 'variant', 'sku', 'price', 'compareAt', 'currency', 'available', 'url']),
  },
  {
    name: 'read_news_feeds',
    title: 'Read RSS and Atom feeds',
    description: 'Read RSS and Atom feeds and return the latest articles, with the same story from different outlets merged. Optional keyword include and exclude filters.',
    actor: 'cardine-labs/news-feed-monitor',
    shape: {
      feeds: urlList('Feed URLs'),
      include: z.array(z.string()).max(20).optional().describe('Keep only articles containing any of these words'),
      exclude: z.array(z.string()).max(20).optional().describe('Drop articles containing any of these words'),
      maxArticles: z.number().int().min(1).max(100).optional().describe('Articles to return, 1-100 (default 30)'),
    },
    buildInput: (a) => ({ feeds: urls(a.feeds), include: a.include, exclude: a.exclude, onlyNew: false, maxArticles: cap(a.maxArticles, 30, 100) }),
    maxItems: (a) => cap(a.maxArticles, 30, 100),
    pick: (i) => keep(i, ['title', 'url', 'source', 'published', 'summary', 'duplicatesMerged']),
  },
  {
    name: 'search_company_jobs',
    title: 'Search company job openings',
    description: 'List open roles from company career pages on Greenhouse, Lever and Ashby: title, location, remote, department, seniority and apply URL. Companies are given as "greenhouse:stripe", "lever:netflix" or "ashby:ramp".',
    actor: 'cardine-labs/jobs-aggregator-eu',
    shape: {
      companies: z.array(z.string().regex(/^(greenhouse|lever|ashby):[A-Za-z0-9_.-]+$/)).min(1).max(20).describe('Companies as "<ats>:<board>", e.g. "greenhouse:stripe" (1-20)'),
      keywords: z.array(z.string()).max(10).optional().describe('Keep only roles whose title matches any of these words'),
      locations: z.array(z.string()).max(10).optional().describe('Keep only roles in these locations'),
      remoteOnly: z.boolean().optional().describe('Only remote roles'),
      maxJobs: z.number().int().min(1).max(200).optional().describe('Jobs to return, 1-200 (default 50)'),
    },
    buildInput: (a) => ({ companies: a.companies, keywords: a.keywords, locations: a.locations, remoteOnly: a.remoteOnly ?? false, onlyNew: false, includeArbeitnow: false, maxJobs: cap(a.maxJobs, 50, 200) }),
    maxItems: (a) => cap(a.maxJobs, 50, 200),
    pick: (i) => keep(i, ['company', 'title', 'location', 'remote', 'department', 'seniority', 'employmentType', 'url', 'postedAt', 'source']),
  },
];

// Keeps the answer inside a typical client's context window.
export const MAX_RESPONSE_CHARS = 60_000;

export function formatResult(tool: ToolDef, items: Item[], runUrl: string): string {
  const picked = items.map(tool.pick);
  const header = { tool: tool.name, actor: tool.actor, items: picked.length, run: runUrl };
  let out = JSON.stringify({ ...header, results: picked });
  let n = picked.length;
  while (out.length > MAX_RESPONSE_CHARS && n > 1) {
    n = Math.max(1, Math.floor(n * 0.8));
    out = JSON.stringify({ ...header, truncated: `showing ${n} of ${picked.length}; open the run for the full dataset`, results: picked.slice(0, n) });
  }
  return out.length > MAX_RESPONSE_CHARS ? out.slice(0, MAX_RESPONSE_CHARS) : out;
}
