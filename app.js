const STORAGE_KEY = 'omnitutor_v29';

const state = {
  apiKey: '',
  procode: '',
  chat: [],
  packets: [],
  focusPacketId: 'all',
  quiz: []
};

const el = {};

document.addEventListener('DOMContentLoaded', () => {
  bindElements();
  loadState();
  bindEvents();
  renderAll();
});

function bindElements() {
  [
    'apiKeyInput','saveKeyBtn','procodeEditor','saveProcodeBtn','chatLog','focusSelect','chatForm','promptInput',
    'summarizeBtn','clearChatBtn','packetList','newPacketBtn','generateQuizBtn','quizContainer','mindMap'
  ].forEach(id => el[id] = document.getElementById(id));
}

function bindEvents() {
  el.saveKeyBtn.addEventListener('click', () => {
    state.apiKey = el.apiKeyInput.value.trim();
    persist();
    toast('API key saved locally.');
  });

  el.saveProcodeBtn.addEventListener('click', () => {
    state.procode = el.procodeEditor.value;
    persist();
    toast('ProCode draft saved.');
  });

  el.chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = el.promptInput.value.trim();
    if (!prompt) return;
    pushChat('user', prompt);
    el.promptInput.value = '';

    const aiText = await generateTutorResponse(prompt);
    pushChat('ai', aiText);
    persist();
  });

  el.summarizeBtn.addEventListener('click', async () => {
    const focusPackets = getFocusedPackets();
    if (!focusPackets.length) return toast('No packets in focus.');
    const text = `Summarize these notes in concise bullets:\n\n${focusPackets.map(p => p.content).join('\n\n')}`;
    pushChat('user', '[Summarize Focus]');
    const aiText = await generateTutorResponse(text, true);
    pushChat('ai', aiText);
    persist();
  });

  el.clearChatBtn.addEventListener('click', () => {
    state.chat = [];
    renderChat();
    persist();
  });

  el.focusSelect.addEventListener('change', () => {
    state.focusPacketId = el.focusSelect.value;
    renderPackets();
    renderMindMap();
    persist();
  });

  el.newPacketBtn.addEventListener('click', () => {
    const title = prompt('Packet title?');
    if (!title) return;
    const content = prompt('Packet content?');
    if (!content) return;
    state.packets.unshift(createPacket(title, content));
    renderPackets();
    renderFocusSelect();
    renderMindMap();
    persist();
  });

  el.generateQuizBtn.addEventListener('click', async () => {
    const quiz = await generateQuiz();
    state.quiz = quiz;
    renderQuiz();
    persist();
  });
}

function createPacket(title, content) {
  return { id: crypto.randomUUID(), title, content, pinned: false, createdAt: Date.now() };
}

function pushChat(role, text) {
  state.chat.push({ role, text, ts: Date.now() });
  renderChat();
}

function getFocusedPackets() {
  if (state.focusPacketId === 'all') return state.packets;
  return state.packets.filter(p => p.id === state.focusPacketId);
}

async function generateTutorResponse(promptText, forceCanvasOnly = false) {
  const focused = getFocusedPackets();
  const contextBlock = focused.length
    ? focused.map((p, i) => `Packet ${i + 1}: ${p.title}\n${p.content}`).join('\n\n')
    : 'No packet context available.';

  const systemInstruction = forceCanvasOnly || state.focusPacketId !== 'all'
    ? 'Reason only from the provided packet context. If unknown, say it is outside focus.'
    : 'Use provided packet context first, then general reasoning as needed.';

  const syntheticPrompt = `${systemInstruction}\n\nContext:\n${contextBlock}\n\nUser:\n${promptText}`;

  if (!state.apiKey) {
    return `Simulated OmniTutor Response:\n- I used your focused packet context.\n- Key insight: ${promptText.slice(0, 80)}...\n- Add API key in Settings to use Gemini live responses.\n\n$\\int_0^1 x^2 dx = \\frac{1}{3}$`;
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.apiKey}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: syntheticPrompt }] }]
      })
    });
    if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
  } catch (err) {
    return `Live model failed (${err.message}). Falling back to local tutor mode.`;
  }
}

async function generateQuiz() {
  const sourcePackets = state.packets.slice(0, 6);
  if (!sourcePackets.length) {
    return [{ q: 'No packets available. Add one to generate a quiz.', options: ['OK'], answer: 0 }];
  }

  if (state.apiKey) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${state.apiKey}`;
      const prompt = `Create exactly 3 multiple-choice questions from these notes. Return pure JSON array with keys q, options (4), answerIndex. Notes: ${sourcePackets.map(p => p.content).join(' ')}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      if (!res.ok) throw new Error('quiz endpoint failed');
      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return parsed.map(item => ({ q: item.q, options: item.options, answer: item.answerIndex }));
    } catch {
      // fallback below
    }
  }

  return sourcePackets.slice(0, 3).map((p, idx) => {
    const fact = p.content.split('.').find(Boolean)?.trim() || p.content;
    return {
      q: `Packet ${idx + 1}: Which best captures this idea?`,
      options: [fact, 'Unrelated interpretation', 'Opposite claim', 'Insufficient context'],
      answer: 0
    };
  });
}

