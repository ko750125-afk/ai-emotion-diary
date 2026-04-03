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
            'logged-in-user', 'user-avatar', 'avatar-input', 'avatar-change-btn', 'voice-btn', 'voice-text', 'analyze-btn', 'diary-input',
            'ai-response', 'history-container', 'signup-btn', 'login-btn', 'google-login-btn', 'logout-btn',
            'chat-box', 'chat-input', 'send-chat-btn', 'chat-image-input', 'chat-image-btn', 'status-dot', 'status-text'
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
            <div class="chat-msg-content">
                ${content.startsWith('http') && (content.includes('supabase') || content.match(/\.(jpeg|jpg|gif|png)$/)) 
                    ? `<img src="${content}" alt="Shared Image" onclick="window.open('${content}', '_blank')">`
                    : Utils.escapeHtml(content)}
            </div>
            <span class="chat-msg-time">${time}</span>
        `;
        
        this.elements.chatBox.appendChild(msgEl);
        this.elements.chatBox.scrollTop = this.elements.chatBox.scrollHeight;
        
        // 빈 메시지 안내 가리기
        const emptyMsg = this.elements.chatBox.querySelector('.chat-empty-msg');
        if (emptyMsg) emptyMsg.style.display = 'none';
    },

    updateChatStatus(status, color) {
        if (this.elements.statusDot) this.elements.statusDot.style.background = color;
        if (this.elements.statusText) this.elements.statusText.innerText = status;
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
            ProfileService.loadAvatar(); // 아바타 불러오기
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

const ProfileService = {
    async loadAvatar() {
        const { supabase, user } = AppState.get();
        if (!supabase || !user) return;

        // 1. 유저 메타데이터 확인
        const avatarUrl = user.user_metadata?.avatar_url;
        if (avatarUrl) {
            UI.elements.userAvatar.src = avatarUrl;
            return;
        }

        // 2. 스토리지에서 기본 파일 확인 (fallback)
        const { data } = supabase.storage.from('avatars').getPublicUrl(`${user.id}/avatar.png`);
        if (data?.publicUrl) {
            // URL이 유효한지 가볍게 체크 (실제론 metadata 업데이트가 권장됨)
            const res = await fetch(data.publicUrl, { method: 'HEAD' });
            if (res.ok) UI.elements.userAvatar.src = data.publicUrl;
        }
    },

    async uploadAvatar(file) {
        const { supabase, user } = AppState.get();
        if (!supabase || !user || !file) return;

        UI.updateChatStatus('사진 업로드 중...', '#fbbf24');
        const fileName = `avatar.png`; // 고정 이름으로 덮어쓰기
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file, { upsert: true });

        if (uploadError) {
            alert("업로드 실패: " + uploadError.message);
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
        
        // 유저 메타데이터 업데이트 (나중에 로그인할 때 바로 불러오기 위함)
        const { error: updateError } = await supabase.auth.updateUser({
            data: { avatar_url: `${publicUrl}?t=${Date.now()}` } // 캐시 방지
        });

        if (updateError) console.error("메타데이터 업데이트 실패:", updateError);
        
        UI.elements.userAvatar.src = `${publicUrl}?t=${Date.now()}`;
        UI.updateChatStatus('업로드 완료', '#4ade80');
        setTimeout(() => ChatService.updateStatusByRealtime(), 2000);
    }
};

const ChatService = {
    channel: null,
    pollingTimer: null,   // 폴링 타이머
    lastMessageId: 0,     // 마지막으로 받은 메시지 ID (폴링 기준점)

    async init() {
        const { supabase, user } = AppState.get();
        if (!supabase || !user) return;

        // 1. 기존 메시지 가져오기 + lastMessageId 초기화
        await this.fetchInitialMessages(supabase, user);

        // 2. Realtime 구독 시도 (성공 시 폴링 중단)
        this.subscribeRealtime(supabase, user);

        // 3. 폴링 시작 (Realtime 실패 시 3초마다 새 메시지 체크)
        this.startPolling(supabase, user);
    },

    // 초기 메시지 로드
    async fetchInitialMessages(supabase, user) {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(50);

        if (error) {
            console.error("메시지 가져오기 오류:", error);
            return;
        }
        if (data && data.length > 0) {
            this.clearChat();
            data.forEach(msg => UI.renderChatMessage(msg, msg.user_email === user.email));
            // 마지막 메시지 ID를 기록 (폴링 기준점)
            this.lastMessageId = data[data.length - 1].id;
        }
    },

    // Realtime WebSocket 구독 시도
    subscribeRealtime(supabase, user) {
        if (this.channel) {
            supabase.removeChannel(this.channel);
            this.channel = null;
        }
        UI.updateChatStatus('연결 중...', '#fbbf24');

        this.channel = supabase
            .channel('chat_room_v1')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload) => {
                    const newMsg = payload.new;
                    // 폴링과 중복 방지: 아직 표시 안 된 메시지만 렌더링
                    if (newMsg.id > this.lastMessageId) {
                        this.lastMessageId = newMsg.id;
                        UI.renderChatMessage(newMsg, newMsg.user_email === user.email);
                    }
                }
            )
            .subscribe((status, err) => {
                console.log("Realtime 구독 상태:", status);
                if (status === 'SUBSCRIBED') {
                    // Realtime 성공 → 폴링 중단
                    UI.updateChatStatus('실시간 연결됨 ●', '#4ade80');
                    this.stopPolling();
                } else if (status === 'CHANNEL_ERROR') {
                    // Realtime 실패 → 폴링으로 대체
                    UI.updateChatStatus('자동 업데이트 중 ●', '#a78bfa');
                    console.warn('Realtime 연결 실패. 폴링 모드로 동작 중:', err);
                }
            });
    },

    updateStatusByRealtime() {
        if (this.channel && this.channel.state === 'joined') {
            UI.updateChatStatus('실시간 연결됨 ●', '#4ade80');
        } else {
            UI.updateChatStatus('자동 업데이트 중 ●', '#a78bfa');
        }
    },

    // 3초마다 새 메시지 폴링 (Realtime 백업)
    startPolling(supabase, user) {
        this.stopPolling();
        this.pollingTimer = setInterval(async () => {
            const { data } = await supabase
                .from('messages')
                .select('*')
                .gt('id', this.lastMessageId)  // 마지막 ID 이후 것만 가져오기
                .order('created_at', { ascending: true });

            if (data && data.length > 0) {
                data.forEach(msg => UI.renderChatMessage(msg, msg.user_email === user.email));
                this.lastMessageId = data[data.length - 1].id;
            }
        }, 3000); // 3초마다 체크
    },

    stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
    },

    async sendMessage(content) {
        const { supabase, user } = AppState.get();
        if (!supabase || !user || !content.trim()) return;

        const { error } = await supabase.from('messages').insert([{
            content: content.trim(),
            user_email: user.email,
            user_id: user.id
        }]);

        if (error) {
            console.error("메시지 전송 실패:", error);
            alert("메시지 전송에 실패했습니다.");
        } else {
            UI.elements.chatInput.value = '';
        }
    },

    async uploadAndSendImage(file) {
        const { supabase, user } = AppState.get();
        if (!supabase || !user || !file) return;

        UI.updateChatStatus('이미지 전송 중...', '#fbbf24');
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('chat-images')
            .upload(filePath, file);

        if (uploadError) {
            alert("이미지 업로드 실패: " + uploadError.message);
            UI.updateChatStatus('전송 실패', '#ef4444');
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(filePath);
        await this.sendMessage(publicUrl);
        UI.updateChatStatus('전송 완료', '#4ade80');
        setTimeout(() => this.updateStatusByRealtime(), 2000);
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
        }},
        { id: 'avatarChangeBtn', event: 'click', fn: () => UI.elements.avatarInput.click() },
        { id: 'avatarInput', event: 'change', fn: (e) => {
            const file = e.target.files[0];
            if (file) ProfileService.uploadAvatar(file);
        }},
        { id: 'chatImageBtn', event: 'click', fn: () => UI.elements.chatImageInput.click() },
        { id: 'chatImageInput', event: 'change', fn: (e) => {
            const file = e.target.files[0];
            if (file) ChatService.uploadAndSendImage(file);
        }}
    ];

    listeners.forEach(({ id, event, fn }) => {
        const el = UI.elements[id];
        if (el) el.addEventListener(event, fn);
    });
});
