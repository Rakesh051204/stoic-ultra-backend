// routes/upload.js
// Full rebuild — yesterday's version only had the pdf-parse import fix,
// nothing else. This is the complete route: multer, per-type processing,
// and the DELETE endpoint SearchBox.jsx already calls on the X button.

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── pdf-parse loader ────────────────────────────────────────────────
// The old "reach into lib/pdf-parse.js" trick hardcoded an internal file
// path that differs between pdf-parse versions — that's exactly why you
// got "pdfParse is not a function". This tries the normal import first
// (correct 99% of the time via ESM/CJS interop) and only falls back to
// the internal-path trick if that fails, logging exactly what it found
// either way so a second failure is diagnosable instead of silent.
let _pdfParseFn = null;
async function getPdfParseFn() {
  if (_pdfParseFn) return _pdfParseFn;

  try {
    const mod = await import('pdf-parse');
    const candidate = typeof mod.default === 'function' ? mod.default : mod;
    if (typeof candidate === 'function') {
      _pdfParseFn = candidate;
      return _pdfParseFn;
    }
    console.warn('pdf-parse standard import resolved but was not callable:', typeof candidate);
  } catch (err) {
    console.warn('pdf-parse standard import failed:', err.message);
  }

  try {
    const entry = require.resolve('pdf-parse');
    const libPath = entry.replace(/index\.js$/, 'lib/pdf-parse.js');
    const mod = require(libPath);
    const candidate = typeof mod === 'function' ? mod : mod.default;
    if (typeof candidate === 'function') {
      _pdfParseFn = candidate;
      return _pdfParseFn;
    }
    console.error(
      'pdf-parse lib fallback did not yield a function. Shape:',
      typeof mod,
      mod && typeof mod === 'object' ? Object.keys(mod) : mod
    );
  } catch (err) {
    console.warn('pdf-parse lib fallback failed:', err.message);
  }

  throw new Error('Could not resolve a callable pdf-parse function — check `npm ls pdf-parse` for the installed version.');
}

// ─── other processors ─────────────────────────────────────────────
import mammoth from 'mammoth';
import ffmpeg from 'fluent-ffmpeg';
import AdmZip from 'adm-zip';

const router = express.Router();

// ─── storage dirs ──────────────────────────────────────────────────
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const KEYFRAME_ROOT = path.join(UPLOAD_ROOT, 'keyframes');
for (const dir of [UPLOAD_ROOT, KEYFRAME_ROOT]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── in-memory session file store ──────────────────────────────────
// sessionId -> Map(fileId -> fileRecord)
// Exported so routes/chat.js (or wherever the LLM call is built) can
// pull extracted text / transcripts / keyframe paths into the prompt.
const sessionFiles = new Map();

function getSessionMap(sessionId) {
  if (!sessionFiles.has(sessionId)) sessionFiles.set(sessionId, new Map());
  return sessionFiles.get(sessionId);
}

export function getFileRecord(sessionId, fileId) {
  return sessionFiles.get(sessionId)?.get(fileId) || null;
}

export function getSessionFileContext(sessionId) {
  const map = sessionFiles.get(sessionId);
  if (!map || map.size === 0) return '';
  const parts = [];
  for (const rec of map.values()) {
    if (rec.extractedText) {
      parts.push(`--- File: ${rec.name} (${rec.category}) ---\n${rec.extractedText}`);
    }
  }
  return parts.join('\n\n');
}

// ─── compatibility exports for existing index.js ───────────────────
// Your index.js already imports these two names from a prior version
// of this file. Keeping the same names/shape so nothing else in
// index.js has to change.

// Returns the raw attachment records for a session (array form) so
// index.js / chat logic can read name, type, extractedText, keyframes.
export function getAttachments(sessionId) {
  const map = sessionFiles.get(sessionId);
  if (!map) return [];
  return Array.from(map.values());
}

// Clears all attachments for a session — call this after a message
// that used them has been sent, or when starting a new chat.
export function clearAttachments(sessionId) {
  const map = sessionFiles.get(sessionId);
  if (!map) return;
  for (const rec of map.values()) {
    try {
      if (fs.existsSync(rec.path)) fs.unlinkSync(rec.path);
      for (const kf of rec.keyframes || []) {
        const kfPath = path.join(KEYFRAME_ROOT, kf);
        if (fs.existsSync(kfPath)) fs.unlinkSync(kfPath);
      }
    } catch (err) {
      console.warn('Cleanup warning on clearAttachments:', err.message);
    }
  }
  sessionFiles.delete(sessionId);
}

// ─── multer config ──────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_ROOT),
  filename: (req, file, cb) => {
    const id = randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/'];
const ALLOWED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.txt', '.md', '.csv', '.json',
  '.zip', '.rar', '.7z', '.xlsx', '.xls', '.ppt', '.pptx',
];

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const okMime = ALLOWED_MIME_PREFIXES.some((p) => file.mimetype.startsWith(p));
  const okExt = ALLOWED_EXTENSIONS.includes(ext);
  if (okMime || okExt) return cb(null, true);
  cb(new Error(`Unsupported file type: ${file.mimetype || ext}`));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB ceiling, video needs headroom
});

// ─── category detection ─────────────────────────────────────────────
function categorize(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype.startsWith('image/')) return 'image';
  if (file.mimetype.startsWith('video/')) return 'video';
  if (file.mimetype.startsWith('audio/')) return 'audio';
  if (ext === '.pdf') return 'pdf';
  if (['.doc', '.docx'].includes(ext)) return 'docx';
  if (['.txt', '.md', '.csv', '.json'].includes(ext)) return 'text';
  if (['.zip'].includes(ext)) return 'zip';
  if (['.rar', '.7z'].includes(ext)) return 'archive';
  if (['.xlsx', '.xls'].includes(ext)) return 'spreadsheet';
  if (['.ppt', '.pptx'].includes(ext)) return 'slides';
  return 'other';
}

