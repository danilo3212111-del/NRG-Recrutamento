export default async function handler(req, res) {
    // Cabeçalhos de Segurança e CORS para evitar bloqueios na Vercel
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Libera a requisição inicial (Preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    try {
        const dados = req.body;
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

        if (!webhookUrl) {
            return res.status(500).json({ error: 'Erro de Servidor: Webhook não configurado.' });
        }

        // 📅 DATAS OFICIAIS DA GAME JAM V2
        const dataInicio = new Date("2026-08-01T00:00:00-03:00").getTime();
        const dataLimite = new Date("2026-08-15T23:59:59-03:00").getTime();
        const agora = Date.now();

        if (agora < dataInicio) return res.status(403).json({ error: 'O portal de submissão só abre dia 1 de Agosto!' });
        if (agora > dataLimite) return res.status(403).json({ error: 'O prazo oficial da V2 já encerrou.' });

        let payload = {};

        if (dados.tipo === 'inscricao') {
            if (!dados.nome_projeto || !dados.discord_lider) {
                return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
            }
            payload = {
                username: "NRG Game Jam V2",
                avatar_url: "https://i.imgur.com/8X16ABy.png",
                embeds: [{
                    title: "🌋 NOVA INSCRIÇÃO RASTREADA - V2",
                    description: "**Tema:** O Chão Não É Seguro",
                    color: 16729344, // Laranja
                    fields: [
                        { name: "👑 Projeto/Equipe", value: dados.nome_projeto, inline: true },
                        { name: "💬 Discord (Líder)", value: dados.discord_lider, inline: true }
                    ],
                    footer: { text: "NRG Studios | V2 Automation System" }
                }]
            };
        } else if (dados.tipo === 'entrega') {
            if (!dados.nome_projeto || !dados.discord_lider || !dados.link_jogo) {
                return res.status(400).json({ error: 'Preencha todos os campos da entrega.' });
            }
            payload = {
                username: "NRG Game Jam V2",
                avatar_url: "https://i.imgur.com/8X16ABy.png",
                embeds: [{
                    title: "🔥 PROJETO FINAL RECEBIDO - V2!",
                    description: "**Os devs sobreviveram ao chão de lava.**",
                    color: 16711680, // Vermelho
                    fields: [
                        { name: "👑 Projeto/Equipe", value: dados.nome_projeto, inline: true },
                        { name: "💬 Discord (Líder)", value: dados.discord_lider, inline: true },
                        { name: "🔗 Link Oficial", value: dados.link_jogo, inline: false }
                    ],
                    footer: { text: "NRG Studios | V2 Reception Core" }
                }]
            };
        } else {
            return res.status(400).json({ error: 'Tipo de envio inválido.' });
        }

        const discordReq = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!discordReq.ok) {
            throw new Error('Falha ao comunicar com o Discord.');
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Instabilidade na rede. Tente novamente.' });
    }
}
