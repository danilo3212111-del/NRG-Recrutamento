// Cache em memória
const jamIpCache = new Set();

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    // 1. TRAVA DA NOVA DATA: 20/07/2026 às 23:59 BRT
    const agora = new Date();
    const dataLimite = new Date("2026-07-20T23:59:59-03:00");
    if (agora > dataLimite) {
        return res.status(403).json({ error: 'O Evento foi encerrado.' });
    }

    // 2. BLOQUEIO DE SPAM
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'IP_JAM_DESCONHECIDO';
    const acaoId = `${clientIp}-${req.body.tipo}`;
    
    if (jamIpCache.has(acaoId)) {
        return res.status(429).json({ error: 'Você já realizou esta ação.' });
    }

    const { tipo } = req.body;
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) return res.status(500).json({ error: 'Erro de conexão com o Servidor Matriz (Webhook).' });

    let payload = {};

    // 3. ROTA A: INSCRIÇÃO
    if (tipo === 'inscricao') {
        const { modalidade, nome_projeto, discord_lider, membros_equipe } = req.body;
        if (!modalidade || !nome_projeto || !discord_lider) {
            return res.status(400).json({ error: 'Dados da inscrição incompletos.' });
        }

        payload = {
            username: "NRG Game Jam Core",
            avatar_url: "https://i.imgur.com/8X16ABy.png",
            embeds: [{
                title: "🏆 NOVA INSCRIÇÃO - GAME JAM",
                color: 65450,
                fields: [
                    { name: "🎮 Modalidade", value: modalidade, inline: true },
                    { name: "👑 Nome / Equipe", value: nome_projeto, inline: true },
                    { name: "💬 Discord do Líder", value: discord_lider, inline: true },
                    { name: "👥 Membros Extras", value: membros_equipe || "Nenhum", inline: false },
                ],
                footer: { text: "NRG Studios Event System" },
                timestamp: new Date().toISOString()
            }]
        };
    } 
    // 4. ROTA B: ENTREGA DO JOGO
    else if (tipo === 'entrega') {
        const { nome_projeto, discord_lider, link_jogo } = req.body;
        if (!nome_projeto || !discord_lider || !link_jogo) {
            return res.status(400).json({ error: 'Dados de entrega incompletos.' });
        }

        payload = {
            username: "NRG Game Jam Core",
            avatar_url: "https://i.imgur.com/8X16ABy.png",
            embeds: [{
                title: "🚀 NOVO JOGO ENTREGUE!",
                description: "Um projeto foi finalizado e enviado para avaliação da Diretoria.",
                color: 9055202,
                fields: [
                    { name: "👑 Projeto / Equipe", value: nome_projeto, inline: true },
                    { name: "💬 Discord do Líder", value: discord_lider, inline: true },
                    { name: "🔗 Link do Jogo", value: `[Clique aqui para acessar](${link_jogo})`, inline: false },
                ],
                footer: { text: "NRG Studios Event System" },
                timestamp: new Date().toISOString()
            }]
        };
    } 
    else {
        return res.status(400).json({ error: 'Tipo de requisição inválido.' });
    }

    // 5. ENVIO FINAL PARA O DISCORD
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
            return res.status(500).json({ error: 'Falha na comunicação com o servidor da NRG.' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Erro crítico interno no servidor.' });
    }
}
