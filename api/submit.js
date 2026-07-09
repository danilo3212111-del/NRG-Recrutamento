// Duas memórias independentes para não travar os jogadores
const inscricaoCache = new Set();
const entregaCache = new Set();

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

    // Trava de Encerramento (17/07/2026 às 23:59 BRT)
    const agora = new Date();
    const dataLimite = new Date("2026-07-17T23:59:59-03:00");
    if (agora > dataLimite) return res.status(403).json({ error: 'Evento encerrado.' });

    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'IP_DESCONHECIDO';
    const dados = req.body;
    
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return res.status(500).json({ error: 'Erro no Webhook' });

    let payload = {};

    // ROTA 1: Tratamento de INSCRIÇÃO
    if (dados.tipo === 'inscricao') {
        if (inscricaoCache.has(clientIp)) return res.status(429).json({ error: 'Já inscrito.' });
        if (!dados.modalidade || !dados.nome_projeto || !dados.discord_lider) return res.status(400).json({ error: 'Faltam dados.' });

        payload = {
            username: "NRG Game Jam Bot",
            avatar_url: "https://i.imgur.com/8X16ABy.png",
            embeds: [{
                title: "🟢 NOVA INSCRIÇÃO - GAME JAM",
                color: 65450, // Verde
                fields: [
                    { name: "🎮 Modalidade", value: dados.modalidade, inline: true },
                    { name: "👑 Nome / Equipe", value: dados.nome_projeto, inline: true },
                    { name: "💬 Discord do Líder", value: dados.discord_lider, inline: true },
                    { name: "👥 Membros Extras", value: dados.membros_equipe, inline: false },
                ],
                footer: { text: "NRG Studios | Sistema de Inscrição" },
                timestamp: new Date().toISOString()
            }]
        };
        inscricaoCache.add(clientIp);
    } 
    // ROTA 2: Tratamento de ENTREGA DO PROJETO FINAL
    else if (dados.tipo === 'entrega') {
        if (entregaCache.has(clientIp)) return res.status(429).json({ error: 'Projeto já entregue.' });
        if (!dados.nome_projeto || !dados.discord_lider || !dados.link_jogo) return res.status(400).json({ error: 'Faltam dados.' });

        payload = {
            username: "NRG Game Jam Bot",
            avatar_url: "https://i.imgur.com/8X16ABy.png",
            embeds: [{
                title: "🟣 PROJETO FINAL ENTREGUE!",
                color: 9055202, // Roxo/Neon
                fields: [
                    { name: "👑 Equipe / Projeto", value: dados.nome_projeto, inline: true },
                    { name: "💬 Discord do Líder", value: dados.discord_lider, inline: true },
                    { name: "🔗 Link do Jogo", value: dados.link_jogo, inline: false },
                ],
                footer: { text: "NRG Studios | Sistema de Entrega Final" },
                timestamp: new Date().toISOString()
            }]
        };
        entregaCache.add(clientIp);
    } 
    else {
        return res.status(400).json({ error: 'Tipo de requisição inválido.' });
    }

    // Disparo para o Discord
    try {
        const discordReq = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (discordReq.ok) return res.status(200).json({ success: true });
        else return res.status(500).json({ error: 'Falha ao notificar Discord.' });
    } catch (error) {
        return res.status(500).json({ error: 'Erro interno.' });
    }
}
