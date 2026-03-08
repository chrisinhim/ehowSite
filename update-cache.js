const fetch = require('node-fetch');
const fs = require('fs').promises;
const Parser = require('rss-parser');

// --- Configuration ---
// These will be read from GitHub Actions secrets
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

/**
 * Writes data to a JSON file.
 */
async function writeCacheFile(filename, videos) {
  const data = {
    items: videos,
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(filename, JSON.stringify(data, null, 2));
  console.log(`Successfully wrote ${videos.length} videos to ${filename}`);
}

/**
 * Main function to run the cache update process.
 */
async function updateCache() {
  if (!CHANNEL_ID) {
    throw new Error("YOUTUBE_CHANNEL_ID is not set in environment variables.");
  }

  console.log("Starting YouTube cache update using RSS Feed...");
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
  
  const parser = new Parser({
    customFields: {
      item: [
        ['yt:videoId', 'videoId'],
        ['media:group', 'mediaGroup']
      ]
    }
  });

  const feed = await parser.parseURL(url);
  
  if (!feed.items || feed.items.length === 0) {
    console.log("No recent video activities found in RSS feed.");
    return;
  }

  const videos = feed.items;
  console.log(`\n--- Processing ${videos.length} videos from RSS feed ---`);

  const upcoming = [];
  const live = [];
  const past = [];
  let skipped = 0;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  videos.forEach(item => {
    // RSS doesn't differentiate between live, upcoming and regular streams
    // We categorize them under 'past' if they were published/updated in the last 7 days.
    const pubDate = new Date(item.pubDate);
    
    // Construct an object similar to what streams.html expects
    const videoObj = {
      id: item.videoId || item.id.replace('yt:video:', ''),
      snippet: {
        title: item.title,
        publishedAt: pubDate.toISOString(),
      }
    };

    if (pubDate > sevenDaysAgo) {
      past.push(videoObj);
      console.log(`  [PAST] ${videoObj.snippet.title} (published: ${videoObj.snippet.publishedAt})`);
    } else {
      skipped++;
      console.log(`  [SKIPPED - OLDER] ${videoObj.snippet.title} (published: ${videoObj.snippet.publishedAt}, older than 7 days)`);
    }
  });

  // Sort by date (newest first)
  past.sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));

  // --- Summary ---
  console.log(`\n--- Categorization Summary ---`);
  console.log(`  Live streams (RSS unsupported): ${live.length}`);
  console.log(`  Upcoming streams (RSS unsupported): ${upcoming.length}`);
  console.log(`  Past week streams: ${past.length}`);
  console.log(`  Skipped (older than 7 days): ${skipped}`);
  console.log(`  Total processed: ${past.length + skipped}/${videos.length}`);
  console.log(`  Reference time (7 days ago): ${sevenDaysAgo.toISOString()}\n`);

  // --- Write cache files ---
  await writeCacheFile('upcoming_cache.json', upcoming);
  await writeCacheFile('live_cache.json', live);
  await writeCacheFile('past_week_cache.json', past);

  console.log("YouTube cache update finished successfully.");
}

updateCache().catch(err => console.error(err));