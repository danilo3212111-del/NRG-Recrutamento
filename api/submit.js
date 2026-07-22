// api/registro.js
// Recebe inscrições ("inscricao") e entregas de projeto ("entrega") da Game Jam
// e retransmite os dados para um canal do Discord via Webhook.
//
// Variáveis de ambiente necessárias:
//   DISCORD_WEBHOOK_URL  -> URL do webhook do Discord (obrigatória)
// Variáveis de ambiente opcionais (recomendadas em produção):
//   IP_SALT       -> string secreta usada para hashear IPs antes de guardá-los em memória
//   SITE_ORIGIN   -> ex: "https://nrgstudios.com" — se definida, bloqueia requisições de outras origens

import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------
const EVENT_DEADLINE_MS = new Date('2026-07-20T23:59:59-03:00').getTime();
const RATE_LIMIT_WINDOW_MS = 10_000;       // tempo mínimo entre requisições do mesmo IP
const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000; // por quanto tempo guardamos "já enviou" em memória
const MAX_CACHE_ENTRIES = 5_000;           // teto de segurança para não vazar memória
const REQUEST_TIMEOUT_MS = 8_000;          // timeout ao chamar o Discord
const DISCORD_NAME_LIMIT = 256;            // limite de campo "name" de embed do Discord
const DISCORD_FIELD_LIMIT = 1024;          // limite de campo "value" de embed do Discord
const ALLOWED_ORIGIN = process.env.SITE_ORIGIN || null;

// ---------------------------------------------------------------------------
// Armazenamento em memória (melhor esforço).
// Observação importante: em ambientes serverless com múltiplas instâncias
// (Vercel, AWS Lambda etc.) cada instância tem sua própria memória, então
// isto NÃO substitui um rate limit real e distribuído. Para produção em
// escala, use um armazenamento compartilhado como Vercel KV, Upstash Redis
// ou similar. O que está aqui já impede abuso trivial de um único IP.
// ---------------------------------------------------------------------------
const rateLimitMap = new Map();      // ipHash -> timestamp da última requisição
const dedupeInscricao = new Map();   // ipHash -> timestamp da inscrição
const dedupeEntrega = new Map();     // ipHash -> timestamp da entrega

function pruneMap(map, ttlMs) {
    const now = Date.now();
    for (const [key, ts] of map) {
        if (now - ts > ttlMs) map.delete(key);
    }
    while (map.size > MAX_CACHE_ENTRIES) {
        const oldestKey = map.keys().next().value;
        map.delete(oldestKey);
    }
}

function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
        const first = Array.isArray(xff) ? xff[0] : xff;
        return first.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.connection?.remoteAddress || 'desconhecido';
}

function hashIp(ip) {
    // Nunca guardamos o IP em texto puro em memória — só um hash com salt.
    return crypto.createHash('sha256').update(ip + (process.env.IP_SALT || 'nrg-jam-default-salt')).digest('hex');
}

