const inscricaoCache = new Set();
const entregaCache = new Set();
const rateLimitMap = new Map();

// Função contra injeção de scripts
const sanitize = (text) => {
    if (!text || typeof text !== 'string') return "Não informado";
    return text.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'IP_DESCONHECIDO';
    const agora = new Date().getTime();
    
    // 📅 DATAS OFICIAIS DA GAME JAM V2
    const dataInicio = new Date("2026-08-01T00:00:00-03:00").getTime();
    const dataLimite = new Date("2026-08-15T23:59:59-03:00").getTime();

    // TRAVAS TEMPORAIS INTELIGENTES
    if (agora < dataInicio) {
        return res.status(403).json({ error: 'Acesso Negado: O portal de submissão só abre dia 1 de Agosto!' });
    }
    if (agora > dataLimite) {
        return res.status(403).json({ error: 'Acesso Negado: O prazo oficial da V2 já encerrou.' });
    }

    // Sistema Anti-Spam
    if (rateLimitMap.has(clientIp)) {
        const ultimoAcesso = rateLimitMap.get(clientIp);
        if (agora - ultimoAcesso < 10000) {
            return res.status(429).json({ error: 'Muitas tentativas. Aguarde 10 segundos.' });
        }
    }
    rateLimitMap.set(clientIp, agora);

    const dados = req.body;
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
        return res.status(500).json({ error: 'Erro de Servidor: Webhook não configurado.' });
    }

    let payload = {};

    // ROTA A: INSCRIÇÃO
    if (dados.tipo === 'inscricao') {
        if (inscricaoCache.has(clientIp)) return res.status(403).json({ error: 'Você já realizou a sua inscrição.' });
        
        if (!dados.nome_projeto || !dados.discord_lider) {
            return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
        }

        payload = {
            username: "NRG Game Jam V2",
            avatar_url: "https://i.imgur.com/8X16ABy.png",
            embeds: [{
                title: "🌋 NOVA INSCRIÇÃO RASTREADA - V2",
                description: "**Tema:** O Chão Não É Seguro",
                color: 16729344, // Laranja Magma
                fields: [
                    { name: "👑 Projeto/Equipe", value: sanitize(dados.nome_projeto), inline: true },
                    { name: "💬 Discord (Líder)", value: sanitize(dados.discord_lider), inline: true }
                ],
                footer: { text: "NRG Studios | V2 Automation System" },
                timestamp: new Date().toISOString()
            }]
        };
        inscricaoCache.add(clientIp);
    } 
    // ROTA B: ENTREGA FINAL
    else if (dados.tipo === 'entrega') {
        if (entregaCache.has(clientIp)) return res.status(403).json({ error: 'O seu projeto já foi entregue.' });
        
        if (!dados.nome_projeto || !dados.discord_lider || !dados.link_jogo) {
            return res.status(400).json({ error: 'Preencha todos os campos da entrega.' });
        }
        
        const safeLink = sanitize(dados.link_jogo);
        if (!safeLink.startsWith('http://') && !safeLink.startsWith('https://')) {
            return res.status(400).json({ error: 'O link do jogo deve começar com http:// ou https://' });
        }

        payload = {
            username: "NRG Game Jam V2",
            avatar_url: "https://i.imgur.com/8X16ABy.png", 
            embeds: [{
                title: "🔥 PROJETO FINAL RECEBIDO - V2!",
                description: "**Os devs sobreviveram ao chão de lava.**",
                color: 16711680, // Vermelho Alerta
                fields: [
                    { name: "👑 Projeto/Equipe", value: sanitize(dados.nome_projeto), inline: true },
                    { name: "💬 Discord (Líder)", value: sanitize(dados.discord_lider), inline: true },
                    { name: "🔗 Link Oficial", value: safeLink, inline: false }
                ],
                footer: { text: "NRG Studios | V2 Reception Core" },
                timestamp: new Date().toISOString()
            }]
        };
        entregaCache.add(clientIp);
    } 
    else {
        return res.status(400).json({ error: 'Requisição inválida.' });
    }

    try {
        const discordReq = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!discordReq.ok) {
            throw new Error("Falha na sincronização do Webhook.");
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        if (dados.tipo === 'inscricao') inscricaoCache.delete(clientIp);
        if (dados.tipo === 'entrega') entregaCache.delete(clientIp);
        return res.status(500).json({ error: 'Instabilidade na rede de servidores. Tente novamente em instantes.' });
    }
}