function renderAll() {
  el.apiKeyInput.value = state.apiKey;
  el.procodeEditor.value = state.procode;
  renderFocusSelect();
  renderChat();
  renderPackets();
  renderQuiz();
  renderMindMap();
}

function renderChat() {
  el.chatLog.innerHTML = '';
  state.chat.forEach(msg => {
    const node = document.createElement('article');
    node.className = `msg ${msg.role}`;
    node.innerHTML = `<div class="text-xs mb-1 uppercase tracking-wide text-slate-300">${msg.role}</div><div>${escapeHtml(msg.text).replace(/\n/g, '<br>')}</div>`;
    el.chatLog.appendChild(node);
  });
  if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([el.chatLog]).catch(() => {});
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

function renderFocusSelect() {
  const options = ['<option value="all">All packets (default)</option>']
    .concat(state.packets.map(p => `<option value="${p.id}">${escapeHtml(p.title)}</option>`));
  el.focusSelect.innerHTML = options.join('');
  el.focusSelect.value = state.focusPacketId;
  if (el.focusSelect.value !== state.focusPacketId) {
    state.focusPacketId = 'all';
    el.focusSelect.value = 'all';
  }
}

function renderPackets() {
  el.packetList.innerHTML = '';
  state.packets.forEach(packet => {
    const card = document.createElement('div');
    const isFocused = state.focusPacketId === packet.id;
    card.className = `packet-card ${isFocused ? 'ring-2 ring-cyan-400' : ''}`;
    card.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <strong class="text-sm">${escapeHtml(packet.title)}</strong>
        <div class="flex gap-1">
          <button class="btn text-xs" data-action="focus">Focus</button>
          <button class="btn text-xs" data-action="pin">${packet.pinned ? 'Unpin' : 'Pin'}</button>
          <button class="btn text-xs" data-action="delete">Del</button>
        </div>
      </div>
      <p class="text-xs text-slate-300 mt-2">${escapeHtml(packet.content).slice(0, 220)}</p>
    `;
    card.querySelector('[data-action="focus"]').addEventListener('click', () => {
      state.focusPacketId = packet.id;
      renderFocusSelect();
      renderPackets();
      renderMindMap();
      persist();
    });
    card.querySelector('[data-action="pin"]').addEventListener('click', () => {
      packet.pinned = !packet.pinned;
      renderPackets();
      renderMindMap();
      persist();
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', () => {
      state.packets = state.packets.filter(p => p.id !== packet.id);
      if (state.focusPacketId === packet.id) state.focusPacketId = 'all';
      renderFocusSelect();
      renderPackets();
      renderMindMap();
      persist();
    });
    el.packetList.appendChild(card);
  });
}

function renderQuiz() {
  el.quizContainer.innerHTML = '';
  state.quiz.forEach((item, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'packet-card';
    const options = (item.options || []).map((opt, idx) =>
      `<button class="btn w-full text-left mt-1" data-choice="${idx}">${String.fromCharCode(65 + idx)}. ${escapeHtml(opt)}</button>`
    ).join('');
    wrap.innerHTML = `<p class="font-medium">Q${i + 1}. ${escapeHtml(item.q)}</p>${options}<p class="text-xs mt-2 text-cyan-300 hidden" data-feedback></p>`;
    wrap.querySelectorAll('[data-choice]').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen = Number(btn.dataset.choice);
        const fb = wrap.querySelector('[data-feedback]');
        fb.classList.remove('hidden');
        fb.textContent = chosen === item.answer ? 'Correct ✅' : `Incorrect. Correct answer: ${String.fromCharCode(65 + item.answer)}.`;
      });
    });
    el.quizContainer.appendChild(wrap);
  });
}

function renderMindMap() {
  const nodes = state.packets.filter(p => p.pinned || state.focusPacketId === p.id).slice(0, 10);
  const center = { x: 160, y: 90 };
  const radius = 60;
  const svg = el.mindMap;
  svg.innerHTML = '';

  const core = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  core.setAttribute('cx', center.x);
  core.setAttribute('cy', center.y);
  core.setAttribute('r', 12);
  core.setAttribute('fill', '#06b6d4');
  svg.appendChild(core);

  nodes.forEach((node, idx) => {
    const angle = (Math.PI * 2 * idx) / Math.max(nodes.length, 1);
    const x = center.x + Math.cos(angle) * radius;
    const y = center.y + Math.sin(angle) * radius;

    const link = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    link.setAttribute('x1', center.x);
    link.setAttribute('y1', center.y);
    link.setAttribute('x2', x);
    link.setAttribute('y2', y);
    link.setAttribute('stroke', '#334155');
    svg.appendChild(link);

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
    dot.setAttribute('r', state.focusPacketId === node.id ? 8 : 6);
    dot.setAttribute('fill', node.pinned ? '#22d3ee' : '#a78bfa');
    svg.appendChild(dot);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', x + 8);
    label.setAttribute('y', y + 4);
    label.setAttribute('fill', '#cbd5e1');
    label.setAttribute('font-size', '8');
    label.textContent = node.title.slice(0, 12);
    svg.appendChild(label);
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    Object.assign(state, parsed);
  } catch {
    // ignore
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function toast(message) {
  console.log(`[OmniTutor] ${message}`);
}

function escapeHtml(str = '') {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
