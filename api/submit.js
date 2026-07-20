const inscricaoCache = new Set();
const entregaCache = new Set();
const rateLimitMap = new Map();

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
    
    const dataLimite = new Date("2026-07-20T23:59:59-03:00").getTime();

    if (agora > dataLimite) {
        return res.status(403).json({ error: 'O prazo do evento foi encerrado oficialmente.' });
    }

    if (rateLimitMap.has(clientIp)) {
        const ultimoAcesso = rateLimitMap.get(clientIp);
        if (agora - ultimoAcesso < 10000) {
            return res.status(429).json({ error: 'Muitas tentativas simultâneas. Aguarde 10 segundos.' });
        }
    }
    rateLimitMap.set(clientIp, agora);

    const dados = req.body;
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
        return res.status(500).json({ error: 'Erro crítico de configuração interna do servidor.' });
    }

    let payload = {};

    if (dados.tipo === 'inscricao') {
        if (inscricaoCache.has(clientIp)) return res.status(403).json({ error: 'Ação Bloqueada: Você já realizou a sua inscrição.' });
        
        if (!dados.modalidade || !dados.nome_projeto || !dados.discord_lider) {
            return res.status(400).json({ error: 'Ação Interrompida: Preencha todos os campos obrigatórios.' });
        }

        payload = {
            username: "NRG Game Jam Bot",
            avatar_url: "https://i.imgur.com/8X16ABy.png",
            embeds: [{
                title: "🟢 NOVA INSCRIÇÃO RASTREADA",
                color: 65450,
                fields: [
                    { name: "🎮 Modalidade", value: sanitize(dados.modalidade), inline: true },
                    { name: "👑 Projeto/Equipe", value: sanitize(dados.nome_projeto), inline: true },
                    { name: "💬 Discord (Líder)", value: sanitize(dados.discord_lider), inline: true },
                    { name: "👥 Membros Extras", value: sanitize(dados.membros_equipe), inline: false },
                ],
                footer: { text: "NRG Studios | A.I. Automation System" },
                timestamp: new Date().toISOString()
            }]
        };
        inscricaoCache.add(clientIp);
    } 
    else if (dados.tipo === 'entrega') {
        if (entregaCache.has(clientIp)) return res.status(403).json({ error: 'Ação Bloqueada: O seu projeto já foi entregue.' });
        
        if (!dados.nome_projeto || !dados.discord_lider || !dados.link_jogo) {
            return res.status(400).json({ error: 'Ação Interrompida: Preencha todos os campos da entrega.' });
        }
        
        const safeLink = sanitize(dados.link_jogo);
        if (!safeLink.startsWith('http://') && !safeLink.startsWith('https://')) {
            return res.status(400).json({ error: 'Protocolo Inválido: O link do jogo deve começar com http:// ou https://' });
        }

        payload = {
            username: "NRG Game Jam Bot",
            avatar_url: "https://i.imgur.com/8X16ABy.png", 
            embeds: [{
                title: "🟣 PROJETO FINAL RECEBIDO!",
                color: 9055202,
                fields: [
                    { name: "👑 Projeto/Equipe", value: sanitize(dados.nome_projeto), inline: true },
                    { name: "💬 Discord (Líder)", value: sanitize(dados.discord_lider), inline: true },
                    { name: "🔗 Link Oficial", value: safeLink, inline: false },
                ],
                footer: { text: "NRG Studios | Game Reception Core" },
                timestamp: new Date().toISOString()
            }]
        };
        entregaCache.add(clientIp);
    } 
    else {
        return res.status(400).json({ error: 'Requisição inválida ou corrompida.' });
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

        if (dados.tipo === 'inscricao') {
            const botToken = process.env.DISCORD_BOT_TOKEN;
            const guildId = process.env.DISCORD_GUILD_ID;
            const roleId = process.env.DISCORD_ROLE_ID;

            if (botToken && guildId && roleId) {
                const limpoUser = sanitize(dados.discord_lider).trim();
                
                const searchRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/search?query=${encodeURIComponent(limpoUser)}`, {
                    headers: { 'Authorization': `Bot ${botToken}` }
                });

                if (searchRes.ok) {
                    const members = await searchRes.json();
                    
                    if (members && members.length > 0) {
                        const userId = members[0].user.id;
                        
                        fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
                            method: 'PUT',
                            headers: { 'Authorization': `Bot ${botToken}` }
                        }).catch(err => console.error("Erro secundário na atribuição de cargo:", err));
                    }
                }
            }
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        if (dados.tipo === 'inscricao') inscricaoCache.delete(clientIp);
        if (dados.tipo === 'entrega') entregaCache.delete(clientIp);
        return res.status(500).json({ error: 'Instabilidade na rede de servidores. Tente novamente em instantes.' });
    }
}
