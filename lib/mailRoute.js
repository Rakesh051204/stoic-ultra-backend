import express from 'express'
import nodemailer from 'nodemailer'

const hits = []

export function registerMail(app) {
  const cors = (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  }
  app.options('/api/send-email', (req, res) => { cors(res); res.sendStatus(204) })
  app.post('/api/send-email', express.json({ limit: '1mb' }), async (req, res) => {
    cors(res)
    const now = Date.now()
    while (hits.length && now - hits[0] > 3600000) hits.shift()
    if (hits.length >= 15) return res.status(429).json({ ok: false, error: 'Too many emails this hour' })
    const { to, cc, bcc, subject, body } = req.body || {}
    const first = String(to || '').split(',')[0].trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(first)) return res.status(400).json({ ok: false, error: 'Enter a valid To address' })
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return res.status(500).json({ ok: false, error: 'Sending is not set up yet (add GMAIL_USER and GMAIL_APP_PASSWORD to the backend .env)' })
    }
    try {
      const tr = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } })
      await tr.sendMail({ from: process.env.GMAIL_USER, to, cc: cc || undefined, bcc: bcc || undefined, subject: subject || '(no subject)', text: body || '' })
      hits.push(now)
      console.log('[mail] sent to', first)
      res.json({ ok: true })
    } catch (e) {
      console.error('[mail] failed:', e.message)
      res.status(500).json({ ok: false, error: e.message })
    }
  })
}