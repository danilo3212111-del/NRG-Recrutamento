(function () {
    'use strict';

    // ---------------- Countdown ----------------
    var DATA_FINAL = new Date('2026-07-20T23:59:59-03:00').getTime();
    var timerEl = document.getElementById('timer');
    var elDias = document.getElementById('dias');
    var elHoras = document.getElementById('horas');
    var elMinutos = document.getElementById('minutos');
    var elSegundos = document.getElementById('segundos');
    var timerInterval = null;

    function pad(n) {
        return String(n).padStart(2, '0');
    }

    function tick() {
        var agora = Date.now();
        var distancia = DATA_FINAL - agora;

        if (distancia < 0) {
            if (timerInterval) clearInterval(timerInterval);
            timerEl.innerHTML = '<h2 class="countdown-revealed">O GRANDE CAMPEÃO FOI REVELADO!</h2>';
            return;
        }

        elDias.textContent = pad(Math.floor(distancia / 86400000));
        elHoras.textContent = pad(Math.floor((distancia % 86400000) / 3600000));
        elMinutos.textContent = pad(Math.floor((distancia % 3600000) / 60000));
        elSegundos.textContent = pad(Math.floor((distancia % 60000) / 1000));
    }

    if (timerEl) {
        tick(); // run immediately to avoid a flash of "00:00:00:00"
        timerInterval = setInterval(tick, 1000);
    }

    // ---------------- Chat widget ----------------
    var chatBtn = document.getElementById('ai-btn');
    var chatWindow = document.getElementById('chat-window');
    var closeChat = document.getElementById('close-chat');
    var chatMessages = document.getElementById('chat-messages');
    var chatInput = document.getElementById('chat-input');
    var chatSend = document.getElementById('chat-send');

    var MAX_MESSAGE_LENGTH = 300;
    var SEND_COOLDOWN_MS = 600;
    var sendLocked = false;

    function toggleChat(forceOpen) {
        if (!chatWindow) return;
        var shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !chatWindow.classList.contains('open');
        chatWindow.classList.toggle('open', shouldOpen);
        chatBtn.setAttribute('aria-expanded', String(shouldOpen));
        if (shouldOpen) chatInput.focus();
    }

    if (chatBtn) chatBtn.addEventListener('click', function () { toggleChat(); });
    if (closeChat) closeChat.addEventListener('click', function () { toggleChat(false); });

    // Build DOM nodes with textContent only — never innerHTML with user input.
    function addUserMessage(text) {
        var div = document.createElement('div');
        div.className = 'msg-user';
        div.textContent = text;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // AI responses are built from a fixed, hardcoded template — never from user input —
    // so innerHTML here cannot be used as an XSS vector.
    function addAiMessage(fragmentNodes) {
        var div = document.createElement('div');
        div.className = 'msg-ai';
        var strong = document.createElement('strong');
        strong.textContent = 'NRG System:';
        div.appendChild(strong);
        div.appendChild(document.createElement('br'));
        div.appendChild(document.createElement('br'));
        fragmentNodes.forEach(function (node) { div.appendChild(node); });
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function topicList() {
        var topics = ['Prazo', 'Equipe', 'Prêmio', 'Tema', 'Jogo', 'IA', 'Segurança'];
        var nodes = [];
        var intro = document.createElement('span');
        intro.textContent = 'Tente perguntar sobre um destes tópicos:';
        nodes.push(intro);
        topics.forEach(function (t) {
            nodes.push(document.createElement('br'));
            var strong = document.createElement('strong');
            strong.textContent = '➔ ' + t;
            nodes.push(strong);
        });
        return nodes;
    }

    function textNode(str) {
        var span = document.createElement('span');
        span.textContent = str;
        return span;
    }

    function strongNode(str) {
        var strong = document.createElement('strong');
        strong.textContent = str;
        return strong;
    }

    function normalize(str) {
        return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function processAIResponse(msg) {
        var text = normalize(msg);
        var response;

        if (/\bprazo\b|\bdata\b|\bdia\b|quando|horario/.test(text)) {
            response = [textNode('A Game Jam foi encerrada no dia '), strongNode('20 de Julho'), textNode('. O vencedor já foi revelado!')];
        } else if (/completo|pronto|jogavel|estado|\bjogo\b/.test(text)) {
            response = [textNode("O projeto vencedor 'Cinematic Block' se destacou justamente por entregar uma experiência imersiva e livre de bugs críticos.")];
        } else if (/equipe|\btime\b|\bsolo\b|grupo|junto/.test(text)) {
            response = [textNode('O grande campeão desta edição competiu e desenvolveu o projeto de forma Solo.')];
        } else if (/premio|ganha|vencer|recompensa|ganhador/.test(text)) {
            response = [textNode('O campeão @guinomio garantiu o '), strongNode('Recrutamento Oficial'), textNode(' para a equipe de elite AAA da NRG Studios!')];
        } else if (/\bia\b|chatgpt|copilot|toolbox|inteligencia/.test(text)) {
            response = [textNode('Nós permitimos o uso de IA como suporte durante o evento, garantindo velocidade e otimização de código.')];
        } else if (/\btema\b|sobre|estilo|assunto/.test(text)) {
            response = [textNode('O tema foi totalmente LIVRE, o que permitiu o surgimento de projetos incrivelmente criativos nesta edição.')];
        } else if (/seguro|navegador|seguranca|virus/.test(text)) {
            response = [textNode('Recomendamos usar navegadores como '), strongNode('Brave'), textNode(' ou Chrome. A NRG opera sob proteção Cloudflare e AWS.')];
        } else if (/regra|comando|ajuda|menu/.test(text)) {
            response = [textNode('Aqui estão os módulos de informação disponíveis na minha memória:')].concat(topicList());
        } else {
            response = [textNode('Desculpe, meu banco de dados não encontrou essa exata informação.')].concat(topicList());
        }

        setTimeout(function () { addAiMessage(response); }, 500);
    }

    function handleSend() {
        if (sendLocked || !chatInput) return;
        var txt = chatInput.value.trim().slice(0, MAX_MESSAGE_LENGTH);
        if (!txt) return;

        sendLocked = true;
        chatSend.disabled = true;

        addUserMessage(txt);
        chatInput.value = '';
        processAIResponse(txt);

        setTimeout(function () {
            sendLocked = false;
            chatSend.disabled = false;
        }, SEND_COOLDOWN_MS);
    }

    if (chatSend) chatSend.addEventListener('click', handleSend);
    if (chatInput) {
        chatInput.setAttribute('maxlength', String(MAX_MESSAGE_LENGTH));
        chatInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSend();
            }
        });
    }

    // ---------------- Lazy video start (saves mobile data until visible) ----------------
    var video = document.querySelector('.video-wrapper video');
    if (video && 'IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    video.play().catch(function () { /* autoplay blocked — user can use controls */ });
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.35 });
        observer.observe(video);
    }
})();
