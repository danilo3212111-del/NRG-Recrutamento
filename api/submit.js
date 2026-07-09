const inscricaoCache = new Set();
const entregaCache = new Set();
const rateLimitMap = new Map(); // Controle Anti-Spam por tempo (DDoS Protection)

// Função de Sanitização (Impede Injeção de Código HTML/JS malicioso)
const sanitize = (text) => {
    if (!text) return "";
    return text.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'IP_DESCONHECIDO';
    const agora = new Date().getTime();
    const dataLimite = new Date("2026-07-17T23:59:59-03:00").getTime();

    // 1. Trava de Encerramento
    if (agora > dataLimite) {
        return res.status(403).json({ error: 'O prazo do evento foi encerrado oficialmente.' });
    }

    // 2. Trava de Rate Limiting (Anti-Spam de Repetição - Bloqueia requisições do mesmo IP por 10 segundos)
    if (rateLimitMap.has(clientIp)) {
        const ultimoAcesso = rateLimitMap.get(clientIp);
        if (agora - ultimoAcesso < 10000) {
            console.warn(`[SECURITY] Spam bloqueado do IP: ${clientIp}`);
            return res.status(429).json({ error: 'Muitas tentativas. Aguarde 10 segundos.' });
        }
    }
    rateLimitMap.set(clientIp, agora); // Atualiza o último toque do IP

    const dados = req.body;
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
        console.error("[CRITICAL] DISCORD_WEBHOOK_URL não está configurado nas variáveis de ambiente da Vercel.");
        return res.status(500).json({ error: 'Erro de configuração interna.' });
    }

    let payload = {};

    // ==========================================
    // ROTA 1: Tratamento de INSCRIÇÃO
    // ==========================================
    if (dados.tipo === 'inscricao') {
        if (inscricaoCache.has(clientIp)) return res.status(403).json({ error: 'Você já realizou a sua inscrição.' });
        if (!dados.modalidade || !dados.nome_projeto || !dados.discord_lider) {
            return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
        }

        payload = {
            username: "NRG Game Jam Bot",
            avatar_url: "https://i.imgur.com/8X16ABy.png",
            embeds: [{
                title: "🟢 NOVA INSCRIÇÃO - GAME JAM",
                color: 65450, // Verde
                fields: [
                    { name: "🎮 Modalidade", value: sanitize(dados.modalidade), inline: true },
                    { name: "👑 Nome / Equipe", value: sanitize(dados.nome_projeto), inline: true },
                    { name: "💬 Discord do Líder", value: sanitize(dados.discord_lider), inline: true },
                    { name: "👥 Membros Extras", value: sanitize(dados.membros_equipe), inline: false },
                ],
                footer: { text: "NRG Studios | Proteção Anti-Spam Ativa" },
                timestamp: new Date().toISOString()
            }]
        };
        inscricaoCache.add(clientIp);
    } 
    // ==========================================
    // ROTA 2: Tratamento de ENTREGA DO PROJETO FINAL
    // ==========================================
    else if (dados.tipo === 'entrega') {
        if (entregaCache.has(clientIp)) return res.status(403).json({ error: 'Você já entregou o seu projeto.' });
        if (!dados.nome_projeto || !dados.discord_lider || !dados.link_jogo) {
            return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
        }
        
        const safeLink = sanitize(dados.link_jogo);
        if (!safeLink.startsWith('http://') && !safeLink.startsWith('https://')) {
            return res.status(400).json({ error: 'O link enviado é inválido. Tente novamente.' });
        }

        payload = {
            username: "NRG Game Jam Bot",
            avatar_url: "https://i.imgur.com/8X16ABy.png",
            embeds: [{
                title: "🟣 PROJETO FINAL ENTREGUE!",
                color: 9055202, // Roxo
                fields: [
                    { name: "👑 Equipe / Projeto", value: sanitize(dados.nome_projeto), inline: true },
                    { name: "💬 Discord do Líder", value: sanitize(dados.discord_lider), inline: true },
                    { name: "🔗 Link do Jogo", value: safeLink, inline: false },
                ],
                footer: { text: "NRG Studios | Recepção de Projetos" },
                timestamp: new Date().toISOString()
            }]
        };
        entregaCache.add(clientIp);
    } 
    else {
        return res.status(400).json({ error: 'Requisição inválida rejeitada pelo servidor.' });
    }

    // ==========================================
    // ENVIO SEGURO PARA A API DO DISCORD
    // ==========================================
    try {
        const discordReq = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (discordReq.ok) {
            return res.status(200).json({ success: true });
        } else {
            const errLog = await discordReq.text();
            console.error(`[DISCORD API ERROR] Falha ao enviar Webhook. Status: ${discordReq.status}. Resposta: ${errLog}`);
            // Remove do cache de trava se a requisição ao Discord falhou, para o usuário poder tentar de novo
            if (dados.tipo === 'inscricao') inscricaoCache.delete(clientIp);
            if (dados.tipo === 'entrega') entregaCache.delete(clientIp);
            
            return res.status(502).json({ error: 'A API do Discord recusou a conexão. Aguarde um minuto e tente novamente.' });
        }
    } catch (error) {
        console.error(`[SERVER ERROR] Falha grave na rede interna da Vercel:`, error);
        
        if (dados.tipo === 'inscricao') inscricaoCache.delete(clientIp);
        if (dados.tipo === 'entrega') entregaCache.delete(clientIp);
        
        return res.status(500).json({ error: 'Nossos servidores falharam ao contatar o Discord. Tente de novo em breve.' });
    }
}