// Escapa HTML (defensivo, caso este texto seja exibido em algum painel web)
// e neutraliza recursos de markdown/menção do Discord que poderiam ser
// usados para abuso (ping em massa, formatação quebrada, etc).
function sanitizeText(value, maxLen) {
    if (typeof value !== 'string') return null;
    let text = value.normalize('NFC').trim();
    if (!text) return null;

    text = text.replace(/[\u0000-\u001F\u007F]/g, ''); // remove caracteres de controle

    text = text
        .replace(/@(everyone|here)/gi, '@\u200b$1')     // impede ping em massa
        .replace(/<@[!&]?\d+>/g, '[menção removida]')     // impede menção direta de usuário/cargo
        .replace(/`/g, "'")
        .replace(/\*/g, '﹡')
        .replace(/_/g, '‗')
        .replace(/~/g, '～')
        .replace(/\|/g, '｜')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    if (text.length > maxLen) text = text.slice(0, maxLen - 1) + '…';
    return text;
}

function isValidHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    if (ALLOWED_ORIGIN) {
        const origin = req.headers.origin || req.headers.referer || '';
        if (!origin.startsWith(ALLOWED_ORIGIN)) {
            return res.status(403).json({ error: 'Origem não autorizada.' });
        }
    }

    const now = Date.now();
    if (now > EVENT_DEADLINE_MS) {
        return res.status(403).json({ error: 'O evento foi encerrado oficialmente.' });
    }

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error('DISCORD_WEBHOOK_URL não configurada.');
        return res.status(500).json({ error: 'Erro interno de configuração do servidor.' });
    }

    const dados = req.body;
    if (!dados || typeof dados !== 'object') {
        return res.status(400).json({ error: 'Corpo da requisição inválido.' });
    }

    const tipo = dados.tipo;
    if (tipo !== 'inscricao' && tipo !== 'entrega') {
        return res.status(400).json({ error: 'Tipo de requisição inválido.' });
    }

    const clientIp = getClientIp(req);
    const ipHash = hashIp(clientIp);

    // Throttle geral por IP (proteção contra rajadas/spam)
    pruneMap(rateLimitMap, RATE_LIMIT_WINDOW_MS * 3);
    const lastRequest = rateLimitMap.get(ipHash);
    if (lastRequest && now - lastRequest < RATE_LIMIT_WINDOW_MS) {
        return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns segundos e tente novamente.' });
    }
    rateLimitMap.set(ipHash, now);

    // Proteção contra envio duplicado
    const dedupeMap = tipo === 'inscricao' ? dedupeInscricao : dedupeEntrega;
    pruneMap(dedupeMap, DEDUPE_TTL_MS);
    if (dedupeMap.has(ipHash)) {
        return res.status(409).json({
            error: tipo === 'inscricao' ? 'Você já realizou a sua inscrição.' : 'O seu projeto já foi entregue.',
        });
    }

    let payload;

    if (tipo === 'inscricao') {
        const modalidade = sanitizeText(dados.modalidade, 100);
        const nomeProjeto = sanitizeText(dados.nome_projeto, DISCORD_NAME_LIMIT);
        const discordLider = sanitizeText(dados.discord_lider, 100);
        const membrosEquipe = sanitizeText(dados.membros_equipe, DISCORD_FIELD_LIMIT) || 'Nenhum';

        if (!modalidade || !nomeProjeto || !discordLider) {
            return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
        }

        payload = {
            username: 'NRG Game Jam Core',
            avatar_url: 'https://i.imgur.com/8X16ABy.png',
            embeds: [{
                title: '🏆 NOVA INSCRIÇÃO - GAME JAM',
                color: 65450,
                fields: [
                    { name: '🎮 Modalidade', value: modalidade, inline: true },
                    { name: '👑 Nome / Equipe', value: nomeProjeto, inline: true },
                    { name: '💬 Discord do Líder', value: discordLider, inline: true },
                    { name: '👥 Membros Extras', value: membrosEquipe, inline: false },
                ],
                footer: { text: 'NRG Studios Event System' },
                timestamp: new Date().toISOString(),
            }],
        };
    } else {
        const nomeProjeto = sanitizeText(dados.nome_projeto, DISCORD_NAME_LIMIT);
        const discordLider = sanitizeText(dados.discord_lider, 100);
        const linkJogo = typeof dados.link_jogo === 'string' ? dados.link_jogo.trim() : '';

        if (!nomeProjeto || !discordLider || !linkJogo) {
            return res.status(400).json({ error: 'Preencha todos os campos de entrega.' });
        }
        if (linkJogo.length > 500 || !isValidHttpUrl(linkJogo)) {
            return res.status(400).json({ error: 'O link do jogo deve ser uma URL http:// ou https:// válida.' });
        }

        payload = {
            username: 'NRG Game Jam Core',
            avatar_url: 'https://i.imgur.com/8X16ABy.png',
            embeds: [{
                title: '🚀 NOVO JOGO ENTREGUE!',
                description: 'Um projeto foi finalizado e enviado para avaliação da Diretoria.',
                color: 9055202,
                fields: [
                    { name: '👑 Projeto / Equipe', value: nomeProjeto, inline: true },
                    { name: '💬 Discord do Líder', value: discordLider, inline: true },
                    { name: '🔗 Link do Jogo', value: `[Clique aqui para acessar](${linkJogo})`, inline: false },
                ],
                footer: { text: 'NRG Studios Event System' },
                timestamp: new Date().toISOString(),
            }],
        };
    }

    try {
        const discordReq = await fetchWithTimeout(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }, REQUEST_TIMEOUT_MS);

        if (discordReq.status === 429) {
            return res.status(503).json({ error: 'Serviço temporariamente sobrecarregado. Tente novamente em instantes.' });
        }
        if (!discordReq.ok) {
            console.error('Falha no webhook do Discord:', discordReq.status, await discordReq.text());
            throw new Error('discord_webhook_failed');
        }

        // Só marcamos como "enviado" depois de confirmar sucesso no Discord.
        dedupeMap.set(ipHash, now);
        return res.status(200).json({ success: true });
    } catch (error) {
        // Em caso de erro, liberamos a trava de rate-limit da requisição não vai
        // liberar sozinha antes da janela — está certo assim, é o comportamento
        // esperado (evita retry imediato em loop contra um serviço instável).
        if (error?.name === 'AbortError') {
            console.error('Timeout ao chamar o webhook do Discord.');
            return res.status(504).json({ error: 'Tempo de resposta excedido. Tente novamente.' });
        }
        console.error('Erro ao processar requisição:', error);
        return res.status(500).json({ error: 'Instabilidade nos servidores. Tente novamente em instantes.' });
    }
}
