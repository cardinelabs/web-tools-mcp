# Web Data Tools MCP Server

Give Claude, Cursor, VS Code or any MCP client six web data tools with one URL: crawl a site to Markdown, audit technical SEO, detect a site's tech stack, read Shopify and WooCommerce prices, read RSS feeds and list company job openings.

Every tool runs a maintained Cardine Labs actor in **your own Apify account**, with a hard cap on what a single call can spend.

## Tools

| Tool | What it returns | Limits per call |
| --- | --- | --- |
| `crawl_to_markdown` | Each page as clean Markdown with URL and title | 10 start URLs, 50 pages, depth 3 |
| `audit_seo` | Technical SEO issues by priority: broken links, titles, meta descriptions, canonical, noindex, H1, alt text | 100 pages |
| `detect_tech_stack` | CMS, ecommerce, analytics, tag managers, frameworks, CDN, hosting, consent, payments, with evidence | 10 sites |
| `check_shop_prices` | Variant price, compare-at price, SKU and stock for Shopify and WooCommerce stores | 10 stores, 250 products each |
| `read_news_feeds` | Latest articles from RSS and Atom feeds, duplicates merged, keyword filters | 10 feeds, 100 articles |
| `search_company_jobs` | Open roles from Greenhouse, Lever and Ashby career pages | 20 companies, 200 jobs |

All tools are read-only: they never change anything on the sites they visit.

## Connect

Use the Standby URL with `/mcp` and your [Apify API token](https://console.apify.com/settings/integrations).

**Claude Code**
```bash
claude mcp add --transport http cardine-web-tools https://cardine-labs--web-tools-mcp.apify.actor/mcp --header "Authorization: Bearer YOUR_APIFY_TOKEN"
```

**Cursor, VS Code, Claude Desktop and other clients**
```json
{
  "mcpServers": {
    "cardine-web-tools": {
      "url": "https://cardine-labs--web-tools-mcp.apify.actor/mcp",
      "headers": { "Authorization": "Bearer YOUR_APIFY_TOKEN" }
    }
  }
}
```

Then ask, for example:
- "Crawl https://docs.example.com and summarize how authentication works."
- "Audit https://example.com and list the high-priority SEO issues."
- "What do allbirds.com and gymshark.com run for ecommerce and analytics?"
- "Compare prices of the running shoes on these two Shopify stores."
- "Which engineering roles are open at Stripe and Ramp in Europe?"

## Pricing

- **$0.01 per successful tool call** for the gateway. Calls that return no results are not charged.
- Plus the events of the actor the tool runs, at its Store price (for example $0.50 per 1,000 pages crawled).
- Each call has a spending cap of **$0.25**, so one prompt can't run up a bill.

A normal (non-Standby) run only lists the tools and is free.

## FAQ

**Do you see my data?** Runs happen in your Apify account. The gateway only passes your request to the actor and returns the result to your client.

**Why not the general Apify MCP server?** It is great for exploring the whole Store. This server gives your agent six curated tools with short inputs, fixed limits and compact answers, so agents pick the right tool and stay inside their context window.

**What doesn't it do?** No logins, no private pages, no social networks, no writes to any site.

## Support

Open an issue on this actor's Issues tab. We answer within 48 hours.
