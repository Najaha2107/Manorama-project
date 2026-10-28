import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY is missing. Add it to your .env file.");
}

// Create the API client only when a key exists. The app still works in local fallback mode without credits.
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

app.use(express.json({ limit: "100kb" }));
app.use(express.static(__dirname));

function wordCount(text) {
  return (String(text || "").trim().match(/\S+/g) || []).length;
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error(`${label} is required.`);
    error.status = 400;
    throw error;
  }
  if (value.length > 10000) {
    const error = new Error(`${label} is too long (maximum 10,000 characters).`);
    error.status = 413;
    throw error;
  }
  return value.trim();
}

async function askAI(instructions, input) {
  if (!openai) {
    const error = new Error("OpenAI API key is not configured; using local fallback.");
    error.code = "AI_UNAVAILABLE";
    throw error;
  }
  const response = await openai.responses.create({
    model: "gpt-6-astra",
    instructions,
    input
  });
  return (response.output_text || "").trim();
}

// Free local fallback: trims the source without inventing new facts.
function fallbackTicker(source) {
  let text = String(source || "").replace(/\s+/g, " ").trim();
  if (!text) return "Announcement available for review";
  // Use the first sentence when possible, then keep the first 10 words.
  text = (text.match(/[^.!?]+[.!?]?/) || [text])[0].trim();
  text = text.replace(/^(breaking news:|announcement:|update:|notice:)\s*/i, "");
  const words = text.match(/\S+/g) || [];
  if (words.length > 10) text = words.slice(0, 10).join(" ").replace(/[,:;â€”-]+$/, "");
  return text || "Announcement available for review";
}

function fallbackAlternatives(source, current) {
  const base = fallbackTicker(source);
  const clean = base.replace(/[.!?]+$/, "");
  const candidates = [
    clean,
    `Update: ${clean}`,
    `Latest: ${clean}`
  ].map(value => (value.match(/\S+/g) || []).slice(0, 10).join(" "));
  const unique = [...new Set(candidates)].filter(value => value && value.toLowerCase() !== String(current).trim().toLowerCase());
  while (unique.length < 3) unique.push((base.match(/\S+/g) || []).slice(0, Math.max(1, 10 - unique.length)).join(" "));
  return [...new Set(unique)].slice(0, 3);
}

function fallbackDriftCheck(source, ticker) {
  const sourceText = String(source || "").toLowerCase();
  const tickerText = String(ticker || "").toLowerCase();
  const numbers = String(ticker || "").match(/\b\d+(?:[.,]\d+)?%?\b/g) || [];
  const missingNumbers = numbers.filter(number => !sourceText.includes(number.toLowerCase()));
  const driftDetected = missingNumbers.length > 0;
  return {
    driftDetected,
    explanation: driftDetected
      ? "Local check found number(s) in the ticker that do not appear exactly in the source. Review manually."
      : "Local basic check found no unmatched numbers. This is not a full factual verification; review the source manually.",
    concerns: missingNumbers.map(number => `Number not found in source: ${number}`),
    mode: "fallback"
  };
}

function isAiFailure(error) {
  // Keep input validation errors visible; use fallback for API, billing, network, or model errors.
  return !error.status || error.status >= 500 || error.status === 429 || error.code === "AI_UNAVAILABLE";
}

app.post("/api/generate", async (req, res) => {
  let announcement;
  try {
    announcement = requireText(req.body.announcement, "Announcement");
    try {
      const ticker = await askAI(
        "Create one concise broadcast-style news ticker. Use no more than 10 words. Use only facts stated in the supplied announcement. Do not invent names, dates, numbers, locations, or claims. Return only the ticker text.",
        announcement
      );
      if (!ticker || wordCount(ticker) > 10) throw new Error("AI returned an empty or overlong ticker.");
      return res.json({ ticker, wordCount: wordCount(ticker), mode: "ai", notice: "Generated with AI. Verify against the original source." });
    } catch (error) {
      if (!isAiFailure(error)) throw error;
      const ticker = fallbackTicker(announcement);
      return res.json({ ticker, wordCount: wordCount(ticker), mode: "fallback", notice: "AI unavailable or out of credits. A free local fallback was used; review wording and facts carefully." });
    }
  } catch (error) {
    console.error("Generate error:", error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : "Ticker generation failed." });
  }
});

