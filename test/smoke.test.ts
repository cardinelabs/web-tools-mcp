import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { TOOLS, formatResult, MAX_RESPONSE_CHARS, URL_LIMIT } from '../src/tools.ts';

test('tool names are unique and snake_case', () => {
  const names = TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const n of names) assert.match(n, /^[a-z][a-z_]+$/);
});

test('every tool targets a cardine-labs actor and has English text', () => {
  for (const t of TOOLS) {
    assert.match(t.actor, /^cardine-labs\/[a-z0-9-]+$/);
    assert.ok(t.description.length > 60);
    assert.doesNotMatch(t.description + t.title, /\b(pagine|sito|il|della|per i)\b/);
  }
});

test('inputs are capped whatever the caller asks', () => {
  const many = Array.from({ length: 30 }, (_, i) => `https://example${i}.com`);
  const crawl = TOOLS.find((t) => t.name === 'crawl_to_markdown')!;
  const ci = crawl.buildInput({ startUrls: many, maxPages: 10_000 });
  assert.equal((ci.startUrls as unknown[]).length, URL_LIMIT);
  assert.equal(ci.maxItems, 50);
  assert.equal(ci.incremental, false);
  const jobs = TOOLS.find((t) => t.name === 'search_company_jobs')!;
  assert.equal(jobs.buildInput({ companies: ['greenhouse:stripe'] }).maxJobs, 50);
  assert.equal(jobs.buildInput({ companies: ['greenhouse:stripe'], maxJobs: 999 }).maxJobs, 200);
});

test('schemas validate good input and reject bad input', () => {
  const jobs = z.object(TOOLS.find((t) => t.name === 'search_company_jobs')!.shape);
  assert.ok(jobs.safeParse({ companies: ['lever:netflix'] }).success);
  assert.ok(!jobs.safeParse({ companies: ['workday:acme'] }).success);
  const seo = z.object(TOOLS.find((t) => t.name === 'audit_seo')!.shape);
  assert.ok(!seo.safeParse({ startUrl: 'not a url' }).success);
});

test('large results are truncated with a note', () => {
  const tool = TOOLS.find((t) => t.name === 'crawl_to_markdown')!;
  const items = Array.from({ length: 50 }, (_, i) => ({ url: `https://x.com/${i}`, title: 't', markdown: 'x'.repeat(5000), chunks: [1, 2] }));
  const out = formatResult(tool, items, 'https://console.apify.com/view/runs/abc');
  assert.ok(out.length <= MAX_RESPONSE_CHARS);
  const parsed = JSON.parse(out);
  assert.match(parsed.truncated, /^showing \d+ of 50/);
  assert.equal(parsed.results[0].chunks, undefined);
});
