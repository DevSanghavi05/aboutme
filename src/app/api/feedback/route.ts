import nodemailer from 'nodemailer';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { message } = await req.json();

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }

  if (message.trim().length > 2000) {
    return NextResponse.json({ error: 'Message too long.' }, { status: 400 });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.error('[feedback] Missing GMAIL_USER or GMAIL_APP_PASSWORD env vars');
    return NextResponse.json({ error: 'Server not configured.' }, { status: 500 });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: `"Portfolio Feedback" <${user}>`,
      to: ['devrsanghavi05@gmail.com', 's2064369@online.houstonisd.org'],
      subject: 'New Game Feedback',
      text: message.trim(),
      html: `<p style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111;">${
        message.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')
      }</p>`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[feedback] Send failed:', err);
    return NextResponse.json({ error: 'Failed to send.' }, { status: 500 });
  }
}
