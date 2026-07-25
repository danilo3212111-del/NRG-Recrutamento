const jamIpCache = new Set();

export default async function handler(req, res) {
    // Redireciona a lógica para o ficheiro principal para evitar código duplicado e erros
    const submitHandler = (await import('./submit.js')).default;
    return submitHandler(req, res);
}

    const agora = new Date().getTime();
    
    // 📅 DATAS OFICIAIS DA GAME JAM V2
    const dataInicio = new Date("2026-08-01T00:00:00-03:00").getTime();
    const dataLimite = new Date("2026-08-15T23:59:59-03:00").getTime();

    if (agora < dataInicio) {
        return res.status(403).json({ error: 'Acesso Negado: O portal de submissão só abre dia 1 de Agosto!' });
    }
    if (agora > dataLimite) {
        return res.status(403).json({ error: 'Acesso Negado: O Evento V2 foi encerrado.' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'IP_JAM_DESCONHECIDO';
    const acaoId = `${clientIp}-${req.body.tipo}`;
    
    if (jamIpCache.has(acaoId)) {
        return res.status(429).json({ error: 'Você já realizou esta ação.' });
    }

    const { tipo } = req.body;
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) return res.status(500).json({ error: 'Erro de conexão com o Servidor.' });

    let payload = {};

    if (tipo === 'inscricao') {
        const { nome_projeto, discord_lider } = req.body;
        if (!nome_projeto || !discord_lider) return res.status(400).json({ error: 'Dados incompletos.' });

        payload = {
            username: "NRG Game Jam V2",
            avatar_url: "https://i.imgur.com/8X16ABy.png",
            embeds: [{
                title: "🌋 INSCRIÇÃO V2 DETETADA",
                color: 16729344,
                fields: [
                    { name: "Equipe", value: nome_projeto, inline: true },
                    { name: "Líder", value: discord_lider, inline: true }
                ]
            }]
        };
    } else if (tipo === 'entrega') {
        const { nome_projeto, discord_lider, link_jogo } = req.body;
        if (!nome_projeto || !discord_lider || !link_jogo) return res.status(400).json({ error: 'Dados incompletos.' });

        payload = {
            username: "NRG Game Jam V2",
            avatar_url: "https://i.imgur.com/8X16ABy.png",
            embeds: [{
                title: "🔥 JOGO V2 ENTREGUE",
                color: 16711680,
                fields: [
                    { name: "Equipe", value: nome_projeto, inline: true },
                    { name: "Líder", value: discord_lider, inline: true },
                    { name: "Link", value: link_jogo, inline: false }
                ]
            }]
        };
    } else {
        return res.status(400).json({ error: 'Tipo inválido.' });
    }

    try {
        const discordReq = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (discordReq.ok) {
            jamIpCache.add(acaoId);
            return res.status(200).json({ success: true });
        } else {
            return res.status(500).json({ error: 'Falha na comunicação.' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Erro interno.' });
    }
}
