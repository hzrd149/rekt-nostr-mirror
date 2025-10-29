import TurndownService from "turndown";
import * as cheerio from "cheerio";

export interface ConversionResult {
  markdown: string;
  extractedImage?: string;
}

export class MarkdownConverter {
  private turndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      fence: "```",
      emDelimiter: "*",
      strongDelimiter: "**",
      linkStyle: "inlined",
      linkReferenceStyle: "full",
      preformattedCode: false,
    });

    // Custom rules for better formatting
    this.addCustomRules();
  }

  private addCustomRules() {
    // Remove script and style tags completely
    this.turndownService.addRule("removeScripts", {
      filter: ["script", "style", "nav", "header", "footer", "aside"],
      replacement: () => "",
    });

    // Clean up divs - convert to paragraphs if they contain text
    this.turndownService.addRule("cleanDivs", {
      filter: "div",
      replacement: (content, node) => {
        const textContent = node.textContent?.trim();
        if (!textContent) return "";

        // If div contains only text (no block elements), treat as paragraph
        const hasBlockElements = node.querySelector(
          "p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre",
        );
        if (!hasBlockElements && textContent.length > 0) {
          return "\n\n" + content + "\n\n";
        }
        return content;
      },
    });

    // Improve image handling
    this.turndownService.addRule("images", {
      filter: "img",
      replacement: (content, node) => {
        // @ts-expect-error
        const alt = node.getAttribute("alt") || "";
        // @ts-expect-error
        const src = node.getAttribute("src") || "";
        // @ts-expect-error
        const title = node.getAttribute("title");

        if (!src) return "";

        const titlePart = title ? ` "${title}"` : "";
        return `![${alt}](${src}${titlePart})`;
      },
    });

    // Better blockquote handling
    this.turndownService.addRule("blockquotes", {
      filter: "blockquote",
      replacement: (content) => {
        return (
          content
            .trim()
            .split("\n")
            .map((line) => "> " + line)
            .join("\n") + "\n\n"
        );
      },
    });

    // Handle Twitter embeds and social media
    this.turndownService.addRule("socialEmbeds", {
      filter: (node) => {
        const classList = node.className || "";
        return (
          typeof classList === "string" &&
          (classList.includes("twitter") ||
            classList.includes("tweet") ||
            classList.includes("instagram") ||
            classList.includes("youtube"))
        );
      },
      replacement: (content, node) => {
        const link = node.querySelector("a")?.getAttribute("href");
        if (link) {
          return `\n\n[Embedded content: ${link}](${link})\n\n`;
        }
        return "\n\n*[Embedded social media content]*\n\n";
      },
    });
  }

  convertToMarkdown(html: string, baseUrl?: string): string {
    if (!html) return "";

    // Pre-process HTML with Cheerio for better cleaning
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $(
      "script, style, nav, header, footer, aside, .advertisement, .ads, .social-share",
    ).remove();

    // Convert relative URLs to absolute
    if (baseUrl) {
      $("img[src]").each((_, img) => {
        const src = $(img).attr("src");
        if (src && !src.startsWith("http")) {
          $(img).attr("src", new URL(src, baseUrl).href);
        }
      });

      $("a[href]").each((_, link) => {
        const href = $(link).attr("href");
        if (href && !href.startsWith("http") && !href.startsWith("#")) {
          $(link).attr("href", new URL(href, baseUrl).href);
        }
      });
    }

    // Clean up the HTML
    const cleanedHtml = $.html();

    // Convert to markdown
    let markdown = this.turndownService.turndown(cleanedHtml);

    // Post-process markdown
    markdown = this.postProcessMarkdown(markdown);

    return markdown;
  }

  private postProcessMarkdown(markdown: string): string {
    return (
      markdown
        // Remove excessive line breaks (more than 2 consecutive)
        .replace(/\n{3,}/g, "\n\n")
        // Clean up bullet points
        .replace(/^[\s]*[-*+]\s*$/gm, "")
        // Remove empty links
        .replace(/\[]\(\)/g, "")
        // Clean up whitespace around headers
        .replace(/^(#{1,6})\s*(.+)\s*$/gm, "$1 $2")
        // Ensure proper spacing around code blocks
        .replace(/```(\w+)?\n*(.+?)\n*```/gs, "```$1\n$2\n```")
        // Remove trailing whitespace
        .replace(/[ \t]+$/gm, "")
        // Ensure content starts and ends cleanly
        .trim()
    );
  }

  // Convert specific rekt.news content patterns
  convertRektArticle(html: string, baseUrl: string): ConversionResult {
    const $ = cheerio.load(html);

    // Remove rekt.news specific unwanted elements
    $(
      ".social-share, .newsletter-signup, .related-posts, .comments, #comments",
    ).remove();

    // Handle rekt.news specific formatting
    $(".highlight, .callout").each((_, element) => {
      $(element).replaceWith(`<blockquote>${$(element).html()}</blockquote>`);
    });

    // Convert code snippets
    $(".code, .solidity, .javascript").each((_, element) => {
      const lang =
        $(element)
          .attr("class")
          ?.split(" ")
          .find((c) =>
            ["solidity", "javascript", "python", "bash"].includes(c),
          ) || "";
      $(element).replaceWith(
        `<pre><code class="language-${lang}">${$(element).text()}</code></pre>`,
      );
    });

    const markdown = this.convertToMarkdown($.html(), baseUrl);

    // Extract image from the beginning of the markdown if it exists
    const result = this.extractLeadingImage(markdown);

    return result;
  }

  private extractLeadingImage(markdown: string): ConversionResult {
    // Regex to match an image at the very beginning of the markdown (with optional whitespace)
    const imageRegex = /^\s*!\[([^\]]*)\]\(([^)]+)\)(?:\s*\n)?/;
    const match = markdown.match(imageRegex);

    if (match) {
      const extractedImage = match[2]; // The URL from the markdown image
      const cleanedMarkdown = markdown.replace(imageRegex, "").trim();

      return {
        markdown: cleanedMarkdown,
        extractedImage,
      };
    }

    return {
      markdown,
      extractedImage: undefined,
    };
  }
}
