console.log('🚀 test-groq.js started');

import express from 'express'
import cors from 'cors'
import Groq from 'groq-sdk'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3002
app.use(cors())
app.use(express.json())

const HAS_GROQ_KEY = !!process.env.GROQ_API_KEY
if (!HAS_GROQ_KEY) console.warn('⚠️  GROQ_API_KEY missing – mock mode.')

let groq = null
if (HAS_GROQ_KEY) {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
    timeout: 20 * 1000,
    maxRetries: 2,
  })
}

function isChitChat(message) {
  const trimmed = message.trim().toLowerCase()
  if (trimmed.length > 60) return false
  const stripped = trimmed.replace(/\b(bro|bruh|man|dude|buddy|friend|dear|sis|boss|mate)\b/g, '').replace(/\s+/g, ' ').trim()
  const patterns = [
    /^(hi|hello|hey|yo|sup|hii+|hiya)[\s!.?]*$/,
    /^(hi|hello|hey|yo|sup|hii+|hiya)[\s,]*(how are you|what'?s up|how'?s it going|how'?s you)[\s!.?]*$/,
    /^(how are you|what'?s up|how'?s it going|how'?s you)[\s!.?]*$/,
    /^(thanks|thank you|thx|ty)[\s!.?]*$/,
    /^(bye|goodbye|see ya|cya)[\s!.?]*$/,
    /^(ok|okay|cool|nice|great|good)[\s!.?]*$/,
    /^(who are you|what are you|what can you do)[\s!.?]*$/
  ]
  return patterns.some(p => p.test(stripped))
}

app.post('/api/chat/stream', async (req, res) => {
  const { message, sessionId = 'default' } = req.body

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message is required' })
  }

  console.log(`📨 [stream] session=${sessionId} msg="${message}"`)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const send = (event, data) => {
    res.write(`data: ${JSON.stringify({ event, ...data })}\n\n`)
  }

  try {
    if (isChitChat(message)) {
      send('thinking', { text: 'Replying' })
      send('sources', { sources: [] })
      send('images', { images: [] })
      const reply = "Hey there! I'm Stoic. 😊 How can I help you today?"
      send('token', { text: reply })
      send('followups', { followUps: [] })
      send('done', {})
      return res.end()
    }

    send('thinking', { text: 'Answering...' })
    send('sources', { sources: [] })
    send('images', { images: [] })

    if (!groq) {
      send('token', { text: '⚠️ No Groq API key – please set GROQ_API_KEY in .env' })
      send('done', {})
      return res.end()
    }

    const promptMessages = [
      { role: 'system', content: 'You are a helpful assistant. Answer concisely.' },
      { role: 'user', content: message }
    ]

    console.log('📡 Sending to Groq:', JSON.stringify(promptMessages))

    // Add a timeout to the entire request
    const timeout = setTimeout(() => {
      console.error('⏰ Groq request timed out after 20 seconds');
      send('error', { message: 'Request timed out' });
      res.end();
    }, 20000);

    try {
      const stream = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: promptMessages,
        temperature: 0.3,
        max_tokens: 500,
        stream: true
      })

      let fullContent = ''
      let chunkCount = 0

      console.log('✅ Stream object received, entering loop...');
      for await (const chunk of stream) {
        chunkCount++
        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) {
          fullContent += delta
          send('token', { text: delta })
        }
      }
      clearTimeout(timeout); // clear timeout on success
      console.log(`✅ Stream finished: ${chunkCount} chunks, ${fullContent.length} chars`)

      if (fullContent.trim().length === 0) {
        console.warn('⚠️ Empty response – using fallback')
        send('token', { text: 'I could not generate a response. Please try again.' })
      }

      send('followups', {
        followUps: [
          'Tell me more',
          'Give me an example',
          'Explain further'
        ]
      })
      send('done', {})
      res.end()

    } catch (loopError) {
      clearTimeout(timeout);
      console.error('🔥 Error during stream processing:', loopError);
      send('error', { message: 'Stream error: ' + loopError.message });
      res.end();
    }

  } catch (error) {
    console.error('🔥 ERROR:', error)
    console.error('📄 Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
    send('error', { message: 'Internal error: ' + error.message })
    res.end()
  }
})

app.listen(PORT, () => {
  console.log(`✅ Test server running on http://localhost:${PORT}`)
  console.log(`🔑 API key present: ${!!process.env.GROQ_API_KEY}`)
})