// ─── per-type processors ────────────────────────────────────────────

async function processPdf(filePath) {
  const parseFn = await getPdfParseFn();
  const buffer = fs.readFileSync(filePath);
  const result = await parseFn(buffer);
  return { extractedText: (result.text || '').slice(0, 20000) };
}

async function processDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return { extractedText: (result.value || '').slice(0, 20000) };
}

async function processText(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return { extractedText: raw.slice(0, 20000) };
}

async function processZip(filePath) {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries().map((e) => e.entryName);
  return { extractedText: `Archive contents (${entries.length} files):\n${entries.slice(0, 200).join('\n')}` };
}

function ffprobeDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(data.format.duration || 0);
    });
  });
}

function extractAudio(filePath, outPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .noVideo()
      .audioCodec('libmp3lame')
      .format('mp3')
      .on('end', () => resolve(outPath))
      .on('error', reject)
      .save(outPath);
  });
}

function extractKeyframes(filePath, outDir, id, everySeconds = 8) {
  return new Promise((resolve, reject) => {
    const pattern = path.join(outDir, `${id}_%03d.png`);
    ffmpeg(filePath)
      .outputOptions([`-vf fps=1/${everySeconds}`])
      .on('end', () => {
        const files = fs
          .readdirSync(outDir)
          .filter((f) => f.startsWith(`${id}_`))
          .map((f) => path.join(outDir, f));
        resolve(files);
      })
      .on('error', reject)
      .save(pattern);
  });
}

// Groq Whisper transcription via raw fetch — avoids assuming a specific
// SDK is installed. Reads GROQ_API_KEY lazily (matches your dotenv
// hoisting fix elsewhere in the backend).
async function transcribeAudio(audioPath) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  GROQ_API_KEY not set — skipping transcription');
    return '';
  }
  const buffer = fs.readFileSync(audioPath);
  const form = new FormData();
  form.append('file', new Blob([buffer]), path.basename(audioPath));
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'text');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('Whisper transcription failed:', res.status, errText);
    return '';
  }
  return res.text();
}

async function processVideo(filePath, id) {
  const audioPath = path.join(UPLOAD_ROOT, `${id}_audio.mp3`);
  let transcript = '';
  let keyframePaths = [];

  try {
    await extractAudio(filePath, audioPath);
    transcript = await transcribeAudio(audioPath);
  } catch (err) {
    console.error('Video audio/transcription step failed:', err.message);
  } finally {
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }

  try {
    keyframePaths = await extractKeyframes(filePath, KEYFRAME_ROOT, id);
  } catch (err) {
    console.error('Keyframe extraction failed:', err.message);
  }

  return {
    extractedText: transcript ? `Video transcript:\n${transcript.slice(0, 20000)}` : '',
    keyframes: keyframePaths.map((p) => path.basename(p)),
  };
}

async function processAudio(filePath, id) {
  const transcript = await transcribeAudio(filePath).catch((err) => {
    console.error('Audio transcription failed:', err.message);
    return '';
  });
  return { extractedText: transcript ? `Audio transcript:\n${transcript.slice(0, 20000)}` : '' };
}

// ─── routes ──────────────────────────────────────────────────────────

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { sessionId } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: 'No file received' });
    if (!sessionId) return res.status(400).json({ success: false, error: 'Missing sessionId' });

    const category = categorize(file);
    const id = path.parse(file.filename).name; // multer already gave this file a uuid name
    const filePath = file.path;

    let extra = {};
    try {
      switch (category) {
        case 'pdf':
          extra = await processPdf(filePath);
          break;
        case 'docx':
          extra = await processDocx(filePath);
          break;
        case 'text':
          extra = await processText(filePath);
          break;
        case 'zip':
          extra = await processZip(filePath);
          break;
        case 'video':
          extra = await processVideo(filePath, id);
          break;
        case 'audio':
          extra = await processAudio(filePath, id);
          break;
        case 'image':
        default:
          extra = {}; // vision handling happens at chat-send time, not here
          break;
      }
    } catch (procErr) {
      console.error(`Processing failed for ${category}:`, procErr);
      extra = { extractedText: '', processingError: procErr.message };
    }

    const record = {
      id,
      name: file.originalname,
      type: category,
      mimetype: file.mimetype,
      size: file.size,
      path: filePath,
      uploadedAt: Date.now(),
      ...extra,
    };

    getSessionMap(sessionId).set(id, record);

    res.json({
      success: true,
      id,
      name: record.name,
      type: record.type,
      size: record.size,
      hasText: Boolean(record.extractedText),
      keyframeCount: record.keyframes?.length || 0,
    });
  } catch (err) {
    console.error('Upload route failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/upload/:id', (req, res) => {
  const { id } = req.params;
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ success: false, error: 'Missing sessionId' });

  const map = sessionFiles.get(sessionId);
  const record = map?.get(id);
  if (!record) return res.status(404).json({ success: false, error: 'File not found' });

  try {
    if (fs.existsSync(record.path)) fs.unlinkSync(record.path);
    for (const kf of record.keyframes || []) {
      const kfPath = path.join(KEYFRAME_ROOT, kf);
      if (fs.existsSync(kfPath)) fs.unlinkSync(kfPath);
    }
  } catch (err) {
    console.warn('Cleanup warning on delete:', err.message);
  }

  map.delete(id);
  res.json({ success: true, id, deleted: true });
});

export default router;