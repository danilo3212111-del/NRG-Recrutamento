const jamIpCache = new Set();

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    // Trava do dia 17/07/2026 às 23:59 BRT
    const agora = new Date();
    const dataLimite = new Date("2026-07-17T23:59:59-03:00");
    if (agora > dataLimite) {
        return res.status(403).json({ error: 'Inscrições encerradas.' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'IP_JAM_DESCONHECIDO';
    if (jamIpCache.has(clientIp)) {
        return res.status(429).json({ error: 'Você já se inscreveu na Game Jam.' });
    }

    const { modalidade, nome_projeto, discord_lider, membros_equipe } = req.body;

    if (!modalidade || !nome_projeto || !discord_lider) {
        return res.status(400).json({ error: 'Dados incompletos.' });
    }

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return res.status(500).json({ error: 'Erro no Webhook' });

    const payload = {
        username: "NRG Game Jam Bot",
        avatar_url: "https://i.imgur.com/8X16ABy.png",
        embeds: [{
            title: "🏆 NOVA INSCRIÇÃO - GAME JAM",
            color: 65450, // Cor Verde Água
            fields: [
                { name: "🎮 Modalidade", value: modalidade, inline: true },
                { name: "👑 Nome / Equipe", value: nome_projeto, inline: true },
                { name: "💬 Discord do Líder", value: discord_lider, inline: true },
                { name: "👥 Membros Extras", value: membros_equipe, inline: false },
            ],
            footer: { text: "NRG Studios Game Jam Event" },
            timestamp: new Date().toISOString()
        }]
    };

    try {
        const discordReq = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (discordReq.ok) {
            jamIpCache.add(clientIp);
            return res.status(200).json({ success: true });
        } else {
            return res.status(500).json({ error: 'Erro ao notificar Discord' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Erro interno' });
    }
}
