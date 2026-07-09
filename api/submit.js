const inscricaoCache = new Set();
const entregaCache = new Set();
const rateLimitMap = new Map();

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

    if (agora > dataLimite) {
        return res.status(403).json({ error: 'O prazo do evento foi encerrado oficialmente.' });
    }

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
        return res.status(500).json({ error: 'Erro de configuração interna.' });
    }

    let payload = {};

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
                color: 65450,
                fields: [
                    { name: "🎮 Modalidade", value: sanitize(dados.modalidade), inline: true },
                    { name: "👑 Nome / Equipe", value: sanitize(dados.nome_projeto), inline: true },
                    { name: "💬 Discord do Líder", value: sanitize(dados.discord_lider), inline: true },
                    { name: "👥 Membros Extras", value: sanitize(dados.membros_equipe), inline: false },
                ],
                footer: { text: "NRG Studios | Sistema de Automação de Cargos" },
                timestamp: new Date().toISOString()
            }]
        };
        inscricaoCache.add(clientIp);
    } 
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
                color: 9055202,
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
        return res.status(400).json({ error: 'Requisição inválida.' });
    }

    try {
        // Envia a notificação padrão via Webhook
        const discordReq = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!discordReq.ok) {
            throw new Error("Falha ao enviar webhook de log.");
        }

        // ============================================================
        // SISTEMA DE CARGO AUTOMÁTICO (Executado apenas em inscrições)
        // ============================================================
        if (dados.tipo === 'inscricao') {
            const botToken = process.env.DISCORD_BOT_TOKEN;
            const guildId = process.env.DISCORD_GUILD_ID;
            const roleId = process.env.DISCORD_ROLE_ID;

            if (botToken && guildId && roleId) {
                // 1. Pesquisa o membro no servidor pelo nickname fornecido
                const limpoUser = dados.discord_lider.trim();
                const searchRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/search?query=${encodeURIComponent(limpoUser)}`, {
                    headers: { 'Authorization': `Bot ${botToken}` }
                });

                if (searchRes.ok) {
                    const members = await searchRes.json();
                    
                    if (members && members.length > 0) {
                        // Seleciona o primeiro ID retornado pela pesquisa da API
                        const userId = members[0].user.id;

                        // 2. Injeta o cargo no usuário encontrado
                        await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
                            method: 'PUT',
                            headers: { 'Authorization': `Bot ${botToken}` }
                        });
                        console.log(`[AUTOMATION] Cargo atribuído com sucesso para ${limpoUser}`);
                    } else {
                        console.warn(`[AUTOMATION] Membro não localizado visualmente no servidor: ${limpoUser}`);
                    }
                }
            }
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error(`[SERVER ERROR]`, error);
        if (dados.tipo === 'inscricao') inscricaoCache.delete(clientIp);
        if (dados.tipo === 'entrega') entregaCache.delete(clientIp);
        return res.status(500).json({ error: 'Erro de comunicação de rede interna. Tente novamente.' });
    }
}
