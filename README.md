# 🔥 Rekt.news → Nostr Mirror

A Bun-powered script that automatically scrapes the latest articles from [rekt.news](https://rekt.news) and publishes them to Nostr as NIP-23 long-form content events.

## Features

- 🕷️ **Smart Scraping**: Extracts articles and metadata from rekt.news
- 📝 **Markdown Conversion**: Converts HTML content to clean, NIP-23 compliant Markdown
- 🔗 **Nostr Publishing**: Publishes articles as NIP-23 addressable events
- 🔐 **Flexible Authentication**: Supports both nsec keys and NIP-46 bunker URIs
- 🚀 **Batch Processing**: Handles multiple articles with configurable delays
- 🔍 **Duplicate Detection**: Skips already published articles
- 🧪 **Dry Run Mode**: Preview articles before publishing

## Installation

### Prerequisites

- [Bun](https://bun.sh) v1.0.0 or later
- A Nostr private key (nsec) or NIP-46 bunker connection

### Setup

1. Clone and install dependencies:

```bash
git clone <your-repo>
cd rekt-nostr-mirror
bun install
```

2. Make the script executable:

```bash
chmod +x index.ts
```

## Usage

### Basic Commands

```bash
# Preview articles without publishing (dry run)
bun run index.ts --dry-run --limit 3

# Publish latest 5 articles with nsec key
bun run index.ts --signer nsec1your_private_key_here --limit 5

# Use NIP-46 bunker for remote signing
bun run index.ts --signer "bunker://pubkey@relay.com?relay=wss://relay.com" --limit 3

# Publish to custom relays
bun run index.ts --signer nsec1... --relays "wss://relay.damus.io,wss://nos.lol"
```

### Command Line Options

The CLI uses [yargs](https://yargs.js.org/) for robust argument parsing and validation:

| Option            | Short | Description                       | Default     |
| ----------------- | ----- | --------------------------------- | ----------- |
| `--signer`        | `-s`  | Nostr signer (nsec or bunker URI) | Required\*  |
| `--limit`         | `-l`  | Number of articles to fetch       | 5           |
| `--delay`         | `-d`  | Delay between publications (ms)   | 5000        |
| `--relays`        | `-r`  | Comma-separated relay URLs        | Default set |
| `--skip-existing` |       | Skip already published articles   | true        |
| `--dry-run`       |       | Preview mode - don't publish      | false       |
| `--help`          | `-h`  | Show help message                 |             |
| `--version`       | `-v`  | Show version number               |             |

\*Required unless using `--dry-run`

**Validation features:**

- Automatic type checking for numeric values
- Custom validation messages for invalid inputs
- Smart help formatting with examples
- Proper error handling with usage display

### Examples

#### Development & Testing

```bash
# Quick preview of latest articles
bun run index.ts --dry-run --limit 2

# Test with minimal delay
bun run index.ts --signer nsec1... --limit 1 --delay 1000
```

#### Production Usage

```bash
# Daily sync - publish latest 10 articles
bun run index.ts --signer nsec1... --limit 10

# Weekly batch - publish up to 25 articles
bun run index.ts --signer nsec1... --limit 25 --delay 10000

# Custom relay setup
bun run index.ts \
  --signer "bunker://..." \
  --limit 5 \
  --relays "wss://relay.damus.io,wss://nos.lol,wss://relay.snort.social"
```

## Best Practices

### HTML to Markdown Conversion

The script uses advanced HTML-to-Markdown conversion with several optimizations:

**✅ What works well:**

- Automatic cleanup of navigation, ads, and social widgets
- Preservation of code blocks with syntax highlighting
- Smart handling of embedded content (Twitter, YouTube)
- Relative URL conversion to absolute URLs
- Clean paragraph and heading formatting

**⚠️ What to watch for:**

- Very image-heavy articles may need manual review
- Complex tables might lose some formatting
- Interactive elements become static content

**🔧 Customization:**
Edit `src/markdown-converter.ts` to adjust conversion rules for specific content patterns.

### Publishing Strategy

**Recommended approach:**

1. **Start with dry run**: Always preview articles first
2. **Small batches**: Use `--limit 5` or less for initial testing
3. **Reasonable delays**: Keep `--delay` at 5000ms+ to respect relays
4. **Monitor duplicates**: The default `--skip-existing` prevents reposts

**Rate limiting considerations:**

- Most relays accept 1 event per second
- Large articles may take longer to propagate
- Use `--delay 10000` for conservative publishing

### Relay Selection

**Default relays** (automatically used):

- wss://relay.damus.io
- wss://nos.lol
- wss://relay.nostr.band
- wss://nostr.wine
- wss://relay.snort.social

**Custom relays:**

```bash
# Specify your preferred relays
--relays "wss://your-relay.com,wss://backup-relay.com"
```

**Relay recommendations:**

- Use 3-5 relays for good distribution
- Include at least one major public relay
- Consider geographic distribution
- Test relay connectivity before batch operations

## NIP-23 Compliance

Articles are published as **NIP-23 Long-form Content** events with:

- **Kind**: 30023 (addressable event)
- **Content**: Clean Markdown formatted text
- **Tags**:
  - `d`: Unique article identifier (derived from URL)
  - `title`: Article title
  - `published_at`: Original publication timestamp
  - `summary`: Article summary/description
  - `image`: Featured image URL
  - `t`: Topic tags (rekt, defi, security)
  - `r`: Reference to original rekt.news URL
  - `client`: Attribution to rekt-nostr-mirror

## Automation

### Cron Job Setup

Add to your crontab for automated publishing:

```bash
# Every 6 hours - check for new articles
0 */6 * * * cd /path/to/rekt-nostr-mirror && bun run index.ts --signer "nsec1..." --limit 5 >> /var/log/rekt-mirror.log 2>&1

# Daily at 9 AM - larger batch
0 9 * * * cd /path/to/rekt-nostr-mirror && bun run index.ts --signer "nsec1..." --limit 10 --delay 8000 >> /var/log/rekt-mirror.log 2>&1
```

### Systemd Service

Create `/etc/systemd/system/rekt-mirror.service`:

```ini
[Unit]
Description=Rekt News Nostr Mirror
After=network.target

[Service]
Type=oneshot
User=your-user
WorkingDirectory=/path/to/rekt-nostr-mirror
ExecStart=/usr/local/bin/bun run index.ts --signer "nsec1..." --limit 5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then create a timer `/etc/systemd/system/rekt-mirror.timer`:

```ini
[Unit]
Description=Run Rekt News Mirror every 6 hours
Requires=rekt-mirror.service

[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable with:

```bash
sudo systemctl enable rekt-mirror.timer
sudo systemctl start rekt-mirror.timer
```

## Error Handling

The script includes comprehensive error handling:

- **Network failures**: Retries with graceful degradation
- **Parsing errors**: Skips problematic articles and continues
- **Relay issues**: Continues with available relays
- **Signing errors**: Clear error messages with troubleshooting hints

**Common issues:**

1. **"Failed to initialize signer"**
   - Check nsec format (starts with `nsec1`)
   - Verify bunker URI is complete and accessible

2. **"No articles found"**
   - rekt.news might be down or changed structure
   - Try with `--dry-run` to debug scraping

3. **"Publication failed"**
   - Check relay connectivity
   - Verify your key has required permissions

## Development

### Project Structure

```
rekt-nostr-mirror/
├── src/
│   ├── scraper.ts          # rekt.news content extraction
│   ├── markdown-converter.ts   # HTML → Markdown conversion
│   └── nip23-publisher.ts      # Nostr NIP-23 publishing
├── nostr.ts               # Nostr client setup
├── index.ts               # Main CLI application
└── package.json           # Dependencies and scripts
```

### Adding Features

1. **New content sources**: Extend `RektScraper` class
2. **Custom formatting**: Modify `MarkdownConverter` rules
3. **Different event types**: Create new publisher classes
4. **Additional metadata**: Update tag generation in `NIP23Publisher`

### Dependencies

- **applesauce-\*\*\***: Nostr client and cryptography
- **cheerio**: HTML parsing and manipulation
- **turndown**: HTML to Markdown conversion
- **turndown-plugin-gfm**: GitHub Flavored Markdown support

## Contributing

1. Fork the repository
2. Create a feature branch
3. Test with `--dry-run` extensively
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Disclaimer

This tool is for educational and informational purposes. Always respect:

- rekt.news terms of service
- Relay policies and rate limits
- Content attribution and licensing
- Nostr protocol best practices

The mirrored content retains links to original articles and proper attribution.
