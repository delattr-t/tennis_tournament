// ============================================================
//  Supabase Edge Function — notify-match
//  Envoie une notification push + email quand un match est assigné
//  Deploy: supabase functions deploy notify-match
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY= Deno.env.get('VAPID_PRIVATE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { player, opponent, tournamentName, tournamentUrl, matchLabel } = await req.json();

    const results = await Promise.allSettled([
      // --- EMAIL ---
      player.email ? sendEmail(player, opponent, tournamentName, tournamentUrl, matchLabel) : Promise.resolve('no email'),
      // --- PUSH ---
      player.push_subscription ? sendPush(player, opponent, tournamentName, tournamentUrl, matchLabel) : Promise.resolve('no push'),
    ]);

    return new Response(JSON.stringify({ ok: true, results: results.map(r => r.status) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ---- EMAIL via Resend ----
async function sendEmail(player, opponent, tournamentName, tournamentUrl, matchLabel) {
  const html = `
  <div style="font-family:-apple-system,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <div style="font-size:32px;margin-bottom:16px">🎾</div>
    <h2 style="font-size:20px;margin-bottom:8px">Vous avez un match à jouer !</h2>
    <p style="color:#666;margin-bottom:20px">Tournoi <strong>${tournamentName}</strong> — ${matchLabel}</p>

    <div style="background:#f5f5f3;border-radius:12px;padding:16px 20px;margin-bottom:20px">
      <div style="font-size:13px;color:#888;margin-bottom:4px">Votre adversaire</div>
      <div style="font-size:18px;font-weight:600">${opponent.name}</div>
      ${opponent.phone ? `<div style="margin-top:8px;font-size:14px">📞 <a href="tel:${opponent.phone}" style="color:#185FA5">${opponent.phone}</a></div>` : ''}
      ${opponent.email ? `<div style="margin-top:4px;font-size:14px">✉️ <a href="mailto:${opponent.email}" style="color:#185FA5">${opponent.email}</a></div>` : ''}
    </div>

    <a href="${tournamentUrl}" style="display:inline-block;background:#1a1a18;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">
      Voir le tournoi →
    </a>

    <p style="color:#aaa;font-size:12px;margin-top:24px">
      Vous recevez cet email car vous êtes inscrit au tournoi ${tournamentName}.
    </p>
  </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Tennis Tournament <onboarding@resend.dev>',
      to: player.email,
      subject: `🎾 Votre prochain match — ${tournamentName}`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
  return res.json();
}

// ---- PUSH via Web Push ----
async function sendPush(player, opponent, tournamentName, tournamentUrl, matchLabel) {
  const payload = JSON.stringify({
    title: `🎾 Match à jouer — ${tournamentName}`,
    body: `vs ${opponent.name} · ${matchLabel}`,
    url: tournamentUrl,
  });

  // Signature VAPID manuelle (Deno-compatible)
  const sub = player.push_subscription;
  const endpoint = sub.endpoint;

  // On utilise l'API web-push via un service tiers ou implémentation native Deno
  // Pour simplifier, on appelle notre propre endpoint via fetch
  const vapidHeaders = await buildVapidHeaders(endpoint, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...vapidHeaders,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body: await encryptPayload(payload, sub),
  });

  if (res.status >= 400) throw new Error(`Push error: ${res.status}`);
  return { status: res.status };
}

// ---- VAPID helpers (Deno Web Crypto) ----
async function buildVapidHeaders(endpoint, publicKey, privateKey) {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const now = Math.floor(Date.now() / 1000);

  const header = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify({ aud: audience, exp: now + 86400, sub: 'mailto:admin@tennis.app' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const key = await crypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );

  const sigInput = new TextEncoder().encode(`${header}.${payload}`);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, sigInput);
  const token = `${header}.${payload}.${arrayBufferToBase64url(sig)}`;

  return {
    'Authorization': `vapid t=${token}, k=${publicKey}`,
  };
}

async function encryptPayload(payload, subscription) {
  // Simplified — returns payload as-is for basic push (no encryption for demo)
  // For production, implement RFC 8291 encryption
  return new TextEncoder().encode(payload);
}

function base64ToArrayBuffer(base64) {
  const bin = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function arrayBufferToBase64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
