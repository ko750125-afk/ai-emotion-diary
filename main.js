import { createClient } from '@supabase/supabase-js';

// --- Utilities ---
const Utils = {
    escapeHtml: (unsafe) => (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                                         .replace(/"/g, "&quot;").replace(/'/g, "&#039;"),
    formatDate: (timestamp) => new Date(timestamp).toLocaleString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
};

// --- Application State ---
const AppState = {
    _state: {
        supabase: null,
        user: null,
        token: null,
        isRecording: false
    },
    update(newState) {
        this._state = { ...this._state, ...newState };
    },
    get() {
        return this._state;
    }
};

// --- HTTP Client ---
const HttpClient = {
    async request(url, options = {}) {
        const { token } = AppState.get();
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };

        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `Request failed with status ${response.status}`);
        }
        return response.json();
    }
};

// --- UI Controller ---
const UI = {
    elements: {},
    
    init() {
        const ids = [
            'login-section', 'app-content', 'email-input', 'password-input', 'auth-error',
            'logged-in-user', 'voice-btn', 'voice-text', 'analyze-btn', 'diary-input',
            'ai-response', 'history-container', 'signup-btn', 'login-btn', 'google-login-btn', 'logout-btn',
            'chat-box', 'chat-input', 'send-chat-btn'
        ];
        ids.forEach(id => this.elements[id.replace(/-([a-z])/g, (g) => g[1].toUpperCase())] = document.getElementById(id));
    },

    updateAuthView(session) {
        const isLoggedIn = !!session;
        this.elements.loginSection.style.display = isLoggedIn ? 'none' : 'flex';
        this.elements.appContent.style.display = isLoggedIn ? 'block' : 'none';
        if (isLoggedIn) {
            this.elements.loggedInUser.textContent = session.user.email;
            this.elements.authError.style.display = 'none';
        }
    },

    showError(message, target = 'authError') {
        const el = this.elements[target] || this.elements.authError;
        el.textContent = message;
        el.style.display = 'block';
    },

    setLoading(isLoading, message = '분석 중입니다...') {
        if (!isLoading) return;
        this.elements.aiResponse.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <svg width="20" height="20" viewBox="0 0 50 50" style="animation: spin 1s linear infinite;">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="var(--primary-color)" stroke-width="5" stroke-dasharray="31.4 31.4" stroke-dashoffset="0"></circle>
                </svg> 
                ${message}
            </div>`;
    },

    renderAIResponse(text) {
        this.elements.aiResponse.innerText = text;
        this.elements.aiResponse.style.whiteSpace = 'pre-wrap';
        this.elements.aiResponse.style.color = 'var(--text-primary)';
    },

    renderHistory(histories) {
        if (!this.elements.historyContainer) return;
        if (histories.length === 0) {
            this.elements.historyContainer.innerHTML = '<div class="empty-history">아직 저장된 일기가 없습니다.</div>';
            return;
        }
        this.elements.historyContainer.innerHTML = histories.map(item => `
            <div class="history-card">
                <div class="history-date">${Utils.formatDate(item.timestamp)}</div>
                <div class="history-content">${Utils.escapeHtml(item.originalText)}</div>
                <div class="history-ai">${Utils.escapeHtml(item.aiResponse)}</div>
            </div>
        `).join('');
    },

    toggleRecording(isRecording) {
        this.elements.voiceText.innerText = isRecording ? '음성 인식 중...' : '음성으로 입력하기';
        this.elements.voiceBtn.classList.toggle('recording', isRecording);
    },

    renderChatMessage(data, isMe) {
        const { user_email, content, created_at } = data;
        const msgEl = document.createElement('div');
        msgEl.className = `chat-msg ${isMe ? 'me' : 'others'}`;
        
        const time = new Date(created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        
        msgEl.innerHTML = `
            <span class="chat-msg-user">${Utils.escapeHtml(user_email)}</span>
            <div class="chat-msg-content">${Utils.escapeHtml(content)}</div>
            <span class="chat-msg-time">${time}</span>
        `;
        
        this.elements.chatBox.appendChild(msgEl);
        this.elements.chatBox.scrollTop = this.elements.chatBox.scrollHeight;
        
        // 빈 메시지 안내 가리기
        const emptyMsg = this.elements.chatBox.querySelector('.chat-empty-msg');
        if (emptyMsg) emptyMsg.style.display = 'none';
    }
};

// --- Services ---
const AuthService = {
    async init() {
        try {
            const { supabaseUrl, supabaseAnonKey } = await HttpClient.request('/api/env');
            AppState.update({ supabase: createClient(supabaseUrl, supabaseAnonKey) });
            
            const supabase = AppState.get().supabase;
            supabase.auth.onAuthStateChange((_, session) => this.handleSession(session));
            
            const { data: { session } } = await supabase.auth.getSession();
            this.handleSession(session);
        } catch (e) {
            UI.showError("서버 설정을 불러올 수 없습니다.");
        }
    },

    handleSession(session) {
        AppState.update({ user: session?.user || null, token: session?.access_token || null });
        UI.updateAuthView(session);
        if (session) {
            DiaryService.restoreTemp();
            ApiService.fetchHistory();
            ChatService.init(); // 채팅 초기화 및 구독 시작
        }
    },

    async login(email, password) {
        const { error } = await AppState.get().supabase.auth.signInWithPassword({ email, password });
        if (error) UI.showError(error.message.includes('Invalid') ? '이메일 또는 비밀번호가 틀렸습니다.' : error.message);
    },

    async signup(email, password) {
        const { error } = await AppState.get().supabase.auth.signUp({ email, password });
        if (error) UI.showError(error.message);
        else alert("가입 확인 이메일을 확인해주세요!");
    },

    async googleLogin() {
        await AppState.get().supabase.auth.signInWithOAuth({
            provider: 'google', options: { redirectTo: window.location.origin }
        });
    },

    async logout() {
        await AppState.get().supabase.auth.signOut();
    }
};

const SpeechService = {
    recognition: null,
    
    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'ko-KR';
        this.recognition.interimResults = true;

        this.recognition.onstart = () => {
            AppState.update({ isRecording: true });
            UI.toggleRecording(true);
        };

        this.recognition.onresult = (e) => {
            let interim = '', final = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
                else interim += e.results[i][0].transcript;
            }
            const current = UI.elements.diaryInput.value;
            // Append logic could be refined but keeping original functionality
            UI.elements.diaryInput.value = current.trim() + ' ' + (final + interim).trim();
        };

        this.recognition.onend = () => {
            AppState.update({ isRecording: false });
            UI.toggleRecording(false);
        };

        this.recognition.onerror = () => {
            AppState.update({ isRecording: false });
            UI.toggleRecording(false);
        };
    },

    async toggle() {
        if (!this.recognition) return alert('음성 인식을 지원하지 않습니다.');
        if (AppState.get().isRecording) {
            this.recognition.stop();
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
                this.recognition.start();
            } catch (e) {
                alert('마이크 접근 권한을 허용해주세요.');
            }
        }
    }
};

const ApiService = {
    async analyze(text) {
        UI.setLoading(true);
        try {
            const { result } = await HttpClient.request('/api/analyze', {
                method: 'POST',
                body: JSON.stringify({ text })
            });
            UI.renderAIResponse(result);
            DiaryService.saveTemp(text, result);
            this.fetchHistory();
        } catch (e) {
            UI.renderAIResponse(`분석 오류: ${e.message}`);
        }
    },

    async fetchHistory() {
        if (!AppState.get().token) return;
        try {
            const { data } = await HttpClient.request('/api/history');
            UI.renderHistory(data || []);
        } catch (e) {
            console.error("History fetch error:", e);
        }
    }
};

const DiaryService = {
    saveTemp: (text, ai) => {
        localStorage.setItem('emotionDiary_text', text);
        localStorage.setItem('emotionDiary_aiResponse', ai);
    },
    restoreTemp: () => {
        const text = localStorage.getItem('emotionDiary_text');
        const ai = localStorage.getItem('emotionDiary_aiResponse');
        if (text) UI.elements.diaryInput.value = text;
        if (ai) UI.renderAIResponse(ai);
    }
};

const ChatService = {
    channel: null,

    async init() {
        const { supabase, user } = AppState.get();
        if (!supabase || !user) return;

        // 1. 기존 메시지 가져오기 (최근 20개)
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(20);

        if (data) {
            this.clearChat();
            data.forEach(msg => UI.renderChatMessage(msg, msg.user_id === user.id));
        }

        // 2. 실시간 구독 설정 (3단계 지시 전이므로 기본 틀만 유지)
        if (this.channel) supabase.removeChannel(this.channel);
        
        this.channel = supabase
            .channel('public:messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
                const newMsg = payload.new;
                UI.renderChatMessage(newMsg, newMsg.user_id === user.id);
            })
            .subscribe();
    },

    async sendMessage(content) {
        const { supabase, user } = AppState.get();
        if (!supabase || !user || !content.trim()) return;

        // 지시하신 { content, user_email } 형식 적용
        const { error } = await supabase.from('messages').insert([{
            content: content.trim(),
            user_email: user.email
        }]);

        if (error) {
            console.error("메시지 전송 실패:", error);
            alert("메시지 전송에 실패했습니다.");
        } else {
            // 전송 성공 시 입력창 비우기 (지시 사항)
            UI.elements.chatInput.value = '';
        }
    },

    clearChat() {
        UI.elements.chatBox.innerHTML = '';
    }
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    UI.init();
    AuthService.init();
    SpeechService.init();

    // Unified Event Listeners
    const listeners = [
        { id: 'signupBtn', event: 'click', fn: () => AuthService.signup(UI.elements.emailInput.value.trim(), UI.elements.passwordInput.value) },
        { id: 'loginBtn', event: 'click', fn: () => AuthService.login(UI.elements.emailInput.value.trim(), UI.elements.passwordInput.value) },
        { id: 'googleLoginBtn', event: 'click', fn: () => AuthService.googleLogin() },
        { id: 'logoutBtn', event: 'click', fn: () => AuthService.logout() },
        { id: 'voiceBtn', event: 'click', fn: () => SpeechService.toggle() },
        { id: 'analyzeBtn', event: 'click', fn: () => {
            const text = UI.elements.diaryInput.value.trim();
            if (!text) return alert('일기 내용을 입력해주세요.');
            ApiService.analyze(text);
        }},
        { id: 'sendChatBtn', event: 'click', fn: () => {
            const content = UI.elements.chatInput.value.trim();
            if (!content) return;
            ChatService.sendMessage(content);
        }},
        { id: 'chatInput', event: 'keypress', fn: (e) => {
            if (e.key === 'Enter') {
                UI.elements.sendChatBtn.click();
            }
        }}
    ];

    listeners.forEach(({ id, event, fn }) => {
        const el = UI.elements[id];
        if (el) el.addEventListener(event, fn);
    });
});
