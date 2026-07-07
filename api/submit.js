export default async function handler(req, res) {
    // 1. Bloqueia qualquer acesso que não seja o formulário enviando dados
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido.' });
    }

    const { nome, discord, cargo, portfolio, motivo } = req.body;

    // 2. Proteção Anti-Hacker (Validação no Servidor)
    if (!nome || !discord || !cargo || !motivo) {
        return res.status(400).json({ error: 'Dados incompletos detectados.' });
    }
    if (motivo.length > 2000 || nome.length > 100) {
        return res.status(400).json({ error: 'Limite de caracteres excedido (Tentativa de Spam/Exploit).' });
    }

    // 3. A IA Avaliadora (Totalmente Invisível para o Candidato)
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

    // 4. O Webhook Seguro (Fica escondido nas variáveis de ambiente)
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
            footer: { text: "NRG Studios Recruitment System" }
        }]
    };

    // 5. Envia para o Discord com Segurança
    try {
        const discordReq = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (discordReq.ok) {
            return res.status(200).json({ success: true, statusIA: statusIA });
        } else {
            return res.status(500).json({ error: 'Acesso negado pelo Discord.' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Falha na rede interna.' });
    }
}