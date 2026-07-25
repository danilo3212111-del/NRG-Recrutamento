const ipCache = new Map();
const RATE_LIMIT_MS = 60_000;

function sanitize(val) {
  if (typeof val !== 'string') return '';
  return val.replace(/[<>"'`]/g, '').trim().slice(0, 200);
}

function isValidRobloxUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'www.roblox.com' && u.pathname.startsWith('/');
  } catch {
    return false;
  }
}

function getRealIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return res.status(500).json({ error: 'Erro interno do servidor.' });

  const agora = Date.now();
  const INICIO = new Date('2026-08-01T00:00:00-03:00').getTime();
  const FIM    = new Date('2026-08-15T23:59:59-03:00').getTime();

  if (agora < INICIO) return res.status(403).json({ error: 'O portal abre dia 1 de Agosto de 2026.' });
  if (agora > FIM)    return res.status(403).json({ error: 'O prazo da Game Jam V2 encerrou.' });

  const ip    = getRealIp(req);
  const tipo  = sanitize(req.body?.tipo);
  const cacheKey = `${ip}-${tipo}`;
  const lastTime = ipCache.get(cacheKey);

  if (lastTime && agora - lastTime < RATE_LIMIT_MS) {
    return res.status(429).json({ error: 'Aguarda 1 minuto antes de tentar novamente.' });
  }

  const nome    = sanitize(req.body?.nome_projeto);
  const discord = sanitize(req.body?.discord_lider);
  const link    = sanitize(req.body?.link_jogo);

  if (!nome || nome.length < 2)    return res.status(400).json({ error: 'Nome do projeto inválido.' });
  if (!discord || discord.length < 2) return res.status(400).json({ error: 'Discord inválido.' });

  let embed;

  if (tipo === 'inscricao') {
    embed = {
      title: '🌋 NOVA INSCRIÇÃO — GAME JAM V2',
      description: '**Tema:** O Chão Não É Seguro',
      color: 0xFF4500,
      fields: [
        { name: '👑 Projeto / Equipa', value: nome,    inline: true },
        { name: '💬 Discord (Líder)', value: discord, inline: true }
      ],
      footer: { text: 'NRG Studios · V2 Automation System' },
      timestamp: new Date().toISOString()
    };
  } else if (tipo === 'entrega') {
    if (!link)                    return res.status(400).json({ error: 'Link obrigatório para entregas.' });
    if (!isValidRobloxUrl(link))  return res.status(400).json({ error: 'Link deve ser um URL válido de www.roblox.com.' });

    embed = {
      title: '🔥 ENTREGA FINAL RECEBIDA — V2',
      description: '**Os devs sobreviveram ao chão de lava.**',
      color: 0xFF0000,
      fields: [
        { name: '👑 Projeto / Equipa', value: nome,    inline: true },
        { name: '💬 Discord (Líder)', value: discord, inline: true },
        { name: '🔗 Link Oficial',    value: link,    inline: false }
      ],
      footer: { text: 'NRG Studios · V2 Reception Core' },
      timestamp: new Date().toISOString()
    };
  } else {
    return res.status(400).json({ error: 'Tipo de envio inválido.' });
  }

  try {
    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username:   'NRG Game Jam V2',
        avatar_url: 'https://i.imgur.com/8X16ABy.png',
        embeds:     [embed]
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!discordRes.ok) {
      const errText = await discordRes.text();
      console.error('Discord webhook error:', discordRes.status, errText);
      return res.status(502).json({ error: 'Falha na comunicação com o Discord.' });
    }

    ipCache.set(cacheKey, agora);

    if (ipCache.size > 5000) {
      const cutoff = agora - RATE_LIMIT_MS;
      for (const [k, t] of ipCache) {
        if (t < cutoff) ipCache.delete(k);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Discord demorou a responder. Tenta novamente.' });
    }
    console.error('Submit handler error:', err);
    return res.status(500).json({ error: 'Erro interno. Tenta novamente.' });
  }
}
