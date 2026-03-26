import * as cheerio from "cheerio";

/**
 * Extractive summarizer — no AI API needed.
 * Extracts the most important sentences from newsletter text.
 */
export function summarize(htmlOrText: string, maxSentences = 5): string {
  // Strip HTML to get plain text
  const text = stripHtml(htmlOrText);

  if (!text || text.length < 100) {
    return text || "No content available.";
  }

  // Split into sentences
  const sentences = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 500);

  if (sentences.length <= maxSentences) {
    return sentences.join(" ");
  }

  // Score sentences by importance
  const wordFreq = getWordFrequency(text);
  const scored = sentences.map((sentence) => ({
    sentence,
    score: scoreSentence(sentence, wordFreq),
  }));

  // Take top sentences, preserving original order
  const topIndices = scored
    .map((s, i) => ({ ...s, index: i }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index);

  return topIndices.map((s) => s.sentence).join(" ");
}

function stripHtml(html: string): string {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $("script, style, head, nav, footer, img, svg, picture, video, audio, iframe").remove();
  $(".unsubscribe, .footer, .email-footer, .mso, .preheader").remove();
  $("[style*='display:none'], [style*='display: none']").remove();

  // Replace links with just their text (no URLs needed for summarization)
  $("a").each((_, el) => {
    $(el).replaceWith($(el).text());
  });

  let text = $("body").text();
  text = text
    .replace(/\u200c/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b\u200d\ufeff]/g, "")
    .replace(/\[image[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function getWordFrequency(text: string): Map<string, number> {
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const stopWords = new Set([
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
    "her", "was", "one", "our", "out", "has", "have", "been", "from",
    "this", "that", "with", "they", "will", "each", "make", "like",
    "just", "over", "such", "more", "also", "back", "than", "them",
    "very", "when", "what", "your", "how", "its", "may", "into",
  ]);

  const freq = new Map<string, number>();
  for (const word of words) {
    if (!stopWords.has(word)) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }
  }
  return freq;
}

function scoreSentence(sentence: string, wordFreq: Map<string, number>): number {
  const words = sentence.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  if (words.length === 0) return 0;

  let score = 0;
  for (const word of words) {
    score += wordFreq.get(word) || 0;
  }

  // Normalize by sentence length to avoid bias toward long sentences
  return score / words.length;
}
