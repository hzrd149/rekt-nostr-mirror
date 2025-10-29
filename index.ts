#!/usr/bin/env bun

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { MarkdownConverter } from "./src/markdown-converter";
import { NIP23Publisher } from "./src/nip23-publisher";
import { RektScraper, type RektArticle } from "./src/scraper";

interface Config {
  signerString: string;
  articleLimit: number;
  publishDelay: number;
  relays?: string[];
  dryRun: boolean;
}

class RektNostrMirror {
  private scraper: RektScraper;
  private markdownConverter: MarkdownConverter;
  private publisher: NIP23Publisher;

  constructor() {
    this.scraper = new RektScraper();
    this.markdownConverter = new MarkdownConverter();
    this.publisher = new NIP23Publisher();
  }

  async run(config: Config): Promise<void> {
    console.log("🚀 Starting Rekt.news → Nostr Mirror");
    console.log(`📊 Configuration:
- Article limit: ${config.articleLimit}
- Publish delay: ${config.publishDelay}ms
- Dry run: ${config.dryRun}
- Relays: ${config.relays?.length || "default"} relays`);

    try {
      // Initialize publisher if not in dry run mode
      if (!config.dryRun) {
        console.log("\n🔐 Initializing Nostr signer...");
        await this.publisher.initialize(config.signerString);
      }

      // Fetch latest articles from rekt.news
      console.log("\n🕷️  Scraping rekt.news for latest articles...");
      const articles = await this.scraper.fetchLatestArticles(
        config.articleLimit,
      );

      if (articles.length === 0) {
        console.log("❌ No articles found. Exiting.");
        return;
      }

      console.log(`✅ Found ${articles.length} articles to process`);

      // Process articles
      const processedArticles: { article: RektArticle; markdown: string }[] =
        [];

      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        if (!article) continue; // Skip undefined articles

        console.log(
          `\n📰 Processing ${i + 1}/${articles.length}: ${article.title}`,
        );

        // Convert HTML to markdown
        console.log("🔄 Converting HTML to Markdown...");
        const result = this.markdownConverter.convertRektArticle(
          article.content,
          article.url,
        );

        if (result.markdown.length < 100) {
          console.log("⚠️  Converted markdown too short, skipping");
          continue;
        }

        console.log(
          `✅ Converted to ${result.markdown.length} characters of markdown`,
        );

        // If an image was extracted from the beginning, set it as the article image
        let updatedArticle = article;
        if (result.extractedImage) {
          console.log(`🖼️  Extracted leading image: ${result.extractedImage}`);
          updatedArticle = { ...article, image: result.extractedImage };
        }

        // Preview first 200 characters
        const preview =
          result.markdown.substring(0, 200) +
          (result.markdown.length > 200 ? "..." : "");
        console.log(`📝 Preview: ${preview}`);

        processedArticles.push({
          article: updatedArticle,
          markdown: result.markdown,
        });
      }

      if (processedArticles.length === 0) {
        console.log("❌ No articles to publish after processing. Exiting.");
        return;
      }

      // Publish articles
      if (config.dryRun) {
        console.log(
          `\n🧪 DRY RUN: Would publish ${processedArticles.length} articles`,
        );
        processedArticles.forEach(({ article }, index) => {
          console.log(`${index + 1}. ${article.title} (${article.url})`);
        });
      } else {
        console.log(
          `\n📤 Publishing ${processedArticles.length} articles to Nostr...`,
        );
        const publishOptions = {
          signerString: config.signerString,
          relays: config.relays,
        };

        const eventIds = await this.publisher.publishMultipleArticles(
          processedArticles,
          publishOptions,
          config.publishDelay,
        );

        console.log(`\n🎉 Successfully published ${eventIds.length} articles!`);
        console.log("📋 Event IDs:");
        eventIds.forEach((id, index) => {
          console.log(`${index + 1}. ${id}`);
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error("💥 Fatal error:", errorMessage);
      if (errorStack) {
        console.error("Stack trace:", errorStack);
      }
      process.exit(1);
    }
  }
}

// CLI interface using yargs
async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("rekt-nostr-mirror")
    .usage(
      "🔥 $0 [options]\n\nMirror rekt.news articles to Nostr as NIP-23 long-form content",
    )
    .option("signer", {
      alias: "s",
      type: "string",
      describe: "Nostr signer (nsec key or bunker:// URI)",
      demandOption: false, // We'll check this conditionally based on dry-run
    })
    .option("limit", {
      alias: "l",
      type: "number",
      describe: "Number of articles to fetch",
      default: 50,
    })
    .option("delay", {
      alias: "d",
      type: "number",
      describe: "Delay between publications (milliseconds)",
      default: 5000,
    })
    .option("relays", {
      alias: "r",
      type: "string",
      describe: "Comma-separated relay URLs",
      coerce: (arg: string) =>
        arg ? arg.split(",").map((r) => r.trim()) : undefined,
    })
    .option("skip-existing", {
      type: "boolean",
      describe: "Skip already published articles",
      default: true,
    })
    .option("dry-run", {
      type: "boolean",
      describe: "Preview mode - don't actually publish",
      default: false,
    })
    .example("$0 --dry-run --limit 3", "Preview 3 latest articles")
    .example(
      "$0 --signer nsec1... --limit 5",
      "Publish 5 articles with nsec key",
    )
    .example(
      '$0 --signer "bunker://..." --relays "wss://relay1.com,wss://relay2.com"',
      "Use bunker signer with custom relays",
    )
    .example(
      "$0 --signer nsec1... --limit 2 --delay 1000 --no-skip-existing",
      "Quick publish with short delay",
    )
    .check((argv) => {
      // Custom validation: require signer unless dry-run
      if (!argv.dryRun && !argv.signer) {
        throw new Error(
          "❌ --signer is required (unless using --dry-run)\n   Use an nsec key or bunker:// URI",
        );
      }

      // Validate limit
      if (argv.limit <= 0) {
        throw new Error("❌ --limit must be a positive number");
      }

      // Validate delay
      if (argv.delay < 0) {
        throw new Error("❌ --delay must be a non-negative number");
      }

      return true;
    })
    .help()
    .alias("help", "h")
    .version("1.0.0")
    .alias("version", "v")
    .wrap(Math.min(120, yargs().terminalWidth()))
    .parseAsync();

  // Build config from parsed arguments
  const config: Config = {
    signerString: argv.signer || "",
    articleLimit: argv.limit,
    publishDelay: argv.delay,
    relays: argv.relays,
    dryRun: argv.dryRun,
  };

  // Run the mirror
  const mirror = new RektNostrMirror();
  await mirror.run(config);
}

// Handle process signals gracefully
process.on("SIGINT", () => {
  console.log("\n⚠️  Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n⚠️  Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Run the script
if (import.meta.main) {
  main().catch((error) => {
    console.error("💥 Unhandled error:", error);
    process.exit(1);
  });
}
