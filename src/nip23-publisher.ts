import type { ISigner } from "applesauce-signers";
import { createSigner, pool } from "../nostr";
import type { RektArticle } from "./scraper";

export interface PublishOptions {
  relays?: string[];
  signerString: string; // nsec key or bunker URI
}

export class NIP23Publisher {
  private signer: ISigner | null = null;
  private defaultRelays = [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.band",
    "wss://nostr.wine",
    "wss://relay.snort.social",
  ];

  async initialize(signerString: string): Promise<void> {
    try {
      this.signer = await createSigner(signerString);
      console.log("✅ Signer initialized successfully");
    } catch (error) {
      if (error instanceof Error)
        throw new Error(`Failed to initialize signer: ${error.message}`);
    }
  }

  async publishArticle(
    article: RektArticle,
    markdownContent: string,
    options: PublishOptions,
  ): Promise<string> {
    if (!this.signer) {
      throw new Error("Publisher not initialized. Call initialize() first.");
    }

    // Use specified relays or default ones
    const relays = options.relays || this.defaultRelays;

    // Create unique article identifier
    const articleId = this.createArticleId(article.url);

    // Build NIP-23 tags
    const tags = this.buildTags(article, articleId);

    // Create the event
    const event = {
      kind: 30023, // NIP-23 long-form content
      created_at: Math.floor(Date.now() / 1000),
      content: markdownContent,
      tags,
    };

    try {
      // Sign and publish the event
      const signedEvent = await this.signer.signEvent(event);
      const publishResult = await pool.publish(relays, signedEvent);

      console.log(`📝 Published article: ${article.title}`);
      console.log(`📍 Event ID: ${signedEvent.id}`);
      console.log(`🔗 Article ID: ${articleId}`);

      // Wait for confirmations
      await this.waitForPublication(signedEvent.id, relays);

      return signedEvent.id;
    } catch (error) {
      if (error instanceof Error)
        console.error(`❌ Failed to publish article: ${error.message}`);
      throw error;
    }
  }

  private createArticleId(url: string): string {
    // Create a unique identifier from the URL
    // Remove protocol and domain, keep path
    const urlPath = new URL(url).pathname;
    return urlPath.replace(/^\//, "").replace(/\/$/, "") || "article";
  }

  private buildTags(article: RektArticle, articleId: string): string[][] {
    const tags: string[][] = [
      ["d", articleId], // Required for addressable events
      ["title", article.title],
      [
        "published_at",
        Math.floor(article.publishedAt.getTime() / 1000).toString(),
      ],
      ["client", "rekt-nostr-mirror"],
      ["r", article.url], // Reference to original article
    ];

    // Add summary if available
    if (article.summary) {
      tags.push(["summary", article.summary]);
    }

    // Add image if available
    if (article.image) {
      tags.push(["image", article.image]);
    }

    // Add tags (hashtags)
    article.tags.forEach((tag) => {
      tags.push(["t", tag.toLowerCase()]);
    });

    // Add subject tags for categorization
    tags.push(["subject", "DeFi Security"]);
    tags.push(["subject", "Blockchain"]);

    return tags;
  }

  private async waitForPublication(
    eventId: string,
    relays: string[],
  ): Promise<void> {
    console.log("⏳ Waiting for publication confirmations...");

    return new Promise((resolve) => {
      let confirmations = 0;

      // Subscribe to see if the event appears on relays
      const observable = pool.subscription(relays, {
        ids: [eventId],
      });

      const subscription = observable.subscribe(() => {
        confirmations++;
        if (confirmations >= Math.ceil(relays.length / 2)) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          console.log(
            `✅ Publication confirmed on ${confirmations}/${relays.length} relays`,
          );
          resolve();
        }
      });

      const timeout = setTimeout(() => {
        subscription.unsubscribe(); // Always unsubscribe on timeout
        console.log(
          `✅ Publication completed with ${confirmations}/${relays.length} confirmations`,
        );
        resolve();
      }, 5000); // Wait max 5 seconds
    });
  }

  async publishMultipleArticles(
    articles: { article: RektArticle; markdown: string }[],
    options: PublishOptions,
    delayMs: number = 5000,
  ): Promise<string[]> {
    const eventIds: string[] = [];

    console.log(
      `📚 Publishing ${articles.length} articles with ${delayMs}ms delay between each...`,
    );

    for (let i = 0; i < articles.length; i++) {
      const { article, markdown } = articles[i]!;

      try {
        console.log(
          `\n📖 Publishing ${i + 1}/${articles.length}: ${article.title}`,
        );
        const eventId = await this.publishArticle(article, markdown, options);
        eventIds.push(eventId);

        // Delay between publications to avoid rate limiting
        if (i < articles.length - 1) {
          console.log(`⏸️  Waiting ${delayMs}ms before next publication...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        if (error instanceof Error)
          console.error(
            `❌ Failed to publish article "${article.title}": ${error.message}`,
          );
        // Continue with next article
      }
    }

    return eventIds;
  }
}