app.post("/api/alternatives", async (req, res) => {
  try {
    const announcement = requireText(req.body.announcement, "Announcement");
    const ticker = requireText(req.body.ticker, "Ticker");
    try {
      const raw = await askAI(
        `Create exactly 3 distinct alternative broadcast news tickers for the current ticker.
Use only facts from the original announcement. Each alternative must be 10 words or fewer.
Do not add facts. Return valid JSON only in this format: {"alternatives":["...","...","..."]}.`,
        `Original announcement:\n${announcement}\n\nCurrent ticker:\n${ticker}`
      );
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(cleaned);
      const alternatives = (Array.isArray(parsed.alternatives) ? parsed.alternatives : [])
        .map(value => String(value).trim()).filter(value => value && wordCount(value) <= 10).slice(0, 3);
      return res.json({ alternatives, mode: "ai", notice: "AI alternatives generated. Verify each against the source." });
    } catch (error) {
      if (!isAiFailure(error) && !(error instanceof SyntaxError)) throw error;
      return res.json({ alternatives: fallbackAlternatives(announcement, ticker), mode: "fallback", notice: "AI unavailable or out of credits. Basic local alternatives were created; review them carefully." });
    }
  } catch (error) {
    console.error("Alternatives error:", error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : "Could not generate alternatives." });
  }
});

app.post("/api/check-drift", async (req, res) => {
  try {
    const announcement = requireText(req.body.announcement, "Announcement");
    const ticker = requireText(req.body.ticker, "Ticker");
    try {
      const raw = await askAI(
        `Compare the ticker with the original announcement and detect possible factual drift.
A drift means the ticker adds, changes, or contradicts a name, number, date, place, event, or factual claim.
Return valid JSON only: {"driftDetected":true,"explanation":"short explanation","concerns":["specific concern"]}.
If no drift is apparent, return driftDetected false and an empty concerns array.
This is an editorial aid, not a guarantee of factual accuracy.`,
        `Original announcement:\n${announcement}\n\nTicker to check:\n${ticker}`
      );
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(cleaned);
      return res.json({
        driftDetected: Boolean(parsed.driftDetected),
        explanation: String(parsed.explanation || "No explanation supplied."),
        concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map(String).slice(0, 8) : [],
        mode: "ai"
      });
    } catch (error) {
      if (!isAiFailure(error) && !(error instanceof SyntaxError)) throw error;
      return res.json(fallbackDriftCheck(announcement, ticker));
    }
  } catch (error) {
    console.error("Drift check error:", error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : "Source drift check failed." });
  }
});

const startedAt = new Date();

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "News Ticker Generator",
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: startedAt.toISOString(),
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    fallbackEnabled: true,
    generationMode: process.env.OPENAI_API_KEY ? "AI with automatic fallback" : "Free local fallback",
    environment: process.env.NODE_ENV || "development"
  });
});

const server = app.listen(PORT, () => {
  const line = "==================================================";
  console.log(`\n${line}`);
  console.log("  NEWS TICKER GENERATOR | SERVER CONSOLE");
  console.log(line);
  console.log(`  Status       : RUNNING`);
  console.log(`  Local URL    : http://localhost:${PORT}`);
  console.log(`  Health Check : http://localhost:${PORT}/api/health`);
  console.log(`  AI API Key   : ${process.env.OPENAI_API_KEY ? "CONFIGURED" : "MISSING - check .env"}`);
  console.log(`  Environment  : ${process.env.NODE_ENV || "development"}`);
  console.log(`  Started At   : ${startedAt.toLocaleString()}`);
  console.log(line);
  console.log("  Keep this terminal open while using the website.");
  console.log(`${line}\n`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`[SERVER ERROR] Port ${PORT} is already in use.`);
    console.error(`Stop the existing process or start with another port: PORT=3001 npm start`);
    process.exitCode = 1;
    return;
  }
  console.error("[SERVER ERROR]", error.message);
  process.exitCode = 1;
});