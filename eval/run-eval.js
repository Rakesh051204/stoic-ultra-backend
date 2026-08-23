import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: "../.env" });
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ⚠️ points to the streaming chat endpoint, port matches your backend's PORT (3001)
const API_URL = process.env.EVAL_API_URL || "http://localhost:3001/api/chat/stream";
const evalSet = JSON.parse(fs.readFileSync(path.join(__dirname, "eval-set.json"), "utf-8"));

async function callPipeline(query) {
  const start = Date.now();
  let firstTokenMs = null;
  let answer = "";
  let sources = [];
  let reasoning = "";

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: query, sessionId: `eval-${Date.now()}` })
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop();

    for (const chunk of chunks) {
      if (!chunk.startsWith("data:")) continue;
      const jsonStr = chunk.replace(/^data:\s*/, "").trim();
      if (!jsonStr) continue;

      let payload;
      try {
        payload = JSON.parse(jsonStr);
      } catch {
        continue;
      }

      // your backend uses "event" as the field name, not "type"
      switch (payload.event) {
        case "token":
          if (firstTokenMs === null) firstTokenMs = Date.now() - start;
          answer += payload.text || "";
          break;
        case "sources":
          sources = (payload.sources || []).map(s => s.url || s.domain || "");
          break;
        case "reasoning":
          reasoning += payload.text || "";
          break;
        case "error":
          throw new Error(payload.message || "stream error event");
        case "done":
          break;
        default:
          break; // thinking, images, jobs, map, followups — not needed for scoring
      }
    }
  }

  const latencyMs = Date.now() - start;
  return { sources, answer, reasoning, latencyMs, firstTokenMs };
}

async function judgeAnswer(query, answer, expectedKeywords) {
  const prompt = `You are grading an AI search assistant's answer.
Query: "${query}"
Answer: "${answer}"
Expected concepts to be present: ${JSON.stringify(expectedKeywords)}
Rate the answer 1-5 on:
- Faithfulness (does it avoid hallucination, stick to plausible facts)
- Coverage (does it include the expected concepts)
Return ONLY valid JSON, no markdown, no preamble:
{"score": <1-5>, "reasoning": "<one sentence>"}`;

  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [{ role: "user", content: prompt }],
    temperature: 0
  });

  const raw = completion.choices[0].message.content.trim();
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return { score: 0, reasoning: "judge parse failure" };
  }
}

function checkRetrieval(sources, expectedContains) {
  if (!expectedContains || expectedContains.length === 0) return 1;
  const hitCount = expectedContains.filter(domain =>
    sources.some(url => url.includes(domain))
  ).length;
  return hitCount / expectedContains.length;
}

async function runEval() {
  const results = [];

  for (const testCase of evalSet) {
    process.stdout.write(`Running: "${testCase.query}"... `);
    try {
      const { sources, answer, latencyMs, firstTokenMs } = await callPipeline(testCase.query);
      const retrievalRecall = checkRetrieval(sources, testCase.expected_sources_contain);

      // skip the judge for chitchat with no expected keywords — nothing meaningful to score
      let judged = { score: null, reasoning: "skipped (chitchat)" };
      if (testCase.category !== "chitchat" || (testCase.expected_answer_keywords || []).length > 0) {
        judged = await judgeAnswer(testCase.query, answer, testCase.expected_answer_keywords);
      }

      results.push({
        query: testCase.query,
        category: testCase.category,
        retrievalRecall,
        judgeScore: judged.score,
        judgeReasoning: judged.reasoning,
        latencyMs,
        firstTokenMs,
        answerPreview: answer.slice(0, 150)
      });

      console.log(
        `recall=${retrievalRecall.toFixed(2)} score=${judged.score ?? "n/a"} latency=${latencyMs}ms ttft=${firstTokenMs ?? "n/a"}ms`
      );
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      results.push({
        query: testCase.query,
        category: testCase.category,
        error: err.message
      });
    }
  }

  const resultsDir = path.join(__dirname, "results");
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);
  const outFile = path.join(resultsDir, `${Date.now()}.json`);

  const scored = results.filter(r => r.judgeScore != null);
  const recalled = results.filter(r => r.retrievalRecall != null);
  const latencies = results.filter(r => r.latencyMs != null);
  const avg = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  const summary = {
    totalTests: results.length,
    errorCount: results.filter(r => r.error).length,
    avgJudgeScore: avg(scored.map(r => r.judgeScore)),
    avgRetrievalRecall: avg(recalled.map(r => r.retrievalRecall)),
    avgLatencyMs: avg(latencies.map(r => r.latencyMs)),
    avgFirstTokenMs: avg(latencies.map(r => r.firstTokenMs).filter(v => v != null)),
    byCategory: {}
  };

  for (const cat of [...new Set(results.map(r => r.category))]) {
    const inCat = results.filter(r => r.category === cat);
    summary.byCategory[cat] = {
      count: inCat.length,
      avgJudgeScore: avg(inCat.filter(r => r.judgeScore != null).map(r => r.judgeScore)),
      avgRetrievalRecall: avg(inCat.filter(r => r.retrievalRecall != null).map(r => r.retrievalRecall))
    };
  }

  fs.writeFileSync(outFile, JSON.stringify({ summary, results }, null, 2));
  console.log(`\nSummary:`, summary);
  console.log(`\nSaved full results to ${outFile}`);
}

runEval();