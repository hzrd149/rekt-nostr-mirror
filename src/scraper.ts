import * as cheerio from "cheerio";

export interface RektArticle {
  title: string;
  url: string;
  content: string;
  publishedAt: Date;
  summary?: string;
  image?: string;
  tags: string[];
}

export class RektScraper {
  private baseUrl = "https://rekt.news";

  private isArticleLink(href: string): boolean {
    // Exclude common non-article patterns
    const excludePatterns = [
      "/tag/",
      "/tags/",
      "/category/",
      "/categories/",
      "/author/",
      "/authors/",
      "/page/",
      "/feed",
      "/rss",
      "/sitemap",
      "/search",
      "/api/",
      "/admin/",
      "/wp-",
      "#",
    ];

    // Exclude common navigation/meta pages
    const excludePages = [
      "/about",
      "/contact",
      "/privacy",
      "/terms",
      "/subscribe",
      "/archive",
      "/archives",
    ];

    const lowerHref = href.toLowerCase();

    // Check exclude patterns
    if (excludePatterns.some((pattern) => lowerHref.includes(pattern))) {
      return false;
    }

    // Check exclude pages (exact match or with trailing slash)
    if (
      excludePages.some(
        (page) => lowerHref === page || lowerHref === page + "/",
      )
    ) {
      return false;
    }

    // Must be at least 3 characters and not just numbers/symbols
    if (href.length < 3 || /^\/[\d\-_]+\/?$/.test(href)) {
      return false;
    }

    return true;
  }

  async fetchLatestArticles(limit: number = 50): Promise<RektArticle[]> {
    try {
      const response = await fetch(this.baseUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch rekt.news: ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const articles: RektArticle[] = [];

      // Find articles using the specific rekt.news structure
      $("article.post").each((_, element) => {
        const $article = $(element);

        // Get the main article link from the post title
        const $titleLink = $article.find(".post-title a").first();
        const href = $titleLink.attr("href");
        const title = $titleLink.text().trim();

        if (
          href &&
          href.startsWith("/") &&
          href !== "/" &&
          this.isArticleLink(href) &&
          title
        ) {
          // Extract publish date from post-meta
          let publishedAt = new Date();
          const dateText = $article.find(".post-meta time").text().trim();
          if (dateText) {
            const parsed = new Date(dateText);
            if (!isNaN(parsed.getTime())) {
              publishedAt = parsed;
            }
          }

          // Extract summary from post-excerpt
          const summary = $article
            .find(".post-excerpt p")
            .first()
            .text()
            .trim();

          // Extract tags from post-meta (but don't use them as article links)
          const tags = ["rekt", "defi", "security"];
          $article.find('.post-meta a[href*="tag="]').each((_, tagEl) => {
            const tagText = $(tagEl).text().trim().toLowerCase();
            if (tagText && !tags.includes(tagText)) {
              tags.push(tagText);
            }
          });

          articles.push({
            title,
            url: this.baseUrl + href,
            content: "",
            publishedAt,
            summary: summary || undefined,
            tags,
          });
        }
      });

      // Remove duplicates and limit
      const uniqueArticles = articles
        .filter(
          (article, index, self) =>
            self.findIndex((a) => a.url === article.url) === index,
        )
        .slice(0, limit);

      // Fetch full content for each article
      const fullArticles = await Promise.all(
        uniqueArticles.map((article) => this.fetchArticleContent(article)),
      );

      return fullArticles.filter((article) => article.content.length > 100);
    } catch (error) {
      console.error("Error fetching articles:", error);
      return [];
    }
  }

  async fetchArticleContent(article: RektArticle): Promise<RektArticle> {
    try {
      const response = await fetch(article.url);
      if (!response.ok) {
        console.warn(
          `Failed to fetch article ${article.url}: ${response.status}`,
        );
        return article;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract main content (try multiple selectors)
      const contentSelectors = [
        "article .content",
        ".post-content",
        ".entry-content",
        "main article",
        ".markdown-body",
        '[class*="content"]',
        "article",
      ];

      let content = "";
      for (const selector of contentSelectors) {
        const $content = $(selector).first();
        if ($content.length && $content.text().trim().length > 100) {
          content = $content.html() || "";
          break;
        }
      }

      // Extract metadata
      const title =
        $("h1").first().text().trim() ||
        $("title").text().trim() ||
        article.title;

      const summary =
        $('meta[name="description"]').attr("content") ||
        $('meta[property="og:description"]').attr("content") ||
        $("p").first().text().trim().slice(0, 200);

      const image =
        $('meta[property="og:image"]').attr("content") ||
        $("img").first().attr("src");

      // Extract publish date
      let publishedAt = article.publishedAt;
      const dateSelectors = [
        "time[datetime]",
        ".date",
        ".published",
        '[class*="date"]',
      ];

      for (const selector of dateSelectors) {
        const dateEl = $(selector).first();
        const datetime = dateEl.attr("datetime") || dateEl.text();
        if (datetime) {
          const parsed = new Date(datetime);
          if (!isNaN(parsed.getTime())) {
            publishedAt = parsed;
            break;
          }
        }
      }

      return {
        ...article,
        title,
        content: content || article.content,
        publishedAt,
        summary,
        image: image ? new URL(image, article.url).href : undefined,
      };
    } catch (error) {
      console.error(`Error fetching content for ${article.url}:`, error);
      return article;
    }
  }
}
