const ipCache = new Set();

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    // Trava de Horário (20:00 BRT do dia 07/07/2026)
    const agora = new Date();
    const dataLimite = new Date("2026-07-07T20:00:00-03:00");
    if (agora > dataLimite) {
        return res.status(403).json({ error: 'Acesso negado. O prazo de inscrições foi encerrado às 20:00.' });
    }

    // Trava de IP Anti-Spam (Um envio por roteador)
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'IP_DESCONHECIDO';
    if (ipCache.has(clientIp)) {
        return res.status(429).json({ error: 'A nossa IA detectou que a sua rede já enviou uma candidatura.' });
    }

    const { nome, discord, cargo, portfolio, motivo } = req.body;

    if (!nome || !discord || !cargo || !motivo) {
        return res.status(400).json({ error: 'Dados incompletos detectados.' });
    }
    if (motivo.length > 2000 || nome.length > 100) {
        return res.status(400).json({ error: 'Limite de caracteres excedido (Tentativa de Spam/Exploit).' });
    }

    let nota = 40; 
    if (motivo.length < 30) nota -= 25; 
    else if (motivo.length > 150) nota += 20; 
    
    const palavrasChave = ["otimização", "knit", "oop", "aaa", "fluido", "sistemas", "segurança", "modular", "blender", "performance"];
    let encontrouTags = 0;
    
    palavrasChave.forEach(palavra => {
        if (motivo.toLowerCase().includes(palavra)) {
            nota += 8;
            encontrouTags++;
        }
    });

    let temPortfolio = "Não possui";
    if (portfolio && portfolio.trim().length > 0) {
        temPortfolio = portfolio;
        if (portfolio.includes("github.com") || portfolio.includes("artstation.com") || portfolio.includes("roblox.com")) {
            nota += 15;
        } else {
            nota += 5;
        }
    }

    nota = Math.max(0, Math.min(100, nota));
    
    let statusIA = "";
    let corEmbed = 0; 
    if (nota >= 80) { statusIA = "💎 ELITE (Altamente Recomendado)"; corEmbed = 5763719; } 
    else if (nota >= 50) { statusIA = "⚠️ MÉDIO (Requer Entrevista)"; corEmbed = 16776960; } 
    else { statusIA = "❌ REPROVADO (Baixo Esforço)"; corEmbed = 15548997; } 

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        return res.status(500).json({ error: 'Erro interno no servidor da NRG.' });
    }

    const payload = {
        username: "NRG System IA",
        embeds: [{
            title: "⚡ NOVO RECRUTA AVALIADO",
            color: corEmbed,
            fields: [
                { name: "👤 Candidato", value: nome, inline: true },
                { name: "🎮 Discord", value: discord, inline: true },
                { name: "🛠️ Especialidade", value: cargo, inline: true },
                { name: "📁 Portfólio", value: temPortfolio },
                { name: "📝 Motivo", value: "```" + motivo + "```" },
                { name: "🤖 Avaliação da IA", value: `**Status:** ${statusIA}\n**Score:** ${nota}/100\n**Tags:** ${encontrouTags}` }
            ],
            footer: { text: "IP Registrado pelo Sistema NRG" }
        }]
    };

    try {
        const discordReq = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (discordReq.ok) {
            ipCache.add(clientIp);
            return res.status(200).json({ success: true, statusIA: statusIA });
        } else {
            return res.status(500).json({ error: 'Acesso negado pelo Discord.' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Falha na rede interna.' });
    }
}
