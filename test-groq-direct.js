import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
  timeout: 20 * 1000,
  maxRetries: 2,
});

console.log('🚀 Sending test request...');

try {
  const stream = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: 'Say "Hello world" and nothing else.' }],
    temperature: 0.3,
    max_tokens: 20,
    stream: true,
  });

  let count = 0;
  for await (const chunk of stream) {
    const content = chunk.choices?.[0]?.delta?.content || '';
    if (content) {
      console.log('📦', content);
      count++;
    }
  }
  console.log(`✅ Done, received ${count} chunks.`);
} catch (error) {
  console.error('🔥 Error:', error);
}