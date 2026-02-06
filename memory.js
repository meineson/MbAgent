import { setGlobalDispatcher, ProxyAgent } from 'undici';
const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || 'http://localhost:10808';
setGlobalDispatcher(new ProxyAgent(proxyUrl));

import pkg from "faiss-node";
const { Index } = pkg;
import { pipeline } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, 'faiss_db');
const INDEX_FILE = path.join(MEMORY_DIR, 'index.faiss');

if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

let store = null;
let extractor = null;
const DIMENSION = 384;

async function getExtractor() {
  if (extractor) return extractor;
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  return extractor;
}

async function generateEmbedding(text) {
  const model = await getExtractor();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

async function getStore() {
  if (store) return store;

  let index;
  if (fs.existsSync(INDEX_FILE)) {
    const data = fs.readFileSync(INDEX_FILE);
    index = await pkg.Index.fromBuffer(data);
  } else {
    index = new pkg.Index(DIMENSION);
  }

  store = {
    index,
    memories: [],
    load: async () => {
      const metaFile = INDEX_FILE.replace('.faiss', '.json');
      if (fs.existsSync(metaFile)) {
        store.memories = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
      }
    },
    save: async () => {
      const buffer = await index.toBuffer();
      fs.writeFileSync(INDEX_FILE, buffer);
      const metaFile = INDEX_FILE.replace('.faiss', '.json');
      fs.writeFileSync(metaFile, JSON.stringify(store.memories, null, 2));
    },
    add: async (text, metadata) => {
      const embedding = await generateEmbedding(text);
      await index.add(embedding);
      const id = store.memories.length;
      store.memories.push({ id, text, metadata, createdAt: new Date().toISOString() });
      await store.save();
    },
    search: async (query, topK = 3) => {
      if (store.memories.length === 0) return [];
      const ntotal = await index.ntotal();
      const k = Math.min(topK, ntotal);
      const queryEmbedding = await generateEmbedding(query);
      const { labels } = await index.search(queryEmbedding, k);
      return labels.map(i => store.memories[i]).filter(Boolean);
    }
  };

  await store.load();
  console.log(`[Memory] 加载了 ${store.memories.length} 条历史记忆`);
  return store;
}

async function addMemory(text, metadata = {}) {
  const s = await getStore();
  await s.add(text, metadata);
  console.log(`[Memory] 保存记忆: "${text.substring(0, 30)}..."`);
}

async function searchMemories(query, topK = 3) {
  const s = await getStore();
  const results = await s.search(query, topK);
  console.log(`[Memory] 检索到 ${results.length} 条相关记忆`);
  return results;
}

async function clearMemories() {
  const s = await getStore();
  s.memories = [];
  if (fs.existsSync(INDEX_FILE)) fs.unlinkSync(INDEX_FILE);
  const metaFile = INDEX_FILE.replace('.faiss', '.json');
  if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
  store = null;
  console.log('[Memory] 已清空所有记忆');
}

async function getStats() {
  const s = await getStore();
  return { total: s.memories.length };
}

export { addMemory, searchMemories, clearMemories, getStats };
